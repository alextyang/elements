"""Headless Cycles/Metal renderer for scene-linear cloud transport plates."""

import json
import math
import os
import struct
import sys
import time
import zlib

import bpy
from mathutils import Vector


def arguments():
    values = sys.argv[sys.argv.index("--") + 1:]
    if len(values) != 9:
        raise RuntimeError(
            "Expected scene, frame, time, width, height, samples, target, output, seed"
        )
    return {
        "scene": values[0],
        "frame": int(values[1]),
        "time": float(values[2]),
        "width": int(values[3]),
        "height": int(values[4]),
        "samples": int(values[5]),
        "target": float(values[6]),
        "output": values[7],
        "seed": int(values[8]),
    }


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat(
        "-Z", "Y"
    ).to_euler()


def cloud_volume_material(
        name, scattering_strength, bottom_fade=0.0, detail_strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    volume = tree.nodes.new("ShaderNodeVolumeCoefficients")
    volume.inputs[0].default_value = 1.0
    phase_model = os.environ.get(
        "CLOUD_PLATE_PHASE_FUNCTION", "HENYEY_GREENSTEIN"
    )
    if phase_model == "MIE":
        volume.phase = "MIE"
        # Effective diameter in micrometres for a mature liquid cloud droplet
        # population.  Blender's Mie phase evaluates the angular distribution;
        # the density grid still controls macroscopic extinction.
        volume.inputs[7].default_value = 20.0
    elif phase_model == "DRAINE":
        volume.phase = "DRAINE"
        volume.inputs[3].default_value = 0.82
        volume.inputs[6].default_value = 0.55
    elif phase_model == "HENYEY_GREENSTEIN":
        volume.phase = "HENYEY_GREENSTEIN"
        volume.inputs[3].default_value = 0.867
    else:
        raise RuntimeError(f"Unsupported cloud phase function: {phase_model}")
    attribute = tree.nodes.new("ShaderNodeAttribute")
    attribute.attribute_name = "density"
    density_source = attribute.outputs["Fac"]
    if detail_strength > 0.0:
        coordinates = tree.nodes.new("ShaderNodeTexCoord")
        macro_noise = tree.nodes.new("ShaderNodeTexNoise")
        macro_noise.noise_dimensions = "3D"
        macro_noise.inputs["Scale"].default_value = 4.2
        macro_noise.inputs["Detail"].default_value = 6.0
        macro_noise.inputs["Roughness"].default_value = 0.68
        macro_noise.inputs["Distortion"].default_value = 0.22
        tree.links.new(coordinates.outputs["Generated"], macro_noise.inputs["Vector"])
        macro_range = tree.nodes.new("ShaderNodeMapRange")
        macro_range.interpolation_type = "SMOOTHERSTEP"
        macro_range.clamp = True
        macro_range.inputs["From Min"].default_value = 0.24
        macro_range.inputs["From Max"].default_value = 0.78
        macro_range.inputs["To Min"].default_value = max(
            0.16, 1.0 - 0.72 * detail_strength
        )
        macro_range.inputs["To Max"].default_value = 1.0 + 0.58 * detail_strength
        tree.links.new(macro_noise.outputs["Fac"], macro_range.inputs["Value"])
        macro_density = tree.nodes.new("ShaderNodeMath")
        macro_density.operation = "MULTIPLY"
        tree.links.new(density_source, macro_density.inputs[0])
        tree.links.new(macro_range.outputs["Result"], macro_density.inputs[1])

        fine_noise = tree.nodes.new("ShaderNodeTexNoise")
        fine_noise.noise_dimensions = "3D"
        fine_noise.inputs["Scale"].default_value = 18.0
        fine_noise.inputs["Detail"].default_value = 4.0
        fine_noise.inputs["Roughness"].default_value = 0.72
        fine_noise.inputs["Distortion"].default_value = 0.10
        tree.links.new(coordinates.outputs["Generated"], fine_noise.inputs["Vector"])
        fine_range = tree.nodes.new("ShaderNodeMapRange")
        fine_range.interpolation_type = "SMOOTHERSTEP"
        fine_range.clamp = True
        fine_range.inputs["From Min"].default_value = 0.28
        fine_range.inputs["From Max"].default_value = 0.74
        fine_range.inputs["To Min"].default_value = max(
            0.45, 1.0 - 0.30 * detail_strength
        )
        fine_range.inputs["To Max"].default_value = 1.0 + 0.28 * detail_strength
        tree.links.new(fine_noise.outputs["Fac"], fine_range.inputs["Value"])
        fine_density = tree.nodes.new("ShaderNodeMath")
        fine_density.operation = "MULTIPLY"
        tree.links.new(macro_density.outputs[0], fine_density.inputs[0])
        tree.links.new(fine_range.outputs["Result"], fine_density.inputs[1])
        eroded_density = tree.nodes.new("ShaderNodeMath")
        eroded_density.operation = "SUBTRACT"
        eroded_density.inputs[1].default_value = 0.14 * detail_strength
        tree.links.new(fine_density.outputs[0], eroded_density.inputs[0])
        nonnegative_density = tree.nodes.new("ShaderNodeMath")
        nonnegative_density.operation = "MAXIMUM"
        nonnegative_density.inputs[1].default_value = 0.0
        tree.links.new(eroded_density.outputs[0], nonnegative_density.inputs[0])
        density_source = nonnegative_density.outputs[0]
    if bottom_fade > 0.0:
        coordinates = tree.nodes.new("ShaderNodeTexCoord")
        separate = tree.nodes.new("ShaderNodeSeparateXYZ")
        tree.links.new(coordinates.outputs["Generated"], separate.inputs["Vector"])
        fade = tree.nodes.new("ShaderNodeMapRange")
        fade.interpolation_type = "SMOOTHERSTEP"
        fade.clamp = True
        fade.inputs["From Min"].default_value = 0.0
        fade.inputs["From Max"].default_value = bottom_fade
        # WDAS stores height on local Y; the object rotates it to world Z.
        tree.links.new(separate.outputs["Y"], fade.inputs["Value"])
        faded_density = tree.nodes.new("ShaderNodeMath")
        faded_density.operation = "MULTIPLY"
        tree.links.new(attribute.outputs["Fac"], faded_density.inputs[0])
        tree.links.new(fade.outputs["Result"], faded_density.inputs[1])
        density_source = faded_density.outputs[0]
    density_scale = tree.nodes.new("ShaderNodeMath")
    density_scale.operation = "MULTIPLY"
    density_scale.inputs[1].default_value = scattering_strength
    tree.links.new(density_source, density_scale.inputs[0])
    scatter = tree.nodes.new("ShaderNodeVectorMath")
    scatter.operation = "SCALE"
    scatter.inputs["Vector"].default_value = (0.92, 0.965, 1.0)
    tree.links.new(density_scale.outputs[0], scatter.inputs["Scale"])
    absorption = tree.nodes.new("ShaderNodeVectorMath")
    absorption.operation = "SCALE"
    absorption.inputs["Vector"].default_value = (0.0030, 0.0022, 0.0015)
    tree.links.new(density_scale.outputs[0], absorption.inputs["Scale"])
    rain_attribute = tree.nodes.new("ShaderNodeAttribute")
    rain_attribute.attribute_name = "rain"
    rain_absorption = tree.nodes.new("ShaderNodeVectorMath")
    rain_absorption.operation = "SCALE"
    rain_absorption.inputs["Vector"].default_value = (0.48, 0.40, 0.32)
    tree.links.new(rain_attribute.outputs["Fac"], rain_absorption.inputs["Scale"])
    total_absorption = tree.nodes.new("ShaderNodeVectorMath")
    total_absorption.operation = "ADD"
    tree.links.new(absorption.outputs["Vector"], total_absorption.inputs[0])
    tree.links.new(rain_absorption.outputs["Vector"], total_absorption.inputs[1])
    tree.links.new(scatter.outputs["Vector"], volume.inputs[2])
    tree.links.new(
        total_absorption.outputs["Vector"], volume.inputs[1]
    )
    tree.links.new(volume.outputs["Volume"], output.inputs["Volume"])
    return material


def mesh_isosurface_material(name):
    """Deliberately non-volumetric baseline for the method benchmark."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    principled = tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (0.84, 0.88, 0.94, 1.0)
    principled.inputs["Roughness"].default_value = 0.88
    return material


def add_mesh_isosurface_modifier(obj, material):
    """Render a VDB density threshold as geometry without baking another asset."""
    nodes = bpy.data.node_groups.new(
        f"{obj.name} density isosurface", "GeometryNodeTree"
    )
    nodes.interface.new_socket(
        name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry"
    )
    nodes.interface.new_socket(
        name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry"
    )
    group_input = nodes.nodes.new("NodeGroupInput")
    group_output = nodes.nodes.new("NodeGroupOutput")
    volume_to_mesh = nodes.nodes.new("GeometryNodeVolumeToMesh")
    volume_to_mesh.inputs["Threshold"].default_value = 0.08
    volume_to_mesh.inputs["Adaptivity"].default_value = 0.0
    set_material = nodes.nodes.new("GeometryNodeSetMaterial")
    set_material.inputs["Material"].default_value = material
    nodes.links.new(
        group_input.outputs["Geometry"], volume_to_mesh.inputs["Volume"]
    )
    nodes.links.new(volume_to_mesh.outputs["Mesh"], set_material.inputs["Geometry"])
    nodes.links.new(set_material.outputs["Geometry"], group_output.inputs["Geometry"])
    modifier = obj.modifiers.new("density isosurface", "NODES")
    modifier.node_group = nodes


def unit_box_mesh(name):
    """Create a bounded volume domain without Blender primitive operators."""
    vertices = [
        (-0.5, -0.5, -0.5), (0.5, -0.5, -0.5),
        (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5),
        (-0.5, -0.5, 0.5), (0.5, -0.5, 0.5),
        (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5),
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5),
        (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name} domain")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def precipitation_volume_material(name, time_seconds, authored_density_scale):
    """Anisotropic continuous rain shafts, never cloud-shaped primitives."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    volume = tree.nodes.new("ShaderNodeVolumeCoefficients")
    volume.phase = "HENYEY_GREENSTEIN"
    volume.inputs[0].default_value = 1.0
    volume.inputs[3].default_value = 0.72

    coordinates = tree.nodes.new("ShaderNodeTexCoord")
    anisotropy = tree.nodes.new("ShaderNodeVectorMath")
    anisotropy.operation = "MULTIPLY"
    anisotropy.inputs[1].default_value = (5.5, 3.0, 0.16)
    tree.links.new(coordinates.outputs["Generated"], anisotropy.inputs[0])
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 2.1
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.72
    noise.inputs["Distortion"].default_value = 0.18
    loop_phase = math.tau * ((time_seconds % 240.0) / 240.0)
    noise.inputs["W"].default_value = (
        1.37 + 0.55 * math.sin(loop_phase) +
        0.25 * math.sin(loop_phase * 2.0)
    )
    tree.links.new(anisotropy.outputs["Vector"], noise.inputs["Vector"])
    shaft_mask = tree.nodes.new("ShaderNodeMapRange")
    shaft_mask.interpolation_type = "SMOOTHERSTEP"
    shaft_mask.clamp = True
    shaft_mask.inputs["From Min"].default_value = 0.38
    shaft_mask.inputs["From Max"].default_value = 0.72
    tree.links.new(noise.outputs["Fac"], shaft_mask.inputs["Value"])

    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coordinates.outputs["Generated"], separate.inputs["Vector"])
    lower_fade = tree.nodes.new("ShaderNodeMapRange")
    lower_fade.interpolation_type = "SMOOTHERSTEP"
    lower_fade.clamp = True
    lower_fade.inputs["From Min"].default_value = 0.02
    lower_fade.inputs["From Max"].default_value = 0.20
    tree.links.new(separate.outputs["Z"], lower_fade.inputs["Value"])

    edge_fades = []
    for axis in ("X", "Y"):
        centered = tree.nodes.new("ShaderNodeMath")
        centered.operation = "SUBTRACT"
        centered.inputs[1].default_value = 0.5
        tree.links.new(separate.outputs[axis], centered.inputs[0])
        absolute = tree.nodes.new("ShaderNodeMath")
        absolute.operation = "ABSOLUTE"
        tree.links.new(centered.outputs[0], absolute.inputs[0])
        edge = tree.nodes.new("ShaderNodeMapRange")
        edge.interpolation_type = "SMOOTHERSTEP"
        edge.clamp = True
        edge.inputs["From Min"].default_value = 0.34
        edge.inputs["From Max"].default_value = 0.50
        edge.inputs["To Min"].default_value = 1.0
        edge.inputs["To Max"].default_value = 0.0
        tree.links.new(absolute.outputs[0], edge.inputs["Value"])
        edge_fades.append(edge.outputs["Result"])

    density = tree.nodes.new("ShaderNodeMath")
    density.operation = "MULTIPLY"
    tree.links.new(shaft_mask.outputs["Result"], density.inputs[0])
    tree.links.new(lower_fade.outputs["Result"], density.inputs[1])
    for edge_fade in edge_fades:
        multiplied = tree.nodes.new("ShaderNodeMath")
        multiplied.operation = "MULTIPLY"
        tree.links.new(density.outputs[0], multiplied.inputs[0])
        tree.links.new(edge_fade, multiplied.inputs[1])
        density = multiplied
    density_scale = tree.nodes.new("ShaderNodeMath")
    density_scale.operation = "MULTIPLY"
    density_scale.inputs[1].default_value = authored_density_scale
    tree.links.new(density.outputs[0], density_scale.inputs[0])

    scatter = tree.nodes.new("ShaderNodeVectorMath")
    scatter.operation = "SCALE"
    scatter.inputs["Vector"].default_value = (0.07, 0.09, 0.12)
    tree.links.new(density_scale.outputs[0], scatter.inputs["Scale"])
    absorption = tree.nodes.new("ShaderNodeVectorMath")
    absorption.operation = "SCALE"
    absorption.inputs["Vector"].default_value = (0.90, 0.78, 0.62)
    tree.links.new(density_scale.outputs[0], absorption.inputs["Scale"])
    tree.links.new(absorption.outputs["Vector"], volume.inputs[1])
    tree.links.new(scatter.outputs["Vector"], volume.inputs[2])
    tree.links.new(volume.outputs["Volume"], output.inputs["Volume"])
    return material


def add_precipitation_curtain(time_seconds, scene_definition):
    specification = scene_definition["offlineComposition"]["precipitation"]
    loop_phase = math.tau * ((time_seconds % 240.0) / 240.0)
    curtain = unit_box_mesh("continuous rain and hail precipitation curtain")
    target = specification["target"]
    curtain.location = (
        target[0] + 0.28 * math.sin(loop_phase),
        target[1] + 0.16 * math.cos(loop_phase),
        target[2],
    )
    curtain.dimensions = specification["dimensions"]
    curtain.rotation_euler[2] = math.radians(
        specification["rotationDegrees"]
    )
    curtain.data.materials.append(precipitation_volume_material(
        "storm rain shaft extinction medium", time_seconds,
        specification["densityScale"],
    ))
    return curtain


def place_volume(obj, target, scale, rotation_degrees, axis_convention):
    obj.rotation_mode = "XYZ"
    if axis_convention == "wdas-y-up":
        obj.rotation_euler = (
            math.radians(90.0), 0.0, math.radians(rotation_degrees)
        )
    elif axis_convention == "z-up":
        obj.rotation_euler = (0.0, 0.0, math.radians(rotation_degrees))
    else:
        raise RuntimeError(f"Unsupported volume axis convention: {axis_convention}")
    obj.scale = scale
    obj.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    center = sum((Vector(corner) for corner in obj.bound_box), Vector()) / 8.0
    obj.location = Vector(target) - obj.matrix_world.to_3x3() @ center


def add_composed_storm_group(time_seconds, scene_definition):
    composition = scene_definition["offlineComposition"]
    source_kind = os.environ.get("CLOUD_STORM_SOURCE_KIND")
    if source_kind != composition["sourceKind"]:
        raise RuntimeError(
            f"Source kind {source_kind!r} does not match authored composition"
        )
    specifications = composition["volumeInstances"]
    fallback_path = os.environ.get("CLOUD_STORM_VDB_PATH")
    source_map = json.loads(os.environ.get("CLOUD_VOLUME_SOURCE_MAP", "{}"))
    source_objects = {}
    instances = []
    for specification in specifications:
        source_id = specification.get(
            "sourceAssetId", composition.get("sourceAssetId", "default")
        )
        path = source_map.get(source_id, fallback_path)
        if not path or not os.path.isfile(path):
            raise RuntimeError(
                f"No density VDB is available for source asset {source_id!r}"
            )
        if source_id not in source_objects:
            bpy.ops.object.volume_import(filepath=path)
            source = bpy.context.object
            source.name = source_id
            source.data.grids.load()
            if not source.bound_box:
                raise RuntimeError(f"Cloud VDB has no renderable bounds: {path}")
            source_objects[source_id] = source
            instance = source
        else:
            instance = source_objects[source_id].copy()
            bpy.context.collection.objects.link(instance)
        # Materials are per authored component, even when multiple instances
        # share immutable voxel storage.
        instance.data = instance.data.copy()
        instance.name = specification["id"]
        instances.append(instance)
    loop_phase = math.tau * ((time_seconds % 240.0) / 240.0)
    for instance, specification in zip(instances, specifications):
        instance.name = specification["id"]
        target = specification["target"]
        scale = specification["scale"]
        component_phase = loop_phase + specification["phaseOffset"]
        evolved_target = (
            target[0] + 0.22 * math.sin(component_phase),
            target[1] + 0.16 * math.cos(component_phase),
            target[2] + 0.06 * math.sin(component_phase * 2.0),
        )
        breathing = 1.0 + 0.008 * math.sin(component_phase)
        evolved_scale = tuple(value * breathing for value in scale)
        axis_convention = specification.get(
            "axisConvention", composition.get("axisConvention", "wdas-y-up")
        )
        place_volume(
            instance, evolved_target, evolved_scale,
            specification["rotationDegrees"] +
            1.2 * math.sin(component_phase),
            axis_convention,
        )
    scattering_strength = float(os.environ.get(
        "CLOUD_STORM_SCATTERING_STRENGTH",
        str(composition["scatteringStrength"]),
    ))
    render_method = os.environ.get("CLOUD_PLATE_RENDER_METHOD", "CYCLES_VOLUME")
    for instance, specification in zip(instances, specifications):
        if render_method == "MESH_ISOSURFACE":
            material = mesh_isosurface_material(
                f"{specification['id']} opaque density isosurface"
            )
            add_mesh_isosurface_modifier(instance, material)
        else:
            instance.data.materials.append(cloud_volume_material(
                f"{specification['id']} multiple-scattering medium",
                scattering_strength * specification["scatteringMultiplier"],
                bottom_fade=specification["bottomFade"],
                detail_strength=specification.get("detailStrength", 0.0),
            ))
    return instances[0]


def configure_scene(config, scene_definition):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    # Every authored component is integrated in one Cycles invocation and
    # exported as a single affine transport operator for the storm group.
    if os.environ.get("CLOUD_DEBUG_PRECIP_ONLY") != "1":
        add_composed_storm_group(config["time"], scene_definition)
    if scene_definition["offlineComposition"].get("precipitation"):
        add_precipitation_curtain(config["time"], scene_definition)

    camera_data = bpy.data.cameras.new("oblique-natural camera")
    camera = bpy.data.objects.new("oblique-natural camera", camera_data)
    bpy.context.collection.objects.link(camera)
    fixed_camera = scene_definition["fixedCamera"]
    camera.location = tuple(fixed_camera.get("position", [17.0, -31.0, 3.2]))
    camera_data.lens = fixed_camera.get("lensMm", 31.0)
    camera_data.sensor_width = 36.0
    look_at(camera, tuple(fixed_camera.get("target", [1.2, 0.0, 7.6])))
    scene.camera = camera

    sun_data = bpy.data.lights.new("storm side sun", "SUN")
    lighting = scene_definition.get("lighting", {})
    sun_data.energy = lighting.get("sunEnergy", 3.0)
    sun_data.angle = math.radians(0.53)
    sun = bpy.data.objects.new("storm side sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun_elevation = math.radians(lighting.get("sunElevationDegrees", 24.0))
    sun_azimuth = math.radians(lighting.get("sunAzimuthDegrees", 224.0))
    sun_distance = 60.0
    sun.location = (
        sun_distance * math.cos(sun_elevation) * math.sin(sun_azimuth),
        sun_distance * math.cos(sun_elevation) * math.cos(sun_azimuth),
        sun_distance * math.sin(sun_elevation),
    )
    look_at(sun, (0.0, 0.0, 8.0))

    key_data = bpy.data.lights.new("storm softbox", "AREA")
    key_data.energy = lighting.get("keyEnergy", 15.0)
    key_data.shape = "DISK"
    key_data.size = 14.0
    key = bpy.data.objects.new("storm softbox", key_data)
    bpy.context.collection.objects.link(key)
    key.location = (-18.0, -15.0, 28.0)
    look_at(key, (0.0, 0.0, 8.0))

    world = bpy.data.worlds.new("cloud lighting world")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    world_model = os.environ.get("CLOUD_PLATE_WORLD_MODEL", "FLAT")
    if world_model == "NISHITA":
        sky = world.node_tree.nodes.new("ShaderNodeTexSky")
        sky.sky_type = "MULTIPLE_SCATTERING"
        sky.sun_disc = False
        sky.sun_elevation = math.radians(
            lighting.get("sunElevationDegrees", 24.0)
        )
        sky.sun_rotation = math.radians(
            lighting.get("sunAzimuthDegrees", 224.0)
        )
        sky.altitude = 0.35
        sky.air_density = 1.0
        sky.aerosol_density = 0.45
        sky.ozone_density = 1.0
        world.node_tree.links.new(sky.outputs["Color"], background.inputs["Color"])
    elif world_model == "FLAT":
        world_color = lighting.get("worldColor", [0.52, 0.66, 0.94])
        background.inputs["Color"].default_value = (*world_color, 1.0)
    else:
        raise RuntimeError(f"Unsupported cloud world model: {world_model}")
    background.inputs["Strength"].default_value = lighting.get(
        "worldStrength", 0.08
    )
    scene.world = world

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = config["width"]
    scene.render.resolution_y = config["height"]
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "ZIP"
    scene.render.image_settings.color_management = "OVERRIDE"
    scene.render.filepath = os.path.join(
        config["output"], f".render-{config['frame']:05d}.exr"
    )
    scene.view_settings.look = "None"

    render_method = os.environ.get("CLOUD_PLATE_RENDER_METHOD", "CYCLES_VOLUME")
    if render_method == "EEVEE_VOLUME":
        scene.render.engine = "BLENDER_EEVEE"
        return scene
    if render_method not in ("CYCLES_VOLUME", "MESH_ISOSURFACE"):
        raise RuntimeError(f"Unsupported cloud render method: {render_method}")

    cycles_preferences = bpy.context.preferences.addons["cycles"].preferences
    cycles_preferences.compute_device_type = "METAL"
    cycles_preferences.get_devices()
    for device in cycles_preferences.devices:
        device.use = device.type == "METAL"
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.seed = config["seed"] + config["frame"]
    scene.cycles.use_animated_seed = False
    scene.cycles.samples = config["samples"]
    # Paired convergence compares exact fixed-SPP renders. An adaptive threshold
    # tied to the acceptance residual can plateau at that same noise level and
    # make sample doubling meaningless.
    scene.cycles.use_adaptive_sampling = False
    path_guiding = os.environ.get("CLOUD_PLATE_PATH_GUIDING", "NONE")
    if path_guiding not in ("NONE", "VOLUME"):
        raise RuntimeError(f"Unsupported path-guiding mode: {path_guiding}")
    scene.cycles.use_guiding = path_guiding == "VOLUME"
    if scene.cycles.use_guiding:
        scene.cycles.use_deterministic_guiding = True
        scene.cycles.use_surface_guiding = False
        scene.cycles.use_volume_guiding = True
        scene.cycles.guiding_training_samples = min(
            512, max(128, config["samples"] // 8)
        )
        scene.cycles.volume_guiding_probability = 0.5
        scene.cycles.use_guiding_direct_light = True
        scene.cycles.use_guiding_mis_weights = True
    # Static transport plates can afford a production denoise pass. It removes
    # the low-frequency volume crawl that becomes conspicuous when a canary
    # plate is enlarged in the live compositor; alpha remains the exact Cycles
    # coverage channel and is exported separately as transmittance.
    denoiser = os.environ.get("CLOUD_PLATE_DENOISER", "OPENIMAGEDENOISE")
    scene.cycles.use_denoising = denoiser != "NONE"
    if scene.cycles.use_denoising and hasattr(scene.cycles, "denoiser"):
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    # Draft renders deliberately trade fine multiple scattering for turnaround;
    # production renders retain the much finer step size.
    volume_step_rate = 2.0 if config["samples"] < 128 else 0.45
    scene.cycles.volume_step_rate = volume_step_rate
    scene.cycles.volume_preview_step_rate = volume_step_rate
    volume_bounces = int(os.environ.get("CLOUD_PLATE_VOLUME_BOUNCES", "1024"))
    scene.cycles.max_bounces = volume_bounces
    scene.cycles.volume_bounces = volume_bounces
    scene.cycles.min_light_bounces = min(32, volume_bounces)
    scene.cycles.transparent_max_bounces = 16
    return scene


def png_chunk(kind, payload):
    return (
        struct.pack(">I", len(payload)) + kind + payload +
        struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def write_preview(path, width, height, pixels, radiance_scale):
    rows = []
    for output_y in range(height):
        source_y = height - 1 - output_y
        row = bytearray([0])
        for x in range(width):
            offset = (source_y * width + x) * 4
            radiance = [
                value * radiance_scale for value in pixels[offset:offset + 3]
            ]
            alpha = max(0.0, min(1.0, pixels[offset + 3]))
            t = 1.0 - alpha
            horizon = output_y / max(1, height - 1)
            sky = (
                0.006 + 0.025 * horizon,
                0.020 + 0.060 * horizon,
                0.100 + 0.190 * horizon,
            )
            linear = [max(0.0, radiance[c] + t * sky[c]) for c in range(3)]
            # Exposure with a smooth photographic shoulder, then display encode.
            mapped = [1.0 - math.exp(-4.0 * value) for value in linear]
            srgb = [
                12.92 * value if value <= 0.0031308
                else 1.055 * pow(value, 1.0 / 2.4) - 0.055
                for value in mapped
            ]
            row.extend(round(max(0, min(1, value)) * 255) for value in srgb)
            row.append(255)
        rows.append(bytes(row))
    payload = b"".join(rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(payload, 9))
    png += png_chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def write_transport(config, pixels):
    os.makedirs(config["output"], exist_ok=True)
    width = config["width"]
    height = config["height"]
    radiance = bytearray(width * height * 8)
    transmittance = bytearray(width * height * 8)
    depth = 15.0
    for output_y in range(height):
        source_y = height - 1 - output_y
        for x in range(width):
            source = (source_y * width + x) * 4
            target = (output_y * width + x) * 8
            alpha = max(0.0, min(1.0, pixels[source + 3]))
            # Blender Render Result is premultiplied scene-linear radiance.
            values = [
                max(0.0, float(pixels[source + channel])) *
                config["radiance_scale"]
                for channel in range(3)
            ]
            for channel, value in enumerate(values):
                struct.pack_into("<e", radiance, target + channel * 2, value)
                struct.pack_into(
                    "<e", transmittance, target + channel * 2, 1.0 - alpha
                )
            interaction_depth = depth if alpha > 1e-4 else 1000.0
            struct.pack_into("<e", radiance, target + 6, interaction_depth)
            struct.pack_into("<e", transmittance, target + 6, interaction_depth)
    with open(os.path.join(config["output"], "radiance.rgba16f"), "wb") as handle:
        handle.write(radiance)
    with open(os.path.join(config["output"], "transmittance.rgba16f"), "wb") as handle:
        handle.write(transmittance)
    write_preview(
        os.path.join(config["output"], "preview.png"), width, height, pixels,
        config["radiance_scale"],
    )


def main():
    config = arguments()
    os.makedirs(config["output"], exist_ok=True)
    with open(config["scene"], "r", encoding="utf-8") as handle:
        scene_definition = json.load(handle)
    render_contract = scene_definition.get("render", {})
    os.environ.setdefault(
        "CLOUD_PLATE_PHASE_FUNCTION",
        render_contract.get("phaseFunction", "henyey-greenstein")
            .upper().replace("-", "_"),
    )
    os.environ.setdefault(
        "CLOUD_PLATE_WORLD_MODEL",
        render_contract.get("worldModel", "flat").upper(),
    )
    if scene_definition["fixedCamera"]["perspectiveId"] != "oblique-natural":
        raise RuntimeError("Only the oblique-natural production camera is supported")
    config["radiance_scale"] = scene_definition["offlineComposition"][
        "radianceCalibration"
    ]
    started = time.time()
    scene = configure_scene(config, scene_definition)
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(scene.render.filepath, check_existing=False)
    pixel_count = 0 if image is None else len(image.pixels)
    if image is None or pixel_count != config["width"] * config["height"] * 4:
        image_size = None if image is None else tuple(image.size)
        raise RuntimeError(
            "Cycles did not return the expected RGBA render result: "
            f"size={image_size}, channels={pixel_count}"
        )
    pixels = list(image.pixels)
    write_transport(config, pixels)
    bpy.data.images.remove(image)
    os.remove(scene.render.filepath)
    metrics = {
        "backend": (
            "blender-eevee" if scene.render.engine == "BLENDER_EEVEE"
            else "blender-cycles-metal"
        ),
        "device": (
            "Apple Metal" if scene.render.engine == "CYCLES" else "GPU raster"
        ),
        "renderMethod": os.environ.get(
            "CLOUD_PLATE_RENDER_METHOD", "CYCLES_VOLUME"
        ).lower().replace("_", "-"),
        "frame": config["frame"],
        "width": config["width"],
        "height": config["height"],
        "transportSamples": config["samples"],
        "adaptiveThreshold": None,
        "samplingMode": "paired-fixed-spp",
        "denoiser": (
            "OpenImageDenoise"
            if scene.render.engine == "CYCLES" and scene.cycles.use_denoising
            else "none"
        ),
        "pathGuiding": (
            "volume"
            if scene.render.engine == "CYCLES" and scene.cycles.use_guiding
            else "none"
        ),
        "phaseFunction": os.environ.get(
            "CLOUD_PLATE_PHASE_FUNCTION", "HENYEY_GREENSTEIN"
        ).lower().replace("_", "-"),
        "worldModel": os.environ.get(
            "CLOUD_PLATE_WORLD_MODEL", "FLAT"
        ).lower(),
        "radianceCalibration": config["radiance_scale"],
        "convergenceDelta": None,
        "renderSeconds": time.time() - started,
        "nonFiniteCount": sum(
            1 for value in pixels if not math.isfinite(float(value))
        ),
    }
    with open(
        os.path.join(config["output"], "capture-metrics.json"),
        "w",
        encoding="utf-8",
    ) as handle:
        json.dump(metrics, handle, indent=2)
        handle.write("\n")
    if metrics["nonFiniteCount"]:
        raise RuntimeError("Cycles result contains non-finite channels")
    print("CLOUD_PLATE_BLENDER_METRICS:" + json.dumps(metrics, separators=(",", ":")))


try:
    main()
except Exception as error:
    print(f"CLOUD_PLATE_BLENDER_ERROR:{type(error).__name__}:{error}", file=sys.stderr)
    raise SystemExit(1) from error
