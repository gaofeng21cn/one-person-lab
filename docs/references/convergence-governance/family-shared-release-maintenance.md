# Family Shared Release Maintenance

Owner: `One Person Lab`
Purpose: `references_convergence_governance_family_shared_release_maintenance`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

这份文档定义 `OPL` 作为 family shared modules owner 时的维护动作。这里维护的是 shared module owner commit、repo-tracked contract、consumer pins 与 drift attention；`MAS`、`MAG`、`RCA` 继续各自维护 domain release truth。

2026-05-26 读法：本文的 `Current Contract And Live Alignment` 是 owner-pin / drift-attention reference，不是当前 App release、domain production release 或 family production-ready claim。shared release alignment 只证明 shared helper / contract / consumer pin 一致；它不授权 MAS/MAG/RCA/OMA domain ready、quality/export verdict、artifact authority、owner-chain closeout、App release-ready 或 production-ready。

## Scope

- owner contract：`contracts/family-release/shared-owner-release.json`
- Python shared package：`opl-harness-shared`
- JS shared package：`opl-framework-shared`
- evidence tests：`tests/src/family-shared-release-discipline.test.ts`

## Current Contract And Live Alignment

- current owner commit：`c5d4a93bd4bb64adf1228ecf7f2a9038c7dce278`
- contract owner commit reachable from current OPL main：yes
- live check command：`npm run family:shared-release -- check`
- current live alignment at 2026-05-26 CST：`med-autogrant` and `redcube-ai` aligned；`med-autoscience` still pins `e3fd0b6be41e858958d42ea400a3e63c4205ff8a` in `pyproject.toml` and `uv.lock`
- current state：`drift_attention`
- last full closeout baseline：`2026-05-21`
- scope：family shared modules / contracts / indexes / product-entry lifecycle adapter primitive only；domain truth remains in MAS、MAG、RCA

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
- `OPL` 维护的是 boundary helper 与 release discipline；domain truth、domain route semantics、authority function、quality gate、artifact authority 和 domain release record 继续留在各自 repo。

## Invariants

- `shared module owner commit` 只记录 family shared modules 的 owner release pin。
- `OPL` 继续维护 shared helper、contract 与 alignment proof。
- domain authority、domain deliverable 与 domain release record 继续留在各 domain repo。

## Closeout Evidence

- contract 已更新到新的 owner commit，且 owner commit 对 package locator remote 可达。
- `npm run family:shared-release -- check` 返回所有 consumers aligned；若某 consumer stale，本文件只能记录 drift attention，不能写成 closeout。
- OPL family lane 通过。
- consumer family lane 通过。
