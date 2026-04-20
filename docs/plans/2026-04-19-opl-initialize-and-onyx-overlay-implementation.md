# OPL Initialize And Onyx Overlay Implementation Plan

> Superseded by [`docs/plans/2026-04-20-opl-product-api-reset-implementation.md`](./2026-04-20-opl-product-api-reset-implementation.md) and the current product boundary in [`docs/specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md`](../specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md). Keep this file only for archive and migration review.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the OPL-side initialize/environment management action surfaces and start the independent `opl-onyx-shell` GUI overlay on top of Onyx with an OPL-shaped workbench and settings entry.

**Architecture:** Keep `one-person-lab` headless and contract-first. Add `Initialize OPL`, engine/system/workspace actions, and adapter endpoints in the OPL repo. In parallel, bootstrap an independent `opl-onyx-shell` repo from Onyx and wire its first screen and settings skeleton to OPL adapter surfaces instead of inventing a repo-local GUI in the OPL main repo.

**Tech Stack:** TypeScript CLI + Node test runner in `one-person-lab`; Next.js 16 + React 19 + Opal + Tauri in `opl-onyx-shell`.

---

## File Structure

### OPL Main Repo

- Modify: `src/frontdesk-installation.ts`
  - Extend environment/action surfaces for initialize, core engines, and system maintenance.
- Modify: `src/cli.ts`
  - Add grouped CLI entry points for initialize, engine actions, workspace root/system maintenance.
- Modify: `src/web-frontdesk.ts`
  - Add matching API endpoints for GUI consumption.
- Modify: `src/frontdesk-state.ts`
  - Persist any new initialize/workspace-root state if needed.
- Modify: `src/workspace-registry.ts`
  - Add explicit workspace root read/write helpers if current registry logic is too project-oriented.
- Modify: `tests/src/cli.test.ts`
  - Add red-green coverage for new CLI commands and web adapter endpoints.
- Modify: `tests/src/verification-command-surfaces.test.ts`
  - Freeze help/verification discovery for the new grouped commands.
- Modify: `docs/references/opl-frontdesk-delivery-board.md`
  - Keep the delivery board aligned with landed surfaces.
- Create: `docs/specs/2026-04-19-opl-initialize-and-environment-manager-design.md`
  - Already drafted in this branch; keep it as the anchor spec.

### opl-onyx-shell Repo

- Modify: `web/src/app/craft/v1/layout.tsx`
  - Repoint the left/middle/right workbench skeleton to OPL semantics.
- Modify: `web/src/app/craft/v1/page.tsx`
  - Switch center/right panels to OPL-oriented chat/progress/files orchestration.
- Modify: `web/src/app/craft/components/SideBar.tsx`
  - Use OPL workspace/task language and session list behavior.
- Modify: `web/src/app/craft/components/ChatPanel.tsx`
  - Consume OPL ask/progress surfaces instead of Onyx build semantics.
- Modify: `web/src/app/craft/components/OutputPanel.tsx`
  - Render OPL progress/files panels.
- Create or modify: `web/src/app/app/settings/...`
  - Add an OPL `Environment / Modules` route using Onyx settings layouts.
- Modify: `desktop/src-tauri/tauri.conf.json`
  - Point the desktop wrapper at the OPL overlay URL/app identity when desktop packaging is ready.
- Modify: `desktop/README.md`
  - Reframe desktop packaging around OPL instead of Onyx Cloud defaults.

## Task 1: Freeze OPL Action Surface Scope

**Files:**
- Modify: `docs/specs/2026-04-19-opl-initialize-and-environment-manager-design.md`
- Modify: `docs/references/opl-frontdesk-delivery-board.md`
- Create: `docs/plans/2026-04-19-opl-initialize-and-onyx-overlay-implementation.md`

- [ ] **Step 1: Verify spec anchor is present in the branch**

Run: `test -f docs/specs/2026-04-19-opl-initialize-and-environment-manager-design.md`
Expected: exit `0`

- [ ] **Step 2: Confirm the delivery board references the initialize/environment spec**

Run: `rg -n "opl-initialize-and-environment-manager-design" docs/references/opl-frontdesk-delivery-board.md`
Expected: one matching line pointing at the spec path

- [ ] **Step 3: Keep this implementation plan in repo-tracked docs**

Run: `test -f docs/plans/2026-04-19-opl-initialize-and-onyx-overlay-implementation.md`
Expected: exit `0`

- [ ] **Step 4: Commit the planning/doc anchor once the branch stabilizes**

```bash
git add docs/specs/2026-04-19-opl-initialize-and-environment-manager-design.md \
        docs/references/opl-frontdesk-delivery-board.md \
        docs/plans/2026-04-19-opl-initialize-and-onyx-overlay-implementation.md
git commit -m "docs: freeze opl initialize and overlay plan"
```

## Task 2: Add Failing Coverage for New OPL CLI / API Surfaces

**Files:**
- Modify: `tests/src/cli.test.ts`
- Modify: `tests/src/verification-command-surfaces.test.ts`

- [ ] **Step 1: Write failing CLI discovery tests for initialize and engine/system commands**

Add tests that expect these commands to exist in help output and machine-readable usage:

```ts
test("help advertises initialize and engine management surfaces", async () => {
  const result = await runCli(["help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('"frontdesk initialize"');
  expect(result.stdout).toContain('"frontdesk engine install"');
  expect(result.stdout).toContain('"workspace root"');
  expect(result.stdout).toContain('"frontdesk repair"');
});
```

- [ ] **Step 2: Write failing behavior tests for `frontdesk initialize`**

Add assertions that the initialize surface returns:

```ts
expect(payload.frontdesk_initialize.overall_state).toBeDefined();
expect(payload.frontdesk_initialize.core_engines.codex).toBeDefined();
expect(payload.frontdesk_initialize.domain_modules.modules.length).toBeGreaterThan(0);
expect(payload.frontdesk_initialize.workspace_root).toBeDefined();
expect(payload.frontdesk_initialize.recommended_next_action).toBeTruthy();
```

- [ ] **Step 3: Write failing behavior tests for engine actions and workspace root**

Add tests that cover dry, local actions without mutating global machine state:

```ts
expect(payload.frontdesk_engine_action.engine_id).toBe("hermes");
expect(payload.frontdesk_engine_action.action).toBe("install");
expect(payload.workspace_root.path).toContain("workspace");
```

Use temp directories and env overrides where needed so tests stay hermetic.

- [ ] **Step 4: Run focused test slice and confirm RED**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts tests/src/verification-command-surfaces.test.ts`
Expected: FAIL with missing commands / missing fields for the new surfaces

## Task 3: Implement Initialize, Engine, Workspace Root, and System Surfaces in OPL

**Files:**
- Modify: `src/frontdesk-installation.ts`
- Modify: `src/frontdesk-state.ts`
- Modify: `src/workspace-registry.ts`
- Modify: `src/cli.ts`
- Modify: `src/web-frontdesk.ts`

- [ ] **Step 1: Add minimal state helpers for workspace root and initialize readiness**

Implement explicit helpers in `src/frontdesk-state.ts` or `src/workspace-registry.ts` so the product can read/write a chosen workspace root independent of per-project bindings.

- [ ] **Step 2: Add `buildFrontDeskInitialize` and engine/system action helpers**

Extend `src/frontdesk-installation.ts` with:

```ts
export async function buildFrontDeskInitialize(contracts: GatewayContracts) { /* ... */ }
export async function runFrontDeskEngineAction(action: FrontDeskEngineAction, engineId: string, contracts: GatewayContracts) { /* ... */ }
export async function runFrontDeskSystemAction(action: FrontDeskSystemAction, contracts: GatewayContracts) { /* ... */ }
```

The initialize payload must compose:
- current environment surface
- current modules surface
- explicit workspace root state
- local frontdesk readiness
- `overall_state`
- `recommended_next_action`

- [ ] **Step 3: Add CLI command group wiring**

Add grouped commands to `src/cli.ts`:

```ts
"frontdesk initialize"
"frontdesk engine install|update|reinstall|remove"
"workspace root"
"workspace root set --path <path>"
"workspace root doctor"
"frontdesk repair"
"frontdesk reinstall-support"
"frontdesk update-channel"
```

- [ ] **Step 4: Add matching web adapter endpoints**

Add routes to `src/web-frontdesk.ts`:

```ts
GET /api/frontdesk/initialize
POST /api/frontdesk/engine-action
GET /api/workspace/root
POST /api/workspace/root
POST /api/frontdesk/system-action
```

- [ ] **Step 5: Run focused test slice and confirm GREEN**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts tests/src/verification-command-surfaces.test.ts`
Expected: PASS

- [ ] **Step 6: Run branch verification for OPL**

Run:

```bash
npm test
npm run test:meta
npm run test:artifact
./scripts/verify.sh
```

Expected: all commands exit `0`

- [ ] **Step 7: Commit the OPL action-surface tranche**

```bash
git add src/frontdesk-installation.ts src/frontdesk-state.ts src/workspace-registry.ts \
        src/cli.ts src/web-frontdesk.ts tests/src/cli.test.ts \
        tests/src/verification-command-surfaces.test.ts \
        docs/specs/2026-04-19-opl-initialize-and-environment-manager-design.md \
        docs/references/opl-frontdesk-delivery-board.md \
        docs/plans/2026-04-19-opl-initialize-and-onyx-overlay-implementation.md
git commit -m "feat: land opl initialize and environment actions"
```

## Task 4: Bootstrap the Independent opl-onyx-shell Repo

**Files:**
- Modify: `/Users/gaofeng/workspace/opl-onyx-shell/web/src/app/craft/v1/layout.tsx`
- Modify: `/Users/gaofeng/workspace/opl-onyx-shell/web/src/app/craft/v1/page.tsx`
- Modify: `/Users/gaofeng/workspace/opl-onyx-shell/web/src/app/craft/components/SideBar.tsx`
- Modify: `/Users/gaofeng/workspace/opl-onyx-shell/web/src/app/craft/components/ChatPanel.tsx`
- Modify: `/Users/gaofeng/workspace/opl-onyx-shell/web/src/app/craft/components/OutputPanel.tsx`
- Create or modify: `/Users/gaofeng/workspace/opl-onyx-shell/web/src/app/app/settings/opl/...`
- Modify: `/Users/gaofeng/workspace/opl-onyx-shell/desktop/src-tauri/tauri.conf.json`
- Modify: `/Users/gaofeng/workspace/opl-onyx-shell/desktop/README.md`

- [ ] **Step 1: Create an isolated branch for the overlay repo**

Run:

```bash
git -C /Users/gaofeng/workspace/opl-onyx-shell checkout -b codex/opl-shell-bootstrap
```

Expected: branch switches successfully

- [ ] **Step 2: Install web dependencies**

Run:

```bash
cd /Users/gaofeng/workspace/opl-onyx-shell/web && npm install
```

Expected: install completes without dependency resolution errors

- [ ] **Step 3: Add an OPL-facing service layer**

Create a thin adapter module under `web/src/app/craft/services/` or `web/src/lib/` that fetches from the OPL adapter service:

```ts
export async function fetchOplInitialize() {}
export async function fetchOplEnvironment() {}
export async function fetchOplModules() {}
export async function submitOplAsk() {}
```

- [ ] **Step 4: Re-skin the Onyx craft workbench into OPL semantics**

Use existing Onyx skeleton:
- left: `SideBar`
- center: `ChatPanel`
- right: `OutputPanel`

Map them to:
- workspace / task
- conversation / progress narration
- files / deliverables / task cards

- [ ] **Step 5: Add OPL settings route using Onyx settings layouts**

Use `web/src/layouts/settings-layouts.tsx` and build an `Environment / Modules` page with the three card groups:
- `Core Engines`
- `Domain Modules`
- `System`

- [ ] **Step 6: Keep the desktop wrapper reusable**

Point the Tauri configuration and README at the OPL overlay flow so the repo can later open the OPL shell as a native desktop app.

- [ ] **Step 7: Run overlay verification**

Run:

```bash
cd /Users/gaofeng/workspace/opl-onyx-shell/web && npm run types:check
cd /Users/gaofeng/workspace/opl-onyx-shell/web && npm run test:ci
```

Expected: both commands exit `0`

- [ ] **Step 8: Commit the overlay bootstrap tranche**

```bash
git -C /Users/gaofeng/workspace/opl-onyx-shell add web desktop
git -C /Users/gaofeng/workspace/opl-onyx-shell commit -m "feat: bootstrap opl onyx overlay"
```

## Task 5: Cross-Repo Integration Check and Branch Cleanup

**Files:**
- Modify as needed in both repos based on verification failures

- [ ] **Step 1: Start the OPL adapter service from the OPL worktree**

Run:

```bash
cd /Users/gaofeng/workspace/one-person-lab/.worktrees/opl-main-frontdesk-init && opl web --host 127.0.0.1 --port 8787
```

Expected: local adapter service starts and `/` returns the headless root payload

- [ ] **Step 2: Point the overlay repo at the OPL adapter base URL and smoke the UI**

Run the overlay dev server and confirm:
- initialize screen can read the initialize surface
- settings page can read environment/modules
- workbench can render left/center/right skeleton with OPL naming

- [ ] **Step 3: Re-run repo verifications after any integration fixes**

Run:

```bash
cd /Users/gaofeng/workspace/one-person-lab/.worktrees/opl-main-frontdesk-init && npm test && npm run test:meta && npm run test:artifact && ./scripts/verify.sh
cd /Users/gaofeng/workspace/opl-onyx-shell/web && npm run types:check && npm run test:ci
```

Expected: all commands exit `0`

- [ ] **Step 4: Absorb the OPL branch back to main and clean the worktree**

Run:

```bash
cd /Users/gaofeng/workspace/one-person-lab
git merge --ff-only codex/opl-main-frontdesk-init
git worktree remove /Users/gaofeng/workspace/one-person-lab/.worktrees/opl-main-frontdesk-init
git branch -d codex/opl-main-frontdesk-init
```

- [ ] **Step 5: Leave the overlay repo on its dedicated branch with a clean status**

Run:

```bash
git -C /Users/gaofeng/workspace/opl-onyx-shell status --short
```

Expected: no uncommitted changes
