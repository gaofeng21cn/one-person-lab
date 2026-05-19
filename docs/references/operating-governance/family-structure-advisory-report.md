# OPL Family Structure Advisory Report

Owner: `One Person Lab`
Purpose: `references_operating_governance_family_structure_advisory_report`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

owner: OPL shared governance  
purpose: advisory structure scan across OPL-family tracked files  
state: current advisory report, not a fail-closed gate  
machine boundary: generated from `npm run --silent family:structure-advisory -- --format=markdown`

## Scope

This report covers tracked files in:

- `one-person-lab`
- `med-autogrant`
- `med-deepscientist`
- `opl-aion-shell`

It intentionally does not scan MAS or RCA. The guard is advisory: it identifies structural pressure, mechanical split residue, nested parts, large shared buckets, public machine-readable surfaces, and near-1000-line part files. It does not force semantic holdouts through mechanical splitting.

## Current Readout

### one-person-lab

safe_to_keep:

- `src/product-entry-parts/*` remains a semantic split below the advisory part budget.
- `tests/src/cli/helpers-parts/*` remains a semantic test helper split below the advisory part budget.
- Small shared surfaces such as `src/management/shared.ts`, `src/system-installation/shared.ts`, and `src/opl-runtime-paths/shared.ts` stay reviewable.

needs_design_pass:

- none from the current advisory scan.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- `contracts/family-orchestration/family-product-entry-manifest-v2.schema.json`
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`

These are the current large machine-readable public surfaces in the advisory scan. They are not immediate split targets, but future edits should prefer schema modularity or generated/source separation over growing them further.

### med-autogrant

safe_to_keep:

- Most `product_entry_parts`, `hermes_runtime_parts`, `cli_parts`, and focused `*_parts.py` files remain semantic and below the advisory part budget.
- Examples include `product_entry_parts/loop_contracts.py`, `hermes_runtime_parts/io.py`, `product_entry_parts/runtime_surfaces.py`, and `hermes_runtime_parts/substrate.py`.

needs_design_pass:

- `src/med_autogrant/product_entry_parts/manifest_builder.py`
- `src/med_autogrant/grant_autonomy_parts.py`

Both are near the 1000-line part-file boundary. The correct next action is a design pass around natural ownership, not a numeric split.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- `schemas/v1/product-entry-manifest.schema.json`
- `schemas/v1/common.schema.json`

These are large schema surfaces. Treat growth here as public contract risk.

### med-deepscientist

safe_to_keep:

- Generated or vendored UI sources under `src/ui/public/monaco/**` and `src/ui/vendor/**` are classified separately from design debt.
- `src/deepscientist/artifact/service_parts/*` is a semantic split under the advisory part budget.
- Small shared UI/runtime surfaces remain safe to keep.

needs_design_pass:

- Large repo-owned implementation files dominate the signal, including:
  - `src/deepscientist/artifact/service.py`
  - `src/deepscientist/quest/service.py`
  - `src/deepscientist/daemon/app.py`
  - `src/ui/src/lib/plugins/ai-manus/AiManusChatView.tsx`
  - `src/ui/src/lib/plugins/lab/components/LabQuestGraphCanvas.tsx`
  - `src/ui/src/lib/api/lab.ts`
  - `src/ui/src/components/workspace/QuestWorkspaceSurface.tsx`
  - large test files such as `tests/test_memory_and_artifact.py` and `tests/test_daemon_api.py`

This repo needs a separate design pass. The current lane is read-only for MDS.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- none from the current advisory scan.

### opl-aion-shell

safe_to_keep:

- Generated declaration files such as `src/renderer/services/i18n/i18n-keys.d.ts` are not design-debt targets.

needs_design_pass:

- Large repo-owned implementation files include:
  - `src/process/agent/acp/index.ts`
  - `src/process/services/database/index.ts`
  - `src/process/bridge/fsBridge.ts`
  - `src/renderer/components/chat/sendbox.tsx`
  - `src/process/task/AcpAgentManager.ts`
  - `src/common/adapter/ipcBridge.ts`
  - `src/process/bridge/modelBridge.ts`

This repo has no `scripts/verify.sh`, so this lane only records read-only advisory findings for it.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- none from the current advisory scan.

## Operating Rule

Use `npm run --silent family:structure-advisory -- --format=markdown` from OPL to refresh the report. Treat `needs_design_pass` and `public_surface_risk` as review queue inputs. Treat `mechanical_residue` as cleanup candidates only after reading the owning code path and confirming the split is mechanical rather than a valid domain term.
