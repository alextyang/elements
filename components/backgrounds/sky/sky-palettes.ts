export type SkyPhase =
    | "night"
    | "preDawn"
    | "sunrise"
    | "morning"
    | "day"
    | "golden"
    | "sunset"
    | "dusk";

export interface SkyPalette {
    top: string;
    upper: string;
    middle: string;
    horizon: string;
    low: string;
    left: string;
    right: string;
    glow: string;
    haze: string;
    cloud: string;
    cloudWarm: string;
}

const palette = (
    top: string,
    upper: string,
    middle: string,
    horizon: string,
    low: string,
    left: string,
    right: string,
    glow: string,
    haze: string,
    cloud: string,
    cloudWarm: string,
): SkyPalette => ({
    top,
    upper,
    middle,
    horizon,
    low,
    left,
    right,
    glow,
    haze,
    cloud,
    cloudWarm,
});

export const SKY_PALETTES: Record<SkyPhase, SkyPalette[]> = {
    night: [
        palette("#030718", "#081536", "#10295a", "#28456b", "#412d51", "#172a66", "#552e68", "#9a74c8", "#52689a", "#bdc9ea", "#9e91bf"),
        palette("#040812", "#071b2c", "#123a50", "#285d6d", "#4a525f", "#0e4d64", "#4c416e", "#7ed0cf", "#5c8d9a", "#bddddd", "#a8afc8"),
        palette("#090515", "#1a0e36", "#30255c", "#694369", "#75465a", "#433078", "#873c68", "#e395ae", "#8e6282", "#d9c5db", "#bf9bad"),
        palette("#020914", "#081d38", "#183961", "#35517a", "#5f536f", "#184376", "#70456e", "#82a9e7", "#6079a2", "#c1d0e8", "#b9a8c8"),
        palette("#070a17", "#111a2b", "#29344d", "#505c70", "#6e6067", "#344d68", "#735466", "#c5a1af", "#8e8797", "#d6d8df", "#c4b5bd"),
        palette("#050518", "#121044", "#28256a", "#4c4b82", "#725372", "#323482", "#864f7d", "#d3a2e5", "#8476a9", "#d2cff0", "#c3aacb"),
    ],
    preDawn: [
        palette("#07142f", "#182858", "#4a3e78", "#a95d7e", "#e78882", "#51428b", "#d85e78", "#ffb5a2", "#cf8fa0", "#c9c7df", "#edb6bc"),
        palette("#071b31", "#133a59", "#3c6676", "#ba837f", "#f2b28f", "#24627c", "#d77d83", "#ffd2a7", "#c8a39b", "#cbdadd", "#e8c6b5"),
        palette("#120b31", "#30235f", "#6b477e", "#c4688d", "#f2a39e", "#714a9d", "#df6388", "#ffc0c4", "#d995ae", "#d5c9e0", "#efb6c6"),
        palette("#041d32", "#17445a", "#56747f", "#c9978d", "#f0c1a0", "#307186", "#db8f85", "#ffe1b5", "#cfb2a3", "#d4e0df", "#efd2bd"),
        palette("#0d1433", "#28385f", "#655b82", "#c07b8e", "#f4ad93", "#4f5a96", "#dc7583", "#ffc3a8", "#d69aa0", "#d1d3e3", "#ecc0bf"),
        palette("#111226", "#2f3048", "#6f6073", "#ba7e7c", "#e7aa86", "#566079", "#d27676", "#f8c39e", "#c39691", "#d5d0d2", "#e7b9aa"),
    ],
    sunrise: [
        palette("#315e9c", "#6b79bd", "#c485c4", "#ff9b99", "#ffd39a", "#f06f92", "#ffad77", "#fff0bb", "#ffcaab", "#f0d9dc", "#ffd0bf"),
        palette("#2d73a9", "#67a5c7", "#b9c7c5", "#f4b68d", "#ffe2ad", "#f0a078", "#f8c38d", "#fff1c8", "#e8cbb5", "#e3e9e2", "#f6d7be"),
        palette("#3d4e9b", "#7f69bb", "#d47eae", "#ff8f79", "#ffc46f", "#df5a93", "#ff8d55", "#ffe49a", "#ffb08c", "#e8cce2", "#ffc0ab"),
        palette("#276f9c", "#60a3b4", "#b9d0c0", "#f2c991", "#ffeaba", "#61b4b4", "#efa16d", "#fff5ce", "#dbd5b6", "#e1ece4", "#f3d2a8"),
        palette("#4c5aa0", "#9b76b8", "#e99cb2", "#ffba99", "#ffe0a9", "#e682aa", "#ffb079", "#fff2c6", "#f6c5b1", "#ead9e9", "#ffcfbd"),
        palette("#355f86", "#7894a5", "#c7b39e", "#e9aa80", "#f5c184", "#7193a0", "#e28d68", "#ffe0a0", "#d9b197", "#dedbd4", "#e9b79d"),
        palette("#254e8d", "#4d76b8", "#8f83cc", "#ef87a7", "#ffd0a0", "#c85f9a", "#ff9b7b", "#ffeab8", "#eeb4ba", "#d5d4ed", "#f9c2c0"),
        palette("#4679a6", "#8fb3c4", "#d2d2c4", "#efbf97", "#ffe6bd", "#89bdc7", "#f1ac82", "#fff0cc", "#e2cbbc", "#e8ece8", "#f4d8c6"),
    ],
    morning: [
        palette("#4a91cd", "#76bce4", "#b1dff0", "#d8edf0", "#f4dbbf", "#68c4e3", "#ecc39d", "#fff2d4", "#d8e9df", "#edf5f3", "#f2ddcd"),
        palette("#538cc0", "#82adc8", "#b7ced5", "#ddd6ca", "#edd0b1", "#7db6ca", "#e1b996", "#f8dfbe", "#d7d8ce", "#e9eeeb", "#e8d8c9"),
        palette("#407fbf", "#6da9db", "#b2d6e9", "#d8e4e6", "#f0d0c1", "#71b7df", "#e4b6b4", "#ffe5d6", "#d6dfe2", "#edf3f5", "#ead6d8"),
        palette("#3d96bd", "#70c4d6", "#b4e2df", "#dce9d5", "#f0d8b9", "#5ec6d3", "#e9c28e", "#fff0ca", "#d9e5d2", "#eef4e9", "#f1dec5"),
        palette("#597fb6", "#8ca9d0", "#c8d5e6", "#e4dce2", "#f0cccb", "#859fcf", "#dcafb7", "#ffe1dc", "#dedce8", "#f1f1f7", "#e9d2da"),
        palette("#4a89a9", "#7eafbd", "#b9ced0", "#dad9cc", "#e7cfaf", "#78b9c4", "#ddb790", "#f4dfbf", "#d4d9d1", "#e9efed", "#e5d6c6"),
    ],
    day: [
        palette("#277fc5", "#4daae0", "#8fd1ef", "#c5e8f4", "#dceef0", "#38b9e8", "#9ddff1", "#f7fdff", "#c7e8ed", "#f5fbfc", "#e8f2f2"),
        palette("#3a76b8", "#6b9fd1", "#a9c8e1", "#d0dfe9", "#dfe5e6", "#5597cf", "#a9cfdf", "#f3f7fa", "#cbd9e1", "#f1f5f6", "#e3e8eb"),
        palette("#178fae", "#45b8ca", "#87d5d9", "#c4e8e3", "#dfede5", "#28c0cc", "#9edfd8", "#f5fff9", "#c9e6dc", "#f2fbf7", "#e1eee8"),
        palette("#4d68ad", "#768dcb", "#aab9dd", "#d1d8e7", "#e1e1e7", "#637ec7", "#b5c2df", "#f7f5ff", "#d1d3e3", "#f4f3fa", "#e6e4ed"),
        palette("#2f86b8", "#5aaccb", "#94cede", "#c6dfe4", "#dedfdb", "#4cb6d1", "#a8d4d9", "#fbfaf0", "#cedfdc", "#f5f7f3", "#e8e8e1"),
        palette("#5b7da6", "#86a4bd", "#b4c8d2", "#d3dde0", "#e2e4e1", "#7aacc4", "#bdced2", "#fafcf9", "#d5dddd", "#f2f5f4", "#e5e8e7"),
        palette("#3572c4", "#669fe0", "#a3c9ef", "#cadff1", "#e0e8ee", "#4c9ce2", "#b4d4ee", "#fbfdff", "#cddff0", "#f6f9fc", "#e7edf4"),
        palette("#308e9c", "#64b4b8", "#9ccfcb", "#c8dfd7", "#e0e4d7", "#52bdba", "#add5ca", "#fffced", "#d0ded2", "#f4f7ee", "#e6e9dc"),
    ],
    golden: [
        palette("#2d6fae", "#5c98c4", "#a9bec7", "#edc493", "#f5ad68", "#488fc7", "#ef9a61", "#fff0b7", "#ddbea0", "#e6e7df", "#f3c39b"),
        palette("#456a9c", "#7e92ae", "#c2b8ad", "#ecb583", "#ef9560", "#667fb2", "#df7d65", "#ffe0a5", "#d5a991", "#e0dcd9", "#eab197"),
        palette("#5963a2", "#8d81b2", "#cda8b2", "#f4b49a", "#f49b75", "#7968b7", "#e47c89", "#ffe0b9", "#ddb0ad", "#e6d8e3", "#efb7b0"),
        palette("#286f8e", "#5d999e", "#aeb79f", "#e1b978", "#e9974d", "#4a9a9d", "#df814e", "#ffe7a3", "#d4af83", "#dfe1d2", "#ecb17f"),
        palette("#365982", "#6f7d94", "#a99e9d", "#dca978", "#e68a50", "#657b99", "#cf7453", "#f8d898", "#c99a82", "#d7d5d0", "#e0a580"),
        palette("#446cb0", "#8096c8", "#c4b6cb", "#efaec0", "#f99d87", "#7278c5", "#ee789a", "#ffe0cf", "#dcaabf", "#e5dded", "#efb1be"),
    ],
    sunset: [
        palette("#263e78", "#5d559a", "#c7649d", "#ff866f", "#ffbd63", "#8b438e", "#ee5b65", "#ffe39b", "#f29a7d", "#d1b4cf", "#ffad8e"),
        palette("#184f73", "#397985", "#b06f75", "#f67b5b", "#ffc45d", "#267e87", "#e75e4a", "#ffe88f", "#ee9a71", "#c8d0ca", "#ffad79"),
        palette("#384078", "#76558d", "#c17b99", "#e9a18e", "#f3c58b", "#7f4e99", "#d98481", "#ffe2af", "#dca795", "#d7c8d5", "#e9b3a5"),
        palette("#263b65", "#6a577d", "#c16d83", "#f47c67", "#f6a554", "#704987", "#df5e64", "#ffd98b", "#e48b76", "#cdbdce", "#f39d85"),
        palette("#315b86", "#6e7e9b", "#c59a9a", "#f0b17d", "#f0bd72", "#6983a1", "#df8a6c", "#ffe2a1", "#d8ab91", "#d4d6d8", "#e8b39a"),
        palette("#352c70", "#713c84", "#c84f82", "#fa696a", "#ffad4f", "#7b2d86", "#ec4859", "#ffd778", "#ec7d6d", "#c9a5c7", "#ff967a"),
        palette("#24476e", "#4f738a", "#9d8c91", "#da966d", "#e7a65c", "#47798d", "#d27657", "#f6cd7c", "#c9957d", "#c7ced0", "#dca084"),
        palette("#4a427c", "#8f5c92", "#da8194", "#f9a184", "#ffc475", "#9b5794", "#ef7b75", "#ffe2a0", "#eda28d", "#ddc2d5", "#f7b19d"),
    ],
    dusk: [
        palette("#111d43", "#26345f", "#55466f", "#a45870", "#dc7b72", "#413771", "#bd4f70", "#f0a29a", "#a66f83", "#bec1d4", "#d28a8b"),
        palette("#0b2438", "#194257", "#3c6570", "#89736f", "#c08770", "#286174", "#a36b6c", "#d9a992", "#8d8280", "#bdcdd0", "#c49b8c"),
        palette("#1a173f", "#382b62", "#71426f", "#ba5c78", "#dc7782", "#5b337a", "#ca5478", "#eca0ac", "#ad718a", "#c9bfd3", "#d78d9c"),
        palette("#14253e", "#35445c", "#6d5d6d", "#a97874", "#c98d76", "#4c5171", "#af6970", "#dfae96", "#97868a", "#c7cbd1", "#cca091"),
        palette("#101d36", "#273851", "#526075", "#8d7180", "#b7787c", "#3d526c", "#a35e7b", "#d99ea6", "#867e91", "#c2c9d4", "#c28d99"),
        palette("#18203f", "#3b3f67", "#716081", "#a9778a", "#c88d82", "#555079", "#ae6b85", "#deb0ac", "#98889b", "#cbc8d5", "#c9a0a3"),
    ],
};

export const PHASE_ORDER: SkyPhase[] = [
    "night",
    "preDawn",
    "sunrise",
    "morning",
    "day",
    "golden",
    "sunset",
    "dusk",
];

