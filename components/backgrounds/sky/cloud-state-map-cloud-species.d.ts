import type { CloudSpecies as SceneCloudSpecies } from "./cloud-scene";

/**
 * Transitional type re-export for V2 migration modules. The canonical
 * declaration remains owned by cloud-scene.ts; this augmentation allows
 * cloud-state-map consumers to import the same type without creating a second
 * species union or changing runtime exports.
 */
declare module "./cloud-state-map" {
    export type CloudSpecies = SceneCloudSpecies;
}
