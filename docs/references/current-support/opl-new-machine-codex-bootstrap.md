# OPL 新机器 Codex 全家桶安装入口

Owner: `One Person Lab`
Purpose: `new_machine_codex_opl_family_bootstrap_entry`
State: `support_reference`
Machine boundary: 本文是人读 bootstrap runbook。可执行真相归 `install.sh`、One Person Lab App release asset、`opl` CLI 输出、Codex plugin registry、domain repo installer、App release evidence 与 repo-native 验证命令。

本文是新机器上让 Codex 一句话安装配置 OPL 的 canonical GitHub 入口。用户生命周期只包含 `OPL Base`、`OPL App`、`OPL Packages`；MAS/MAG/RCA/OMA/Book Forge 与 OPL Flow 都通过 Packages 管理，不再各自暴露安装器或 updater。

## 复制给新机器 Codex

```text
请按 One Person Lab 官方新机器指南，帮我完成这台机器的 OPL 智能体运行环境和 Codex 工作流全家桶安装配置。

Source of truth:
- https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/references/current-support/opl-new-machine-codex-bootstrap.md

目标:
1. 先读取这份指南，再检查当前机器的 macOS/Linux 环境、GitHub 可访问性、Codex CLI/Codex 配置、~/.codex、~/.agents/plugins/marketplace.json、~/plugins、~/.local/bin、OPL 相关 checkout 与已有安装状态。
2. 安装或刷新 One Person Lab Framework CLI，并验证 `opl help --text`、`opl system initialize --json` 和必要的 runtime readiness。
3. 安装或打开 One Person Lab App；macOS Apple Silicon 首次安装优先使用最新 Full DMG，命令行路径使用 App 仓库 one-shot installer。
4. 通过 `opl packages` 安装或刷新需要的官方智能体；通过同一入口安装 OPL Flow。
5. 检查推荐 companion skills/tools 的状态；这些是 Base 的依赖/集成状态，不是第四类用户模块。
6. 完成后报告 Base、App、Packages 的安装路径、关键命令输出摘要、验证结果和需要我手动处理的权限/密钥/GitHub/macOS 系统阻塞。

约束:
- 不覆盖我已有的用户配置；安装器会替换用户级 profile 时，先说明备份位置。
- 不把 MAS/MAG/RCA 镜像成重复的 ~/.codex/skills/{mas,mag,rca} 裸 skill。
- 不把 Codex plugin 当成第二套语义；domain skill/action/stage metadata 仍由 domain repo 和 OPL Framework 持有。
- 不用 developer checkout 静默覆盖 managed runtime；只有我明确要求开发模式时才使用本地工作区 checkout。
- 遇到鉴权、网络、macOS 权限、GitHub 登录、系统安装权限或安全密钥阻塞时，停止并给出精确恢复步骤。
```

## Owner 分层

| 层 | Canonical owner | 负责内容 |
| --- | --- | --- |
| OPL Base | `one-person-lab` | `opl` CLI、Temporal-backed runtime/provider、初始化、package lifecycle、readiness 与 App 可消费 state/action surface |
| OPL App | `one-person-lab-app` | 可选 Desktop GUI、Base/Packages 管理界面、Full first-install DMG、release gates 与首启用户路径 |
| OPL Packages | package manifest + owning repo | MAS/MAG/RCA/OMA/Book Forge、OPL Flow 及其 plugin/skill/profile 投影；domain truth 仍归各 domain owner |
| Base dependencies | OPL Base | OfficeCLI、MinerU、native helpers 等依赖/集成状态，不作为独立用户生命周期对象 |
| Developer support | owning source repo | `opl-doc` 等开发治理工具只服务源码维护，不进入普通用户必装清单 |

## 推荐执行顺序

### 1. 安装或刷新 OPL Framework

命令行一键路径：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab-app/main/install.sh | bash
```

完整命令行路径：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

如果只做 framework source development：

```bash
git clone https://github.com/gaofeng21cn/one-person-lab.git
cd one-person-lab
npm install
npm link
```

#### Codex 安装默认值的 OPL Flow 投影

`contracts/opl-framework/codex-default-profile.json` 从 OPL Flow workflow policy 生成模型与推理推荐；Framework 保持 `config.toml` 唯一写入者，provider endpoint 仍由 Base 管理，用户固定选择优先。开发或发布同步阶段使用显式 workflow policy path 生成：

```bash
npm run codex:export-default-profile -- \
  --workflow-policy /absolute/path/to/opl-flow/contracts/workflow-policy.json
```

默认模型和推理档的唯一人工维护入口是 OPL Flow `contracts/workflow-policy.json#codex_model_policy`。Framework 的 `codex-default-profile.json` 与 App 的模型 UI 都是该策略的投影，不得维护第二套默认值；provider 与 base URL 仍由 OPL Base 管理。`bootstrapLocalCodexDefaults` 消费 Framework 内生成结果，并继续尊重显式用户选择、用户固定模型/推理档位和已有非 OPL Codex 配置。

### 2. 安装 One Person Lab App

macOS Apple Silicon 首次安装优先使用最新 Full first-install DMG：

```text
https://github.com/gaofeng21cn/one-person-lab-app/releases/latest
One-Person-Lab-Full-<version>-mac-arm64.dmg
```

Full DMG 是 clean-machine 产品路径。它包含桌面 App、OPL Framework runtime payload、Foundry Agents、当前 runtime payload、`officecli` 和推荐 skill payload；Book Forge 是否进入默认 App 首屏仍由 App-owned product decision 和 release evidence 决定。

### 3. 验证 OPL CLI 与初始化状态

```bash
opl help --text
opl connect modules
opl system initialize --json
```

`ready_to_launch` 只表示 core launch gate 到位。domain modules、family runtime provider、recommended skills、native helpers、repo sync、CLT 和 ecosystem updates 仍可能是 Full readiness 或后台维护项。

### 4. 安装和管理 OPL Packages

```bash
opl packages list --json
opl packages install mas --json
opl packages install rca --json
opl packages install opl-flow --json
opl packages status --package-id mas --scope workspace --target-workspace /path/to/study --json
opl packages status --package-id rca --json
opl packages update rca --json
```

稳定边界：

- 智能体和 OPL Flow 都是 Package；不再 clone repo 后运行各自 installer。
- `opl connect sync-skills` 只保留为 package/materialized module 的内部兼容投影，不是 MAS/ScholarSkills 的用户安装、激活、修复或 currentness 入口。
- OPL Flow 的 plugin、`AGENTS.md` 和 `TASTE.md` 由同一 package transaction 管理。已有 `AGENTS.md` 时不覆盖，而是返回 merge packet 和 `opl packages profile apply` 路由。
- `opl packages install mas` 自动安装兼容的 `mas-scholar-skills` closure。workspace bind/activate、domain launch 或 MAS quest owner 每次进入 use boundary 都对账 MAS latest-stable root 与兼容 provider，并从 provider manifest 动态物化当前发布包声明的全部 35 Skills；11 core + 8 modules 只是 readiness floor。managed projection 缺失或漂移自动恢复，用户不需要为每个论文目录运行 repair。
- MAS/MAG/RCA 不应同时作为重复裸 skill 出现在 `~/.codex/skills/{mas,mag,rca}`。
- `opl-doc` 是开发者 support repo，不属于普通用户的 Base/App/Packages 安装清单；源码维护时才使用其 repo-native developer installer。

### 5. 检查 Base 依赖与集成

```bash
opl skill companion status --json
opl system initialize --json
```

需要同步时，优先使用 OPL CLI/App/Full payload 的受管路径。不要手工把 domain plugin skills 复制成裸 skill。

## 完成标准

Codex 报告完成前，至少应给出这些新鲜证据：

```bash
opl help --text
opl system initialize --json
opl packages list --json
opl packages status --package-id opl-flow --json
```

App 路径的完成证据可以是 App 首启达到 Core readiness，也可以是首启页面或 installer 输出中的明确 blocker。Codex 不应把 Full readiness、domain ready、production ready、artifact authority、publication/fundability/visual quality verdict 或 owner receipt 混同为安装完成。

## Headless Docker smoke

如果当前机器可以运行 Docker，可以先用干净 Linux 容器验证命令行 bootstrap 链路：

```bash
git clone https://github.com/gaofeng21cn/one-person-lab.git
cd one-person-lab
npm run new-machine:codex-bootstrap:docker-smoke
```

该 smoke 会从 GitHub 重新拉取安装入口，验证：

- OPL CLI 可安装并响应 `opl help --text` / `opl system initialize --json`。
- MAS 和 RCA 可以作为 managed domain modules 安装，并投影为 Codex plugin。
- `~/.codex/config.toml` 出现 `med-autoscience@med-autoscience-local` 与 `redcube-ai@redcube-ai-local` plugin 配置。
- 不生成重复的 `~/.codex/skills/{mas,rca}` 裸 skill mirror。
- `opl packages install opl-flow` 可在干净 HOME 中安装插件、`AGENTS.md` 与 `TASTE.md`，解析依赖/冲突/retirement policy，并返回可回滚的 package/profile lifecycle receipt。

这个 smoke 不覆盖 macOS Full DMG、桌面 App 首启、Codex API key 配置、在线 runtime provider、GitHub 权限或推荐 Base dependencies 全量安装。

## 常见阻塞

- GitHub 无法访问：先处理网络、DNS、代理或 GitHub auth，再继续 clone/install。
- macOS Command Line Tools 未安装：按系统提示安装，安装完成后重跑 installer 或 `opl system initialize --json`。
- Codex CLI 或 Codex 配置缺失：先让 OPL/App 初始化 core launch gate；涉及密钥时由用户手动提供。
- managed checkout dirty/ahead/diverged：停止自动覆盖，报告路径和状态，由用户决定是否清理、rebase、push 或改用新路径。
- plugin registry 更新后 Codex 不显示新 skill：重启 Codex 或刷新 plugin/skill discovery，再复查 `~/.codex/config.toml` 的 family marketplace `source` 是否指向 `OPL_STATE_DIR/codex-plugin-marketplaces/<marketplace-id>`，以及该 wrapper 下 `.agents/plugins/marketplace.json` 和 `plugins/<plugin-id>/.codex-plugin/plugin.json` / `skills/<plugin-id>/SKILL.md` 是否存在并使用 canonical id；不要把 MAS/MAG/RCA 开发 checkout 下的 `.agents/plugins/marketplace.json` 当作当前 OPL/App truth。
