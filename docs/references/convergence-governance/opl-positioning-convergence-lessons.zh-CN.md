# OPL 定位演化与收敛经验参考

状态锚点：`2026-05-07`

## 用途

这份参考材料沉淀两次仓库调研的核心经验：

- 从 commit 历史看 `OPL` 如何从 gateway / federation 蓝图，逐步收敛为 `Codex-default session runtime + explicit activation layer + family shared modules/contracts/indexes`。
- 从定位转变过程看，仓库如何防止旧入口、旧术语、旧 runtime 假设和旧 UI/API 形态反向污染当前主线。

它是第三层参考材料，不替代 `docs/status.md`、`docs/invariants.md`、`docs/decisions.md` 或机器可读合同。后续开发遇到类似“新方向出现、旧路线还在、多个入口互相污染”的情况时，先用本文作为方法参考，再回到当前核心五件套确认 live truth。

## 一、定位演化的核心判断

`OPL` 的清晰化不是一次性设计出来的，而是在多轮试验中持续回答三个问题：

1. 哪一层是 `OPL` 必须拥有的？
2. 哪一层应交给外部 runtime、GUI shell 或 domain repo？
3. 哪些历史 surface 只允许保留为兼容、审计或迁移线索？

最终形成的稳定答案是：

- `OPL` 持有 `Codex-default session/runtime`、显式 activation、family-level shared modules、shared contracts、shared indexes、安装与投影面。
- `MAS`、`MAG`、`RCA` 持有各自 domain truth、domain runtime、domain quality judgment 与 deliverable authority。
- `MDS` 是 `MAS` 的隐藏 runtime/backend companion，不升级为 OPL 顶层 domain agent。
- `Hermes-Agent` 是外部 runtime substrate / online-management gateway owner，`OPL Runtime Manager` 只做产品级 provision、profile、诊断、恢复入口、状态投影和 native helper catalog。
- GUI 由外部 `opl-aion-shell` 交付，主仓只提供 CLI-backed machine-readable surfaces、release/install surface 与 runtime truth。

这条线说明：`OPL` 不是“大一统 agent 内核”，也不是 GUI 或 API service 的别名。它是默认 Codex 会话运行时之上的家族级激活与共享合同层。

## 二、历史阶段给出的经验

### 1. 先用合同冻结边界，再让实现跟随

早期 `2026-04-05` 到 `2026-04-08` 的大量 gateway / admission / acceptance commits 证明，边界不清时先不要急着堆 runtime。先把 read-only discovery、routed action、domain admission、surface index、acceptance matrix 这类东西冻结成机器可读面，可以避免后续每个入口都重新解释 OPL 是什么。

后续转向时，这些合同也能帮助判断哪些内容还有效：路径和 schema 可以保留为 compatibility surface，但叙事主语必须退到 reference。

### 2. 试验入口可以很快，但试验结果必须被吸收或退役

`frontdesk`、LibreChat pilot、Paperclip control plane、local web pilot、Product API 等试验都曾帮助找清楚 workspace、session、progress、artifact、domain handoff 应该怎么组织。问题不在试验本身，而在试验结束后是否还继续冒充当前主线。

典型收敛动作：

- `Revert "feat: ship the opl frontdesk workbench"`：发现 workbench 会把主仓重新推成 GUI / web 产品面后，直接回退。
- `Retire LibreChat from default OPL frontdesk surfaces`：hosted shell 经验保留，默认入口不继续被 LibreChat 命名污染。
- `Retire headless Product API Web surface` 与 `fix: retire default Product API service`：本地 Product API 不再作为用户入口或 projection surface。

经验是：试验入口只要完成学习价值，就必须进入三类之一：吸收到当前主线、退到 reference/history、彻底删除。

### 3. 当一个词承载太多含义，应退休而不是继续解释

`frontdesk` 早期同时指用户入口、hosted shell、MCP surface、domain handoff、product-entry 和 local web adapter。继续补说明会让旧心智模型反复复活。

后来通过一组 commits 做了真正收敛：

- `Retire frontdesk public CLI aliases`
- `Retire legacy frontdesk management chain`
- `Remove retired frontdesk task store`
- `Remove frontdesk terminology from OPL surfaces`

经验是：术语如果已经跨越多个历史阶段并开始误导实现，不要只在文档里声明“现在不是那个意思”。更有效的是删 public alias、改当前文案、清测试覆盖，把旧词限制在 history / compatibility 语境。

### 4. 默认路径必须极窄，扩展能力必须显式进入

OPL 的默认入口最终收敛为 `Codex-default`，只有显式 domain activation 或显式 runtime switch 才离开默认语义。这解决了三个污染源：

- `Hermes-Agent` 不会被误当成默认执行器。
- `MAS/MAG/RCA` 不会被包装成 OPL-only 语义。
- GUI / ACP shell 不会反向定义 session runtime。

经验是：默认路径越窄，系统越容易长期维护。所有增强能力都应该通过显式开关、显式 skill、显式 module 或显式 domain entry 进入。

### 5. shared owner 只能持有 shared surface，不能夺取 domain truth

OPL 需要统一 family shared modules、contracts、indexes 和 activation，但如果把 domain-specific 判断也放进 OPL，就会形成第二真相源。

MAS v2 alignment 是典型例子：

- `MAS` 继续是 independent domain agent。
- `MAS` 对外只有一个 MAS domain app skill。
- `OPL` 只消费 MAS-owned entry/projection truth。
- `OPL` 不给 MAS progress、publication、quality、runtime control projection 写 ready / submission-ready / publication-ready / quality verdict。
- `MDS` 保持 MAS 隐藏 backend companion，不进入 OPL 顶层 agents。

经验是：共享层的价值是统一入口和复用合同，不是统一所有判断。凡是涉及质量裁决、审稿判断、submission readiness、publication gate、deliverable authority，都应回到 domain owner。

### 6. UI、runtime、开发编排必须分层处理

历史上容易混淆的三层是：

- 产品运行时：`Codex-default session/runtime`、workspace/session/progress/artifact。
- 用户入口：`opl` CLI、AionUI-based OPL GUI shell、WebUI / ACP-compatible shell。
- 开发编排：worktree、OMX、subagent、CI、release scripts。

`OPL` 的当前收敛方式是：

- 主仓保留 runtime truth、CLI、contracts、release/install surface。
- GUI shell 放在 `opl-aion-shell`，通过 CLI-backed surfaces 消费 OPL。
- 长跑和 online-management 由外部 `Hermes-Agent` substrate 管，OPL Runtime Manager 只投影和诊断。
- 开发 worktree / OMX / subagent 是维护方式，不进入产品语义。

经验是：当讨论“入口”“runtime”“托管”“GUI”时，先明确它属于哪一层。多数定位漂移都来自把这三层放在同一句话里处理。

## 三、防止历史定位污染的具体技巧

### 技巧 1：建立 canonical working set

把当前真相固定在少数文件中：

- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `contracts/README.md`

新增文档或修改旧文档前，先判断它是在强化这组 working set，还是应该进入 reference/history。不要让 reference 文档反向定义当前主线。

### 技巧 2：给旧路线明确生命周期标签

旧 surface 不应只写成“旧的”。应明确它属于：

- `current path`
- `compatibility surface`
- `migration bridge`
- `regression baseline`
- `reference`
- `history`
- `deleted`

例子：gateway-first 文档仍 repo-tracked，是为了保留迁移审计和历史语境；机器可读合同只应引用 `human_doc:*` 这类语义标识或真正的 contract/schema/source surface，不应把 `docs/**` 路径当成稳定接口。

### 技巧 3：删除 public alias，避免半活状态

如果旧命令还能跑，用户和 AI 都会继续把它当事实。退役必须落到命令、测试和文档三面：

- public command fail closed。
- help output 不再推荐。
- tests 删除旧 projection session surface。
- docs 只在 reference/history 说明来龙去脉。

这比“文档里说不推荐”可靠得多。

### 技巧 4：用 hard negative 写清不能做什么

好的决策记录不只写当前方案，还写禁止恢复项。

例子：

- `OPL Runtime Manager` 不得写成 scheduler、session store、memory store、domain truth owner 或 concrete executor。
- `OPL native helper` 不得替代 domain durable truth。
- `MAS` 不得恢复为 OPL-owned runtime kernel 或 standalone product release。
- GUI 不得反向定义 `workspace / session / agent / progress / artifacts` 的 canonical truth。

这些 hard negative 是防污染的主要防线。

### 技巧 5：把外部依赖压成 thin adapter

当外部系统能力很强时，最容易发生“顺手接管”。OPL 对 Hermes、native helper、GUI 的处理都采用 thin adapter：

- Hermes：外部 runtime substrate owner；OPL 只安装、pin、检查 readiness 和投影。
- Native helper：只做 probe/index/doctor 加速；不做 domain truth。
- GUI shell：只消费 CLI-backed machine-readable surfaces；不复制安装、模块管理、skill sync 或 runtime 管理逻辑。

原则是：外部依赖可以被管理和投影，但不能因此改变 OPL owner boundary。

### 技巧 6：用 owner split 审查每个新增 surface

新增任何 surface 前，先回答：

- owner 是 OPL、domain repo、GUI shell，还是外部 runtime？
- 它写入 durable truth，还是只读 projection？
- 它给 verdict，还是只给 evidence/provenance/status/routing？
- 它是默认路径，还是显式 activation？
- 它是否会让 direct Codex 调用和 OPL activation 产生不同 domain 语义？

如果回答不清楚，先不要实现。

### 技巧 7：测试机器面，不测试叙述文案

叙述文档会随着定位成熟而重写。把测试绑在 prose wording 上，会导致维护者为了过测试保留旧措辞。

更稳的验证对象是：

- JSON schema
- CLI JSON output
- module registry resolution
- command fail-closed 行为
- package manifest
- fresh install matrix
- native helper lifecycle
- line budget / structural health

`Retire prose doc assertions from family meta tests` 体现了这个方向：文档可解释 current truth，但测试应锁机器合同和行为。

进一步说，`docs/**` 默认是人读材料。脚本、合同、测试和 runtime dashboard 可以暴露稳定的 `surface_id`、`contract_ref`、`schema_ref`、`human_doc:*` 语义标识，但不应把 README 或 `docs/references/*.md` 的 repo path 当成机读约束。这样 docs 可以按活动/归档/参考层级继续重组，而不会为了不破坏脚本被迫保留旧位置。

### 技巧 8：发布通道按消费对象拆开

发布形态也会污染定位。标准 App 自动更新、Full first-install、Packages/GHCR、git checkout module update 面向不同对象，不应混成一个 release 叙事。

当前稳定边界是：

- 标准 App / updater：用户日常更新通道。
- Full first-install：首次安装资产，可带 MAS/MDS/MAG/RCA、Hermes、OfficeCLI、companion skills，但不进入 `latest*.yml`。
- Packages/GHCR：机器消费通道和后续分发目标。
- Git checkout / sibling repo：当前正式 module 更新路径。

## 四、后续开发使用清单

处理定位变化、入口重构、domain 接入或 runtime 扩展时，按这个顺序自检：

1. 先读核心五件套和对应 contract，确认当前真相。
2. 判断改动属于 current path、compatibility、migration bridge、reference/history 还是 deletion。
3. 写清 owner split：谁拥有 truth，谁只消费 projection。
4. 保持默认 Codex 路径窄；增强能力走显式 activation / switch / module / skill。
5. 如果旧词已经误导实现，优先改名、删 alias 或退役，而不是继续解释。
6. GUI 能力先落 CLI / machine-readable output，再由 GUI 调用。
7. 外部 runtime 能力先落 thin adapter，不复制 kernel。
8. 测试 machine-readable contract 与 CLI 行为，不固定叙述性文案。
9. 修改公开边界时，同步 docs、contracts 和验证。
10. 完成后检查是否有旧路线被无意重新提升到 current layer。

## 五、常见污染信号

看到以下信号时，应暂停并做边界审查：

- 文档把 `gateway / harness` 写成当前对外第一身份。
- `Hermes-Agent` 被写成 OPL 默认执行器或 OPL 私有 runtime kernel。
- GUI 文档要求 OPL 改成 GUI 内部模型，而不是消费 OPL CLI-backed surfaces。
- OPL projection 开始给 domain quality、publication、submission-ready 或 deliverable verdict。
- `MDS` 被写成 OPL 顶层 domain agent。
- 旧 `frontdesk`、`Product API`、`opl web`、8787 service 重新出现在用户入口或默认安装路径。
- 新测试固定 README / docs 的具体措辞，而不是验证合同或行为。
- 发布文案把标准 updater、Full first-install、Packages/GHCR 和 git module update 混成一个通道。

这些信号不一定意味着方向错了，但意味着需要重新确认 owner、layer 和 lifecycle。
