# Authored cumulus density sources

These 96³ R8 density fields are deterministic, normalized conversions of
CGHEVEN's Congestus Cloud VDB 21, 23, and 25. They are used as volumetric
formation sources; lighting, extinction, phase, atmospheric coupling, and
temporal reconstruction remain native to Elements.

- Sources:
  - https://cgheven.com/assets/hero-congestus-cloud-vdb-21
  - https://cgheven.com/assets/hero-congestus-cloud-vdb-23
  - https://cgheven.com/assets/hero-congestus-cloud-vdb-25
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Conversion: OpenVDB 13 `density` grid, trilinear box sampling, each active
  axis fitted inside a guarded 96³ domain, clamp to [0, 1], encode R8.
- No percentile scaling, gain, gamma, cleanup, component removal, or
  morphological filtering was applied.

| File | SHA-256 |
| --- | --- |
| `cgheven-congestus-21-r8-96.bin` | `b89d346890eea3c1cacfac565838da92984714ff27882fa1e31df1780102f9c0` |
| `cgheven-congestus-23-r8-96.bin` | `91761befd7cdd765f2240a9dbf1ae0412f45e1d343657010f8309152c7ff90e8` |
| `cgheven-congestus-25-r8-96.bin` | `acd587983dc3b558ba175fa1149bfab78289bd3d270873a070f0e595a54f8863` |

The upstream pack and the individual asset pages identify these VDBs as CC0.
