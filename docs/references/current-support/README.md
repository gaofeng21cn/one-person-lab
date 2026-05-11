# Current Support References

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: human-readable index only; operational truth must use CLI/API behavior, contracts, source, release artifacts, runtime state, or semantic `human_doc:*` ids.

This directory holds current operational support references for install, GUI/WebUI, release packaging, skills, quality details, and test lane governance.

These files are useful for operators, but none of them owns the OPL runtime topology. Current topology remains in the core five and the runtime-substrate owner surfaces.

## Contents

| File group | Role | Current owner / boundary |
| --- | --- | --- |
| `opl-gui-shell-adapter-boundary.zh-CN.md` | GUI adapter ownership and upstream-sync boundary | `opl-aion-shell` owns GUI code; OPL owns CLI-backed runtime/contracts/projection surfaces. |
| `opl-docker-webui-deployment*` | Docker and browser deployment reference | WebUI is the OPL-branded AionUI shell; retired headless Product API ports are not user entrypoints. |
| `opl-fresh-install-and-gui-first-launch-testing.zh-CN.md` | Fresh install and GUI first-launch evidence plan | OPL main repo owns CLI clean-room truth; release App VM proof stays in `opl-aion-shell`. |
| `opl-default-skill-ecosystem*` | Default skill and companion tool support | Domain skills remain domain-owned; OPL syncs and detects. MDS internals stay MAS-controlled. |
| `opl-release-packages-modular-distribution.zh-CN.md` | Release/package distribution support | Release packaging must preserve the framework/domain split. |
| `opl-quality-details.md` | Quality command reference | Support reference only; verification truth is the command behavior. |
| `opl-test-lane-governance.zh-CN.md` | Test lane governance reference | Test lanes are machine-governed by package scripts and lane manifests, not prose wording. |

## Use Rule

Before changing an operational support reference, check whether the underlying owner is OPL CLI/source/contracts, `opl-aion-shell`, a release artifact, or a domain repo. Update the owner surface first when behavior changes.
