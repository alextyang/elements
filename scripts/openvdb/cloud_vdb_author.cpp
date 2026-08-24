#include <openvdb/io/File.h>
#include <openvdb/openvdb.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
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

namespace {

constexpr double kTau = 6.283185307179586476925286766559;

struct Vec3 {
    double x;
    double y;
    double z;
};

struct Config {
    std::string genus;
    std::string species;
    std::filesystem::path output;
    std::uint32_t seed = 1;
    int width = 256;
    int depth = 160;
    int height = 144;
    double voxelSize = 0.08;
    double evolution = 0.0;
};

bool contains(std::string_view value, std::string_view fragment)
{
    return value.find(fragment) != std::string_view::npos;
}

double clamp01(double value)
{
    return std::clamp(value, 0.0, 1.0);
}

double smoothstep(double edge0, double edge1, double value)
{
    const double x = clamp01((value - edge0) / (edge1 - edge0));
    return x * x * (3.0 - 2.0 * x);
}

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

double valueNoise(Vec3 p, std::uint32_t seed)
{
    const int x0 = static_cast<int>(std::floor(p.x));
    const int y0 = static_cast<int>(std::floor(p.y));
    const int z0 = static_cast<int>(std::floor(p.z));
    const double tx = fade(p.x - x0);
    const double ty = fade(p.y - y0);
    const double tz = fade(p.z - z0);
    const auto lerp = [](double a, double b, double t) {
        return a + (b - a) * t;
    };
    std::array<double, 8> corners {};
    int index = 0;
    for (int z = 0; z < 2; ++z) {
        for (int y = 0; y < 2; ++y) {
            for (int x = 0; x < 2; ++x) {
                corners[index++] = lattice(x0 + x, y0 + y, z0 + z, seed);
            }
        }
    }
    const double x00 = lerp(corners[0], corners[1], tx);
    const double x10 = lerp(corners[2], corners[3], tx);
    const double x01 = lerp(corners[4], corners[5], tx);
    const double x11 = lerp(corners[6], corners[7], tx);
    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
}

double fbm(Vec3 p, std::uint32_t seed, int octaves)
{
    double value = 0.0;
    double amplitude = 0.5;
    double normalization = 0.0;
    for (int octave = 0; octave < octaves; ++octave) {
        value += amplitude * valueNoise(p, seed + octave * 0x632be5abU);
        normalization += amplitude;
        p = {
            2.03 * p.x + 7.13,
            2.01 * p.y - 3.71,
            2.07 * p.z + 5.29,
        };
        amplitude *= 0.5;
    }
    return value / normalization;
}

double worleyF1(Vec3 p, std::uint32_t seed)
{
    const int cellX = static_cast<int>(std::floor(p.x));
    const int cellY = static_cast<int>(std::floor(p.y));
    const int cellZ = static_cast<int>(std::floor(p.z));
    double minimumSquared = std::numeric_limits<double>::max();
    for (int z = -1; z <= 1; ++z) {
        for (int y = -1; y <= 1; ++y) {
            for (int x = -1; x <= 1; ++x) {
                const int candidateX = cellX + x;
                const int candidateY = cellY + y;
                const int candidateZ = cellZ + z;
                const Vec3 feature {
                    candidateX + lattice(
                        candidateX, candidateY, candidateZ, seed + 521U),
                    candidateY + lattice(
                        candidateX, candidateY, candidateZ, seed + 523U),
                    candidateZ + lattice(
                        candidateX, candidateY, candidateZ, seed + 541U),
                };
                const double dx = p.x - feature.x;
                const double dy = p.y - feature.y;
                const double dz = p.z - feature.z;
                minimumSquared = std::min(
                    minimumSquared, dx * dx + dy * dy + dz * dz);
            }
        }
    }
    return clamp01(std::sqrt(minimumSquared) / 1.05);
}

Vec3 warp(Vec3 p, std::uint32_t seed, double strength)
{
    const Vec3 q { p.x * 0.42, p.y * 0.42, p.z * 0.42 };
    return {
        p.x + strength * (fbm(q, seed + 11U, 4) - 0.5),
        p.y + strength * (fbm({q.y, q.z, q.x}, seed + 29U, 4) - 0.5),
        p.z + strength * (fbm({q.z, q.x, q.y}, seed + 47U, 4) - 0.5),
    };
}

double ellipse(Vec3 p, Vec3 center, Vec3 radius)
{
    const double x = (p.x - center.x) / radius.x;
    const double y = (p.y - center.y) / radius.y;
    const double z = (p.z - center.z) / radius.z;
    return 1.0 - std::sqrt(x * x + y * y + z * z);
}

double convectiveEnvelope(Vec3 p, std::uint32_t seed, bool deep, bool anvil)
{
    const double top = deep ? 0.94 : 0.72;
    const double vertical = clamp01(p.z / top);
    const double windShear = deep ? 0.26 * vertical * vertical : 0.08 * vertical;
    p.x -= windShear;
    const Vec3 warped = warp({p.x * 5.0, p.y * 5.0, p.z * 4.0}, seed, 0.42);
    const double radius = (deep ? 0.17 : 0.22) *
        (0.72 + 0.52 * std::sin(vertical * 2.8));
    double field = ellipse(
        {warped.x / 5.0, warped.y / 5.0, warped.z / 4.0},
        {0.0, 0.0, (deep ? 0.47 : 0.36)},
        {radius * (1.0 + 0.35 * vertical), radius, top * 0.58});
    const double cauliflower = fbm(
        {p.x * 15.0, p.y * 15.0, p.z * 12.0}, seed + 101U, 5);
    field += 0.28 * (cauliflower - 0.48);
    field -= 0.14 * smoothstep(0.0, 0.10, p.z);
    if (anvil) {
        const double anvilHeight = std::abs(p.z - 0.82) / 0.10;
        const double anvilRadius = std::sqrt(
            std::pow((p.x - 0.14) / 0.52, 2.0) +
            std::pow(p.y / 0.26, 2.0));
        double anvil = 1.0 - std::max(anvilHeight, anvilRadius);
        anvil += 0.22 * (fbm(
            {p.x * 18.0, p.y * 18.0, p.z * 8.0}, seed + 211U, 5) - 0.5);
        field = std::max(field, anvil);
    }
    return field;
}

// A mature thunderstorm is a connected mesoscale system, not a pile of
// spherical emitters.  This field grows convection out of a shared turbulent
// boundary-layer shelf, bends the main updraft through vertical wind shear,
// and joins it continuously to a downwind ice-outflow shield.  All boundaries
// are displaced in object space before voxelization, so no screen-space or
// camera-radial pattern can be introduced here.
double stormComplexEnvelope(Vec3 p, std::uint32_t seed, bool anvil)
{
    const Vec3 domain = warp(
        {p.x * 3.6, p.y * 4.2, p.z * 3.0}, seed + 401U, 0.31);
    const Vec3 q {domain.x / 3.6, domain.y / 4.2, domain.z / 3.0};
    const double z = q.z;

    // The primary updraft leans downwind and changes cross-section with
    // height.  Broad non-periodic modulation avoids the rotational symmetry
    // of an ellipsoid while retaining a physically legible vertical column.
    const double shear = smoothstep(0.16, 0.92, z);
    const double centerX = -0.08 + 0.13 * shear * shear +
        0.035 * (fbm({z * 2.7, 1.3, 4.1}, seed + 409U, 4) - 0.5);
    const double centerY = 0.015 + 0.055 * (fbm(
        {2.8, z * 3.1, 6.7}, seed + 419U, 4) - 0.5);
    const double lowerBroadening = std::exp(-std::pow((z - 0.23) / 0.19, 2.0));
    const double upperPulse = std::exp(-std::pow((z - 0.67) / 0.17, 2.0));
    const double tropopausePinch = smoothstep(0.82, 0.97, z);
    const double pulseX = fbm({z * 6.8, 5.7, 2.3}, seed + 423U, 5);
    const double pulseY = fbm({3.1, z * 7.4, 8.9}, seed + 427U, 5);
    const double radiusX = (0.155 + 0.110 * lowerBroadening +
        0.058 * upperPulse - 0.040 * tropopausePinch) *
        (0.72 + 0.66 * pulseX);
    const double radiusY = (0.140 + 0.086 * lowerBroadening +
        0.035 * upperPulse - 0.030 * tropopausePinch) *
        (0.74 + 0.62 * pulseY);
    const double dx = (q.x - centerX) / std::max(0.070, radiusX);
    const double dy = (q.y - centerY) / std::max(0.065, radiusY);
    const double angularBreakup = 0.12 * (fbm(
        {(q.x + 0.41) * 8.0, (q.y - 0.17) * 9.0, z * 6.0},
        seed + 431U, 5) - 0.5);
    const double towerCrossSection = 1.0 -
        std::pow(std::pow(std::abs(dx), 2.65) +
            std::pow(std::abs(dy), 2.15), 1.0 / 2.4) + angularBreakup;
    const double verticalWindow = smoothstep(0.075, 0.15, z) *
        (1.0 - smoothstep(0.93, 0.995, z));
    double field = towerCrossSection + verticalWindow - 1.0;

    // Shared turbulent inflow shelf.  A continuous top-height map grows
    // irregular feeder convection without discrete blobs or particle sites.
    const double inflowNoise = fbm(
        {(q.x + 0.17) * 4.3, (q.y - 0.04) * 5.2, 0.37},
        seed + 443U, 6);
    const double ridgeNoise = 1.0 - std::abs(2.0 * fbm(
        {(q.x - 0.11) * 7.0, (q.y + 0.19) * 6.0, 2.1},
        seed + 449U, 5) - 1.0);
    const double feederTop = 0.19 + 0.31 * std::pow(
        smoothstep(0.47, 0.78, 0.72 * inflowNoise + 0.28 * ridgeNoise), 1.25);
    const double shelfX = smoothstep(-0.53, -0.43, q.x) *
        (1.0 - smoothstep(0.35, 0.49, q.x));
    const double shelfY = smoothstep(-0.43, -0.32, q.y) *
        (1.0 - smoothstep(0.28, 0.42, q.y));
    const double shelfBottom = smoothstep(0.055, 0.12, z);
    const double feederVertical = 1.0 - smoothstep(
        feederTop - 0.055, feederTop + 0.045, z);
    const double feederInterior = std::min(shelfX, shelfY) *
        shelfBottom * feederVertical;
    const double feederEdge = 0.18 * (fbm(
        {q.x * 15.0, q.y * 16.0, z * 12.0}, seed + 457U, 5) - 0.52);
    field = std::max(field, feederInterior - 0.54 + feederEdge);

    if (anvil) {
        // A sheared, asymmetric incus joined to the tower at the tropopause.
        // The shield is deliberately longer downwind (+X) than upwind.
        const double anvilCenter = 0.840 + 0.028 * q.x +
            0.018 * (fbm({q.x * 3.0, q.y * 3.0, 1.8}, seed + 463U, 4) - 0.5);
        const double thickness = 0.026 + 0.020 *
            (1.0 - smoothstep(-0.08, 0.52, q.x));
        const double vertical = 1.0 - std::abs(z - anvilCenter) / thickness;
        const double downwind = smoothstep(-0.12, -0.04, q.x) *
            (1.0 - smoothstep(0.44, 0.57, q.x));
        const double lateralCenter = 0.02 + 0.10 * q.x;
        const double lateralRadius = 0.22 + 0.10 * smoothstep(-0.08, 0.46, q.x);
        const double lateral = 1.0 -
            std::pow(std::abs((q.y - lateralCenter) / lateralRadius), 1.65);
        const double iceTurbulence = 0.34 * (fbm(
            {(q.x + 0.3) * 11.0, (q.y - 0.2) * 14.0, z * 8.0},
            seed + 467U, 6) - 0.49);
        const double iceFibres = 0.20 * (fbm(
            {(q.x + 0.1) * 4.0, (q.y - 0.2) * 36.0, z * 11.0},
            seed + 471U, 6) - 0.50);
        const double anvilSupport = std::min(
            std::min(vertical, lateral), downwind);
        const double turbulenceMask = smoothstep(-0.22, 0.08, anvilSupport);
        const double anvilField = anvilSupport +
            (iceTurbulence + iceFibres) * turbulenceMask - 0.12;
        field = std::max(field, anvilField);

        // A small overshooting top is part of the same updraft field.  Its
        // superelliptic, warped section avoids a circular cap silhouette.
        const Vec3 over = warp(
            {(p.x - 0.17) * 13.0, (p.y - 0.02) * 15.0,
                (p.z - 0.94) * 12.0}, seed + 479U, 0.24);
        const double overshoot = 1.0 - std::pow(
            std::pow(std::abs(over.x), 2.8) +
            std::pow(std::abs(over.y), 2.2) +
            std::pow(std::abs(over.z), 3.3), 1.0 / 2.7);
        field = std::max(field, overshoot);
    }

    // Boundary erosion is strongest at cloud edges and weak in the optically
    // thick core, preserving mass while exposing nested turbulent scales.
    const double macroEdge = fbm(
        {(q.x + 0.23) * 9.0, (q.y - 0.31) * 10.5, z * 7.5},
        seed + 481U, 6);
    const double coarseBillow = 1.0 - worleyF1(
        {(q.x + 0.19) * 7.0, (q.y - 0.23) * 8.0, z * 6.2},
        seed + 482U);
    const double fineBillow = 1.0 - worleyF1(
        {(q.x - 0.11) * 15.0, (q.y + 0.29) * 17.0, z * 13.0},
        seed + 483U);
    const double edgeDetail = fbm(
        {q.x * 26.0, q.y * 29.0, z * 23.0}, seed + 487U, 6);
    field += (0.30 * (macroEdge - 0.50) +
        0.45 * (coarseBillow - 0.48) +
        0.22 * (fineBillow - 0.48) +
        0.18 * (edgeDetail - 0.50)) *
        (1.0 - smoothstep(0.10, 0.58, field));
    return field;
}

double stratiformEnvelope(Vec3 p, std::uint32_t seed, double base, double top,
    double brokenness)
{
    const Vec3 warped = warp({p.x * 3.0, p.y * 3.0, p.z * 6.0}, seed, 0.24);
    const double wz = warped.z / 6.0;
    const double lower = smoothstep(base - 0.025, base + 0.035, wz);
    const double upper = 1.0 - smoothstep(top - 0.045, top + 0.035, wz);
    const double edge = smoothstep(0.50, 0.44, std::abs(p.x)) *
        smoothstep(0.50, 0.44, std::abs(p.y));
    const double macro = fbm({p.x * 4.0, p.y * 4.0, p.z * 2.0}, seed + 73U, 5);
    const double detail = fbm({p.x * 18.0, p.y * 18.0, p.z * 9.0}, seed + 97U, 4);
    const double coverage = smoothstep(brokenness, brokenness + 0.18, macro);
    return lower * upper * edge * coverage * (0.72 + 0.45 * detail);
}

double fibrousEnvelope(Vec3 p, std::uint32_t seed, bool veil)
{
    const double shear = 0.34 * (p.z - 0.62);
    const double wave = 0.025 * std::sin(14.0 * p.x + 4.0 * p.y);
    const double center = 0.70 + wave;
    const double thickness = veil ? 0.050 : 0.022;
    const double sheet = 1.0 - std::abs(p.z - center) / thickness;
    const double streakCoordinate = p.y + shear +
        0.10 * (fbm({p.x * 5.0, p.y * 5.0, p.z * 2.0}, seed, 4) - 0.5);
    const double crossWarp = 0.20 * (fbm(
        {p.x * 7.0, p.y * 7.0, p.z * 4.0}, seed + 127U, 4) - 0.5);
    const double fibreTurbulence = fbm({
        p.x * 3.5,
        (streakCoordinate + crossWarp) * 31.0,
        p.z * 5.0,
    }, seed + 131U, 6);
    const double fibres = smoothstep(0.43, 0.73, fibreTurbulence);
    const double field = veil
        ? sheet * (0.38 + 0.72 * fibreTurbulence)
        : std::min(sheet, fibres - 0.08);
    const double edge = smoothstep(0.50, 0.42, std::abs(p.x)) *
        smoothstep(0.50, 0.42, std::abs(p.y));
    return field * edge;
}

double lenticularEnvelope(Vec3 p, std::uint32_t seed, double center)
{
    const Vec3 warped = warp({p.x * 5.0, p.y * 5.0, p.z * 9.0}, seed, 0.12);
    const Vec3 q {warped.x / 5.0, warped.y / 5.0, warped.z / 9.0};
    const double horizontal = std::pow(std::abs(q.x / 0.42), 3.2) +
        std::pow(std::abs(q.y / 0.22), 3.2);
    const double primary = 1.0 - horizontal -
        std::pow(std::abs((q.z - center) / 0.048), 2.0);
    const double secondary = 1.0 - 1.35 * horizontal -
        std::pow(std::abs((q.z - center - 0.085) / 0.030), 2.0);
    const double ripples = 0.10 * (fbm(
        {p.x * 22.0, p.y * 22.0, p.z * 16.0}, seed + 157U, 4) - 0.5);
    return smoothstep(-0.08, 0.14, std::max(primary, secondary) + ripples);
}

double volutusEnvelope(Vec3 p, std::uint32_t seed, double center)
{
    const double meander = 0.035 * std::sin(7.0 * p.x) +
        0.025 * (fbm({p.x * 5.0, p.y * 4.0, p.z * 3.0}, seed, 4) - 0.5);
    const double y = (p.y - meander) / 0.18;
    const double z = (p.z - center) / 0.075;
    const double roll = 1.0 - std::sqrt(y * y + z * z);
    const double finite = smoothstep(0.50, 0.42, std::abs(p.x));
    const double detail = 0.20 * (fbm(
        {p.x * 18.0, p.y * 22.0, p.z * 18.0}, seed + 181U, 5) - 0.5);
    return smoothstep(-0.10, 0.16, roll + detail) * finite;
}

double cellularTowerEnvelope(Vec3 p, std::uint32_t seed, double base,
    double top, bool fragmented)
{
    const double commonBase = stratiformEnvelope(p, seed, base, base + 0.07, 0.38);
    const double sites = fbm({p.x * 10.0, p.y * 10.0, 0.4}, seed + 223U, 4);
    const double towers = smoothstep(0.55, 0.72, sites) *
        smoothstep(base - 0.03, base + 0.03, p.z) *
        (1.0 - smoothstep(top - 0.08, top + 0.03, p.z));
    const double eroded = fragmented
        ? towers * smoothstep(0.44, 0.67, fbm(
            {p.x * 20.0, p.y * 20.0, p.z * 16.0}, seed + 251U, 4))
        : towers;
    return clamp01(std::max(commonBase * (fragmented ? 0.45 : 0.75), eroded));
}

double applySpeciesMorphology(std::string_view species, std::string_view genus,
    Vec3 p, std::uint32_t seed, double baseDensity)
{
    if (species.empty()) return baseDensity;
    if (contains(species, "lenticularis")) {
        return lenticularEnvelope(p, seed, genus == "cirrocumulus" ? 0.71 : 0.57);
    }
    if (contains(species, "volutus")) {
        return volutusEnvelope(p, seed, genus == "stratocumulus" ? 0.39 : 0.56);
    }
    if (contains(species, "castellanus")) {
        const double base = genus == "cirrus" || genus == "cirrocumulus" ? 0.66 : 0.50;
        return cellularTowerEnvelope(p, seed, base, base + 0.20, false);
    }
    if (contains(species, "floccus")) {
        const double base = genus == "cirrus" || genus == "cirrocumulus" ? 0.67 : 0.51;
        return cellularTowerEnvelope(p, seed, base, base + 0.14, true);
    }
    if (contains(species, "fractus")) {
        const double erosion = smoothstep(0.47, 0.68, fbm(
            {p.x * 13.0, p.y * 13.0, p.z * 11.0}, seed + 277U, 5));
        return baseDensity * erosion;
    }
    if (contains(species, "humilis")) {
        const double cap = 1.0 - smoothstep(0.34, 0.47, p.z);
        return baseDensity * cap;
    }
    if (contains(species, "mediocris")) {
        const double cap = 1.0 - smoothstep(0.52, 0.67, p.z);
        return baseDensity * cap;
    }
    if (contains(species, "calvus")) {
        return baseDensity * (1.0 - 0.18 * smoothstep(0.64, 0.90, p.z));
    }
    if (contains(species, "capillatus")) {
        // Cumulonimbus capillatus fibres are authored inside the connected
        // storm outflow field.  Adding a second free-standing cirrus field
        // here would create detached ice flecks upstream of the incus.
        return baseDensity;
    }
    if (contains(species, "uncinus")) {
        const double hook = ellipse(p, {0.16, -0.04, 0.76}, {0.17, 0.10, 0.075});
        return clamp01(std::max(baseDensity * 0.82,
            smoothstep(-0.10, 0.12, hook) *
            smoothstep(0.35, 0.66, fbm(
                {p.x * 15.0, p.y * 15.0, p.z * 12.0}, seed + 293U, 4))));
    }
    if (contains(species, "spissatus")) {
        return clamp01(baseDensity * 1.45);
    }
    if (contains(species, "fibratus")) {
        return clamp01(baseDensity * 0.78);
    }
    if (contains(species, "nebulosus")) {
        return clamp01(0.82 * baseDensity + 0.12 * smoothstep(
            0.42, 0.66, fbm({p.x * 4.0, p.y * 4.0, p.z * 3.0}, seed + 307U, 4)));
    }
    return baseDensity;
}

double densityFor(std::string_view genus, std::string_view species, Vec3 p,
    std::uint32_t seed)
{
    double field = 0.0;
    if (genus == "cumulonimbus") {
        field = stormComplexEnvelope(p, seed, contains(species, "incus"));
    } else if (genus == "cumulus") {
        field = convectiveEnvelope(p, seed, false, false);
    } else if (genus == "stratus") {
        field = stratiformEnvelope(p, seed, 0.24, 0.38, 0.28);
    } else if (genus == "stratocumulus") {
        field = stratiformEnvelope(p, seed, 0.28, 0.48, 0.42);
    } else if (genus == "nimbostratus") {
        field = stratiformEnvelope(p, seed, 0.20, 0.60, 0.20);
    } else if (genus == "altostratus") {
        field = stratiformEnvelope(p, seed, 0.45, 0.61, 0.24);
    } else if (genus == "altocumulus") {
        field = stratiformEnvelope(p, seed, 0.48, 0.63, 0.48);
    } else if (genus == "cirrostratus") {
        field = fibrousEnvelope(p, seed, true);
    } else if (genus == "cirrus") {
        field = fibrousEnvelope(p, seed, false);
    } else if (genus == "cirrocumulus") {
        const double layer = fibrousEnvelope(p, seed, true);
        const double cells = 0.5 + 0.5 * std::cos(48.0 * p.x +
            3.0 * std::sin(11.0 * p.y)) * std::cos(55.0 * p.y);
        field = layer * smoothstep(0.44, 0.70, cells);
    } else {
        throw std::runtime_error("Unsupported WMO genus: " + std::string(genus));
    }
    if (genus == "cumulonimbus") {
        const double envelope = smoothstep(-0.045, 0.125, field);
        const double coherent = fbm(
            {(p.x + 0.29) * 9.0, (p.y - 0.13) * 10.5, p.z * 8.0},
            seed + 503U, 6);
        const double fine = fbm(
            {p.x * 25.0, p.y * 27.0, p.z * 22.0}, seed + 509U, 5);
        const double erodedEnvelope = smoothstep(
            0.08, 0.70, envelope + 0.62 * (coherent - 0.5));
        field = erodedEnvelope * (0.16 + 1.15 * coherent) *
            (0.52 + 0.68 * fine);
    } else if (genus == "cumulus") {
        field = smoothstep(-0.07, 0.18, field) *
            (0.62 + 0.55 * fbm(
                {p.x * 24.0, p.y * 24.0, p.z * 20.0}, seed + 313U, 5));
    }
    return applySpeciesMorphology(species, genus, p, seed, field);
}

Config parseArguments(int argc, char** argv)
{
    Config config;
    for (int index = 1; index < argc; ++index) {
        const std::string_view argument(argv[index]);
        const auto value = [&]() -> std::string {
            if (++index >= argc) {
                throw std::runtime_error("Missing value after " + std::string(argument));
            }
            return argv[index];
        };
        if (argument == "--genus") config.genus = value();
        else if (argument == "--species") config.species = value();
        else if (argument == "--output") config.output = value();
        else if (argument == "--seed") config.seed = std::stoul(value());
        else if (argument == "--width") config.width = std::stoi(value());
        else if (argument == "--depth") config.depth = std::stoi(value());
        else if (argument == "--height") config.height = std::stoi(value());
        else if (argument == "--voxel-size") config.voxelSize = std::stod(value());
        else if (argument == "--evolution") config.evolution = std::stod(value());
        else throw std::runtime_error("Unknown argument: " + std::string(argument));
    }
    if (config.genus.empty() || config.output.empty()) {
        throw std::runtime_error("--genus and --output are required");
    }
    if (!config.species.empty() &&
        !config.species.starts_with(config.genus + "-")) {
        throw std::runtime_error("Species does not belong to requested genus");
    }
    if (config.width < 8 || config.depth < 8 || config.height < 8 ||
        config.voxelSize <= 0.0) {
        throw std::runtime_error("Invalid grid dimensions or voxel size");
    }
    return config;
}

std::string deterministicUuid(const Config& config)
{
    std::ostringstream identity;
        identity << "continuous-domain-warped-field-v2|" << config.genus << '|'
             << config.species << '|' << config.seed << '|' << config.width
             << '|' << config.depth << '|' << config.height << '|'
             << std::setprecision(17) << config.voxelSize << '|'
             << config.evolution;
    const std::string value = identity.str();
    const auto fnv = [&value](std::uint64_t offset, std::uint64_t prime) {
        std::uint64_t result = offset;
        for (const unsigned char byte : value) {
            result ^= byte;
            result *= prime;
        }
        return result;
    };
    std::ostringstream hexadecimal;
    hexadecimal << std::uppercase << std::hex << std::setfill('0')
                << std::setw(16) << fnv(1469598103934665603ULL, 1099511628211ULL)
                << std::setw(16) << fnv(1099511628211ULL, 1469598103934665603ULL);
    const std::string compact = hexadecimal.str();
    return compact.substr(0, 8) + '-' + compact.substr(8, 4) + '-' +
        compact.substr(12, 4) + '-' + compact.substr(16, 4) + '-' +
        compact.substr(20, 12);
}

void canonicalizeArchiveUuid(const std::filesystem::path& path,
    const Config& config)
{
    std::fstream stream(path, std::ios::in | std::ios::out | std::ios::binary);
    if (!stream) throw std::runtime_error("Unable to reopen authored VDB header");
    std::array<char, 128> header {};
    stream.read(header.data(), static_cast<std::streamsize>(header.size()));
    const std::string bytes(header.data(), static_cast<std::size_t>(stream.gcount()));
    const std::regex uuidPattern(
        "[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}");
    std::smatch match;
    if (!std::regex_search(bytes, match, uuidPattern)) {
        throw std::runtime_error("OpenVDB archive UUID was not found in header");
    }
    const std::string uuid = deterministicUuid(config);
    stream.clear();
    stream.seekp(static_cast<std::streamoff>(match.position()), std::ios::beg);
    stream.write(uuid.data(), static_cast<std::streamsize>(uuid.size()));
    if (!stream) throw std::runtime_error("Unable to canonicalize VDB archive UUID");
}

} // namespace

int main(int argc, char** argv)
try {
    const Config config = parseArguments(argc, argv);
    openvdb::initialize();
    auto grid = openvdb::FloatGrid::create(0.0f);
    grid->setName("density");
    grid->setGridClass(openvdb::GRID_FOG_VOLUME);
    grid->setTransform(openvdb::math::Transform::createLinearTransform(
        config.voxelSize));
    grid->insertMeta("cloud:genus", openvdb::StringMetadata(config.genus));
    grid->insertMeta("cloud:species", openvdb::StringMetadata(config.species));
    grid->insertMeta("cloud:authoring", openvdb::StringMetadata(
        "continuous-domain-warped-field-v2"));
    grid->insertMeta("cloud:seed", openvdb::Int32Metadata(
        static_cast<std::int32_t>(config.seed)));
    auto accessor = grid->getAccessor();
    std::uint64_t active = 0;
    double maximum = 0.0;
    const double phaseX = 0.07 * std::cos(kTau * config.evolution);
    const double phaseY = 0.07 * std::sin(kTau * config.evolution);
    for (int z = 0; z < config.height; ++z) {
        for (int y = 0; y < config.depth; ++y) {
            for (int x = 0; x < config.width; ++x) {
                const Vec3 p {
                    (static_cast<double>(x) + 0.5) / config.width - 0.5 + phaseX,
                    (static_cast<double>(y) + 0.5) / config.depth - 0.5 + phaseY,
                    (static_cast<double>(z) + 0.5) / config.height,
                };
                const double density = clamp01(densityFor(
                    config.genus, config.species, p, config.seed));
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
    openvdb::GridPtrVec grids { grid };
    file.write(grids);
    file.close();
    canonicalizeArchiveUuid(config.output, config);
    std::cout << "CLOUD_VDB_AUTHOR_METRICS:{\"genus\":\"" << config.genus
              << "\",\"species\":\"" << config.species
              << "\",\"activeVoxels\":" << active
              << ",\"maxDensity\":" << maximum
              << ",\"output\":\"" << config.output.string() << "\"}\n";
    return active == 0 ? 2 : 0;
} catch (const std::exception& error) {
    std::cerr << "CLOUD_VDB_AUTHOR_ERROR:" << error.what() << '\n';
    return 1;
}
