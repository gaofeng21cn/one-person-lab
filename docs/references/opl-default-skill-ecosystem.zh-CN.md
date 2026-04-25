[English](./opl-default-skill-ecosystem.md) | **中文**

# OPL 默认 Skill 生态参考

这份文档说明 OPL App 和 `opl install` 默认维护哪些 skill，以及这些 skill 应该放在哪一层。目标是让 One Person Lab App、原版 Codex App 和命令行 Codex 看到一致的能力生态，同时避免把项目专用 skill 装到系统级。

## 三层模型

| 层级 | 例子 | 默认安装/同步位置 | 维护原则 |
| --- | --- | --- | --- |
| OPL family domain skills | MAS、MDS、MAG、RCA | Codex plugin / family skill sync | 由各 domain 仓维护，OPL 只负责注册和同步 |
| OPL companion skills | Superpowers、officecli、officecli-docx/pptx/xlsx、morph-ppt、ui-ux-pro-max | 用户级 Codex/agent skill discovery 路径 | OPL 负责检测、安装提示、同步和修复入口 |
| Codex bundled skills | Documents、Presentations、Spreadsheets | Codex plugin cache | 只检测可用性，不复制到 `~/.codex/skills` |

MAS/MDS 内部的 `scout`、`review`、`baseline`、`experiment`、`write` 等项目专用 skill 不属于 OPL 默认系统级生态。它们应该留在 MAS/MDS 项目目录或对应 domain runtime 内部，由 MAS/MDS 自己调用。

## Superpowers 的官方安装模型

Superpowers 不是安装单个 `using-superpowers` skill。官方 Codex 安装方式是：

```bash
git clone https://github.com/obra/superpowers.git ~/.codex/superpowers
mkdir -p ~/.agents/skills
ln -s ~/.codex/superpowers/skills ~/.agents/skills/superpowers
```

安装后需要重启 Codex / OPL App，让 skill discovery 重新读取 `~/.agents/skills/superpowers`。

更新方式：

```bash
cd ~/.codex/superpowers && git pull --ff-only
```

OPL 的 `opl install` 和 `opl skill sync` 按这个模型维护 Superpowers：

- 默认 clone 到 `~/.codex/superpowers`。
- 默认创建 `~/.agents/skills/superpowers -> ~/.codex/superpowers/skills`。
- 清理旧的 `~/.codex/skills/superpowers -> .../using-superpowers` 单 skill 链接。
- 支持 `OPL_SUPERPOWERS_REPO_URL` 指向测试或镜像仓库。
- 支持 `OPL_SUPERPOWERS_DIR` 指定本地 clone 位置。

## officecli 和 Office 类 skill

OPL 把 officecli 系列作为 companion skills，因为 MAS/MAG/RCA 都可能需要 Word、PowerPoint、Excel 或 dashboard 能力。

默认检测这些用户级 skill：

- `officecli`
- `officecli-docx`
- `officecli-pptx`
- `officecli-xlsx`
- `morph-ppt`

这些 skill 当前主要来自 Skills Manager 管理的 `~/.skills-manager/skills/*`，OPL 只把它们 symlink 到 Codex 可见的 skill 目录，不接管上游内容。

## OPL App 应该怎么用这套生态

OPL App 默认应该复用 Codex 的用户级 skill discovery 路径，而不是维护一套 AionUI 私有 skill 注入逻辑。

推荐顺序：

1. 读取 Codex / agent 原生发现路径，包括 `~/.agents/skills` 和 `~/.codex/skills`。
2. 展示 OPL family domain skills 和 companion skills 的状态。
3. 在「环境管理」里提供安装、更新、修复按钮。
4. 对 Codex bundled skills 只显示可用性，不复制。
5. 对 MAS/MDS 项目专用 skill 不做系统级展示。

## 验证

```bash
opl install --skip-gui-open
opl skill sync
ls -la ~/.agents/skills/superpowers
opl system initialize
```

`opl system initialize` 中 `recommended_skills` 应显示 Superpowers ready，并在安装提示中说明官方 bundle + symlink 模型。
