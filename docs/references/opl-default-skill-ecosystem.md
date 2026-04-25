**English** | [中文](./opl-default-skill-ecosystem.zh-CN.md)

# OPL Default Skill Ecosystem Reference

This document defines which skills One Person Lab App and `opl install` should maintain by default. The goal is for One Person Lab App, stock Codex App, and Codex CLI to see the same capability ecosystem without installing project-local skills globally.

## Three Layers

| Layer | Examples | Default install / sync path | Ownership rule |
| --- | --- | --- | --- |
| OPL family domain skills | MAS, MDS, MAG, RCA | Codex plugin / family skill sync | Owned by each domain repo; OPL registers and syncs them |
| OPL companion skills | Superpowers, officecli, officecli-docx/pptx/xlsx, morph-ppt, ui-ux-pro-max | User-level Codex / agent skill discovery paths | OPL detects, installs when supported, and exposes repair/update actions |
| Codex bundled skills | Documents, Presentations, Spreadsheets | Codex plugin cache | OPL detects availability and does not copy them into `~/.codex/skills` |

MAS/MDS internal skills such as `scout`, `review`, `baseline`, `experiment`, and `write` are not part of the OPL default global ecosystem. They should stay project-local or domain-runtime-local and be invoked by MAS/MDS.

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

`opl install` and `opl skill sync` maintain Superpowers using this model:

- Clone into `~/.codex/superpowers` by default.
- Link `~/.agents/skills/superpowers -> ~/.codex/superpowers/skills` by default.
- Remove the old single-skill `~/.codex/skills/superpowers -> .../using-superpowers` link when present.
- Support `OPL_SUPERPOWERS_REPO_URL` for mirrors or tests.
- Support `OPL_SUPERPOWERS_DIR` for a custom local clone path.

## officecli And Office Skills

OPL treats officecli skills as companion skills because MAS/MAG/RCA may need Word, PowerPoint, Excel, or dashboard capability.

Default checks cover:

- `officecli`
- `officecli-docx`
- `officecli-pptx`
- `officecli-xlsx`
- `morph-ppt`

These skills are usually managed by Skills Manager under `~/.skills-manager/skills/*`. OPL symlinks them into the Codex-visible skill directory and does not own their upstream content.

## How OPL App Should Use This Ecosystem

One Person Lab App should reuse Codex user-level skill discovery paths instead of maintaining a separate AionUI-private skill injection lane.

Recommended order:

1. Read native Codex / agent discovery paths, including `~/.agents/skills` and `~/.codex/skills`.
2. Show OPL family domain skills and companion skill health.
3. Offer install, update, and repair actions from Environment Management.
4. Detect Codex bundled skills without copying them.
5. Keep MAS/MDS project-local skills out of the global system list.

## Verification

```bash
opl install --skip-gui-open
opl skill sync
ls -la ~/.agents/skills/superpowers
opl system initialize
```

`opl system initialize` should report Superpowers as ready and describe the official bundle + symlink model in the install hint.
