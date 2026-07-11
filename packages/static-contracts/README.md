# OPL Framework Static Contracts

This package is the lightweight carrier for Foundry Agent consumers that only
need OPL contract validation, standard Agent Pack ABI, reference-design/build
proof, canonical Foundry series policy, or action-stage readback. Its only
runtime dependency is `ajv`.

Use the existing `opl-framework-shared` package when the `opl` CLI, Temporal
provider runtime, E2B adapter, or other complete Framework surfaces are needed.

OMA can switch its dependency and import prefix without changing subpath names:

```json
{
  "dependencies": {
    "opl-framework-static-contracts": "<published version or packed tarball>"
  }
}
```

```ts
import { STANDARD_AGENT_PACK_ABI } from 'opl-framework-static-contracts/standard-agent-pack-abi';
```
