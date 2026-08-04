/**
 * Standalone qualification manifest for optical/emissive weather phenomena.
 * It is separate from the active cloud matrix so renderer integration can land
 * without creating merge conflicts or falsely marking unhooked states complete.
 */

export type WeatherPhenomenonQualificationFamily =
    | "droplet-optics"
    | "oriented-ice"
    | "lightning"
    | "aurora"
    | "blowing-medium";

export interface WeatherPhenomenonQualificationTarget {
    id: string;
    family: WeatherPhenomenonQualificationFamily;
    phenomenon: string;
    owner: string;
    environment: string;
    sourceGeometry: string;
    perspective: string;
    requiredCues: readonly string[];
    forbiddenFailures: readonly string[];
    implementation: "standalone-foundation";
}

const target = (
    value: Omit<WeatherPhenomenonQualificationTarget, "implementation">,
): WeatherPhenomenonQualificationTarget => ({
    ...value,
    implementation: "standalone-foundation",
});

export const WEATHER_PHENOMENA_QUALIFICATION_TARGETS = Object.freeze([
    target({
        id: "rainbow-primary-distant-rain", family: "droplet-optics",
        phenomenon: "primary-rainbow", owner: "finite sunlit rain shaft",
        environment: "clean post-shower air; Sun 8 degrees above horizon",
        sourceGeometry: "138-degree source/view scattering",
        perspective: "ground observer with rain opposite the Sun",
        requiredCues: ["red outer edge", "blue inner edge", "finite shaft ownership"],
        forbiddenFailures: ["screen-centred arc", "uniform spectral band", "bow outside rain"],
    }),
    target({
        id: "rainbow-secondary-alexander-band", family: "droplet-optics",
        phenomenon: "secondary-rainbow", owner: "same finite rain shaft as primary",
        environment: "moderate large-drop shower; low Sun",
        sourceGeometry: "126–130-degree scattering outside primary",
        perspective: "wide antisolar view",
        requiredCues: ["reversed colour order", "weaker energy", "dark interval without negative light"],
        forbiddenFailures: ["secondary brighter than primary", "identical radius", "painted dark stripe"],
    }),
    target({
        id: "fogbow-small-droplet-bank", family: "droplet-optics",
        phenomenon: "fogbow", owner: "finite illuminated fog bank",
        environment: "5–25 micron droplets; modest optical depth",
        sourceGeometry: "broad near-antisolar scattering",
        perspective: "observer at or above bank edge",
        requiredCues: ["broad white bow", "weak spectral fringe", "fog-density coupling"],
        forbiddenFailures: ["rainbow saturation", "sharp ring", "bow through clear air"],
    }),
    target({
        id: "glory-cloud-top", family: "droplet-optics",
        phenomenon: "glory", owner: "finite liquid cloud top",
        environment: "narrow 8–20 micron droplet spectrum",
        sourceGeometry: "concentric rings within several degrees of antisolar point",
        perspective: "elevated observer looking onto own shadow region",
        requiredCues: ["radius changes with droplet size", "red/blue ring reversal", "cloud ownership"],
        forbiddenFailures: ["fixed halo", "single white circle", "glory without backscatter geometry"],
    }),
    target({
        id: "corona-thin-liquid-veil", family: "droplet-optics",
        phenomenon: "corona", owner: "optically thin liquid cloud",
        environment: "narrow droplet distribution around 10 microns",
        sourceGeometry: "forward diffraction around resolved Sun or Moon",
        perspective: "source-centred telephoto and natural-FOV views",
        requiredCues: ["energy-normalized Airy core", "polydisperse ring damping", "source extinction"],
        forbiddenFailures: ["static radial stamp", "backscatter corona", "rings through thick cloud"],
    }),
    target({
        id: "halo-22-cirrostratus", family: "oriented-ice",
        phenomenon: "22-degree halo", owner: "finite cold cirrostratus",
        environment: "smooth randomly oriented hexagonal crystals",
        sourceGeometry: "22-degree source-centred minimum-deviation ring",
        perspective: "wide source-centred view",
        requiredCues: ["red inner edge", "blue outer edge", "habit/roughness suppression"],
        forbiddenFailures: ["HG glow", "fixed white ring", "halo outside ice veil"],
    }),
    target({
        id: "halo-46-pristine-ice", family: "oriented-ice",
        phenomenon: "46-degree halo", owner: "thin pristine ice cloud",
        environment: "low roughness; broad random orientation population",
        sourceGeometry: "46-degree source-centred refracted ring",
        perspective: "very wide source-centred view",
        requiredCues: ["much weaker than 22-degree halo", "spectral inner edge", "finite ice support"],
        forbiddenFailures: ["equal-energy rings", "same width as rough ice", "screen-space circle"],
    }),
    target({
        id: "sundogs-horizontal-plates", family: "oriented-ice",
        phenomenon: "parhelia", owner: "plate-rich ice cloud or diamond dust",
        environment: "Sun below 35 degrees; narrow plate tilt distribution",
        sourceGeometry: "paired source-elevation lobes near 22-degree azimuth",
        perspective: "horizon-inclusive wide view",
        requiredCues: ["paired finite lobes", "same elevation as source", "red source-facing edge"],
        forbiddenFailures: ["complete ring from oriented plates", "vertical displacement", "single fixed sprite"],
    }),
    target({
        id: "circumzenithal-low-sun", family: "oriented-ice",
        phenomenon: "circumzenithal arc", owner: "horizontal plate population",
        environment: "Sun 5–30 degrees; pristine plates",
        sourceGeometry: "top-face/side-face refraction with 32.3-degree cutoff",
        perspective: "camera includes zenith and source azimuth",
        requiredCues: ["altitude rises toward zenith with Sun", "strong spectral ordering", "finite azimuth arc"],
        forbiddenFailures: ["arc above source cutoff", "46-degree circular mask", "wrong source azimuth"],
    }),
    target({
        id: "solar-pillar-low-source", family: "oriented-ice",
        phenomenon: "light pillar", owner: "finite horizontal plate field",
        environment: "source near horizon; distributed plate tilts",
        sourceGeometry: "azimuth-locked specular reflection column",
        perspective: "horizon and source in frame",
        requiredCues: ["vertical elongation", "tilt-dependent length", "cloud/diamond-dust depth"],
        forbiddenFailures: ["radial bloom", "pillar far from source azimuth", "uniform alpha bar"],
    }),
    target({
        id: "diamond-dust-glints", family: "oriented-ice",
        phenomenon: "diamond-dust glints", owner: "finite cold boundary-layer region",
        environment: "plate/column crystals below 269 K",
        sourceGeometry: "Beckmann-distributed crystal half-vector alignment",
        perspective: "near-ground source-facing view",
        requiredCues: ["sparse orientation-selective glints", "finite region", "energy partition from volume"],
        forbiddenFailures: ["random stars in fog", "isotropic HG sparkle", "warm humid invalid state"],
    }),
    target({
        id: "lightning-intracloud", family: "lightning",
        phenomenon: "intra-cloud lightning", owner: "deep finite cumulonimbus",
        environment: "separated positive/negative charge regions",
        sourceGeometry: "branched channel between charge reservoirs",
        perspective: "side view through cloud optical depth",
        requiredCues: ["cloud-volume irradiance injection", "sub-millisecond rise", "branch attachment"],
        forbiddenFailures: ["full-screen flash", "IC channel outside cloud support", "unattenuated overlay"],
    }),
    target({
        id: "lightning-cloud-ground", family: "lightning",
        phenomenon: "cloud-to-ground return stroke", owner: "deep finite cumulonimbus",
        environment: "negative charge centre over physical terrain",
        sourceGeometry: "stepped descending leader, attached branches, finite return pulses",
        perspective: "ground and cloud base visible",
        requiredCues: ["ground termination", "energy-normalized pulse train", "atmospheric scatter"],
        forbiddenFailures: ["floating endpoint", "constant emissive tube", "tone-mapped source injection"],
    }),
    target({
        id: "aurora-green-curtain", family: "aurora",
        phenomenon: "green auroral curtain", owner: "finite magnetic sheet",
        environment: "auroral latitude; moderate Kp",
        sourceGeometry: "field-aligned folds with O I 557.7 nm peak near 112 km",
        perspective: "wide northern sky view",
        requiredCues: ["thin folded sheet", "green altitude peak", "lower-atmosphere extinction"],
        forbiddenFailures: ["screen-space noise", "ground-level glow", "uniform green gradient"],
    }),
    target({
        id: "aurora-red-high-altitude", family: "aurora",
        phenomenon: "red auroral upper curtain", owner: "same magnetic sheet",
        environment: "soft electron precipitation; geomagnetic storm",
        sourceGeometry: "O I 630.0 nm emission centred near 225 km",
        perspective: "long slant path beneath upper curtain",
        requiredCues: ["red above green", "field-aligned displacement", "finite longitudinal support"],
        forbiddenFailures: ["red below blue edge", "flat billboard", "TOA-source treatment"],
    }),
    target({
        id: "aurora-blue-lower-edge", family: "aurora",
        phenomenon: "blue-violet lower border", owner: "energetic finite curtain",
        environment: "strong particle precipitation; high latitude",
        sourceGeometry: "N2/N2+ emission near 95–110 km",
        perspective: "near-overhead curtain folds",
        requiredCues: ["blue confined to lower edge", "subtle temporal rays", "scene-linear line emission"],
        forbiddenFailures: ["blue entire curtain", "RGB texture scroll", "alpha compositing"],
    }),
    target({
        id: "blowing-snow-ground-layer", family: "blowing-medium",
        phenomenon: "blowing snow", owner: "finite snow-covered boundary region",
        environment: "subfreezing surface; wind above threshold",
        sourceGeometry: "saltation-dominated near-ground exponential layer",
        perspective: "crosswind and downwind ground views",
        requiredCues: ["neutral extinction", "near-ground concentration", "wind-coupled motion"],
        forbiddenFailures: ["global white fog", "warm no-snow state", "hard region mask"],
    }),
    target({
        id: "blowing-dust-erodible-soil", family: "blowing-medium",
        phenomenon: "blowing dust", owner: "finite dry-soil boundary region",
        environment: "dry low-snow surface; wind above threshold",
        sourceGeometry: "saltation plus suspended coarse aerosol",
        perspective: "crosswind and downwind horizon views",
        requiredCues: ["blue-weighted extinction", "absorbing warm scatter", "finite source region"],
        forbiddenFailures: ["white snow optics", "wet-soil state", "horizon-wide flat overlay"],
    }),
] as const satisfies readonly WeatherPhenomenonQualificationTarget[]);
