# OPL Quality Details Reference

Owner: `One Person Lab`
Purpose: `references_current_support_opl_quality_details`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

`opl quality details` is the family-owned sidecar diagnostic surface for code-quality triage. It complements Sentrux Free: Sentrux remains the structural score, trend, baseline, and rules wall; OPL emits deterministic details that help an agent find the files, functions, dependency paths, test gaps, and local rules involved in a structural problem.

The command does not fork Sentrux, bypass Sentrux licensing, depend on Sentrux Pro, or create a second quality score. It reads the target repository and writes only stdout or caller-chosen artifacts.

## Command

```bash
opl quality details --root <repo_path> \
  [--format <json|markdown>] \
  [--limit <n>] \
  [--focus <auto|depth|equality|modularity|redundancy|test_gaps|rules>] \
  [--compare-ref <git_ref>]
```

JSON output is the machine surface:

- `surface_kind`: `opl_code_quality_details.v1`
- `repo_summary`: source/test/function/import/depth/test-gap/rules counts
- `baseline_diff`: optional compare-ref summary for complex-function changes
- `function_change_findings`: functions that crossed or worsened past the complex-function threshold
- `function_findings`: function name, file, line span, length, parameter count, complexity, and reasons
- `file_findings`: file length, local fan-in/fan-out, function count, and reasons
- `dependency_findings`: deep local dependency paths and high fan-in/fan-out targets
- `test_gap_findings`: source files without a matching local test import/reference
- `rules_findings`: local `.sentrux/rules.toml` constraint and boundary details
- `agent_triage_targets`: ranked targets for the next agent action

Markdown output is intentionally compact for GitHub step summaries.

`--compare-ref` creates a temporary detached Git worktree for the supplied ref, compares it with the current target tree, and reports function-level changes. It is meant for Sentrux gate failures such as `Complex functions increased`; the Markdown table lists `file`, `function`, line, and old/new complexity.

## Language Coverage

TypeScript and JavaScript are parsed with the TypeScript compiler API. Python is parsed through the Python standard-library `ast` module. Source-code discovery uses tracked files when the target is a Git repository and falls back to a conservative filesystem walk outside Git.

The v1 rules reader covers the family `.sentrux/rules.toml` shape: `[constraints]`, `[[layers]]`, and `[[boundaries]]`. It is a diagnostic reader for this repo family, not a general TOML replacement and not the Sentrux rules authority.

## Family Usage

Domain repositories should consume this as advisory output before or beside their Sentrux lane. MAS, MAG, and RCA retain domain-owned truth and product/runtime semantics; OPL owns only the shared diagnostic tool.

Local structure lanes should run their existing Sentrux gate/check first. In OPL, `./scripts/verify.sh structure` is a blocking gate. If Sentrux exits nonzero, the lane should emit:

```bash
opl quality details --root . --format markdown --limit 30 --focus auto --compare-ref "${OPL_QUALITY_DETAILS_COMPARE_REF:-origin/main}"
```

and then return the original Sentrux status. This keeps Sentrux as the blocking wall while making function-level regressions visible during development.

The GitHub `Sentrux Advisory` workflow is intentionally non-blocking. It publishes Sentrux output plus this sidecar for review visibility, but the repository's blocking structure gate is the local `structure` lane used by `scripts/verify.sh` and the `Verify` workflow.

GitHub workflows can use the OPL-owned action after this repository's main branch contains the action:

```yaml
- uses: gaofeng21cn/one-person-lab/.github/actions/quality-details@main
  with:
    root: .
    compare-ref: origin/main
    output-dir: artifacts/opl-quality-details
```
