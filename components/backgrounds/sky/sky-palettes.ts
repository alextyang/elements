export type SkyPhase =
    | "night"
    | "blueHourMorning"
    | "preDawn"
    | "beltOfVenus"
    | "sunrise"
    | "morning"
    | "solarNoon"
    | "day"
    | "golden"
    | "sunset"
    | "afterglow"
    | "dusk"
    | "blueHourEvening";

export type SkyAtmosphere = "crystal" | "haze" | "cirrus" | "mist" | "soft";
export type SkySeason = "winter" | "spring" | "summer" | "autumn";
export type SkyRegion =
    | "marine"
    | "continental"
    | "dry"
    | "humid"
    | "tropical"
    | "polar";

export type SkyNightCharacter =
    | "pristine"
    | "marine"
    | "alpine"
    | "desert"
    | "overcast"
    | "smoky"
    | "humid"
    | "polar"
    | "airglow";

export interface SkyFamily {
    id: string;
    label: string;
    phaseIndices: Record<SkyPhase, number>;
    grade: {
        hueShift: number;
        chroma: number;
        lightness: number;
        hueJitter: number;
        chromaJitter: number;
        lightnessJitter: number;
    };
    intensity: {
        contrast: number;
        saturation: number;
        edge: number;
        glow: number;
        haze: number;
    };
    optics: {
        nightCharacter: SkyNightCharacter;
        nightTint: string;
        nightFloor: number;
        horizonLift: number;
        aerosol: number;
        humidity: number;
        artificialGlow: number;
        twilightChroma: number;
    };
    atmospheres: SkyAtmosphere[];
    seasonWeights: Record<SkySeason, number>;
    regionWeights: Partial<Record<SkyRegion, number>>;
}

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
        palette("#01070d", "#071820", "#12313a", "#31545a", "#586768", "#0b3e4c", "#4d5969", "#8fd6d4", "#67888c", "#bdd7d7", "#9fb6b8"),
        palette("#08070d", "#171522", "#302c3c", "#555064", "#78666d", "#3f3952", "#765868", "#d6b4bb", "#96868e", "#ddd8dd", "#c7b6bd"),
    ],
    blueHourMorning: [
        palette("#061126", "#102b51", "#214f79", "#557998", "#8b98a8", "#245e92", "#735f96", "#a9ccec", "#718baa", "#c7d9ea", "#b8b7d0"),
        palette("#071a27", "#123848", "#2f6673", "#6a8e92", "#9baaa5", "#257184", "#786f85", "#b5e1df", "#7f9c9e", "#cce1de", "#c2bdc8"),
        palette("#100b29", "#292052", "#564176", "#8b668c", "#b78996", "#614b8c", "#a26186", "#d5c1ef", "#927796", "#d8d2e5", "#d3b9c8"),
        palette("#041522", "#0f3548", "#2d5e70", "#64838e", "#92a3a4", "#237086", "#71788e", "#b2d9e3", "#78959d", "#c9dde2", "#bfc4ca"),
        palette("#101631", "#28365c", "#525f82", "#85859d", "#ad9ea7", "#516a99", "#9a718f", "#d2d7f3", "#8b8fa7", "#d5d9e5", "#d0bdc8"),
        palette("#15141f", "#303342", "#5a6070", "#858890", "#aaa4a0", "#596d7f", "#8c7078", "#d5d3d0", "#92969b", "#d8d9d9", "#c8c0bd"),
        palette("#03151c", "#0d3440", "#245d67", "#5d8583", "#91a69c", "#176d78", "#6d7a75", "#a9e0d5", "#739993", "#c9dfda", "#b7c6bd"),
        palette("#0a1029", "#1c2b57", "#3d5382", "#72769d", "#a18fa2", "#435f9d", "#946383", "#b8ccf5", "#7f82a7", "#ccd7ec", "#c8aec4"),
    ],
    preDawn: [
        palette("#07142f", "#182858", "#4a3e78", "#a95d7e", "#e78882", "#51428b", "#d85e78", "#ffb5a2", "#cf8fa0", "#c9c7df", "#edb6bc"),
        palette("#071b31", "#133a59", "#3c6676", "#ba837f", "#f2b28f", "#24627c", "#d77d83", "#ffd2a7", "#c8a39b", "#cbdadd", "#e8c6b5"),
        palette("#120b31", "#30235f", "#6b477e", "#c4688d", "#f2a39e", "#714a9d", "#df6388", "#ffc0c4", "#d995ae", "#d5c9e0", "#efb6c6"),
        palette("#041d32", "#17445a", "#56747f", "#c9978d", "#f0c1a0", "#307186", "#db8f85", "#ffe1b5", "#cfb2a3", "#d4e0df", "#efd2bd"),
        palette("#0d1433", "#28385f", "#655b82", "#c07b8e", "#f4ad93", "#4f5a96", "#dc7583", "#ffc3a8", "#d69aa0", "#d1d3e3", "#ecc0bf"),
        palette("#111226", "#2f3048", "#6f6073", "#ba7e7c", "#e7aa86", "#566079", "#d27676", "#f8c39e", "#c39691", "#d5d0d2", "#e7b9aa"),
        palette("#071d28", "#174351", "#4e7378", "#b08d7f", "#ddb18b", "#2d6f78", "#be7c70", "#f5d1a9", "#b79c90", "#cfddda", "#dfbda7"),
        palette("#17102b", "#392759", "#795075", "#c06b82", "#e59b8c", "#824d91", "#d35e76", "#f7b8b3", "#cd8ea0", "#d8cbd9", "#e6aeb4"),
    ],
    beltOfVenus: [
        palette("#203d73", "#52669c", "#9a89b7", "#e6a4ad", "#f8c5ae", "#7b69aa", "#e78b9e", "#ffe0ca", "#d2a9b8", "#dde0ed", "#efc0bd"),
        palette("#235777", "#5f8495", "#a6b5b4", "#e4b7aa", "#f5d1b2", "#6c9ba5", "#dc9a90", "#ffe8ce", "#cdbbb1", "#e2e8e5", "#edcec0"),
        palette("#313776", "#6e5c9e", "#b77dad", "#ee9eae", "#fac2b8", "#8c61af", "#e47f9d", "#ffdad3", "#d6a0b5", "#e6dced", "#f1b9c1"),
        palette("#285b70", "#669091", "#abb9aa", "#e1b995", "#f1d1a7", "#61a4a4", "#d69a79", "#ffe8bd", "#c8b79e", "#e1e9df", "#ebc9ae"),
        palette("#454778", "#7b729c", "#b7a0b5", "#e0b3b7", "#f2c9b8", "#887aad", "#d99ca9", "#f9ded6", "#c9b3bf", "#e7e2e9", "#e9c6c3"),
        palette("#3c5268", "#748390", "#adb2af", "#d8b8a8", "#e9c9ad", "#7c98a0", "#cc9b8e", "#f3ddc8", "#c3b4ad", "#e1e4e2", "#dfc6bb"),
        palette("#263c70", "#58699f", "#9a88c0", "#e49ab4", "#f9c1b5", "#755eb3", "#df799f", "#ffdbd4", "#d1a0b7", "#dbdcec", "#efb7c3"),
        palette("#315e77", "#7295a0", "#b2bdb5", "#e5bf9f", "#f6d9b9", "#79aaa9", "#dc9e83", "#ffebca", "#cfbdab", "#e5ebe6", "#efcfb9"),
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
        palette("#61798f", "#8fa5b3", "#bdc8cc", "#d8d9d4", "#e6d9c7", "#839eac", "#d5b99e", "#f3e5cf", "#ced5d3", "#e7ecec", "#dfd5ca"),
        palette("#327fa4", "#62abbc", "#a3d0cd", "#d1dfcf", "#e7d9b6", "#54b5c0", "#dabf87", "#f9edc2", "#cadccc", "#eaf2ea", "#e9d9bd"),
        palette("#536db2", "#8298d2", "#b8c6e3", "#d8d9ea", "#edcedb", "#7699dc", "#dbaec5", "#fce0e8", "#d4d7e7", "#edf1f8", "#e6d3e0"),
        palette("#527f92", "#82a9ad", "#b7cbc5", "#d6ddd0", "#e8d8b8", "#76b3b1", "#d9bd8b", "#f8ecc4", "#d0dbcd", "#eaf0e8", "#e7dac2"),
    ],
    solarNoon: [
        palette("#126fc2", "#2d96dd", "#69bdec", "#abe0f5", "#d4eff5", "#20aee8", "#82d5f2", "#f8feff", "#b8e4ef", "#f6fcfd", "#e9f4f5"),
        palette("#315f9e", "#527fb5", "#82a8cc", "#b7cfdf", "#d7e1e4", "#3e83be", "#93c2d8", "#f5f8fa", "#bed3de", "#f0f5f7", "#e2e9ed"),
        palette("#07849e", "#24aab9", "#64c9cd", "#a9e0dc", "#d2ece4", "#13b6c0", "#82d8d1", "#f6fffa", "#b7dfd6", "#f2faf7", "#e3eee9"),
        palette("#40569a", "#6278b5", "#8fa3cf", "#bdcce0", "#d9e0e8", "#526dbc", "#a0b5da", "#f7f7ff", "#c4cede", "#f3f4fa", "#e5e7ef"),
        palette("#23789d", "#459db5", "#78becb", "#add9dc", "#d1e6e2", "#32a8bd", "#8fced4", "#fcfbf2", "#bbd8d5", "#f5f7f4", "#e7ebe7"),
        palette("#55728d", "#7795a9", "#a3bac5", "#c7d5da", "#dce2e1", "#689db7", "#aabfc7", "#fafcf9", "#c9d6d7", "#f1f5f4", "#e5e9e8"),
        palette("#235fba", "#4585d5", "#78ace7", "#aed0ef", "#d4e5ed", "#337fd9", "#99c3e9", "#fbfdff", "#bbd5ec", "#f5f9fc", "#e7edf4"),
        palette("#17848e", "#399fa5", "#6ebcbc", "#a8d5ce", "#d2e2d7", "#27aaa9", "#8cc9c0", "#fffdef", "#b9d5ca", "#f4f7ef", "#e5eadf"),
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
        palette("#466f87", "#76959d", "#acb4a8", "#d8b778", "#e8a94f", "#5c999d", "#d68b49", "#ffe3a0", "#cfad7f", "#dfe4da", "#e7b273"),
        palette("#414d8d", "#7370ad", "#b19bb9", "#e5ac9e", "#ed916d", "#7163b1", "#dd7183", "#ffddbf", "#d5a4a5", "#e2d8e6", "#e9aa9b"),
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
    afterglow: [
        palette("#1e2c5f", "#51407f", "#a14d83", "#ee6c72", "#fca25d", "#6e378d", "#df445f", "#ffd38c", "#df7b73", "#cab1cb", "#ef947f"),
        palette("#16455e", "#326b73", "#8d646d", "#d96c58", "#ec9c55", "#23717a", "#ce5146", "#ffd982", "#d87d69", "#bdcbc8", "#ef9470"),
        palette("#342f67", "#68467d", "#a96987", "#d68c87", "#eab37c", "#72418a", "#c76e77", "#ffd9a3", "#cc958f", "#d0c3d2", "#dea396"),
        palette("#27325a", "#59446f", "#a05272", "#df655c", "#ee9146", "#624078", "#cf4658", "#ffcd78", "#d57267", "#c5b8c7", "#e68673"),
        palette("#2c4e70", "#617084", "#ad8b8b", "#daa173", "#e7b266", "#607b91", "#cd7b61", "#ffd991", "#c89b85", "#cbd0d2", "#dda88f"),
        palette("#30245f", "#672d75", "#ae3e72", "#ed5761", "#f79543", "#70217c", "#dc344d", "#ffca67", "#d86661", "#c39ec0", "#f08069"),
        palette("#21405d", "#466678", "#877d84", "#c58966", "#dc9d53", "#3f7080", "#bc674e", "#efc26f", "#bb8872", "#bdc7c9", "#d19478"),
        palette("#43366a", "#7f4d80", "#be6d84", "#e98f79", "#f8b265", "#8b4985", "#dc665f", "#ffda8f", "#dc8c7e", "#d2b6ce", "#eaa18d"),
    ],
    dusk: [
        palette("#111d43", "#26345f", "#55466f", "#a45870", "#dc7b72", "#413771", "#bd4f70", "#f0a29a", "#a66f83", "#bec1d4", "#d28a8b"),
        palette("#0b2438", "#194257", "#3c6570", "#89736f", "#c08770", "#286174", "#a36b6c", "#d9a992", "#8d8280", "#bdcdd0", "#c49b8c"),
        palette("#1a173f", "#382b62", "#71426f", "#ba5c78", "#dc7782", "#5b337a", "#ca5478", "#eca0ac", "#ad718a", "#c9bfd3", "#d78d9c"),
        palette("#14253e", "#35445c", "#6d5d6d", "#a97874", "#c98d76", "#4c5171", "#af6970", "#dfae96", "#97868a", "#c7cbd1", "#cca091"),
        palette("#101d36", "#273851", "#526075", "#8d7180", "#b7787c", "#3d526c", "#a35e7b", "#d99ea6", "#867e91", "#c2c9d4", "#c28d99"),
        palette("#18203f", "#3b3f67", "#716081", "#a9778a", "#c88d82", "#555079", "#ae6b85", "#deb0ac", "#98889b", "#cbc8d5", "#c9a0a3"),
        palette("#102631", "#294650", "#587077", "#8b8580", "#ad927e", "#3a6170", "#987870", "#d2b9a3", "#7f9291", "#c7d3d3", "#b8a59a"),
        palette("#211735", "#43294f", "#774661", "#aa6671", "#c88177", "#5f3668", "#b75a70", "#dfa0a0", "#967083", "#c9becd", "#c79198"),
    ],
    blueHourEvening: [
        palette("#09142f", "#182855", "#344372", "#656384", "#8d7985", "#32407d", "#7c4d78", "#b6a9db", "#766b8b", "#c6c5dc", "#b9a2b6"),
        palette("#071d2b", "#123b4d", "#32606d", "#617b7f", "#878981", "#236071", "#705c71", "#a9d1ce", "#70878a", "#c2d3d3", "#b3aaa9"),
        palette("#160d32", "#302054", "#5b3a6e", "#8d586f", "#a96e75", "#58317d", "#914260", "#cda2cf", "#80637d", "#c9bed2", "#bc919f"),
        palette("#0b2030", "#1e4052", "#486473", "#728080", "#968a7c", "#346275", "#806066", "#b8c9c5", "#78888a", "#c6d1d1", "#b6a59d"),
        palette("#111b38", "#2a395d", "#56607a", "#7f7685", "#9d7f83", "#465680", "#83566f", "#c4b0ce", "#7e768a", "#c8c7d5", "#baa3ae"),
        palette("#171b2d", "#303849", "#565f6c", "#777a7c", "#92857e", "#485f73", "#755b63", "#c0b7b3", "#777d82", "#c7cccf", "#b8aaa5"),
        palette("#081b27", "#163b48", "#365d67", "#627875", "#85867b", "#28616f", "#6b5e69", "#a7cbc3", "#6b8583", "#bfd0cd", "#aea9a3"),
        palette("#10122f", "#252554", "#4a4175", "#775b83", "#987080", "#443881", "#81496e", "#b6a9dc", "#726681", "#c3c1d8", "#b793a8"),
    ],
};

export const PHASE_ORDER: SkyPhase[] = [
    "night",
    "blueHourMorning",
    "preDawn",
    "beltOfVenus",
    "sunrise",
    "morning",
    "solarNoon",
    "day",
    "golden",
    "sunset",
    "afterglow",
    "dusk",
    "blueHourEvening",
];

const phaseIndices = (values: number[]) =>
    Object.fromEntries(
        PHASE_ORDER.map((phase, index) => [phase, values[index]]),
    ) as Record<SkyPhase, number>;

const seasons = (
    winter: number,
    spring: number,
    summer: number,
    autumn: number,
): Record<SkySeason, number> => ({ winter, spring, summer, autumn });

export const SKY_FAMILIES: SkyFamily[] = [
    {
        id: "crystal-azure",
        label: "Crystal Azure",
        phaseIndices: phaseIndices([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        grade: { hueShift: -2, chroma: 1.08, lightness: 0, hueJitter: 3, chromaJitter: 0.08, lightnessJitter: 0.018 },
        intensity: { contrast: 1.08, saturation: 1.1, edge: 1.08, glow: 1.02, haze: 0.78 },
        optics: { nightCharacter: "pristine", nightTint: "#0a1b43", nightFloor: 0.105, horizonLift: 0.035, aerosol: 0.18, humidity: 0.18, artificialGlow: 0.01, twilightChroma: 1.02 },
        atmospheres: ["crystal", "cirrus"],
        seasonWeights: seasons(1.25, 1.1, 1.05, 0.9),
        regionWeights: { continental: 1.2, dry: 1.15, polar: 1.25 },
    },
    {
        id: "marine-pearl",
        label: "Marine Pearl",
        phaseIndices: phaseIndices([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
        grade: { hueShift: -5, chroma: 0.84, lightness: 0.018, hueJitter: 3, chromaJitter: 0.06, lightnessJitter: 0.015 },
        intensity: { contrast: 0.91, saturation: 0.9, edge: 0.8, glow: 1.08, haze: 1.3 },
        optics: { nightCharacter: "marine", nightTint: "#123b4a", nightFloor: 0.135, horizonLift: 0.072, aerosol: 0.52, humidity: 0.82, artificialGlow: 0.025, twilightChroma: 0.78 },
        atmospheres: ["mist", "haze", "soft"],
        seasonWeights: seasons(0.85, 1.15, 1.35, 1.0),
        regionWeights: { marine: 1.65, humid: 1.15 },
    },
    {
        id: "lavender-alpenglow",
        label: "Lavender Alpenglow",
        phaseIndices: phaseIndices([2, 2, 2, 2, 2, 4, 3, 3, 2, 2, 2, 2, 2]),
        grade: { hueShift: 4, chroma: 1.04, lightness: 0.004, hueJitter: 4, chromaJitter: 0.08, lightnessJitter: 0.018 },
        intensity: { contrast: 1.02, saturation: 1.08, edge: 1.12, glow: 1.08, haze: 0.92 },
        optics: { nightCharacter: "alpine", nightTint: "#211640", nightFloor: 0.105, horizonLift: 0.04, aerosol: 0.2, humidity: 0.25, artificialGlow: 0, twilightChroma: 1.05 },
        atmospheres: ["cirrus", "soft", "crystal"],
        seasonWeights: seasons(1.2, 1.05, 0.82, 1.2),
        regionWeights: { continental: 1.25, polar: 1.2, dry: 1.1 },
    },
    {
        id: "desert-apricot",
        label: "Desert Apricot",
        phaseIndices: phaseIndices([3, 3, 3, 3, 3, 5, 4, 4, 3, 3, 3, 3, 3]),
        grade: { hueShift: 5, chroma: 1.12, lightness: 0.006, hueJitter: 3, chromaJitter: 0.09, lightnessJitter: 0.016 },
        intensity: { contrast: 1.07, saturation: 1.12, edge: 1.14, glow: 1.16, haze: 0.82 },
        optics: { nightCharacter: "desert", nightTint: "#101f43", nightFloor: 0.09, horizonLift: 0.045, aerosol: 0.3, humidity: 0.08, artificialGlow: 0.008, twilightChroma: 1.08 },
        atmospheres: ["crystal", "cirrus", "soft"],
        seasonWeights: seasons(0.9, 1.05, 1.3, 1.35),
        regionWeights: { dry: 1.75, continental: 1.1 },
    },
    {
        id: "storm-slate",
        label: "Storm Slate",
        phaseIndices: phaseIndices([4, 5, 5, 5, 5, 6, 5, 5, 4, 4, 4, 4, 5]),
        grade: { hueShift: -2, chroma: 0.7, lightness: -0.018, hueJitter: 3, chromaJitter: 0.05, lightnessJitter: 0.012 },
        intensity: { contrast: 1.15, saturation: 0.82, edge: 0.72, glow: 0.78, haze: 1.2 },
        optics: { nightCharacter: "overcast", nightTint: "#151c27", nightFloor: 0.115, horizonLift: 0.025, aerosol: 0.68, humidity: 0.72, artificialGlow: 0.035, twilightChroma: 0.62 },
        atmospheres: ["soft", "mist", "haze"],
        seasonWeights: seasons(1.25, 1.2, 0.72, 1.25),
        regionWeights: { marine: 1.15, continental: 1.2, humid: 1.35 },
    },
    {
        id: "smoky-copper",
        label: "Smoky Copper",
        phaseIndices: phaseIndices([6, 6, 6, 6, 5, 7, 5, 5, 6, 6, 6, 6, 6]),
        grade: { hueShift: 7, chroma: 0.9, lightness: -0.005, hueJitter: 3, chromaJitter: 0.07, lightnessJitter: 0.015 },
        intensity: { contrast: 1.03, saturation: 1.02, edge: 1.05, glow: 1.18, haze: 1.22 },
        optics: { nightCharacter: "smoky", nightTint: "#261c24", nightFloor: 0.115, horizonLift: 0.08, aerosol: 0.9, humidity: 0.22, artificialGlow: 0.08, twilightChroma: 0.92 },
        atmospheres: ["haze", "soft", "cirrus"],
        seasonWeights: seasons(0.72, 0.85, 1.2, 1.65),
        regionWeights: { dry: 1.35, continental: 1.1, marine: 0.9 },
    },
    {
        id: "humid-aqua",
        label: "Humid Aqua",
        phaseIndices: phaseIndices([1, 6, 1, 7, 3, 3, 2, 2, 6, 1, 1, 6, 6]),
        grade: { hueShift: -7, chroma: 1.02, lightness: 0.012, hueJitter: 4, chromaJitter: 0.08, lightnessJitter: 0.016 },
        intensity: { contrast: 0.96, saturation: 1.06, edge: 1.0, glow: 1.08, haze: 1.18 },
        optics: { nightCharacter: "humid", nightTint: "#07313b", nightFloor: 0.125, horizonLift: 0.082, aerosol: 0.58, humidity: 0.94, artificialGlow: 0.035, twilightChroma: 0.88 },
        atmospheres: ["haze", "mist", "soft"],
        seasonWeights: seasons(0.72, 1.2, 1.55, 0.95),
        regionWeights: { tropical: 1.7, humid: 1.55, marine: 1.1 },
    },
    {
        id: "winter-ice",
        label: "Winter Ice",
        phaseIndices: phaseIndices([3, 4, 4, 4, 6, 2, 6, 6, 1, 4, 4, 4, 4]),
        grade: { hueShift: -5, chroma: 0.88, lightness: 0.02, hueJitter: 3, chromaJitter: 0.06, lightnessJitter: 0.014 },
        intensity: { contrast: 1.05, saturation: 0.94, edge: 0.92, glow: 1.0, haze: 0.88 },
        optics: { nightCharacter: "polar", nightTint: "#142743", nightFloor: 0.1, horizonLift: 0.035, aerosol: 0.14, humidity: 0.28, artificialGlow: 0, twilightChroma: 0.83 },
        atmospheres: ["crystal", "soft", "cirrus"],
        seasonWeights: seasons(1.8, 1.0, 0.48, 0.95),
        regionWeights: { polar: 1.7, continental: 1.2 },
    },
    {
        id: "rose-afterglow",
        label: "Rose Afterglow",
        phaseIndices: phaseIndices([5, 2, 2, 6, 4, 8, 3, 3, 5, 7, 7, 2, 7]),
        grade: { hueShift: 5, chroma: 1.1, lightness: 0.008, hueJitter: 4, chromaJitter: 0.1, lightnessJitter: 0.018 },
        intensity: { contrast: 1.03, saturation: 1.13, edge: 1.18, glow: 1.16, haze: 0.9 },
        optics: { nightCharacter: "airglow", nightTint: "#28152f", nightFloor: 0.1, horizonLift: 0.05, aerosol: 0.26, humidity: 0.3, artificialGlow: 0.008, twilightChroma: 1.08 },
        atmospheres: ["cirrus", "crystal", "soft"],
        seasonWeights: seasons(1.1, 1.25, 1.05, 1.3),
        regionWeights: { marine: 1.1, continental: 1.1, dry: 1.1 },
    },
    {
        id: "violet-nocturne",
        label: "Violet Nocturne",
        phaseIndices: phaseIndices([5, 7, 7, 2, 2, 8, 3, 3, 7, 5, 5, 7, 7]),
        grade: { hueShift: 7, chroma: 1.08, lightness: -0.006, hueJitter: 4, chromaJitter: 0.09, lightnessJitter: 0.014 },
        intensity: { contrast: 1.1, saturation: 1.12, edge: 1.16, glow: 1.02, haze: 0.76 },
        optics: { nightCharacter: "pristine", nightTint: "#17113b", nightFloor: 0.082, horizonLift: 0.026, aerosol: 0.1, humidity: 0.15, artificialGlow: 0, twilightChroma: 1.04 },
        atmospheres: ["crystal", "cirrus"],
        seasonWeights: seasons(1.15, 1.05, 0.92, 1.25),
        regionWeights: { continental: 1.15, polar: 1.1 },
    },
    {
        id: "sage-haze",
        label: "Sage Haze",
        phaseIndices: phaseIndices([6, 6, 6, 7, 3, 9, 7, 7, 6, 6, 6, 6, 6]),
        grade: { hueShift: -9, chroma: 0.82, lightness: 0.014, hueJitter: 3, chromaJitter: 0.06, lightnessJitter: 0.015 },
        intensity: { contrast: 0.94, saturation: 0.88, edge: 0.82, glow: 1.08, haze: 1.38 },
        optics: { nightCharacter: "marine", nightTint: "#16342f", nightFloor: 0.13, horizonLift: 0.09, aerosol: 0.7, humidity: 0.88, artificialGlow: 0.04, twilightChroma: 0.68 },
        atmospheres: ["haze", "mist", "soft"],
        seasonWeights: seasons(0.82, 1.4, 1.2, 1.05),
        regionWeights: { marine: 1.35, humid: 1.2, tropical: 1.1 },
    },
    {
        id: "cobalt-gold",
        label: "Cobalt Gold",
        phaseIndices: phaseIndices([7, 0, 4, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0]),
        grade: { hueShift: -1, chroma: 1.16, lightness: -0.004, hueJitter: 3, chromaJitter: 0.08, lightnessJitter: 0.016 },
        intensity: { contrast: 1.14, saturation: 1.16, edge: 1.12, glow: 1.14, haze: 0.7 },
        optics: { nightCharacter: "desert", nightTint: "#071a44", nightFloor: 0.075, horizonLift: 0.022, aerosol: 0.12, humidity: 0.08, artificialGlow: 0, twilightChroma: 1.08 },
        atmospheres: ["crystal", "cirrus"],
        seasonWeights: seasons(1.0, 1.15, 1.45, 1.15),
        regionWeights: { dry: 1.35, continental: 1.15, tropical: 1.05 },
    },
];
