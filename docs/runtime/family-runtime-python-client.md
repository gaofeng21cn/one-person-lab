# Family Runtime Python Client

owner: `one-person-lab / OPL Runway`

purpose: 为 Python domain consumer 提供统一的 Temporal stage-attempt submit/query transport，避免 MAS、MAG、RCA 或新 Agent 各自实现 OPL CLI 查找、子进程超时和 JSON envelope 解析。

state: `active_contract`

machine boundary: `python/opl_framework/family_runtime_client.py`

## 稳定 API

- `submit_stage_attempt_request(request, opl_bin=None, timeout_seconds=120, runner=None)`：请求必须包含 `domain_id`、`stage_id`、非空 `workspace_locator`、`require_stage_admission=true` 和 `start=true`；可带 `action_id`、`source_fingerprint`。client 固定走 Temporal provider，返回经过 shape 校验的 `family_runtime_stage_attempt` canonical surface。
- `query_family_runtime_readback(query, opl_bin=None, timeout_seconds=8, runner=None)`：`operation=query` 时要求 `stage_attempt_id`；`operation=list` 时可带 `domain_id`、`status`、`study_id`。返回 `family_runtime_stage_attempt_query` 或 `family_runtime_stage_attempts` canonical surface；底层 runner 明确返回空时返回 `None`。
- `runner` 只用于测试或显式 carrier 注入，调用合同为 `runner(command: list[str], timeout_seconds=<float>) -> mapping | None`。默认 runner 负责独立 process group、timeout kill、exit code 和 JSON object 校验。

client 不解释医学、资助或视觉领域 truth，不签 owner receipt，不把 provider completion 写成 domain completion。domain consumer 仍负责形成 stage request 的语义字段，并消费 canonical family-runtime readback。
