# OPL 默认 Skill 生态参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_default_skill_ecosystem`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

这份文档说明 OPL App 和 `opl install` 默认维护哪些 skill，以及这些 skill 应该放在哪一层。目标是让 One Person Lab App、原版 Codex App 和命令行 Codex 看到一致的能力生态，同时避免把项目专用 skill 装到系统级。

## Currentness policy

本文冻结默认 skill 生态的 owner boundary 和读法，不冻结本机 skill 安装状态、symlink target、tool version、Codex bundled plugin cache version、Full runtime payload、远端 companion 仓库 head、用户 `CODEX_HOME` / `HOME` / `PATH`、`~/.codex/config.toml` 内容或 App 首启结果。当前推荐 companion 清单、source candidate、tool readiness、apply mode、plugin registry、generated plugin surface 和 recommended skill status 必须从 fresh `opl system initialize --json`、`opl skill companion status --json`、`opl skill companion apply --mode <ask_to_apply|managed> --json`、`opl connect skills --json`、`opl connect sync-skills --json`、`src/install-companions.ts`、`src/install-companions/catalog.ts`、`src/install-companions-parts/tools.ts`、`src/opl-skills.ts`、`src/system-installation/codex-plugin-registry.ts` 与相关测试读取。

稳定读法是：MAS/MAG/RCA/OMA 是 family domain plugin/generated surface，不是默认 companion skill mirror；OPL companion skills 是用户级或 managed profile 可同步的辅助能力；Codex bundled skills 只读可用性。`status` / `observe` 不修改用户环境，`managed` 或 App/Full managed profile 才可以 materialize symlink、tool binary 或 plugin registry。任何 package payload 存在都不等于已经写入用户级 `~/.codex/skills` 或 `.agents/skills`。

## 三层模型

| 层级 | 例子 | 默认安装/同步位置 | 维护原则 |
| --- | --- | --- | --- |
| OPL family domain skills | MAS、MAG、RCA、OPL Meta Agent | MAS/MAG/RCA 走 tracked repo plugin source + OPL-owned Codex marketplace wrapper / family plugin registry；OPL Meta Agent 走 OPL-generated Codex source + 同一 wrapper | MAS/MAG/RCA 由各 active domain-agent 仓维护 plugin metadata，OPL 只负责刷新 Codex plugin registry 和 `OPL_STATE_DIR/codex-plugin-marketplaces/*` wrapper，不复制到 `~/.codex/skills`，也不在 domain repo 写 `.agents/plugins/marketplace.json`；OPL Meta Agent 不持有 repo-local plugin wrapper，由 OPL 从 contract pack materialize generated Codex source，不作为默认 companion skill mirror |
| OPL companion 能力 | Superpowers、ui-ux-pro-max、officecli skills、officecli CLI binary、MinerU document extractor、mineru-open-api binary | 用户级 Codex/agent skill discovery 路径加受管工具 PATH | OPL 在 status 模式只检测；`opl install`、OPL App 首启、Full 随包 runtime、`system configure-codex` 或显式 managed profile 会执行安装/同步；Docker/WebUI payload 只按 image/release manifest 实证读取 |
| Codex bundled skills | Documents、Presentations、Spreadsheets | Codex plugin cache | 只检测可用性，不复制到 `~/.codex/skills` |

OPL family domain agent 默认不写入顶层 `[mcp_servers.*]` standalone server。MAS、MAG、RCA 的 Codex App 可见面统一来自 Codex plugin / family plugin registry / OPL-generated interface；OPL Meta Agent 的 Codex App 可见面来自 OPL-generated Codex surface。repo-local MCP server 只能作为 domain handler target、direct protocol adapter 或 proof lane 保留。`opl install` 和 `opl connect sync-skills` 在刷新 MAS/MAG/RCA plugin registry 时，会移除旧的 family standalone MCP server 段，并退役旧的 `~/.codex/skills/{mas,mag,rca}` 裸 mirror，保留 Sentrux、Playwright 等非 OPL MCP server 配置。

这里的 generated surface 是 Codex 可见暴露面，不是默认 companion skill sync 清单。Full runtime 可以携带 OPL Meta Agent 或其他 skill/module payload，但随包存在不等于已经写入用户级 `~/.codex/skills`；是否写入由 `opl connect sync-skills`、startup maintenance 或显式 managed companion sync 决定。

MAS Scholar Skills 采用 profile-driven 同步模型：MAS profile/overlay 决定 required/default pack，OPL Connect 只负责分发、安装、同步和发现。当前 `mas-scholar-skills` 总入口是 required/default pack；`medical-research-lit`、`medical-manuscript-writing`、`medical-manuscript-review`、`medical-figure-design`、`medical-statistical-review`、`medical-table-design`、`medical-submission-prep`、`medical-data-governance` 是默认 medical-paper professional specialist pack。MAS 的 `write`、`review`、`figure`、`data/cohort` 等 stage 主提示词留在 MAS 仓内，专业 Skill 从 MAS Scholar Skills 同步。source repo 未物化这些目录时，`opl connect skills --domain scholarskills --json` 和 `opl connect sync-skills --domain scholarskills ... --json` 必须显示 `available-but-not-materialized` 或 `source-missing`，不能把缺目录猜成已安装。Skill 包只是可同步能力源；MAS runtime 继续持有 owner gate、quality/domain truth、clinical data body/source readiness、owner receipt、typed blocker、runtime queue 与 publication/export readiness。

MDS 内部的 `scout`、`review`、`baseline`、`experiment`、`write` 等项目专用 skill 不属于 OPL 默认系统级生态。它们应该留在 MAS 控制下的项目目录或 domain runtime 内部，不升级为 OPL 默认 family skill。

## 机器入口读法

| 机器入口 | 当前职责 | 不从本文读取的动态事实 |
| --- | --- | --- |
| `src/install-companions/catalog.ts` | 定义推荐 companion skill spec，包括 Superpowers、officecli、ui-ux-pro-max、MinerU document extractor、OfficeCLI 子 skill 与 Codex bundled Office skill detection。 | 本机 ready/missing 状态、实际 source path、tool version、packaged payload 是否存在。 |
| `src/install-companions.ts` / `opl skill companion status` | 只读检测 companion skill source、target path、Superpowers profile 和 tool readiness。 | 本机安装结果、symlink 是否成功、远端 clone/pull 状态。 |
| `opl skill companion apply --mode managed` / `opl install` / `opl system configure-codex` | 在显式 managed profile 中同步 companion skill symlink、Full packaged skill payload 和 companion tools。 | 某次执行的成功/失败、具体路径、版本、remote install 输出。 |
| `src/install-companions-parts/tools.ts` | 检测或安装 `officecli` 与 `mineru-open-api` binary，并要求对应 skill payload + binary 同时可用才算相关 companion ready。 | `officecli --version`、`mineru-open-api version`、本机 PATH、`OPL_FULL_RUNTIME_HOME/bin`、remote install 输出。 |
| `src/opl-skills.ts` / `opl connect skills` / `opl connect sync-skills` | 检查 MAS/MAG/RCA tracked plugin manifest / skill source，生成 OMA Codex plugin source，并调用 Codex plugin registry。 | 当前 sibling/managed repo 是否存在、tracked plugin source path、generated plugin cache path、sync count。 |
| `src/system-installation/codex-plugin-registry.ts` | 在 `OPL_STATE_DIR/codex-plugin-marketplaces/*` 生成 OPL-owned marketplace wrapper，注册 `mas@mas-local`、`mag@mag-local`、`rca@rca-local` 和 `opl-meta-agent@opl-meta-agent-local`，并移除旧 family standalone MCP server blocks。 | 用户 config 当前内容、wrapper marketplace path 是否存在、wrapper plugin symlink target、实际移除数量。 |
| `opl system initialize` | 投影 `recommended_skills`、GUI shell、runtime/tool readiness 等初始化读面。 | 当前 recommended skill status、tool readiness、App first-run result。 |

`opl connect sync-skills --domain scholarskills --scope workspace|quest` 可由 OPL App action、MAS foreground workflow 或 CLI 直接调用，不依赖 Console。Console 只展示或投影结果；Runtime Fabric 提供通用资源底座，Connect 是其中的资源连接 / discovery 能力之一，但 Connect 的 CLI/App/runtime 调用面可单独执行。

## Superpowers profile 边界

Superpowers 不是安装单个 `using-superpowers` skill。OPL 只在显式托管模式下应用 Superpowers：

- `opl skill companion status` 只检测，不修改。
- `opl skill companion apply --mode managed --superpowers full` 才 clone 到 `~/.codex/superpowers` 并创建 `~/.agents/skills/superpowers -> ~/.codex/superpowers/skills`。
- `opl skill companion apply --mode managed --superpowers lite` 保留轻量 profile，不启用 upstream `using-superpowers`。
- 支持 `OPL_SUPERPOWERS_REPO_URL` 指向测试或镜像仓库。
- 支持 `OPL_SUPERPOWERS_DIR` 指定本地 clone 位置。
- packaged Full runtime 可提供 `skills/superpowers/skills/*`，managed Full profile 可直接 symlink 该 packaged source；payload 存在本身不代表用户级 discovery path 已改。

## officecli 和 Office 类 skill

OPL 把 officecli 作为“双组件” companion 能力，因为 MAS/MAG/RCA 都可能需要 Word、PowerPoint、Excel 或 dashboard 能力。skill payload 说明怎么用，`officecli` CLI binary 执行真实文档操作。Office 类 skill 只有 skill payload 和 `officecli --version` 同时可用时才算 ready。

当前推荐 companion 由 `buildOplRecommendedSkillSpecs()` 定义；长期文档只保留类别，不冻结某次状态：

- `officecli` skill payload + `officecli` CLI binary
- `officecli-docx` + `officecli` CLI binary
- `officecli-pptx` + `officecli` CLI binary
- `officecli-xlsx` + `officecli` CLI binary
- `mineru-document-extractor` + `mineru-open-api` binary
- `ui-ux-pro-max` skill payload
- Superpowers full/lite profile source
- Codex bundled Documents / Presentations / Spreadsheets availability

这些 skill 可以来自 Skills Manager 的 `~/.skills-manager/skills/*`、OfficeCLI / ui-ux-pro-max / MinerU source、或通过 `OPL_PACKAGED_SKILLS_ROOT` / `OPL_FULL_RUNTIME_HOME/skills` 暴露的 App Full first-install package、显式挂载 runtime 或其他 managed payload。`opl install`、`system configure-codex` 和 OPL App 首启会走 managed profile，安装或复用 `officecli` / `mineru-open-api` binary，并把 companion skill payload symlink 到 Codex 可见目录；MAS/MAG/RCA 仍走 plugin registry，不作为 companion skill 写入 `~/.codex/skills`。Full DMG 中 binary 可由 `runtime/current/bin/*` 提供；当前 WebUI Docker 镜像不能被假定为内置 OfficeCLI、MinerU 或 `/opt/opl/skills` companion payload，除非 release workflow / Dockerfile / image manifest 明确提供该 payload。

## OPL App 应该怎么用这套生态

OPL App 默认应该优先复用 Codex 的用户级 skill discovery 路径；是否修改这些路径由 profile 决定。

维护规则：

- `observe` 只读检测，不修改用户 skill 或工具生态。
- `ask_to_apply` 只生成可执行计划/按钮，等用户确认。
- `managed` 用于 `opl install`、OPL App 首启、OPL 专用 `CODEX_HOME`、`system configure-codex` 或显式挂载 packaged payload 的环境。
- 存在 `OPL_PACKAGED_SKILLS_ROOT` / `OPL_FULL_RUNTIME_HOME/skills` 时，managed profile 可把它们作为首装 skill source；是否已经 symlink 到用户级 discovery path 仍以 fresh CLI 输出和文件系统为准。
- 对 Codex bundled skills 只显示可用性，不复制。
- 对 MDS 以及其他 MAS-internal 项目专用 skill 不做系统级展示。
- 对 MAS/MAG/RCA/OMA domain app skill，只注册 plugin / generated plugin surface；不恢复旧 `~/.codex/skills/{mas,mag,rca,opl-meta-agent}` 裸 mirror、standalone family MCP server block、compat alias 或 wrapper。

## 验证

```bash
opl install --skip-gui-open
opl connect sync-skills
opl skill companion status
opl skill companion apply --mode managed --superpowers lite
opl system initialize
```

`opl system initialize` 中 `recommended_skills` 应显示当前状态；`opl skill companion status` 不应修改用户环境，`apply --mode managed` 才能改。
