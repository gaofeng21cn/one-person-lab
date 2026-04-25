[English](./opl-default-skill-ecosystem.md) | **中文**

# OPL 默认 Skill 生态参考

这份文档说明 OPL App 和 `opl install` 默认维护哪些 skill，以及这些 skill 应该放在哪一层。目标是让 One Person Lab App、原版 Codex App 和命令行 Codex 看到一致的能力生态，同时避免把项目专用 skill 装到系统级。

## 三层模型

| 层级 | 例子 | 默认安装/同步位置 | 维护原则 |
| --- | --- | --- | --- |
| OPL family domain skills | MAS、MAG、RCA | Codex plugin / family skill sync | 由各 active domain-agent 仓维护，OPL 只负责注册和同步 |
| OPL companion skills | Superpowers、officecli、officecli-docx/pptx/xlsx、ui-ux-pro-max | 用户级 Codex/agent skill discovery 路径 | OPL 负责检测、计划和显式 apply；默认不改用户全局配置 |
| Codex bundled skills | Documents、Presentations、Spreadsheets | Codex plugin cache | 只检测可用性，不复制到 `~/.codex/skills` |

MDS 内部的 `scout`、`review`、`baseline`、`experiment`、`write` 等项目专用 skill 不属于 OPL 默认系统级生态。它们应该留在 MAS 控制下的项目目录或 domain runtime 内部，不升级为 OPL 默认 family skill。

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

OPL 只在显式托管模式下按这个模型应用 Superpowers：

- `opl skill companion status` 只检测，不修改。
- `opl skill companion apply --mode managed --superpowers full` 才 clone 到 `~/.codex/superpowers` 并创建 `~/.agents/skills/superpowers -> ~/.codex/superpowers/skills`。
- `opl skill companion apply --mode managed --superpowers lite` 保留轻量 profile，不启用 upstream `using-superpowers`。
- 支持 `OPL_SUPERPOWERS_REPO_URL` 指向测试或镜像仓库。
- 支持 `OPL_SUPERPOWERS_DIR` 指定本地 clone 位置。

## officecli 和 Office 类 skill

OPL 把 officecli 系列作为 companion skills，因为 MAS/MAG/RCA 都可能需要 Word、PowerPoint、Excel 或 dashboard 能力。

默认检测这些用户级 skill：

- `officecli`
- `officecli-docx`
- `officecli-pptx`
- `officecli-xlsx`

这些 skill 当前主要来自 Skills Manager 管理的 `~/.skills-manager/skills/*`，OPL 在 `status` 中只检测；只有用户或 OPL 托管 profile 显式 apply 时，才把它们 symlink 到 Codex 可见的 skill 目录。

## OPL App 应该怎么用这套生态

OPL App 默认应该优先复用 Codex 的用户级 skill discovery 路径；是否修改这些路径由 profile 决定，而不是由 `opl install` 无条件执行。

推荐顺序：

1. `observe`：只读检测，不修改用户 skill 生态。
2. `ask_to_apply`：生成计划和按钮，等用户确认。
3. `managed`：OPL App / Docker / OPL 专用 `CODEX_HOME` 才执行推荐配置。
4. 对 Codex bundled skills 只显示可用性，不复制。
5. 对 MDS 以及其他 MAS-internal 项目专用 skill 不做系统级展示。

## 验证

```bash
opl install --skip-gui-open
opl skill sync
opl skill companion status
opl skill companion apply --mode managed --superpowers lite
opl system initialize
```

`opl system initialize` 中 `recommended_skills` 应显示当前状态；`opl skill companion status` 不应修改用户环境，`apply --mode managed` 才能改。
