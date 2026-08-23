#include <openvdb/openvdb.h>
#include <openvdb/io/File.h>
#include <openvdb/tools/Interpolation.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

int main(int argc, char** argv) {
    if (argc != 4) {
        std::cerr << "usage: convert-vdb-density INPUT.vdb OUTPUT.bin RESOLUTION\n";
        return 2;
    }

    const std::string input = argv[1];
    const std::string output = argv[2];
    const int resolution = std::stoi(argv[3]);
    if (resolution < 16) throw std::runtime_error("resolution must be >= 16");

    openvdb::initialize();
    openvdb::io::File file(input);
    file.open();
    openvdb::GridBase::Ptr base;
    try {
        base = file.readGrid("density");
    } catch (const openvdb::KeyError&) {
        for (auto iterator = file.beginName(); iterator != file.endName(); ++iterator) {
            base = file.readGrid(iterator.gridName());
            if (base->isType<openvdb::FloatGrid>()) break;
            base.reset();
        }
    }
    file.close();
    if (!base || !base->isType<openvdb::FloatGrid>()) {
        throw std::runtime_error("VDB has no FloatGrid density field");
    }

    auto grid = openvdb::gridPtrCast<openvdb::FloatGrid>(base);
    const openvdb::CoordBBox bounds = grid->evalActiveVoxelBoundingBox();
    const openvdb::Coord minimum = bounds.min();
    const openvdb::Coord maximum = bounds.max();
    const openvdb::Vec3d span(
        std::max(1, maximum.x() - minimum.x()),
        std::max(1, maximum.y() - minimum.y()),
        std::max(1, maximum.z() - minimum.z())
    );
    const auto accessor = grid->getConstAccessor();

    const int horizontalGuard = std::max(2, static_cast<int>(
        std::round((resolution - 1) * 4.0 / 95.0)));
    const int verticalGuard = std::max(2, static_cast<int>(
        std::round((resolution - 1) * 6.0 / 95.0)));
    const int horizontalMaximum = resolution - 1 - horizontalGuard;
    const int verticalMaximum = resolution - 1 - verticalGuard;
    std::vector<std::uint8_t> density(
        static_cast<std::size_t>(resolution) * resolution * resolution, 0);

    std::size_t positive = 0;
    double mass = 0.0;
    for (int z = horizontalGuard; z <= horizontalMaximum; ++z) {
        const double nz = static_cast<double>(z - horizontalGuard) /
            std::max(1, horizontalMaximum - horizontalGuard);
        for (int y = verticalGuard; y <= verticalMaximum; ++y) {
            const double ny = static_cast<double>(y - verticalGuard) /
                std::max(1, verticalMaximum - verticalGuard);
            for (int x = horizontalGuard; x <= horizontalMaximum; ++x) {
                const double nx = static_cast<double>(x - horizontalGuard) /
                    std::max(1, horizontalMaximum - horizontalGuard);
                const openvdb::Vec3R coordinate(
                    minimum.x() + nx * span.x(),
                    minimum.y() + ny * span.y(),
                    minimum.z() + nz * span.z()
                );
                const float value = openvdb::tools::BoxSampler::sample(
                    accessor,
                    coordinate
                );
                const auto encoded = static_cast<std::uint8_t>(std::lround(
                    std::clamp(static_cast<double>(value), 0.0, 1.0) * 255.0
                ));
                const std::size_t index =
                    (static_cast<std::size_t>(z) * resolution + y) * resolution + x;
                density[index] = encoded;
                if (encoded > 0) ++positive;
                mass += encoded;
            }
        }
    }

    std::ofstream stream(output, std::ios::binary);
    stream.write(reinterpret_cast<const char*>(density.data()),
        static_cast<std::streamsize>(density.size()));
    if (!stream) throw std::runtime_error("could not write output density field");

    std::cout << "{\"input\":\"" << input << "\",\"output\":\"" << output
              << "\",\"resolution\":" << resolution
              << ",\"bboxMin\":[" << minimum.x() << ',' << minimum.y() << ','
              << minimum.z() << "],\"bboxMax\":[" << maximum.x() << ','
              << maximum.y() << ',' << maximum.z() << "],\"positiveVoxels\":"
              << positive << ",\"densityByteMass\":" << mass << "}\n";
    return 0;
}
