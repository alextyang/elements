import json
import math
import os
import random
import subprocess
import sys
from pathlib import Path

import bpy


def arguments():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not values:
        raise RuntimeError(
            "Usage: simulate_congestus.py -- OUTPUT.vdb SEED RESOLUTION "
            "FRAMES [CAPTURE_FRAME]")
    output = Path(values[0]).resolve()
    seed = int(values[1]) if len(values) > 1 else 9101
    resolution = int(values[2]) if len(values) > 2 else 96
    frames = int(values[3]) if len(values) > 3 else 48
    capture_frame = int(values[4]) if len(values) > 4 else int(frames * 0.67)
    if resolution < 32 or frames < 12:
        raise RuntimeError("Resolution must be >= 32 and frames >= 12")
    if capture_frame < 1 or capture_frame > frames:
        raise RuntimeError("Capture frame must be within the baked frame range")
    return output, seed, resolution, frames, capture_frame


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def irregular_prism(name, seed):
    rng = random.Random(seed)
    count = 18
    bottom = 0.62
    top = 1.18
    points = []
    for index in range(count):
        angle = 2.0 * math.pi * index / count
        harmonic = 1.0 + 0.19 * math.sin(3.0 * angle + 0.7) + \
            0.12 * math.sin(5.0 * angle - 1.1)
        jitter = 0.90 + 0.20 * rng.random()
        points.append((
            2.65 * harmonic * jitter * math.cos(angle),
            1.70 * harmonic * jitter * math.sin(angle),
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


def add_domain(cache_directory, resolution, frames):
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
    settings.vorticity = 1.35
    settings.alpha = 1.20
    settings.beta = 1.20
    settings.use_adaptive_domain = True
    settings.adapt_margin = 6
    settings.adapt_threshold = 0.0015
    settings.additional_res = 2
    settings.use_dissolve_smoke = False
    settings.use_noise = True
    settings.noise_scale = 2
    settings.noise_strength = 1.25
    settings.noise_pos_scale = 1.6
    settings.noise_time_anim = 0.23
    return domain


def add_flow(seed, frames):
    flow = irregular_prism("ConnectedMoistUpdraft", seed)
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
    settings.temperature = 2.0
    settings.use_initial_velocity = True
    settings.velocity_coord = (0.0, 0.0, 1.20)
    settings.velocity_normal = 0.08
    settings.velocity_random = 0.24
    texture = bpy.data.textures.new("UpdraftMoistureTexture", type="CLOUDS")
    texture.noise_scale = 0.58
    texture.noise_depth = 2
    texture.noise_type = "SOFT_NOISE"
    settings.use_texture = True
    settings.noise_texture = texture
    settings.texture_map_type = "AUTO"
    settings.texture_size = 1.35
    settings.use_inflow = True
    settings.keyframe_insert("use_inflow", frame=1)
    settings.use_inflow = False
    settings.keyframe_insert("use_inflow", frame=max(18, int(frames * 0.78)))
    return flow


def add_effectors(seed):
    rng = random.Random(seed + 88)
    for index, z in enumerate((3.0, 6.4, 9.2)):
        bpy.ops.object.effector_add(
            type="TURBULENCE",
            location=(rng.uniform(-1.7, 1.7), rng.uniform(-1.0, 1.0), z),
        )
        field = bpy.context.object.field
        field.strength = 1.4 + index * 0.55
        field.size = 2.4 + index * 0.45
        field.noise = 0.65
        field.seed = seed + index * 17
    bpy.ops.object.effector_add(
        type="WIND", location=(-5.5, 0.0, 7.8), rotation=(0.0, math.pi / 2, 0.0),
    )
    wind = bpy.context.object.field
    wind.strength = 0.18 + 0.12 * ((seed // 7) % 3)
    wind.noise = 0.45


def bake(domain, cache_directory, frames, capture_frame):
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frames
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action="DESELECT")
    domain.select_set(True)
    bpy.context.view_layer.objects.active = domain
    bpy.ops.fluid.bake_data()
    bpy.context.scene.frame_set(frames)
    bpy.ops.fluid.bake_noise()
    candidates = list(cache_directory.rglob(f"*{capture_frame:04d}*.vdb"))
    density = [path for path in candidates if path.parent.name == "noise"]
    if not density:
        density = [path for path in candidates if "density" in path.name.lower()]
    if not density:
        density = candidates
    if not density:
        raise RuntimeError(
            f"No OpenVDB cache for frame {capture_frame} in {cache_directory}")
    return max(density, key=lambda path: path.stat().st_size)


def main():
    output, seed, resolution, frames, capture_frame = arguments()
    output.parent.mkdir(parents=True, exist_ok=True)
    cache_directory = output.parent / f".{output.stem}-mantaflow-cache"
    cache_directory.mkdir(parents=True, exist_ok=True)
    clear_scene()
    domain = add_domain(cache_directory, resolution, frames)
    add_flow(seed, frames)
    add_effectors(seed)
    source = bake(domain, cache_directory, frames, capture_frame)
    repository_root = Path(__file__).resolve().parents[2]
    normalizer = repository_root / \
        "output/tools/cloud-vdb-author-build/cloud-vdb-normalizer"
    if not normalizer.is_file():
        raise RuntimeError("Build cloud-vdb-normalizer before simulating")
    normalized = subprocess.run([
        str(normalizer), "--input", str(source), "--output", str(output),
        "--grid", "density_noise", "--seed", str(seed),
    ], check=True, capture_output=True, text=True)
    print(normalized.stdout.strip())
    print("CLOUD_CONVECTION_METRICS:" + json.dumps({
        "backend": "blender-mantaflow",
        "seed": seed,
        "resolution": resolution,
        "frames": frames,
        "captureFrame": capture_frame,
        "source": str(source),
        "output": str(output),
        "bytes": output.stat().st_size,
    }, separators=(",", ":")))


main()
