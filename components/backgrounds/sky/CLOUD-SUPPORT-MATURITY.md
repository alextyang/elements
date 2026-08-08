# Cloud support maturity

The cloud renderer tracks support as cumulative evidence rather than a binary
implemented flag. A cloud route may have transport pixels today while still
lacking causal evolution, independent-view photographic review, motion review,
or device qualification.

The machine-readable manifest is generated at module load from the existing
photographic and weather qualification matrices:

- 32 canonical base identities;
- 28 orthogonal morphology identities;
- 216 complete-weather identities;
- 276 total support routes across all ten WMO genera.

The read-only endpoint is `/api/cloud-support/manifest`. The endpoint includes
validation issues so dashboards can reject a drifted matrix instead of silently
publishing incomplete coverage.

## Maturity levels

| Level | State | Required evidence |
| ---: | --- | --- |
| 0 | Declared | The route exists in the taxonomy or qualification catalog. |
| 1 | Compiled | It compiles into a valid cloud-system representation. |
| 2 | Runtime active | Its distinct state reaches the production runtime. |
| 3 | Transport active | Its geometry, material, or weather state affects pixels. |
| 4 | Dynamically active | It evolves through a causal persistent lifecycle. |
| 5 | Strict ready | Current finite transport, lighting, and reconstruction gates pass. |
| 6 | Photograph qualified | Independent views pass photographic invariants. |
| 7 | Time qualified | Motion and lifecycle sequences pass review. |
| 8 | Device qualified | The declared performance and reliability matrix passes. |

Evidence is cumulative. Later observations are retained as `blockedEvidence`
when an earlier gate is missing, but they cannot raise the maturity claim. For
example, a reviewed still cannot skip causal lifecycle evidence and become
Level 6 by itself.

Level 6 is the minimum for a public support claim. Level 8 is required for a
release-qualified route. Until then, `sourceStatus` records the narrower source
matrix fact—packed, operator active, transport attached, or photographically
qualified—without overstating end-to-end maturity.

## Validation

Run the focused contract test:

```sh
node --test scripts/test-cloud-support-manifest.mjs
```

The test checks route identity, matrix cardinality, genus coverage,
qualification dimensions, cumulative maturity behavior, and the read-only API
contract. The repository-wide `npm test` command includes it automatically.
