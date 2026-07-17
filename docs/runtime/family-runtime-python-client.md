# Family Runtime Python Client

Owner: `one-person-lab / OPL Runway`
Purpose: `family_runtime_python_client_support`
State: `active_contract_support`
Machine boundary: 本文是 Python consumer 的人读 API 说明。机器真相归 `python/opl_framework/family_runtime_client.py` 及其 tests；本文不持有 domain truth、owner receipt 或 provider/domain readiness。

## 稳定 API

- `submit_stage_attempt_request(request, opl_bin=None, timeout_seconds=120, runner=None)`：请求必须包含 `domain_id`、`stage_id`、非空 `workspace_locator` 和 `start=true`；可带 `action_id`、`source_fingerprint`。client 固定走 Temporal transport，Stage 语义由 Codex CLI 判断，不经过 admission control plane。
- `query_family_runtime_readback(query, opl_bin=None, timeout_seconds=8, runner=None)`：`operation=query` 时要求 `stage_attempt_id`；`operation=list` 时可带 `domain_id`、`status`、`study_id`。返回 `family_runtime_stage_attempt_query` 或 `family_runtime_stage_attempts` canonical surface；底层 runner 明确返回空时返回 `None`。
- `runner` 只用于测试或显式 carrier 注入，调用合同为 `runner(command: list[str], timeout_seconds=<float>) -> mapping | None`。默认 runner 负责独立 process group、timeout kill、exit code 和 JSON object 校验。

client 不解释医学、资助或视觉领域 truth，不签 owner receipt，不把 provider completion 写成 domain completion。domain consumer 仍负责形成 stage request 的语义字段，并消费 canonical family-runtime readback。
