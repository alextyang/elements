#include <openvdb/io/File.h>
#include <openvdb/openvdb.h>
#include <openvdb/tools/Interpolation.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

struct Config {
    std::vector<std::filesystem::path> sources;
    std::filesystem::path output;
    std::uint32_t seed = 1;
    int width = 384;
    int depth = 240;
    int height = 216;
    double voxelSize = 0.05333333333333334;
};

std::uint32_t hash(std::uint32_t value)
{
    value ^= value >> 16;
    value *= 0x7feb352dU;
    value ^= value >> 15;
    value *= 0x846ca68bU;
    value ^= value >> 16;
    return value;
}

double lattice(int x, int y, int z, std::uint32_t seed)
{
    std::uint32_t value = seed;
    value ^= hash(static_cast<std::uint32_t>(x) + 0x9e3779b9U);
    value ^= hash(static_cast<std::uint32_t>(y) + 0x85ebca6bU);
    value ^= hash(static_cast<std::uint32_t>(z) + 0xc2b2ae35U);
    return static_cast<double>(hash(value)) /
        static_cast<double>(std::numeric_limits<std::uint32_t>::max());
}

double fade(double value)
{
    return value * value * value *
        (value * (value * 6.0 - 15.0) + 10.0);
}

double noise(double x, double y, double z, std::uint32_t seed)
{
    const int x0 = static_cast<int>(std::floor(x));
    const int y0 = static_cast<int>(std::floor(y));
    const int z0 = static_cast<int>(std::floor(z));
    const double tx = fade(x - x0);
    const double ty = fade(y - y0);
    const double tz = fade(z - z0);
    const auto lerp = [](double a, double b, double t) {
        return a + (b - a) * t;
    };
    std::array<double, 8> values {};
    int index = 0;
    for (int dz = 0; dz < 2; ++dz) {
        for (int dy = 0; dy < 2; ++dy) {
            for (int dx = 0; dx < 2; ++dx) {
                values[index++] = lattice(
                    x0 + dx, y0 + dy, z0 + dz, seed);
            }
        }
    }
    return lerp(
        lerp(lerp(values[0], values[1], tx),
            lerp(values[2], values[3], tx), ty),
        lerp(lerp(values[4], values[5], tx),
            lerp(values[6], values[7], tx), ty), tz);
}

double fbm(double x, double y, double z, std::uint32_t seed)
{
    double result = 0.0;
    double amplitude = 0.5;
    double normalization = 0.0;
    for (int octave = 0; octave < 6; ++octave) {
        result += amplitude * noise(x, y, z, seed + octave * 0x632be5abU);
        normalization += amplitude;
        x = 2.03 * x + 7.13;
        y = 2.01 * y - 3.71;
        z = 2.07 * z + 5.29;
        amplitude *= 0.5;
    }
    return result / normalization;
}

Config parseArguments(int argc, char** argv)
{
    Config config;
    for (int index = 1; index < argc; ++index) {
        const std::string_view argument(argv[index]);
        const auto value = [&]() -> std::string {
            if (++index >= argc) throw std::runtime_error(
                "Missing value after " + std::string(argument));
            return argv[index];
        };
        if (argument == "--source") config.sources.emplace_back(value());
        else if (argument == "--output") config.output = value();
        else if (argument == "--seed") config.seed = std::stoul(value());
        else if (argument == "--width") config.width = std::stoi(value());
        else if (argument == "--depth") config.depth = std::stoi(value());
        else if (argument == "--height") config.height = std::stoi(value());
        else if (argument == "--voxel-size") config.voxelSize = std::stod(value());
        else throw std::runtime_error("Unknown argument: " + std::string(argument));
    }
    if (config.sources.size() < 2 || config.output.empty()) {
        throw std::runtime_error("At least two --source paths and --output are required");
    }
    if (config.width < 8 || config.depth < 8 || config.height < 8 ||
        config.voxelSize <= 0.0) {
        throw std::runtime_error("Invalid grid dimensions or voxel size");
    }
    return config;
}

struct Source {
    openvdb::FloatGrid::Ptr grid;
    openvdb::CoordBBox bounds;
};

Source readSource(const std::filesystem::path& path)
{
    openvdb::io::File file(path.string());
    file.open();
    auto base = file.readGrid("density");
    file.close();
    auto grid = openvdb::gridPtrCast<openvdb::FloatGrid>(base);
    if (!grid) throw std::runtime_error("Source has no float density grid: " +
        path.string());
    const openvdb::CoordBBox bounds = grid->evalActiveVoxelBoundingBox();
    if (bounds.empty()) {
        throw std::runtime_error("Source density is empty: " + path.string());
    }
    return {grid, bounds};
}

double sampleSource(const Source& source, double x, double y, double z)
{
    // CGHaven cloud grids are Y-up. The synthesized grid is Z-up, so normalized
    // vertical and depth coordinates are exchanged before index-space sampling.
    const auto dimensions = source.bounds.dim().asVec3d();
    const auto minimum = source.bounds.min().asVec3d();
    const openvdb::Vec3d index(
        minimum.x() + x * (dimensions.x() - 1.0),
        minimum.y() + z * (dimensions.y() - 1.0),
        minimum.z() + y * (dimensions.z() - 1.0));
    return openvdb::tools::PointSampler::sample(source.grid->tree(), index);
}

std::string deterministicUuid(const Config& config)
{
    std::ostringstream identity;
    identity << "exemplar-profiled-congestus-v5|" << config.seed << '|'
             << config.width << '|' << config.depth << '|' << config.height
             << '|' << std::setprecision(17) << config.voxelSize;
    for (const auto& path : config.sources) identity << '|' << path.filename().string();
    const std::string value = identity.str();
    const auto fnv = [&value](std::uint64_t offset, std::uint64_t prime) {
        std::uint64_t result = offset;
        for (const unsigned char byte : value) {
            result ^= byte;
            result *= prime;
        }
        return result;
    };
    std::ostringstream output;
    output << std::uppercase << std::hex << std::setfill('0')
           << std::setw(16) << fnv(1469598103934665603ULL, 1099511628211ULL)
           << std::setw(16) << fnv(1099511628211ULL, 1469598103934665603ULL);
    const std::string compact = output.str();
    return compact.substr(0, 8) + '-' + compact.substr(8, 4) + '-' +
        compact.substr(12, 4) + '-' + compact.substr(16, 4) + '-' +
        compact.substr(20, 12);
}

void canonicalizeUuid(const std::filesystem::path& path, const Config& config)
{
    std::fstream stream(path, std::ios::in | std::ios::out | std::ios::binary);
    std::array<char, 128> header {};
    stream.read(header.data(), static_cast<std::streamsize>(header.size()));
    const std::string bytes(header.data(), static_cast<std::size_t>(stream.gcount()));
    const std::regex pattern(
        "[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}");
    std::smatch match;
    if (!std::regex_search(bytes, match, pattern)) {
        throw std::runtime_error("OpenVDB archive UUID was not found");
    }
    const std::string uuid = deterministicUuid(config);
    stream.clear();
    stream.seekp(static_cast<std::streamoff>(match.position()), std::ios::beg);
    stream.write(uuid.data(), static_cast<std::streamsize>(uuid.size()));
}

} // namespace

int main(int argc, char** argv)
try {
    const Config config = parseArguments(argc, argv);
    openvdb::initialize();
    std::vector<Source> sources;
    for (const auto& path : config.sources) sources.push_back(readSource(path));

    auto output = openvdb::FloatGrid::create(0.0f);
    output->setName("density");
    output->setGridClass(openvdb::GRID_FOG_VOLUME);
    output->setTransform(openvdb::math::Transform::createLinearTransform(
        config.voxelSize));
    output->insertMeta("cloud:genus", openvdb::StringMetadata("cumulus"));
    output->insertMeta("cloud:species",
        openvdb::StringMetadata("cumulus-congestus"));
    output->insertMeta("cloud:authoring",
        openvdb::StringMetadata("exemplar-profiled-congestus-v5"));
    output->insertMeta("cloud:seed", openvdb::Int32Metadata(
        static_cast<std::int32_t>(config.seed)));
    auto accessor = output->getAccessor();
    const std::size_t primary = config.seed % sources.size();
    constexpr int componentCount = 5;
    const int morphologyProfile = static_cast<int>((config.seed / 3U) % 4U);
    output->insertMeta("cloud:morphology-profile",
        openvdb::Int32Metadata(morphologyProfile));
    std::array<double, componentCount> centerZ {
        0.25, 0.43, 0.62, 0.79, 0.48};
    std::array<double, componentCount> centerX {
        0.48, 0.50, 0.53, 0.56, 0.44};
    std::array<double, componentCount> extentX {
        1.02, 0.72, 0.56, 0.39, 0.50};
    std::array<double, componentCount> extentY {
        0.96, 0.77, 0.64, 0.50, 0.58};
    std::array<double, componentCount> extentZ {
        0.52, 0.61, 0.55, 0.39, 0.44};
    if (morphologyProfile == 0) {
        centerZ = {0.22, 0.43, 0.64, 0.82, 0.51};
        centerX = {0.48, 0.49, 0.51, 0.53, 0.43};
        extentX = {0.88, 0.63, 0.48, 0.34, 0.40};
        extentZ = {0.48, 0.62, 0.56, 0.38, 0.43};
    } else if (morphologyProfile == 1) {
        centerZ = {0.24, 0.39, 0.57, 0.73, 0.45};
        centerX = {0.48, 0.42, 0.55, 0.61, 0.31};
        extentX = {1.08, 0.78, 0.60, 0.43, 0.60};
        extentY = {1.00, 0.81, 0.67, 0.52, 0.66};
    } else if (morphologyProfile == 2) {
        centerZ = {0.23, 0.42, 0.62, 0.81, 0.47};
        centerX = {0.39, 0.44, 0.53, 0.64, 0.34};
        extentX = {0.96, 0.68, 0.51, 0.35, 0.47};
        extentZ = {0.50, 0.61, 0.54, 0.37, 0.43};
    } else {
        centerZ = {0.23, 0.42, 0.62, 0.78, 0.63};
        centerX = {0.49, 0.42, 0.43, 0.45, 0.68};
        extentX = {1.04, 0.62, 0.48, 0.34, 0.46};
        extentY = {0.98, 0.71, 0.59, 0.47, 0.58};
        extentZ = {0.50, 0.58, 0.53, 0.38, 0.54};
    }
    std::uint64_t active = 0;
    double maximum = 0.0;
    for (int z = 0; z < config.height; ++z) {
        for (int y = 0; y < config.depth; ++y) {
            for (int x = 0; x < config.width; ++x) {
                const double px = (x + 0.5) / config.width;
                const double py = (y + 0.5) / config.depth;
                const double pz = (z + 0.5) / config.height;
                const double warpX = 0.040 * (fbm(
                    px * 4.1, py * 4.7, pz * 3.3, config.seed + 101U) - 0.5);
                const double warpY = 0.035 * (fbm(
                    py * 4.3, pz * 3.9, px * 4.9, config.seed + 151U) - 0.5);
                const double warpZ = 0.025 * (fbm(
                    pz * 3.7, px * 4.5, py * 4.1, config.seed + 211U) - 0.5);
                double assembledDensity = 0.0;
                for (int component = 0; component < componentCount; ++component) {
                    const std::size_t index =
                        (primary + component + morphologyProfile) % sources.size();
                    const double angle = (lattice(
                        component, 7, 11, config.seed + 271U) - 0.5) * 0.46;
                    const double cosine = std::cos(angle);
                    const double sine = std::sin(angle);
                    const double profileDrift = morphologyProfile == 2
                        ? 0.12 * (centerZ[component] - 0.23) : 0.0;
                    const double jitteredCenterX = centerX[component] +
                        profileDrift + 0.08 * (lattice(component, 37, 41,
                            config.seed + 293U) - 0.5);
                    const double jitteredCenterY = 0.50 + 0.08 * (lattice(
                        component, 43, 47, config.seed + 307U) - 0.5);
                    const double scaleX = extentX[component] * (0.91 + 0.18 *
                        lattice(component, 13, 17, config.seed + 277U));
                    const double scaleY = extentY[component] * (0.91 + 0.18 *
                        lattice(component, 19, 23, config.seed + 281U));
                    const double scaleZ = extentZ[component] * (0.91 + 0.18 *
                        lattice(component, 29, 31, config.seed + 283U));
                    const double centeredX = px - jitteredCenterX + warpX;
                    const double centeredY = py - jitteredCenterY + warpY;
                    const double qx = 0.5 +
                        (cosine * centeredX - sine * centeredY) / scaleX;
                    const double qy = 0.5 +
                        (sine * centeredX + cosine * centeredY) / scaleY;
                    const double qz = 0.5 +
                        (pz - centerZ[component] + warpZ) / scaleZ;
                    const double value = (qx < 0.0 || qx > 1.0 ||
                        qy < 0.0 || qy > 1.0 || qz < 0.0 || qz > 1.0) ? 0.0 :
                        sampleSource(sources[index], qx, qy, qz);
                    assembledDensity = std::max(assembledDensity, value);
                }
                // Reintroduce resolved boundary/interior turbulence after
                // deformation. This is density variation in object space, not
                // image noise, and therefore survives sample convergence.
                const double microDetail = fbm(
                    px * 53.0, py * 61.0, pz * 47.0, config.seed + 401U);
                const double mesoDetail = fbm(
                    px * 17.0, py * 19.0, pz * 15.0, config.seed + 431U);
                const double detailScale =
                    (0.13 + 1.74 * microDetail) * (0.54 + 0.88 * mesoDetail);
                const double shapedDensity = std::pow(assembledDensity, 1.45);
                const double erosion = 0.052 * (1.0 - mesoDetail) +
                    0.026 * (1.0 - microDetail);
                const double density = std::clamp(
                    shapedDensity * detailScale - erosion, 0.0, 1.0);
                if (density <= 0.002) continue;
                accessor.setValue(openvdb::Coord(x, y, z),
                    static_cast<float>(density));
                ++active;
                maximum = std::max(maximum, density);
            }
        }
    }
    std::filesystem::create_directories(config.output.parent_path());
    openvdb::io::File file(config.output.string());
    openvdb::GridPtrVec grids {output};
    file.write(grids);
    file.close();
    canonicalizeUuid(config.output, config);
    std::cout << "CLOUD_VDB_SYNTHESIZER_METRICS:{\"activeVoxels\":"
              << active << ",\"maxDensity\":" << maximum
              << ",\"primarySource\":" << primary
              << ",\"morphologyProfile\":" << morphologyProfile
              << ",\"output\":\""
              << config.output.string() << "\"}\n";
    return active == 0 ? 2 : 0;
} catch (const std::exception& error) {
    std::cerr << "CLOUD_VDB_SYNTHESIZER_ERROR:" << error.what() << '\n';
    return 1;
}
