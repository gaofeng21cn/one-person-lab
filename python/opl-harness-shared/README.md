# opl-harness-shared

Owner: `one-person-lab`
Purpose: `python_shared_harness_substrate_readme`
State: `active_package_support`
Machine boundary: Human-readable package index. Machine truth lives in `pyproject.toml`, `src/opl_harness_shared/`, bundled contracts, root `contracts/`, package tests, and family shared-release contracts.

`one-person-lab` 持有的 family-level Python 共享基座。

当前导出的共享实现：

- `opl_harness_shared.automation_companions`
- `opl_harness_shared.editable_dependency_bootstrap`
- `opl_harness_shared.editable_consumer_bootstrap`
- `opl_harness_shared.editable_consumer_launcher`
- `opl_harness_shared.family_action_catalog`
- `opl_harness_shared.family_entry_contracts`
- `opl_harness_shared.family_orchestration`
- `opl_harness_shared.family_product_entry_preset`
- `opl_harness_shared.family_shared_release`
- `opl_harness_shared.managed_runtime`
- `opl_harness_shared.hermes_supervision`
- `opl_harness_shared.product_entry_companions`
- `opl_harness_shared.product_entry_program_companions`
- `opl_harness_shared.runtime_task_companions`
- `opl_harness_shared.skill_catalog`
- `opl_harness_shared.status_narration`
- `opl_harness_shared.workspace_boundary`

设计边界：

- 只承载跨 domain 复用的 substrate/helper。
- 不承载医学、grant、visual deliverable 等 domain-specific 治理语义。
- root `contracts/opl-framework/managed-runtime-three-layer-contract.json` 仍是 machine-readable truth；本子包内的同名 JSON 是为了 pip subdirectory 安装时的 runtime access，并由测试强制与 root contract 保持同步。
- consumer 依赖 pin、release SHA 和跨仓消费状态由 `contracts/family-release/shared-owner-release.json`、`src/family-shared-release.ts`、`python/opl-harness-shared/src/opl_harness_shared/family_shared_release.py` 与对应 tests 管理，不由本文宣告。
