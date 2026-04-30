# Family Incident Learning Loop

## Purpose

`OPL` family 的长期自治能力必须从真实失败中变强。incident 不能只留在聊天、日志、terminal prose 或个人记忆里；每个可复现或可分类失败都必须回流成 repo-tracked guard、test、contract、runbook、taxonomy update 或 operator projection。

## Owner Split

- `OPL` owns：family incident taxonomy、cross-domain pattern、operator projection、shared guard/test/contract 入口。
- domain repo owns：domain-specific incident detail、domain repair route、domain quality reopening、domain runtime closure。
- `OPL Runtime Manager` can surface incident status, but it does not decide domain repair success。

## Incident Taxonomy

OPL family incident 至少覆盖：

- `stalled_run`：长跑任务无进展或 retry 队列不再推进。
- `status_drift`：operator projection 与 domain-owned truth 不一致。
- `missing_projection`：domain repo 缺少 OPL 可读 source refs。
- `quality_reopen`：已完成 work 被 domain quality gate 重新打开。
- `install_sync_drift`：module install、skill sync、shared release pin 或 package source 漂移。
- `runtime_owner_mismatch`：OPL、Hermes-Agent、Codex CLI 或 domain repo 的 owner 表述冲突。
- `artifact_proof_missing`：交付物缺少 domain-owned proof / eval / export pointer。
- `human_gate_blocked`：人工 gate 阻塞且缺少明确 next surface。

## Required Follow-Up Asset

每个 incident record 必须至少落到一种 durable follow-up：

- `guard`：新增或收紧 fail-closed 检查。
- `test`：新增或收紧 meta / runtime / contract test。
- `contract`：更新 machine-readable 或 repo-tracked contract。
- `runbook`：补明确 operator repair / resume 步骤。
- `taxonomy_update`：扩展 incident taxonomy 或 stop rule。
- `operator_projection`：让用户可见下一步、source refs、freshness 或 human gate。

## Record Minimum

incident record 至少包含：

- `incident_id`
- `domain_id`
- `incident_kind`
- `detected_at`
- `source_refs`
- `owner_repo`
- `impact`
- `follow_up_asset`
- `closure_ref`

## Stop Rules

- 没有 `source_refs` 的 incident 不能关闭。
- 只有聊天总结、memory 或 terminal prose 的 incident 不能关闭。
- 没有 follow-up asset 的 incident 不能关闭。
- domain-specific failure 不能由 `OPL` 单独宣布修复；必须回到 domain-owned closure ref。

## Product Projection

OPL 可以把 incident 聚合到 operator view，但必须保留 domain source refs、freshness、owner split 和 next gate。投影的目标是可监督、可接手、可追溯，不是替代 domain runtime 或 quality authority。

