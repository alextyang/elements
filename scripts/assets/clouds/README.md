# Authored Cumulus density sources

These fields are deterministic conversions of CGHEVEN's CC0 Hero Cumulus and
Congestus VDBs. They supply the physical condensate morphology; lighting,
extinction, phase, atmospheric coupling, and temporal reconstruction remain
native to Elements.

- Sources:
  - https://cgheven.com/assets/hero-cumulus-cloud-vdb-06
  - https://cgheven.com/assets/hero-cumulus-cloud-vdb-15
  - https://cgheven.com/assets/hero-cumulus-cloud-vdb-26
  - https://cgheven.com/assets/hero-congestus-cloud-vdb-21
  - https://cgheven.com/assets/hero-congestus-cloud-vdb-23
  - https://cgheven.com/assets/hero-congestus-cloud-vdb-25
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Conversion: OpenVDB 13 `density` grid, trilinear box sampling, each active
  axis fitted inside a four-voxel-guarded 96³ domain, clamp to [0, 1], encode
  R8 with `scripts/tools/vdb-density-to-r8.cpp`.
- No percentile scaling, gain, gamma, cleanup, component removal, or
  morphological filtering was applied.

| File | SHA-256 |
| --- | --- |
| `cgheven-cumulus-06-r8-96.bin` | `7d8636dcb9d507d6a2aa480e54fa22e2ec6d2cfef426a33c976278b436f6b206` |
| `cgheven-cumulus-15-r8-96.bin` | `57bacec6dfbfaf9ae4f6e1bc348f2265f0ebe74a3cd6cf8ee95d7ba29d8a9c59` |
| `cgheven-cumulus-26-r8-96.bin` | `7e0ac6ff3bcffc470955d593e060f3c3ad667ee646390bb89e6e0916f74c9419` |
| `cgheven-congestus-21-r8-96.bin` | `b89d346890eea3c1cacfac565838da92984714ff27882fa1e31df1780102f9c0` |
| `cgheven-congestus-23-r8-96.bin` | `91761befd7cdd765f2240a9dbf1ae0412f45e1d343657010f8309152c7ff90e8` |
| `cgheven-congestus-25-r8-96.bin` | `acd587983dc3b558ba175fa1149bfab78289bd3d270873a070f0e595a54f8863` |

The upstream pack and the individual asset pages identify these VDBs as CC0.
