# OPL frontdoor readiness surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one top-level `frontdoor-readiness` surface that truthfully tells operators whether `OPL` is directly usable now, which domain entries are ready, and what to fix next.

**Architecture:** Reuse already frozen surfaces instead of inventing a second truth source. The new surface derives from `frontdoor-service-status`, `hosted_runtime_readiness`, `frontdoor-domain-wiring`, `domain-manifests`, and existing domain `product_entry_readiness / preflight / quickstart` companions, then expose it through both CLI and `opl web`.

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
const output = await runCliAsync(['frontdoor-readiness'], {
  OPL_HERMES_BIN: hermesPath,
  PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
  HOME: homeRoot,
  OPL_LAUNCHCTL_BIN: launchctlFixture.launchctlPath,
});

assert.equal(output.frontdoor_readiness.surface_id, 'opl_frontdoor_readiness');
assert.equal(output.frontdoor_readiness.local_service.installed, false);
assert.equal(output.frontdoor_readiness.summary.total_projects_count, 2);
assert.equal(output.frontdoor_readiness.summary.usable_now_projects_count, 0);
assert.equal(output.frontdoor_readiness.endpoints.frontdoor_readiness, '/api/frontdoor-readiness');
```

- [ ] **Step 2: Extend the bound-manifest fixture test with readiness expectations**

```ts
const readinessOutput = await runCliAsync(['frontdoor-readiness'], env);
assert.equal(readinessOutput.frontdoor_readiness.summary.total_projects_count, 3);
assert.equal(readinessOutput.frontdoor_readiness.summary.usable_now_projects_count, 3);
assert.equal(readinessOutput.frontdoor_readiness.summary.good_to_use_now_projects_count, 1);
assert.equal(readinessOutput.frontdoor_readiness.summary.fully_automatic_projects_count, 2);
assert.equal(readinessOutput.frontdoor_readiness.summary.ready_for_opl_start_count, 3);
```

- [ ] **Step 3: Add built CLI and web assertions for discoverability**

```js
assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdoor-readiness'));
assert.equal(readinessPayload.frontdoor_readiness.surface_id, 'opl_frontdoor_readiness');
assert.match(pageHtml, /Frontdoor Readiness/);
```

- [ ] **Step 4: Run the focused source tests and confirm RED**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdoor-readiness|domain-manifests resolves real family manifest fixtures|web starts a local front-door pilot and serves dashboard plus ask surfaces|help advertises the local web front-door pilot command surface'`

Expected: FAIL because `frontdoor-readiness` command and API do not exist yet.

### Task 2: Implement the derived readiness surface and expose it through CLI + web

**Files:**
- Modify: `src/frontdoor-paths.ts`
- Historical target: `src/management.ts`（已退役；当前实现使用 `src/management/*` leaf surfaces）
- Modify: `src/frontdoor-service.ts`
- Modify: `src/cli.ts`
- Modify: `src/web-frontdoor.ts`

- [ ] **Step 1: Add the new endpoint and surface builder**

```ts
// src/frontdoor-paths.ts
frontdoor_readiness: `${apiBase}/frontdoor-readiness`,

// Historical: src/management.ts. Current implementation uses src/management/* leaf surfaces.
export async function buildFrontdoorReadiness(contracts: GatewayContracts, options: DashboardOptions = {}) {
  const endpoints = buildFrontdoorEndpoints(options.basePath);
  const service = (await getFrontdoorServiceStatus(contracts)).frontdoor_service;
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const domainBindingParity = buildDomainBindingParity(contracts, options);
  // derive summary + per-project readiness here
}
```

- [ ] **Step 2: Register the CLI command and thread the new surface refs into existing hosted-friendly surfaces**

```ts
'frontdoor-readiness': {
  usage: 'opl frontdoor-readiness [--path <workspace_path>] [--sessions-limit <n>]',
  summary: 'Expose one operator-facing readiness surface for local shell, hosted pilot, and domain direct-entry parity.',
  handler: (args) => buildFrontdoorReadiness(getContracts(), parseDashboardArgs(args, commandSpecs['frontdoor-readiness'])),
},
```

- [ ] **Step 3: Add the web API and browser card**

```ts
// src/web-frontdoor.ts
frontdoor_readiness: string;

if (method === 'GET' && routedPath === '/api/frontdoor-readiness') {
  return sendJson(response, 200, await buildFrontdoorReadiness(contracts, requestOptions));
}
```

```ts
// hosted-friendly fetch group
fetch(bootstrap.web_frontdoor.api.frontdoor_readiness)
```

- [ ] **Step 4: Re-run the focused source tests and confirm GREEN**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdoor-readiness|domain-manifests resolves real family manifest fixtures|web starts a local front-door pilot and serves dashboard plus ask surfaces|help advertises the local web front-door pilot command surface'`

Expected: PASS.

### Task 3: Sync docs and full verification

**Files:**
- Modify: `docs/status.md`
- Modify: `docs/README.md`
- Modify: `docs/README.zh-CN.md`
- Modify: `docs/references/opl-frontdoor-delivery-board.md`
- Modify: `contracts/opl-gateway/README.md`
- Modify: `contracts/opl-gateway/README.zh-CN.md`

- [ ] **Step 1: Update repo-tracked truth surfaces**

```md
- `opl frontdoor-readiness` 现在把 local service / hosted pilot / domain direct-entry readiness 收成单一 operator-facing truth surface。
- `opl web` 现在额外暴露 `/api/frontdoor-readiness`，让 browser front desk 与 future hosted shell 不必自己拼接多份状态。
```

- [ ] **Step 2: Run the full verification stack**

Run: `./scripts/verify.sh full`
Expected: PASS

Run: `git diff --check`
Expected: no output

- [ ] **Step 3: Commit the slice**

```bash
git add src/frontdoor-paths.ts src/management/* src/frontdoor-service.ts src/cli.ts src/web-frontdoor.ts tests/src/cli.test.ts tests/built/cli.test.mjs docs/status.md docs/README.md docs/README.zh-CN.md docs/references/opl-frontdoor-delivery-board.md contracts/opl-gateway/README.md contracts/opl-gateway/README.zh-CN.md docs/history/process/superpowers/plans/2026-04-14-opl-frontdoor-readiness-plan.md
git commit -m "Add frontdoor readiness surface for operator triage"
```
