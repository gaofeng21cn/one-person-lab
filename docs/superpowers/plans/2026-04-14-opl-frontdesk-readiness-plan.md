# OPL frontdesk readiness surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one top-level `frontdesk-readiness` surface that truthfully tells operators whether `OPL` is directly usable now, which domain entries are ready, and what to fix next.

**Architecture:** Reuse already frozen surfaces instead of inventing a second truth source. The new surface derives from `frontdesk-service-status`, `hosted_runtime_readiness`, `frontdesk-domain-wiring`, `domain-manifests`, and existing domain `product_entry_readiness / preflight / quickstart` companions, then expose it through both CLI and `opl web`.

**Tech Stack:** TypeScript CLI, Node.js HTTP server, node:test, existing Hermes/file-backed local state integrations

---

### Task 1: Lock the new readiness contract with failing tests

**Files:**
- Modify: `tests/src/cli.test.ts`
- Modify: `tests/built/cli.test.mjs`
- Test: `tests/src/cli.test.ts`
- Test: `tests/built/cli.test.mjs`

- [ ] **Step 1: Add the new source CLI assertions before touching implementation**

```ts
const output = await runCliAsync(['frontdesk-readiness'], {
  OPL_HERMES_BIN: hermesPath,
  PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
  HOME: homeRoot,
  OPL_LAUNCHCTL_BIN: launchctlFixture.launchctlPath,
});

assert.equal(output.frontdesk_readiness.surface_id, 'opl_frontdesk_readiness');
assert.equal(output.frontdesk_readiness.local_service.installed, false);
assert.equal(output.frontdesk_readiness.summary.total_projects_count, 2);
assert.equal(output.frontdesk_readiness.summary.usable_now_projects_count, 0);
assert.equal(output.frontdesk_readiness.endpoints.frontdesk_readiness, '/api/frontdesk-readiness');
```

- [ ] **Step 2: Extend the bound-manifest fixture test with readiness expectations**

```ts
const readinessOutput = await runCliAsync(['frontdesk-readiness'], env);
assert.equal(readinessOutput.frontdesk_readiness.summary.total_projects_count, 3);
assert.equal(readinessOutput.frontdesk_readiness.summary.usable_now_projects_count, 3);
assert.equal(readinessOutput.frontdesk_readiness.summary.good_to_use_now_projects_count, 1);
assert.equal(readinessOutput.frontdesk_readiness.summary.fully_automatic_projects_count, 2);
assert.equal(readinessOutput.frontdesk_readiness.summary.ready_for_opl_start_count, 3);
```

- [ ] **Step 3: Add built CLI and web assertions for discoverability**

```js
assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk-readiness'));
assert.equal(readinessPayload.frontdesk_readiness.surface_id, 'opl_frontdesk_readiness');
assert.match(pageHtml, /Frontdesk Readiness/);
```

- [ ] **Step 4: Run the focused source tests and confirm RED**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdesk-readiness|domain-manifests resolves real family manifest fixtures|web starts a local front-desk pilot and serves dashboard plus ask surfaces|help advertises the local web front-desk pilot command surface'`

Expected: FAIL because `frontdesk-readiness` command and API do not exist yet.

### Task 2: Implement the derived readiness surface and expose it through CLI + web

**Files:**
- Modify: `src/frontdesk-paths.ts`
- Historical target: `src/management.ts`（已退役；当前实现使用 `src/management/*` leaf surfaces）
- Modify: `src/frontdesk-service.ts`
- Modify: `src/cli.ts`
- Modify: `src/web-frontdesk.ts`

- [ ] **Step 1: Add the new endpoint and surface builder**

```ts
// src/frontdesk-paths.ts
frontdesk_readiness: `${apiBase}/frontdesk-readiness`,

// Historical: src/management.ts. Current implementation uses src/management/* leaf surfaces.
export async function buildFrontDeskReadiness(contracts: GatewayContracts, options: DashboardOptions = {}) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const service = (await getFrontDeskServiceStatus(contracts)).frontdesk_service;
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const domainBindingParity = buildDomainBindingParity(contracts, options);
  // derive summary + per-project readiness here
}
```

- [ ] **Step 2: Register the CLI command and thread the new surface refs into existing hosted-friendly surfaces**

```ts
'frontdesk-readiness': {
  usage: 'opl frontdesk-readiness [--path <workspace_path>] [--sessions-limit <n>]',
  summary: 'Expose one operator-facing readiness surface for local shell, hosted pilot, and domain direct-entry parity.',
  handler: (args) => buildFrontDeskReadiness(getContracts(), parseDashboardArgs(args, commandSpecs['frontdesk-readiness'])),
},
```

- [ ] **Step 3: Add the web API and browser card**

```ts
// src/web-frontdesk.ts
frontdesk_readiness: string;

if (method === 'GET' && routedPath === '/api/frontdesk-readiness') {
  return sendJson(response, 200, await buildFrontDeskReadiness(contracts, requestOptions));
}
```

```ts
// hosted-friendly fetch group
fetch(bootstrap.web_frontdesk.api.frontdesk_readiness)
```

- [ ] **Step 4: Re-run the focused source tests and confirm GREEN**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdesk-readiness|domain-manifests resolves real family manifest fixtures|web starts a local front-desk pilot and serves dashboard plus ask surfaces|help advertises the local web front-desk pilot command surface'`

Expected: PASS.

### Task 3: Sync docs and full verification

**Files:**
- Modify: `docs/status.md`
- Modify: `docs/README.md`
- Modify: `docs/README.zh-CN.md`
- Modify: `docs/references/opl-frontdesk-delivery-board.md`
- Modify: `contracts/opl-gateway/README.md`
- Modify: `contracts/opl-gateway/README.zh-CN.md`

- [ ] **Step 1: Update repo-tracked truth surfaces**

```md
- `opl frontdesk-readiness` 现在把 local service / hosted pilot / domain direct-entry readiness 收成单一 operator-facing truth surface。
- `opl web` 现在额外暴露 `/api/frontdesk-readiness`，让 browser front desk 与 future hosted shell 不必自己拼接多份状态。
```

- [ ] **Step 2: Run the full verification stack**

Run: `./scripts/verify.sh full`
Expected: PASS

Run: `git diff --check`
Expected: no output

- [ ] **Step 3: Commit the slice**

```bash
git add src/frontdesk-paths.ts src/management/* src/frontdesk-service.ts src/cli.ts src/web-frontdesk.ts tests/src/cli.test.ts tests/built/cli.test.mjs docs/status.md docs/README.md docs/README.zh-CN.md docs/references/opl-frontdesk-delivery-board.md contracts/opl-gateway/README.md contracts/opl-gateway/README.zh-CN.md docs/superpowers/plans/2026-04-14-opl-frontdesk-readiness-plan.md
git commit -m "Add frontdesk readiness surface for operator triage"
```
