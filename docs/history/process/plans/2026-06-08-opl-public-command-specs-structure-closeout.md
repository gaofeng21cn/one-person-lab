# OPL Public Command Specs Structure Closeout

Owner: `One Person Lab`
Purpose: `public_command_specs_structure_closeout`
State: `history_provenance`
Machine boundary: 本文只记录本轮 source-structure / docs-governance tranche closeout。当前命令面 truth 继续归 `src/cli/cases/public-command-specs.ts`、`src/cli/cases/public-command-specs-parts/**`、`src/cli/modules/help-output.ts`、contracts、CLI 行为和 tests；当前 OPL active truth 继续归 `docs/active/current-state-vs-ideal-gap.md`。

## Semantic Theme

本轮治理主题是 OPL public CLI command-spec 聚合桶的结构收薄。SSOT 不是某份文档，而是 live command-spec source 和 CLI/help tests：

- `buildPublicCommandSpecs` 仍是 public command registry composer。
- Brand / Foundry / Connect / Workspace / Stages 命令分组改由 `src/cli/cases/public-command-specs-parts/` 下的 group builder 持有。
- 命令 id、usage、summary、examples、group、help surface 和 handler 语义保持不变。

这不是 public surface rename、runtime truth 变更、domain owner route 变更或 compatibility lane。

## Edited

- `src/cli/cases/public-command-specs.ts`
- `src/cli/cases/public-command-specs-parts/brand.ts`
- `src/cli/cases/public-command-specs-parts/connect.ts`
- `src/cli/cases/public-command-specs-parts/foundry.ts`
- `src/cli/cases/public-command-specs-parts/shared.ts`
- `src/cli/cases/public-command-specs-parts/stages.ts`
- `src/cli/cases/public-command-specs-parts/workspace.ts`
- `docs/history/process/plans/README.md`
- this closeout

## Result

- `src/cli/cases/public-command-specs.ts` dropped from `1450` lines to `730` lines.
- The new part files are all below the ordinary source line budget: largest is `workspace.ts` at `249` lines.
- Fresh family structure advisory for `one-person-lab` no longer lists `src/cli/cases/public-command-specs.ts` under `needs_design_pass`; OPL main `needs_design_pass` count moved from `16` to `15`.

## Remaining Scope

The remaining OPL source-structure advisory items are outside this tranche. Current first items after this split include `src/contracts.ts`, `src/workspace-diagnostics.ts`, `tests/src/cli/cases/workspace-domain.initializer.test.ts`, `src/domain-pack-compiler/generated-interface-read-model.ts`, and `tests/src/verification-command-surfaces.test.ts`.

Do not treat line-budget advisory output as domain ready, production ready, App release ready, owner receipt, or physical delete authority. Future split lanes should choose one semantic owner at a time, preserve command/contract behavior, and record process proof in history rather than active docs.

## Verification

Fresh verification on `2026-06-08`:

- `rtk npm run typecheck`: pass.
- `rtk node --test tests/src/cli/cases/system-commands.test.ts tests/src/cli/cases/brand-modules.test.ts tests/src/cli/cases/framework-locator.test.ts tests/src/cli/cases/contracts-help.test.ts`: pass, `78/78`.
- `rtk npm run line-budget`: advisory exit `0`; still reports `15` unrelated historical over-budget files and no longer reports `src/cli/cases/public-command-specs.ts`.
- `rtk npm run --silent family:structure-advisory -- --format=json`: OPL `categories.needs_design_pass` count is `15`, `src/cli/cases/public-command-specs.ts` is absent, first remaining items are the files listed above.
- `rtk opl-doc-doctor doctor . --format json`: pass with `finding_count=0` and `active_truth_health.status=pass`.
- `rtk git diff --check`: pass.
- `rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" src/cli/cases docs/history/process/plans`: no conflict markers.
