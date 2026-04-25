**English** | [中文](./opl-default-skill-ecosystem.zh-CN.md)

# OPL Default Skill Ecosystem Reference

This document defines which skills One Person Lab App and `opl install` should maintain by default. The goal is for One Person Lab App, stock Codex App, and Codex CLI to see the same capability ecosystem without installing project-local skills globally.

## Three Layers

| Layer | Examples | Default install / sync path | Ownership rule |
| --- | --- | --- | --- |
| OPL family domain skills | MAS, MAG, RCA | Codex plugin / family skill sync | Owned by each active domain-agent repo; OPL registers and syncs them |
| OPL companion skills | Superpowers, officecli, officecli-docx/pptx/xlsx, ui-ux-pro-max | User-level Codex / agent skill discovery paths | OPL detects, plans, and applies only through explicit user or managed-profile action |
| Codex bundled skills | Documents, Presentations, Spreadsheets | Codex plugin cache | OPL detects availability and does not copy them into `~/.codex/skills` |

MDS internal skills such as `scout`, `review`, `baseline`, `experiment`, and `write` are not part of the OPL default global ecosystem. They should stay MAS-controlled, project-local, or domain-runtime-local instead of becoming OPL default family skills.

## Official Superpowers Model

Superpowers is not installed by enabling only the `using-superpowers` skill. The official Codex installation model is:

```bash
git clone https://github.com/obra/superpowers.git ~/.codex/superpowers
mkdir -p ~/.agents/skills
ln -s ~/.codex/superpowers/skills ~/.agents/skills/superpowers
```

After installation, restart Codex / One Person Lab App so native skill discovery can read `~/.agents/skills/superpowers`.

Update with:

```bash
cd ~/.codex/superpowers && git pull --ff-only
```

OPL applies Superpowers with this model only in explicit managed mode:

- `opl skill companion status` only inspects and does not mutate the user environment.
- `opl skill companion apply --mode managed --superpowers full` clones into `~/.codex/superpowers` and links `~/.agents/skills/superpowers -> ~/.codex/superpowers/skills`.
- `opl skill companion apply --mode managed --superpowers lite` preserves a lightweight profile and does not enable upstream `using-superpowers`.
- Support `OPL_SUPERPOWERS_REPO_URL` for mirrors or tests.
- Support `OPL_SUPERPOWERS_DIR` for a custom local clone path.

## officecli And Office Skills

OPL treats officecli skills as companion skills because MAS/MAG/RCA may need Word, PowerPoint, Excel, or dashboard capability.

Default checks cover:

- `officecli`
- `officecli-docx`
- `officecli-pptx`
- `officecli-xlsx`

These skills are usually managed by Skills Manager under `~/.skills-manager/skills/*`. OPL only inspects them in status mode. It symlinks them into the Codex-visible skill directory only after an explicit apply or inside an OPL-managed profile.

## How OPL App Should Use This Ecosystem

One Person Lab App should reuse Codex user-level skill discovery paths when appropriate, but whether it mutates those paths is controlled by the selected profile.

Recommended order:

1. `observe`: inspect only and do not modify the user skill ecosystem.
2. `ask_to_apply`: build a plan and wait for user confirmation.
3. `managed`: apply the recommended profile for OPL App / Docker / OPL-owned `CODEX_HOME`.
4. Detect Codex bundled skills without copying them.
5. Keep MDS and other MAS-internal project-local skills out of the global system list.

## Verification

```bash
opl install --skip-gui-open
opl skill sync
opl skill companion status
opl skill companion apply --mode managed --superpowers lite
opl system initialize
```

`opl system initialize` should report the observed state. `opl skill companion status` must not mutate user configuration; `apply --mode managed` is the mutating action.
