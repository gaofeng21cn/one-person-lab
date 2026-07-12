# OPL 新机器 Codex 全家桶安装入口

Owner: `One Person Lab`
Purpose: `new_machine_codex_opl_family_bootstrap_entry`
State: `support_reference`
Machine boundary: 本文是人读 bootstrap runbook。可执行真相归 `install.sh`、One Person Lab App release asset、`opl` CLI 输出、Codex plugin registry、domain repo installer、App release evidence 与 repo-native 验证命令。

本文是新机器上让 Codex 一句话安装配置 OPL 智能体运行环境的 canonical GitHub 入口。它覆盖 OPL Framework、One Person Lab App、MAS/MAG/RCA/OMA/Book Forge 智能体可见面、OPL Flow 工作流 profile、OPL Doc 文档治理插件，以及推荐 companion skills / tools 的同步边界。

## 复制给新机器 Codex

```text
请按 One Person Lab 官方新机器指南，帮我完成这台机器的 OPL 智能体运行环境和 Codex 工作流全家桶安装配置。

Source of truth:
- https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/references/current-support/opl-new-machine-codex-bootstrap.md

目标:
1. 先读取这份指南，再检查当前机器的 macOS/Linux 环境、GitHub 可访问性、Codex CLI/Codex 配置、~/.codex、~/.agents/plugins/marketplace.json、~/plugins、~/.local/bin、OPL 相关 checkout 与已有安装状态。
2. 安装或刷新 One Person Lab Framework CLI，并验证 `opl help --text`、`opl system initialize --json` 和必要的 runtime readiness。
3. 安装或打开 One Person Lab App；macOS Apple Silicon 首次安装优先使用最新 Full DMG，命令行路径使用 App 仓库 one-shot installer。
4. 运行 `opl connect sync-skills`，让 MAS/MAG/RCA/OMA/Book Forge 作为 repo-local full-copy Codex plugin carriers 可见。
5. 通过 OPL package lifecycle 安装并验证 OPL Flow，让 Codex 获得最小用户级 AGENTS.md/TASTE.md、opl-flow 插件、推荐依赖和旧工作流迁移回执。
6. 安装并验证 OPL Doc，让 Codex 获得 opl-doc canonical skill、opl-doc-governance 兼容 skill 和 opl-doc-doctor。
7. 检查推荐 companion skills/tools 的状态；只按 OPL CLI/App/Full payload 的受管路径安装或同步，不手工制造第二真相源。
8. 完成后报告安装路径、关键命令输出摘要、验证结果、需要我手动处理的权限/密钥/GitHub/macOS 系统阻塞。

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
| Framework / runtime | `one-person-lab` | `opl` CLI、初始化、Connect 模块发现、runtime/provider/readiness、`opl connect sync-skills`、App 可消费 state/action surface |
| Product / first install | `one-person-lab-app` | Desktop App、Full first-install DMG、one-shot App installer、release gates、首启用户路径 |
| Domain agents | MAS/MAG/RCA/OMA default visible surfaces; Book Forge explicit repo until default admission | domain truth、action/stage semantics、quality/export/artifact authority、domain skill metadata |
| Codex workflow | `opl-flow` | 最小 `AGENTS.md`/`TASTE.md`、dependency/conflict/model policy；普通开发保持 model-native |
| Docs governance | `opl-doc` | OPL-native 文档生命周期治理 skill、`opl-doc-doctor`、`opl-doc-governance` 历史转发入口 |
| Recommended skills/tools | OPL Flow policy + OPL Framework executor | OfficeCLI、MinerU、UI/UX 等依赖闭包；Superpowers/Ponytail/CodexCont 属迁移冲突 |

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

### 4. 同步 OPL 智能体可见面

```bash
opl connect sync-skills
opl connect skills --json
```

稳定边界：

- MAS、MAG、RCA 走 plugin-packaged domain skill entries。
- MAS/MAG/RCA/OMA/Book Forge 都走 repo-local full-copy Codex plugin carrier；`agent/primary_skill/SKILL.md` 是 canonical rich source，`plugins/<plugin_name>/skills/<plugin_name>/SKILL.md` 是安装 carrier。
- `opl connect sync-skills` 是统一同步入口；旧 `opl skill sync` 已退役并 fail closed 到 Connect 替代入口。
- MAS/MAG/RCA 不应同时作为重复裸 skill 出现在 `~/.codex/skills/{mas,mag,rca}`。

### 5. 安装 OPL Flow

```bash
opl packages install opl-flow
opl packages update opl-flow
```

这一步由 Framework 解析 OPL Flow policy，安装在线推荐依赖、归档明确冲突的旧工作流、注册插件、同步 profile/model policy，并写入可回滚 receipt。出现用户 AGENTS.md 语义冲突时，命令返回 merge packet；完成合并后使用 `opl packages profile-apply opl-flow --packet <path>`。只有开发 OPL Flow checkout 时才使用仓内 `scripts/install_local_plugin.py` 做 local-source staging/verify，它不是普通用户安装入口。

### 6. 安装 OPL Doc

```bash
git clone https://github.com/gaofeng21cn/opl-doc.git
cd opl-doc
python3 scripts/install_local_plugin.py
python3 scripts/install_local_plugin.py --verify-only
```

这一步安装 `opl-doc` canonical skill、`opl-doc-governance` 兼容 skill 和 `opl-doc-doctor`。

### 7. 检查 companion skills/tools

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
opl connect sync-skills
opl packages install opl-flow
python3 <opl-doc-checkout>/scripts/install_local_plugin.py --verify-only
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
- MAS 和 RCA 可以作为 managed domain modules 安装，并通过 `opl connect sync-skills --domain mas --domain rca` 注册为 Codex plugin。
- `~/.codex/config.toml` 出现 `med-autoscience@med-autoscience-local` 与 `redcube-ai@redcube-ai-local` plugin 配置。
- 不生成重复的 `~/.codex/skills/{mas,rca}` 裸 skill mirror。
- `opl packages install opl-flow` 可在干净 HOME 中安装插件与最小 profile，解析依赖闭包并生成 package/migration receipt。

这个 smoke 不覆盖 macOS Full DMG、桌面 App 首启、Codex API key 配置、在线 runtime provider、GitHub 权限、推荐 companion skills 全量安装或 OPL Doc 的最终使用质量。需要连带验证 OPL Doc 安装时，可以运行：

```bash
npm run new-machine:codex-bootstrap:docker-smoke -- --include-opl-doc
```

## 常见阻塞

- GitHub 无法访问：先处理网络、DNS、代理或 GitHub auth，再继续 clone/install。
- macOS Command Line Tools 未安装：按系统提示安装，安装完成后重跑 installer 或 `opl system initialize --json`。
- Codex CLI 或 Codex 配置缺失：先让 OPL/App 初始化 core launch gate；涉及密钥时由用户手动提供。
- managed checkout dirty/ahead/diverged：停止自动覆盖，报告路径和状态，由用户决定是否清理、rebase、push 或改用新路径。
- plugin registry 更新后 Codex 不显示新 skill：重启 Codex 或刷新 plugin/skill discovery，再复查 `~/.codex/config.toml` 的 family marketplace `source` 是否指向 `OPL_STATE_DIR/codex-plugin-marketplaces/<marketplace-id>`，以及该 wrapper 下 `.agents/plugins/marketplace.json` 和 `plugins/<plugin-id>/.codex-plugin/plugin.json` / `skills/<plugin-id>/SKILL.md` 是否存在并使用 canonical id；不要把 MAS/MAG/RCA 开发 checkout 下的 `.agents/plugins/marketplace.json` 当作当前 OPL/App truth。
