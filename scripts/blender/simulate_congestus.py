import json
import math
import random
import shutil
import subprocess
import sys
from pathlib import Path

import bpy


REGIMES = {
    "developing": {
        "footprint": (1.85, 1.12),
        "emitter_top": 1.12,
        "inflow_fraction": 0.42,
        "temperature": 2.35,
        "vertical_velocity": 1.38,
        "velocity_random": 0.18,
        "vorticity": 1.12,
        "buoyancy": 1.34,
        "noise_strength": 1.08,
        "texture_scale": 0.48,
        "turbulence_scale": 0.82,
        "wind_strength": 0.10,
    },
    "mature": {
        "footprint": (3.10, 2.00),
        "emitter_top": 1.24,
        "inflow_fraction": 0.46,
        "temperature": 1.95,
        "vertical_velocity": 1.12,
        "velocity_random": 0.27,
        "vorticity": 1.52,
        "buoyancy": 1.18,
        "noise_strength": 1.38,
        "texture_scale": 0.66,
        "turbulence_scale": 1.24,
        "wind_strength": 0.16,
    },
    "sheared": {
        "footprint": (2.42, 1.48),
        "emitter_top": 1.16,
        "inflow_fraction": 0.38,
        "temperature": 2.08,
        "vertical_velocity": 1.22,
        "velocity_random": 0.23,
        "vorticity": 1.34,
        "buoyancy": 1.24,
        "noise_strength": 1.24,
        "texture_scale": 0.56,
        "turbulence_scale": 1.42,
        "wind_strength": 0.52,
    },
}


def arguments():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not values:
        raise RuntimeError(
            "Usage: simulate_congestus.py -- OUTPUT.vdb SEED RESOLUTION "
            "FRAMES [CAPTURE_FRAME] [REGIME]")
    output = Path(values[0]).resolve()
    seed = int(values[1]) if len(values) > 1 else 9101
    resolution = int(values[2]) if len(values) > 2 else 96
    frames = int(values[3]) if len(values) > 3 else 48
    capture_frame = int(values[4]) if len(values) > 4 else int(frames * 0.67)
    regime = values[5] if len(values) > 5 else "mature"
    if resolution < 32 or frames < 12:
        raise RuntimeError("Resolution must be >= 32 and frames >= 12")
    if capture_frame < 1 or capture_frame > frames:
        raise RuntimeError("Capture frame must be within the baked frame range")
    if regime not in REGIMES:
        raise RuntimeError(
            f"Unknown regime {regime}; expected one of {', '.join(REGIMES)}")
    return output, seed, resolution, frames, capture_frame, regime


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def irregular_prism(name, seed, regime):
    rng = random.Random(seed)
    profile = REGIMES[regime]
    radius_x, radius_y = profile["footprint"]
    count = 18
    bottom = 0.62
    top = profile["emitter_top"]
    points = []
    for index in range(count):
        angle = 2.0 * math.pi * index / count
        harmonic = 1.0 + 0.19 * math.sin(3.0 * angle + 0.7) + \
            0.12 * math.sin(5.0 * angle - 1.1)
        jitter = 0.90 + 0.20 * rng.random()
        points.append((
            radius_x * harmonic * jitter * math.cos(angle),
            radius_y * harmonic * jitter * math.sin(angle),
        ))
    vertices = [(x, y, bottom) for x, y in points] + \
        [(x, y, top) for x, y in points]
    faces = []
    faces.append(tuple(range(count - 1, -1, -1)))
    faces.append(tuple(range(count, count * 2)))
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(f"{name}-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def add_domain(cache_directory, resolution, frames, regime):
    profile = REGIMES[regime]
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, 7.0))
    domain = bpy.context.object
    domain.name = "CongestusDomain"
    domain.scale = (7.5, 5.0, 7.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = domain.modifiers.new("CongestusGasDomain", "FLUID")
    modifier.fluid_type = "DOMAIN"
    bpy.context.view_layer.objects.active = domain
    bpy.context.view_layer.update()
    settings = modifier.domain_settings
    settings.domain_type = "GAS"
    settings.cache_type = "MODULAR"
    settings.cache_directory = str(cache_directory)
    settings.cache_frame_start = 1
    settings.cache_frame_end = frames
    settings.cache_resumable = True
    settings.cache_data_format = "OPENVDB"
    settings.cache_noise_format = "OPENVDB"
    settings.openvdb_cache_compress_type = "BLOSC"
    settings.openvdb_data_depth = "16"
    settings.resolution_max = resolution
    settings.timesteps_min = 2
    settings.timesteps_max = 8
    settings.cfl_condition = 2.0
    settings.time_scale = 1.25
    settings.vorticity = profile["vorticity"]
    settings.alpha = profile["buoyancy"]
    settings.beta = profile["buoyancy"]
    settings.use_adaptive_domain = True
    settings.adapt_margin = 6
    settings.adapt_threshold = 0.0015
    settings.additional_res = 2
    settings.use_dissolve_smoke = False
    settings.use_noise = True
    settings.noise_scale = 2
    settings.noise_strength = profile["noise_strength"]
    settings.noise_pos_scale = 1.6
    settings.noise_time_anim = 0.23
    return domain


def add_flow(seed, frames, regime):
    profile = REGIMES[regime]
    flow = irregular_prism("ConnectedMoistUpdraft", seed, regime)
    modifier = flow.modifiers.new("MoistUpdraftFlow", "FLUID")
    modifier.fluid_type = "FLOW"
    bpy.context.view_layer.objects.active = flow
    bpy.context.view_layer.update()
    settings = modifier.flow_settings
    settings.flow_type = "SMOKE"
    settings.flow_behavior = "INFLOW"
    settings.flow_source = "MESH"
    settings.surface_distance = 2.2
    settings.density = 3.0
    settings.volume_density = 1.0
    settings.temperature = profile["temperature"]
    settings.use_initial_velocity = True
    settings.velocity_coord = (0.0, 0.0, profile["vertical_velocity"])
    settings.velocity_normal = 0.08
    settings.velocity_random = profile["velocity_random"]
    texture = bpy.data.textures.new("UpdraftMoistureTexture", type="CLOUDS")
    texture.noise_scale = profile["texture_scale"]
    texture.noise_depth = 2
    texture.noise_type = "SOFT_NOISE"
    settings.use_texture = True
    settings.noise_texture = texture
    settings.texture_map_type = "AUTO"
    settings.texture_size = 1.35
    settings.use_inflow = True
    settings.keyframe_insert("use_inflow", frame=1)
    settings.use_inflow = False
    settings.keyframe_insert(
        "use_inflow", frame=max(18, int(frames * profile["inflow_fraction"])))
    return flow


def add_effectors(seed, regime):
    rng = random.Random(seed + 88)
    profile = REGIMES[regime]
    for index, z in enumerate((3.0, 6.4, 9.2)):
        bpy.ops.object.effector_add(
            type="TURBULENCE",
            location=(rng.uniform(-1.7, 1.7), rng.uniform(-1.0, 1.0), z),
        )
        field = bpy.context.object.field
        field.strength = (1.4 + index * 0.55) * \
            profile["turbulence_scale"]
        field.size = 2.4 + index * 0.45
        field.noise = 0.65
        field.seed = seed + index * 17
    bpy.ops.object.effector_add(
        type="WIND", location=(-5.5, 0.0, 7.8), rotation=(0.0, math.pi / 2, 0.0),
    )
    wind = bpy.context.object.field
    wind.strength = profile["wind_strength"]
    wind.noise = 0.45


def bake(domain, cache_directory, frames, capture_frame):
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frames
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action="DESELECT")
    domain.select_set(True)
    bpy.context.view_layer.objects.active = domain
    bpy.ops.fluid.bake_data()
    # Wavelet up-res must replay the baked base cache from its first frame.
    # Starting this operation from the final frame can emit empty late caches
    # even while the corresponding base-density frames remain populated.
    bpy.context.scene.frame_set(1)
    bpy.ops.fluid.bake_noise()
    candidates = list(cache_directory.rglob(f"*{capture_frame:04d}*.vdb"))
    noise = [path for path in candidates if path.parent.name == "noise"]
    base = [path for path in candidates if path.parent.name == "data"]
    if not noise and not base:
        raise RuntimeError(
            f"No OpenVDB cache for frame {capture_frame} in {cache_directory}")
    return (
        max(noise, key=lambda path: path.stat().st_size) if noise else None,
        max(base, key=lambda path: path.stat().st_size) if base else None,
    )


def main():
    output, seed, resolution, frames, capture_frame, regime = arguments()
    output.parent.mkdir(parents=True, exist_ok=True)
    cache_directory = output.parent / f".{output.stem}-mantaflow-cache"
    if cache_directory.exists():
        shutil.rmtree(cache_directory)
    cache_directory.mkdir(parents=True, exist_ok=True)
    clear_scene()
    domain = add_domain(cache_directory, resolution, frames, regime)
    add_flow(seed, frames, regime)
    add_effectors(seed, regime)
    noise_source, base_source = bake(
        domain, cache_directory, frames, capture_frame)
    repository_root = Path(__file__).resolve().parents[2]
    normalizer = repository_root / \
        "output/tools/cloud-vdb-author-build/cloud-vdb-normalizer"
    if not normalizer.is_file():
        raise RuntimeError("Build cloud-vdb-normalizer before simulating")
    source = noise_source
    source_grid = "density_noise"
    normalized = None
    if source is not None:
        normalized = subprocess.run([
            str(normalizer), "--input", str(source), "--output", str(output),
            "--grid", source_grid, "--seed", str(seed),
        ], capture_output=True, text=True)
    if normalized is None or normalized.returncode != 0:
        if base_source is None:
            detail = normalized.stderr.strip() if normalized else "missing base cache"
            raise RuntimeError(f"No usable density cache: {detail}")
        source = base_source
        source_grid = "density"
        normalized = subprocess.run([
            str(normalizer), "--input", str(source), "--output", str(output),
            "--grid", source_grid, "--seed", str(seed),
        ], check=True, capture_output=True, text=True)
    print(normalized.stdout.strip())
    print("CLOUD_CONVECTION_METRICS:" + json.dumps({
        "backend": "blender-mantaflow",
        "seed": seed,
        "resolution": resolution,
        "frames": frames,
        "captureFrame": capture_frame,
        "regime": regime,
        "sourceGrid": source_grid,
        "source": str(source),
        "output": str(output),
        "bytes": output.stat().st_size,
    }, separators=(",", ":")))


main()
