# OPL Series Heartbeat Governance Ledger

Owner: `One Person Lab`
Purpose: `automation_2_heartbeat_governance_closeout`
State: `historical_archive`
Machine boundary: 本文只记录 2026-06-02T17:01:35Z 冻结的 automation-2 单轮
heartbeat governance closeout。机器 truth 继续归各 repo 的 git state、source、
contracts、tests、CLI/read-model、runtime ledgers、GitHub remote/PR state 和
验证输出。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-06-02T17:01:35Z`.
- Frozen repo scope:
  - `one-person-lab`: `main@92164b32`, clean root, `origin/main` aligned at snapshot.
  - `med-autoscience`: `main@88d781e7`, clean root, `origin/main` aligned; local branch
    `fix/progress-first-current-dispatch-arbitration-20260601` existed.
  - `med-autogrant`: `main@b5429be`, clean root, ahead `origin/main` by one commit.
  - `redcube-ai`: `main@caf60da7`, clean root, ahead `origin/main` by 10 and behind by 3.
  - `opl-meta-agent`: `main@2d71dd7`, clean root, ahead `origin/main` by one commit.
  - `one-person-lab-app`: `main@b930325`, clean root, behind `origin/main` by one commit.
- Initial worktree scope showed only repo root worktrees. A later
  `one-person-lab/.worktrees/queue-stranded-release` worktree is classified as
  `post_snapshot_activity`, not part of the frozen cleanup scope.
- Open PR check: six governed repos had no open PRs returned by `gh pr list` at
  inventory time.
- Recent-write signal relative to snapshot:
  - `one-person-lab` and `med-autoscience` had writes in the hour before
    snapshot and related running processes, so their implementation lanes were
    not safe cleanup/absorb targets.
  - `med-autogrant`, `redcube-ai`, `opl-meta-agent`, and `one-person-lab-app`
    had no recent-write blocker after UTC reference-file correction.

## Process And Remote State

- Process scan found active Codex/node/Python/Temporal/agent-browser processes
  rooted in `one-person-lab`, `med-autoscience`, `redcube-ai`, and
  `one-person-lab-app`. These guarded against deleting active owner lanes.
- `redcube-ai` stayed a sync blocker: local `main` had 10 commits absent from
  `origin/main`, while `origin/main` had 3 commits absent locally. The diff
  crossed agent/plugin contracts, tests, docs, and marketplace state, so this
  round did not merge, push, or clean it.
- `one-person-lab-app` root was behind one remote commit and had App owner
  processes; governance mutation therefore ran from a fresh worktree based on
  `origin/main`.

## Handled Snapshot Lanes

- `med-autogrant`:
  - Existing ahead commit `b5429be docs: archive MAG portfolio ledger`.
  - Verification: `git diff --check HEAD~1..HEAD` passed; OPL Doc doctor
    reported `finding_count=0` and active truth `pass`.
  - Action: pushed `main` to `origin/main`.
- `opl-meta-agent`:
  - Existing ahead commit `2d71dd7 docs: archive OMA portfolio ledger`.
  - Verification: `git diff --check HEAD~1..HEAD` passed; OPL Doc doctor
    reported `finding_count=0` and active truth `pass`.
  - Action: pushed `main` to `origin/main`.
- `one-person-lab-app`:
  - Created fresh worktree
    `/Users/gaofeng/workspace/one-person-lab-app-automation-2-governance-20260602`
    on `origin/main`, branch `codex/automation-2-governance-20260602-app`.
  - Committed and pushed `e658929 chore(governance): retire Full Hermes CLI surface`.
  - Fast-forwarded root App `main` from `b930325` to `origin/main@3ca2cf6`,
    then fast-forwarded to `e658929`; pushed `main`.
  - Removed the governance worktree, deleted the local branch, and deleted the
    remote temporary branch.

## Reviewed Source / Contracts / Tests / Docs

- OPL Doc skill: `/Users/gaofeng/workspace/opl-doc/skills/opl-doc/SKILL.md`.
- App guidance and preferences: `one-person-lab-app/AGENTS.md`,
  `one-person-lab-app/TASTE.md`.
- App canonical docs and active plan:
  `docs/README.md`, `docs/project.md`, `docs/status.md`,
  `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`,
  `docs/active/app-ideal-state-gap-plan.md`.
- App GUI support docs:
  `docs/active/app-interaction-logic-command-center.md`,
  `docs/agui-codex-candidate-verification.md`,
  `docs/app-gui-feature-inventory.md`,
  `docs/app-ideal-gui-interaction-spec.md`,
  `docs/codex-to-opl-app-delta.md`.
- App retirement candidate surfaces:
  `scripts/build-full-first-install-package.ts`,
  `tests/release/app-release-boundary.test.ts`, and negative scans across
  `scripts`, `tests`, `docs`, `contracts`, and `package.json`.

## Changed Source / Contracts / Tests / Docs

- App docs lifecycle governance:
  - Added the missing lifecycle `Purpose` and canonical `Machine boundary`
    header to `docs/active/app-interaction-logic-command-center.md`.
  - Normalized four long-lived GUI docs from `机器边界` to `Machine boundary`:
    `docs/agui-codex-candidate-verification.md`,
    `docs/app-gui-feature-inventory.md`,
    `docs/app-ideal-gui-interaction-spec.md`,
    `docs/codex-to-opl-app-delta.md`.
  - Replaced the stale `opl-doc-governance` doctor path in
    `docs/active/app-ideal-state-gap-plan.md` with the canonical
    `/Users/gaofeng/workspace/opl-doc/scripts/opl_doc_doctor.py`.
- App retired surface:
  - Removed the dedicated `--hermes-root` parser branch from
    `scripts/build-full-first-install-package.ts`.
  - Added a release-boundary guard asserting the Full package builder no longer
    exposes `--hermes-root`.

## Retirement Candidate Audit

| Candidate | Type | Checks | Replacement / retirement basis | Outcome |
| --- | --- | --- | --- | --- |
| App Full package `--hermes-root` CLI branch | CLI/package entry | `rg -- --hermes-root scripts tests docs contracts package.json`; read `scripts/build-full-first-install-package.ts`; checked release-boundary tests for Full package parser coverage | OPL Full packages no longer include Hermes runtime payloads; Temporal-backed provider/OPL Framework payload is the App Full path; current Full package inputs are `--framework-root`/`--opl-root`, MAS/MAG/RCA/OMA roots, toolchain bins, runtime cache, and release assets | Physically retired the dedicated branch and locked absence with `assert.doesNotMatch(buildScript, /--hermes-root/)`. Negative scan now only finds the guard assertion. |
| App stale `opl-doc-governance` doctor path | Developer-doc workflow pointer | `rg "opl-doc-governance|/Users/gaofeng/workspace/opl-doc-governance"` in App docs/scripts/tests/contracts | Canonical repo is `/Users/gaofeng/workspace/opl-doc`; compatibility entrance is not source of truth | Replaced path in active plan. Negative scan has no hits. |

## Verification

- App governance worktree:
  - `rtk git diff --check`: passed.
  - `rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs scripts tests contracts`: no hits.
  - `python3 /Users/gaofeng/workspace/opl-doc/scripts/opl_doc_doctor.py doctor <app-worktree> --format json`: `finding_count=0`, active truth `pass`.
  - `rtk rg "opl-doc-governance|/Users/gaofeng/workspace/opl-doc-governance" docs scripts tests contracts`: no hits.
  - `rtk rg -- --hermes-root scripts tests docs contracts package.json`: only the new negative guard assertion.
  - `rtk node --experimental-strip-types scripts/validate-active-shell.ts --quick`: passed after `npm run ensure:shell` created the isolated external `shells/aionui` checkout.
  - `rtk npm run test:release-boundary`: `102/102` passed.
- App root `main` after absorb:
  - `rtk git diff --check`: passed.
  - conflict-marker scan: no hits.
  - OPL Doc doctor: `finding_count=0`, active truth `pass`.
  - stale `opl-doc-governance` scan: no hits.
  - `--hermes-root` scan: only the test guard assertion.
  - active-shell quick validation: passed.
  - `rtk npm run test:release-boundary`: `102/102` passed.

## Blockers And Next Owners

- `one-person-lab`: root `main` clean and aligned, but
  `.worktrees/queue-stranded-release` appeared after the frozen inventory. It is
  dirty and had active test/CLI processes (`family-runtime queue` tests and
  runtime CLI commands) during closeout. Next owner: next heartbeat / active
  branch owner decides whether to commit, absorb, or clean it after processes
  finish.
- `med-autoscience`: root `main` clean and aligned, but snapshot had recent
  writes and related Python/runtime processes. No cleanup or absorb attempted.
- `redcube-ai`: root clean but divergent from origin (`ahead 10`, `behind 3`).
  Next owner must inspect and reconcile local commits with remote
  `test(ci): align plugin marketplace contract`,
  `fix(ci): remove tracked agent marketplace state`, and
  `fix: publish RCA Codex plugin installer`; no destructive action in this run.
- `one-person-lab-app`: temporary governance branch/worktree cleaned after main
  absorb; App root `main` aligned with origin at `e658929`.

## Post-Snapshot Activity

- `one-person-lab/.worktrees/queue-stranded-release` existed by closeout but not
  in the initial frozen worktree inventory. It had dirty files:
  `docs/decisions.md`, `docs/status.md`,
  `src/family-runtime-command-parts/queue.ts`,
  `src/family-runtime-command.ts`, `src/family-runtime-queue-release.ts`,
  `src/family-runtime.ts`, and untracked
  `tests/src/cli/cases/family-runtime-queue-stranded-release.test.ts`.
- Active processes referenced that worktree at closeout, including Node tests
  for `family-runtime-queue-guards`, `family-runtime-queue-stranded-release`,
  `family-runtime`, and `contracts-help`, plus CLI invocations for
  `family-runtime queue inspect`, `family-runtime tick`, and
  `family-runtime evidence-worklist`.
- No open PR was returned for `queue-stranded-release`.

## No-Safe-Mutation Matrix

This run was not a no-edit closeout. Safe verified mutations were completed and
pushed:

| Repo | Commit / cleanup candidates | Docs governance candidates | Retirement candidates | Outcome |
| --- | --- | --- | --- | --- |
| `one-person-lab` | Root clean/aligned; post-snapshot dirty worktree blocked by active processes | Ledger-only write done from fresh worktree in this repo | Not selected; active implementation lane blocked | Ledger commit created separately; active lane carried forward |
| `med-autoscience` | Root clean/aligned; recent writes/processes at snapshot | Doctor pass; no mutation selected | Not selected due active owner activity | Carry forward |
| `med-autogrant` | One ahead docs commit | Existing MAG ledger archive commit | Not selected | Verified and pushed |
| `redcube-ai` | Divergent main ahead 10/behind 3 | Doctor pass | Potential stale surfaces require divergence reconciliation first | Blocked for next owner |
| `opl-meta-agent` | One ahead docs commit | Existing OMA ledger archive commit | Not selected | Verified and pushed |
| `one-person-lab-app` | Root behind one; fresh governance worktree used | Lifecycle header cleanup committed | `--hermes-root` CLI branch retired | Verified, absorbed, pushed, temp worktree/branch cleaned |

## Remaining Stale / Retire Candidates

- `redcube-ai` branch divergence reconciliation before any safe RCA retire/doc
  mutation.
- `one-person-lab/.worktrees/queue-stranded-release` dirty active lane after
  tests finish.
- App legacy Settings redirects and candidate shell references remain retained
  public surfaces, not retired, because contracts/tests still require redirect
  compatibility and explicit candidate selection.

## Next-Round Write Scope

- First inspect `one-person-lab/.worktrees/queue-stranded-release` after its
  processes finish; decide whether it is a coherent queue-release bugfix commit
  or a blocker for the branch owner.
- Reconcile `redcube-ai` local/remote divergence before any cleanup, push, or
  retire action.
- Continue App docs lifecycle only from fresh `origin/main`; current App doctor
  baseline is clean after this run.
