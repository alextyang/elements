#include <openvdb/openvdb.h>
#include <openvdb/tools/Interpolation.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

constexpr int kResolution = 96;
constexpr int kGuardVoxels = 4;

double sourceCoordinate(int outputCoordinate, int sourceMinimum,
                        int sourceMaximum) {
    const double denominator =
        static_cast<double>(kResolution - 1 - 2 * kGuardVoxels);
    const double unit =
        (static_cast<double>(outputCoordinate) - kGuardVoxels) / denominator;
    return std::lerp(static_cast<double>(sourceMinimum),
                     static_cast<double>(sourceMaximum), unit);
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 3) {
        std::cerr << "Usage: vdb-density-to-r8 INPUT.vdb OUTPUT.bin\n";
        return 2;
    }

    openvdb::initialize();
    openvdb::io::File file(argv[1]);
    file.open();
    openvdb::GridBase::Ptr base = file.readGrid("density");
    file.close();
    auto density = openvdb::gridPtrCast<openvdb::FloatGrid>(base);
    if (!density) {
        throw std::runtime_error("density grid is not a FloatGrid");
    }

    const openvdb::CoordBBox bounds = density->evalActiveVoxelBoundingBox();
    if (bounds.empty()) {
        throw std::runtime_error("density grid has no active voxels");
    }

    const auto accessor = density->getConstAccessor();
    const openvdb::tools::GridSampler<
        openvdb::FloatGrid::ConstAccessor,
        openvdb::tools::BoxSampler> sampler(accessor, density->transform());
    std::vector<std::uint8_t> output(
        kResolution * kResolution * kResolution, 0);

    for (int z = kGuardVoxels; z < kResolution - kGuardVoxels; ++z) {
        for (int y = kGuardVoxels; y < kResolution - kGuardVoxels; ++y) {
            for (int x = kGuardVoxels; x < kResolution - kGuardVoxels; ++x) {
                const openvdb::Vec3d sourceIndex(
                    sourceCoordinate(x, bounds.min().x(), bounds.max().x()),
                    sourceCoordinate(y, bounds.min().y(), bounds.max().y()),
                    sourceCoordinate(z, bounds.min().z(), bounds.max().z()));
                const float value = std::clamp(
                    sampler.isSample(sourceIndex), 0.0f, 1.0f);
                output[(z * kResolution + y) * kResolution + x] =
                    static_cast<std::uint8_t>(std::lround(value * 255.0f));
            }
        }
    }

    std::ofstream stream(argv[2], std::ios::binary | std::ios::trunc);
    if (!stream) throw std::runtime_error("unable to open output file");
    stream.write(reinterpret_cast<const char*>(output.data()),
                 static_cast<std::streamsize>(output.size()));
    if (!stream) throw std::runtime_error("unable to write output file");

    std::cout << "Wrote " << output.size() << " bytes from density bbox "
              << bounds.min() << " -> " << bounds.max() << "\n";
    return 0;
}
