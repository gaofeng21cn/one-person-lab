# Family Shared Release Maintenance

这份文档定义 `OPL` 作为 family shared modules owner 时的维护动作。这里维护的是 shared module owner commit、repo-tracked contract 与 consumer pins；`MAS`、`MAG`、`RCA` 继续各自维护 domain release truth。

## Scope

- owner contract：`contracts/family-release/shared-owner-release.json`
- Python shared package：`opl-harness-shared`
- JS shared package：`opl-gateway-shared`
- evidence tests：`tests/src/family-shared-release-discipline.test.ts`

## Maintainer Flow

1. 在 owner repo 完成 shared module 变更，并先跑本仓验证：
   - `npm run test:meta`
   - `scripts/verify.sh family`
2. 确认新的 shared module owner commit：
   - `git rev-parse HEAD`
3. 确认这笔 owner commit 已经对 package locator 指向的 remote 可达：
   - 先把 owner repo push 到承载 shared package locator 的 remote
   - `release` 会 fail-closed 拒绝 unpublished owner commit
4. 用 owner repo 改写 contract 并同步 consumers pins：
   - `npm run family:shared-release -- release --owner-commit <40-hex-sha>`
5. 重新核对 alignment：
   - `npm run family:shared-release -- check`
6. 在 consumers 仓补跑各自 family lane：
   - `med-autoscience/scripts/verify.sh family`
   - `med-autogrant/scripts/verify.sh family`
   - `redcube-ai test:family lane`

## Boundary Discipline

- shared release 只维护 shared package owner commit、owner contract 与 consumer pins。
- shared release 不改写各 domain repo 自己的 `entry_adapter`、`shared_downstream_entry`、`family_orchestration.action_graph.target_domain_id` 或 `resume_contract.session_locator_field`。
- `OPL` 维护的是 boundary helper 与 release discipline；domain truth、domain route semantics、domain runtime owner truth 继续留在各自 repo。

## Invariants

- `shared module owner commit` 只记录 family shared modules 的 owner release pin。
- `OPL` 继续维护 shared helper、contract 与 alignment proof。
- domain runtime、domain deliverable 与 domain release record 继续留在各 domain repo。

## Closeout Evidence

- contract 已更新到新的 owner commit
- `npm run family:shared-release -- check` 返回 aligned
- OPL family lane 通过
- consumer family lane 通过
