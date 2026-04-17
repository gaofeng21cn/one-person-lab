# opl-harness-shared

`one-person-lab` 持有的 family-level Python 共享基座。

当前导出的共享实现：

- `opl_harness_shared.managed_runtime`
- `opl_harness_shared.hermes_supervision`

设计边界：

- 只承载跨 domain 复用的 substrate/helper。
- 不承载医学、grant、visual deliverable 等 domain-specific 治理语义。
- root `contracts/opl-gateway/managed-runtime-three-layer-contract.json` 仍是 machine-readable truth；本子包内的同名 JSON 是为了 pip subdirectory 安装时的 runtime access，并由测试强制与 root contract 保持同步。
