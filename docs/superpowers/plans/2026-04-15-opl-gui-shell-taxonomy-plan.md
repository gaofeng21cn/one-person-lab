# OPL GUI shell taxonomy and MAS workspace mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land one stable family-level entry-guide surface for AI / GUI shells, expose it through CLI / API / startup payload, and keep naming boundaries clear without colliding with the separate `LibreChat-first` GUI line.

**Architecture:** Reuse existing manifest / readiness / wiring truth and derive one `frontdesk-entry-guide` surface from them. Then expose that surface through CLI, web API, and startup payload, while keeping `opl web` on its current operator-pilot role.

**Tech Stack:** TypeScript CLI, Node.js HTTP server, node:test, existing frontdesk manifest/readiness/wiring/dashboard surfaces

---

### Task 1: Lock the new entry-guide contract with failing tests

**Files:**
- Modify: `tests/src/cli.test.ts`
- Modify: `tests/built/cli.test.mjs`
- Test: `tests/src/cli.test.ts`
- Test: `tests/built/cli.test.mjs`

- [ ] **Step 1: Add source assertions for the new CLI surface**

```ts
const output = runCli(['frontdesk-entry-guide']);

assert.equal(output.frontdesk_entry_guide.surface_id, 'opl_frontdesk_entry_guide');
assert.equal(output.frontdesk_entry_guide.workspace_taxonomy.family_workspace_kind, 'opl_family_workspace');
assert.equal(output.frontdesk_entry_guide.projects.length, 2);
assert.equal(output.frontdesk_entry_guide.endpoints.frontdesk_entry_guide, '/api/frontdesk-entry-guide');
```

- [ ] **Step 2: Extend the family-manifest fixture test with MAS mapping expectations**

```ts
const guideOutput = runCli(['frontdesk-entry-guide'], env);
const scienceGuide = guideOutput.frontdesk_entry_guide.projects.find((entry) => entry.project_id === 'med-autoscience');

assert.equal(scienceGuide.domain_workspace_kind, 'research_workspace');
assert.equal(scienceGuide.domain_workspace_label, 'study queue');
assert.equal(scienceGuide.workspace_mapping.family_workspace_role, 'family_task_container');
assert.equal(scienceGuide.workspace_mapping.domain_workspace_role, 'research_runtime_workspace');
assert.match(scienceGuide.workspace_mapping.summary, /OPL workspace/i);
assert.equal(scienceGuide.start.recommended_mode_id, 'open_frontdesk');
```

- [ ] **Step 3: Add built CLI and web assertions for discoverability**

```js
assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk-entry-guide'));
assert.equal(guidePayload.frontdesk_entry_guide.surface_id, 'opl_frontdesk_entry_guide');
assert.match(pageHtml, /Tell OPL what you want to get done/i);
assert.match(pageHtml, /Family Workspace vs Domain Workspace/i);
assert.match(pageHtml, /Med Auto Science/i);
```

- [ ] **Step 4: Run the focused tests and confirm RED**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdesk-entry-guide|domain-manifests resolves real family manifest fixtures while workspace-catalog stays registry-only|web starts a local front-desk pilot and serves dashboard plus ask surfaces|help advertises the local web front-desk pilot command surface'`

Expected: FAIL because the new command, API, and human-first page copy do not exist yet.

### Task 2: Implement the derived entry-guide surface

**Files:**
- Modify: `src/frontdesk-paths.ts`
- Modify: `src/management.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Add the new endpoint**

```ts
// src/frontdesk-paths.ts
frontdesk_entry_guide: `${apiBase}/frontdesk-entry-guide`,
```

- [ ] **Step 2: Add a guide builder that stays derived from existing truth**

```ts
// src/management.ts
export function buildFrontDeskEntryGuide(contracts: GatewayContracts, options: DashboardOptions = {}) {
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const readiness = buildFrontDeskReadiness(contracts, options);
  const wiring = buildFrontDeskDomainWiring(contracts, options);
  // derive family workspace taxonomy + per-project guide entries here
}
```

- [ ] **Step 3: Register the new CLI command**

```ts
'frontdesk-entry-guide': {
  usage: 'opl frontdesk-entry-guide [--path <workspace_path>] [--sessions-limit <n>]',
  summary: 'Explain the human-first family entry model, workspace taxonomy, and per-domain start guidance.',
  handler: (args) => buildFrontDeskEntryGuide(getContracts(), parseDashboardArgs(args, commandSpecs['frontdesk-entry-guide'])),
},
```

- [ ] **Step 4: Re-run the focused CLI tests and confirm GREEN**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdesk-entry-guide|domain-manifests resolves real family manifest fixtures while workspace-catalog stays registry-only'`

Expected: PASS

### Task 3: Expose the guide through web API and startup payload

**Files:**
- Modify: `src/web-frontdesk.ts`
- Modify: `tests/src/cli.test.ts`
- Modify: `tests/built/cli.test.mjs`

- [ ] **Step 1: Add the web API and bootstrap field**

```ts
// src/web-frontdesk.ts
frontdesk_entry_guide: string;

if (method === 'GET' && routedPath === '/api/frontdesk-entry-guide') {
  return sendJson(response, 200, await buildFrontDeskEntryGuide(contracts, requestOptions));
}
```

- [ ] **Step 2: Keep `opl web` machine-readable and bootstrap the new surface**

```ts
// startup payload should expose bootstrap.web_frontdesk.api.frontdesk_entry_guide
// page-level tests only verify the bootstrap is present and points at the new surface
```

- [ ] **Step 3: Re-run focused web tests and confirm GREEN**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='web starts a local front-desk pilot and serves dashboard plus ask surfaces|help advertises the local web front-desk pilot command surface|frontdesk-entry-guide'`

Expected: PASS

### Task 4: Sync docs and verify the slice

**Files:**
- Modify: `docs/status.md`
- Modify: `docs/README.md`
- Modify: `docs/README.zh-CN.md`
- Modify: `docs/references/opl-frontdesk-delivery-board.md`
- Modify: `contracts/opl-gateway/README.md`
- Modify: `contracts/opl-gateway/README.zh-CN.md`

- [ ] **Step 1: Update repo-tracked truth**

```md
- `frontdesk-entry-guide` 现在冻结 family-level GUI shell taxonomy、workspace mapping 与 domain start guidance。
- `OPL Cortex` 若作为用户前台名称，只在文档里作为 shell branding 提示；repo 内部 `frontdesk_*` 继续保持 contract / API 命名。
```

- [ ] **Step 2: Run verification**

Run: `npm run build`
Expected: PASS

Run: `./scripts/verify.sh typecheck`
Expected: PASS

Run: `git diff --check`
Expected: no output

- [ ] **Step 3: If the repo-wide fast/full lane still has pre-existing failures, run the minimal honest slice verification**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdesk-entry-guide|domain-manifests resolves real family manifest fixtures while workspace-catalog stays registry-only|web starts a local front-desk pilot and serves dashboard plus ask surfaces|help advertises the local web front-desk pilot command surface'`

Run: `NODE_NO_WARNINGS=1 node --test tests/built/cli.test.mjs --test-name-pattern='frontdesk-entry-guide|web starts a local front-desk pilot through the built CLI entrypoint|help exposes the local web front-desk pilot command through the built CLI entrypoint'`

Expected: PASS

- [ ] **Step 4: Commit the slice**

```bash
git add docs/superpowers/specs/2026-04-15-opl-gui-shell-taxonomy-design.md \
  docs/superpowers/plans/2026-04-15-opl-gui-shell-taxonomy-plan.md \
  src/frontdesk-paths.ts src/management.ts src/cli.ts src/web-frontdesk.ts \
  tests/src/cli.test.ts tests/built/cli.test.mjs \
  docs/status.md docs/README.md docs/README.zh-CN.md \
  docs/references/opl-frontdesk-delivery-board.md \
  contracts/opl-gateway/README.md contracts/opl-gateway/README.zh-CN.md
git commit -m "Add GUI shell taxonomy and entry guide surface"
```
