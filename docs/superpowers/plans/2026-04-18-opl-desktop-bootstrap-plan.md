# OPL Desktop Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `opl frontdesk-bootstrap` install a Docker-free Desktop frontdoor by default while keeping LibreChat as an explicit optional lane.

**Architecture:** Reuse the existing OPL frontdesk service and API surfaces as the single truth source. Add one Electron desktop shell package plus one desktop bootstrap state file, then repoint `frontdesk-bootstrap` to that shell while leaving `frontdesk librechat *` intact.

**Tech Stack:** TypeScript CLI, Node.js frontdesk service, Electron desktop shell, node:test, existing workspace registry and Paperclip bootstrap helpers

---

### Task 1: Lock the new bootstrap contract with failing tests

**Files:**
- Modify: `tests/src/cli.test.ts`
- Test: `tests/src/cli.test.ts`

- [ ] **Step 1: Replace the old bootstrap expectation with a desktop-first one**

```ts
assert.equal(install.frontdesk_desktop.action, 'bootstrap');
assert.equal(install.frontdesk_desktop.installed, true);
assert.equal(install.frontdesk_desktop.default_entry, 'desktop');
assert.equal(install.frontdesk_desktop.librechat_retired_from_default, true);
assert.equal(install.frontdesk_service.loaded, true);
```

- [ ] **Step 2: Assert Desktop assets are written and Docker is not part of the default path**

```ts
assert.equal(fs.existsSync(install.frontdesk_desktop.assets.package_json), true);
assert.equal(fs.existsSync(install.frontdesk_desktop.assets.main_js), true);
assert.equal(fs.existsSync(install.frontdesk_desktop.assets.preload_js), true);
assert.equal(fs.existsSync(install.frontdesk_desktop.assets.desktop_config), true);
assert.doesNotMatch(JSON.stringify(install.frontdesk_desktop), /docker/i);
```

- [ ] **Step 3: Keep the explicit LibreChat lane covered**

```ts
const librechat = await runCliAsync(['frontdesk', 'librechat', 'install', '--path', workspace], env);
assert.equal(librechat.frontdesk_librechat.action, 'install');
assert.equal(librechat.frontdesk_librechat.installed, true);
```

- [ ] **Step 4: Run the focused test and confirm RED**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdesk bootstrap|frontdesk librechat install'`

Expected: FAIL because `frontdesk-bootstrap` still returns LibreChat payload.

### Task 2: Add the desktop bootstrap state and package generator

**Files:**
- Modify: `src/frontdesk-state.ts`
- Create: `src/frontdesk-desktop-package.ts`

- [ ] **Step 1: Add desktop state paths**

```ts
desktop_config_file: path.join(stateDir, 'desktop-config.json'),
desktop_pilot_root: path.join(stateDir, 'desktop-pilot'),
```

- [ ] **Step 2: Add a desktop package writer**

```ts
export function buildFrontDeskDesktopPackage(options: FrontDeskDesktopPackageOptions) {
  // write package.json, main.js, preload.js, index.html, and README into desktop-pilot root
}
```

- [ ] **Step 3: Re-run the focused state/package tests**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdesk bootstrap'`

Expected: still FAIL until CLI wiring switches over.

### Task 3: Repoint `frontdesk-bootstrap` to Desktop

**Files:**
- Modify: `src/cli.ts`
- Create: `src/frontdesk-desktop-service.ts`
- Modify: `src/frontdesk-librechat-service.ts`

- [ ] **Step 1: Add a desktop bootstrap implementation**

```ts
export async function bootstrapFrontDeskDesktop(contracts, options) {
  await installFrontDeskService(contracts, options);
  // sync workspace binding
  // write desktop config
  // write desktop package
  // return frontdesk_desktop payload
}
```

- [ ] **Step 2: Rewire the CLI command**

```ts
handler: (args) =>
  bootstrapFrontDeskDesktop(
    getContracts(),
    parseFrontDeskDesktopArgs(args, commandSpecs['frontdesk-bootstrap']),
  ),
```

- [ ] **Step 3: Keep LibreChat command family explicit**

```ts
'frontdesk-librechat-install': { ... } // unchanged behavior
'frontdesk librechat install': { ... } // unchanged alias
```

- [ ] **Step 4: Re-run focused tests and confirm GREEN**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='frontdesk bootstrap|frontdesk librechat install'`

Expected: PASS

### Task 4: Sync docs and command discovery

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/status.md`
- Modify: `docs/references/opl-frontdesk-delivery-board.md`

- [ ] **Step 1: Rewrite the default-path wording**

```md
- `opl frontdesk-bootstrap --path <workspace>` now bootstraps the local `OPL Atlas` Desktop shell.
- `opl frontdesk librechat install` remains available as an optional Docker-based shell lane.
```

- [ ] **Step 2: Update the current-state wording**

```md
- LibreChat is no longer the default local GUI path.
- LibreChat remains the hosted pilot and optional compatibility lane.
```

- [ ] **Step 3: Re-run help/discovery checks**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern='help returns command discovery|frontdesk bootstrap'`

Expected: PASS

### Task 5: Verify the tranche honestly

**Files:**
- Modify: `package.json` if extra verification scripts are needed

- [ ] **Step 1: Run source tests**

Run: `npm test`

Expected: PASS

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: Run diff hygiene**

Run: `git diff --check`

Expected: no output
