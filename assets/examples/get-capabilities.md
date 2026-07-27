# get_capabilities

`get_capabilities` returns `projectIdResolution` and `projectConfig` from the same snapshot.

`projectIdResolution` is derived from the resolved `projectConfig` when that diagnosis is available:

- `projectConfig.status: "valid"` and `writeReady: true` produce `outcome: "resolved"` and the same non-null `projectId`.
- `projectConfig.status: "ambiguous"` produces `outcome: "ambiguous"` with a null resolution project ID.
- Other non-valid statuses produce `outcome: "unresolved"` with a null resolution project ID.

Consumers can therefore use `projectIdResolution.outcome === "resolved"` as the single project-identity gate before a dysflow call, and use `projectConfig` for detailed diagnostics and target paths. The two fields must never be interpreted as independent project resolvers.
