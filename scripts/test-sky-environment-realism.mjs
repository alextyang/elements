import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const compileCommonJs = (relativePath, dependency = {}) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const moduleObject = { exports: {} };
    const localRequire = (specifier) => dependency[specifier] ?? require(specifier);
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        localRequire,
    );
    return moduleObject.exports;
};

const skyPalettes = compileCommonJs(
    "../components/backgrounds/sky/sky-palettes.ts",
);
const physicalAtmosphere = compileCommonJs(
    "../components/backgrounds/sky/physical-atmosphere.ts",
    {
        "./physical-atmosphere-wgsl.ts": {
            PHYSICAL_ATMOSPHERE_DIRECTIONAL_LIGHTING_WGSL: "",
            PHYSICAL_ATMOSPHERE_IRRADIANCE_WGSL: "",
            PHYSICAL_ATMOSPHERE_MULTISCATTER_WGSL: "",
            PHYSICAL_ATMOSPHERE_SKY_VIEW_WGSL: "",
            PHYSICAL_ATMOSPHERE_TRANSMITTANCE_WGSL: "",
            physicalAtmosphereConsumerWgsl: () => "",
        },
        "./directional-cloud-visibility.ts": {
            DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT: 96,
            DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT: 193,
            DIRECTIONAL_CLOUD_VISIBILITY_WIDTH: 96,
        },
    },
);
const atmosphere = compileCommonJs(
    "../components/backgrounds/sky/atmospheric-composition.ts",
    {
        "./sky-palettes": skyPalettes,
        "./physical-atmosphere": physicalAtmosphere,
    },
);

const {
    AEROSOL_AUTHORING_PRIORS,
    AEROSOL_PHYSICAL_ENVELOPES,
    climatologicalOzoneColumnDobson,
    ozoneColumnScale,
    resolveEnvironmentGroundAlbedo,
    resolvePhysicalAtmosphereComposition,
} = atmosphere;
const {
    SKY_FAMILIES,
    SKY_FAMILY_ENVIRONMENTS,
    skyFamilySelectionWeight,
} = skyPalettes;

const REGIONS = ["marine", "continental", "dry", "humid", "tropical", "polar"];
const SEASONS = ["winter", "spring", "summer", "autumn"];

test("every palette family has a finite physical environment envelope", () => {
    for (const family of SKY_FAMILIES) {
        const environment = SKY_FAMILY_ENVIRONMENTS[family.id];
        assert.ok(environment, `${family.id} is missing its physical environment`);
        assert.ok(environment.autoRegions.length > 0);
        assert.ok(environment.autoRegions.every((region) => REGIONS.includes(region)));
        assert.ok(
            environment.autoSeasons === undefined ||
                environment.autoSeasons.every((season) => SEASONS.includes(season)),
        );
        const [minimum, maximum] = environment.cloudDensityRange;
        assert.ok(Number.isFinite(minimum) && Number.isFinite(maximum));
        assert.ok(minimum >= 0 && maximum <= 2 && minimum <= maximum);
    }
    assert.ok(
        SKY_FAMILY_ENVIRONMENTS["monsoon-pewter"].cloudDensityRange[0] >
            SKY_FAMILY_ENVIRONMENTS["cobalt-gold"].cloudDensityRange[1],
        "monsoon and clean desert regimes must not collapse onto the same cloud state",
    );
});

test("automatic family selection respects regional meteorology", () => {
    for (const region of REGIONS) {
        for (const season of SEASONS) {
            const weights = SKY_FAMILIES.map((family) =>
                skyFamilySelectionWeight(family, season, region));
            assert.ok(weights.some((weight) => weight > 0), `${region}/${season}`);
            SKY_FAMILIES.forEach((family, index) => {
                const environment = SKY_FAMILY_ENVIRONMENTS[family.id];
                if (!environment.autoRegions.includes(region)) {
                    assert.equal(weights[index], 0, `${family.id} in ${region}`);
                }
            });
        }
    }
    const monsoon = SKY_FAMILIES.find((family) => family.id === "monsoon-pewter");
    const winterIce = SKY_FAMILIES.find((family) => family.id === "winter-ice");
    assert.equal(skyFamilySelectionWeight(monsoon, "summer", "polar"), 0);
    assert.ok(skyFamilySelectionWeight(monsoon, "summer", "tropical") > 0);
    assert.equal(skyFamilySelectionWeight(winterIce, "summer", "continental"), 0);
    assert.ok(skyFamilySelectionWeight(winterIce, "winter", "continental") > 0);
});

test("aerosol-class changes start from a valid class-specific microphysics recipe", () => {
    for (const [type, prior] of Object.entries(AEROSOL_AUTHORING_PRIORS)) {
        const envelope = AEROSOL_PHYSICAL_ENVELOPES[type];
        for (const [value, bounds, label] of [
            [prior.aerosol, envelope.aerosol, "aerosol"],
            [prior.humidity, envelope.humidity, "humidity"],
            [prior.size, envelope.size, "size"],
            [prior.absorption, envelope.absorption, "absorption"],
        ]) {
            assert.ok(value >= bounds[0] && value <= bounds[1], `${type} ${label}`);
        }
    }
    assert.ok(AEROSOL_AUTHORING_PRIORS.maritime.size > AEROSOL_AUTHORING_PRIORS.smoke.size);
    assert.ok(AEROSOL_AUTHORING_PRIORS.smoke.absorption > AEROSOL_AUTHORING_PRIORS.maritime.absorption);
});

test("ordinary ozone climatology is centered near 300 DU and varies with latitude and season", () => {
    const equatorial = climatologicalOzoneColumnDobson({
        latitude: 0,
        season: "summer",
        variability: 0.5,
    });
    const midlatitudeSpring = climatologicalOzoneColumnDobson({
        latitude: 45,
        season: "spring",
        variability: 0.5,
    });
    const highLatitudeSpring = climatologicalOzoneColumnDobson({
        latitude: 70,
        season: "spring",
        variability: 0.5,
    });
    assert.ok(equatorial >= 230 && equatorial < 300);
    assert.ok(midlatitudeSpring > equatorial);
    assert.ok(highLatitudeSpring > midlatitudeSpring);

    for (const latitude of [-80, -45, 0, 45, 80]) {
        for (const season of SEASONS) {
            for (const variability of [0, 0.5, 1]) {
                const ozone = climatologicalOzoneColumnDobson({
                    latitude,
                    season,
                    familyScale: 1,
                    variability,
                });
                assert.ok(ozone >= 230 && ozone <= 430);
            }
        }
    }

    const composition = {
        aerosol: 0.16,
        humidity: 0.3,
        aerosolSize: 0.18,
        aerosolAbsorption: 0.025,
        ozone: 1,
        observerAltitude: 0.08,
        inversion: 0.05,
        stratosphericAerosol: 0.02,
        groundAlbedo: 0.2,
    };
    assert.equal(ozoneColumnScale(composition), 1);
    assert.equal(
        resolvePhysicalAtmosphereComposition(composition, "clean").ozoneColumnDobson,
        300,
        "normalized ozone=1 must no longer silently become 430 DU",
    );
});

test("surface spectra remain material-specific across daily brightness variation", () => {
    const darkOcean = resolveEnvironmentGroundAlbedo("ocean", 0);
    const brightOcean = resolveEnvironmentGroundAlbedo("ocean", 1);
    const vegetation = resolveEnvironmentGroundAlbedo("vegetation", 0.5);
    const desert = resolveEnvironmentGroundAlbedo("desert", 0.5);
    const snow = resolveEnvironmentGroundAlbedo("snow", 0.5);

    assert.ok(brightOcean.every((channel, index) => channel > darkOcean[index]));
    assert.ok(darkOcean[2] > darkOcean[1] && darkOcean[1] > darkOcean[0]);
    assert.ok(vegetation[1] > vegetation[0] && vegetation[1] > vegetation[2]);
    assert.ok(desert[0] > desert[1] && desert[1] > desert[2]);
    assert.ok(snow.every((channel) => channel > 0.8));
});
