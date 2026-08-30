#include <openvdb/io/File.h>
#include <openvdb/openvdb.h>

#include <cstdint>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace {

struct Config {
    std::filesystem::path input;
    std::filesystem::path output;
    std::string grid = "density_noise";
    std::uint32_t seed = 1;
};

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
        if (argument == "--input") config.input = value();
        else if (argument == "--output") config.output = value();
        else if (argument == "--grid") config.grid = value();
        else if (argument == "--seed") config.seed = std::stoul(value());
        else throw std::runtime_error("Unknown argument: " + std::string(argument));
    }
    if (config.input.empty() || config.output.empty()) {
        throw std::runtime_error("--input and --output are required");
    }
    return config;
}

} // namespace

int main(int argc, char** argv)
try {
    const Config config = parseArguments(argc, argv);
    openvdb::initialize();
    openvdb::io::File input(config.input.string());
    input.open();
    auto base = input.readGrid(config.grid);
    input.close();
    auto source = openvdb::gridPtrCast<openvdb::FloatGrid>(base);
    if (!source) throw std::runtime_error(
        "Input has no float grid named " + config.grid);
    auto density = source->deepCopy();
    density->setName("density");
    density->setGridClass(openvdb::GRID_FOG_VOLUME);
    density->tree().prune(0.0f);
    density->insertMeta("cloud:genus", openvdb::StringMetadata("cumulus"));
    density->insertMeta("cloud:species",
        openvdb::StringMetadata("cumulus-congestus"));
    density->insertMeta("cloud:authoring",
        openvdb::StringMetadata("mantaflow-convection-v1"));
    density->insertMeta("cloud:seed", openvdb::Int32Metadata(
        static_cast<std::int32_t>(config.seed)));
    const auto bounds = density->evalActiveVoxelBoundingBox();
    const auto active = density->activeVoxelCount();
    if (bounds.empty() || active == 0) {
        throw std::runtime_error("Normalized density grid is empty");
    }
    std::filesystem::create_directories(config.output.parent_path());
    openvdb::io::File output(config.output.string());
    openvdb::GridPtrVec grids {density};
    output.write(grids);
    output.close();
    const auto dimensions = bounds.dim();
    std::cout << "CLOUD_VDB_NORMALIZER_METRICS:{\"activeVoxels\":"
              << active << ",\"dimensions\":[" << dimensions.x() << ','
              << dimensions.y() << ',' << dimensions.z() << "],\"output\":\""
              << config.output.string() << "\"}\n";
    return 0;
} catch (const std::exception& error) {
    std::cerr << "CLOUD_VDB_NORMALIZER_ERROR:" << error.what() << '\n';
    return 1;
}
