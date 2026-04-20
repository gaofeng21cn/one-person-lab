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
3. 用 owner repo 改写 contract 并同步 consumers pins：
   - `npm run family:shared-release -- release --owner-commit <40-hex-sha>`
4. 重新核对 alignment：
   - `npm run family:shared-release -- check`
5. 在 consumers 仓补跑各自 family lane：
   - `med-autoscience/scripts/verify.sh family`
   - `med-autogrant/scripts/verify.sh family`
   - `redcube-ai test:family lane`

## Invariants

- `shared module owner commit` 只记录 family shared modules 的 owner release pin。
- `OPL` 继续维护 shared helper、contract 与 alignment proof。
- domain runtime、domain deliverable 与 domain release record 继续留在各 domain repo。

## Closeout Evidence

- contract 已更新到新的 owner commit
- `npm run family:shared-release -- check` 返回 aligned
- OPL family lane 通过
- consumer family lane 通过
