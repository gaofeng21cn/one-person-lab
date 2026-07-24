# OPL Package 平台组合迁移计划

Owner: `One Person Lab Framework + One Person Lab App`
Purpose: `opl_package_platform_composition_migration_support`
State: `planned`
Status: `review_ready`
Decision date: `2026-07-24`
Machine boundary: 本文是
[`current-state-vs-ideal-gap.md`](./current-state-vs-ideal-gap.md) 下的迁移支撑计划，
不是第二 backlog，也不构成已实现声明。当前机器真相继续归 contracts、source、tests、
平台 inventory、fresh CLI/App readback、release evidence 和 domain owner evidence。

## 结论

可以在功能不降级的前提下实现以下生态形态：

```text
OPL Base    ≈ R
OPL App     ≈ RStudio，可替换 GUI / 部署载体
OPL Package ≈ R Package
```

目标不是删除 Package 这个生态对象，而是删除 OPL 自研 Package Manager 的重复能力。
标准智能体只是 `kind=agent` 的普通 OPL Package；MAS 对 ScholarSkills 的依赖仍是
required dependency，但只检查“是否存在且可调用”。每个 first-party Package owner 在
独立 GHCR repository 发布完整官方 runtime，并独立推进自己的 `latest-stable`；OPL Base
只保留薄 OCI/native carrier adapter、动态发现、fresh installed 聚合、运行聚合和 App
投影。

Package identity、carrier 和 executor 必须拆开：

```text
OPL Package = executor-neutral identity + capabilities + presence dependencies
Carrier     = OCI / Codex Plugin Manager / Git / local / offline platform adapter
Executor    = Codex CLI / Claude Code / Hermes Agent / future executor
```

Codex Plugin Manager 是首个 carrier adapter，只管理 Codex plugin/config/cache；它不是
Package identity、installed truth 或生态 authority。完整 Package runtime 不会被仅
Plugin 安装取代。切换 executor 只刷新 route readiness，不重装 Package，也不丢
Settings/Home preference、required dependency presence、Work Item 或 typed view。

目标态遵循七条设计规则：

1. 自由组合优先：新增 Package 不修改 Framework 固定数组，也不要求 Base、App 或其他
   Package 同步发版。
2. 平台能力优先：平台已经提供 install/list/update/remove 时，OPL 不再复制 resolver、
   lock、payload、LKG、receipt、materializer 或 transaction engine。
3. 依赖存在即可：`requires` 只声明 Package id；不声明或比较 SemVer range、ABI range、
   exact digest 或 content lock。缺 required dependency 时先调用平台 ensure；仍不可用才
   把当前 Package 标记为 unavailable。
4. 兼容责任归 owner：稳定 Package/capability/entrypoint identity 只允许向后兼容扩展；
   breaking interface 发布新 identity，或由 owner 保留兼容 adapter。旧 identity 只有在
   no-active-consumer proof 后才能删除，不引入中央版本 resolver。
5. 状态按 owner 分层：平台回答“装了什么、能否更新”；Agent 回答“有哪些业务 Work
   Item”；Temporal 回答“执行到哪里”；App 只负责组合和展示。
6. 发布与组合分离：GHCR 保存每个 owner 的完整官方 runtime 和独立
   `latest-stable`；共享 manifest 只做 Full/offline/integration/QA 快照，不定义普通
   currentness。
7. 物理状态与 route 分离：某 executor adapter 缺失只局部降级该 route；只有所有真实
   carrier 都无法读取完整 runtime bytes 时，Package 才报告 `physical_unavailable`。

## 最小对象模型

目标 descriptor 只保留下列可组合字段；字段形状在兼容桥阶段以最小 consumer proof
确定，不能先扩成新的 central schema 平台：

| 字段 | 作用 |
| --- | --- |
| `id` | 跨 carrier 稳定的 Package identity。 |
| `kind` | Package role，例如 `agent`、`capability_bundle`、`workflow`；`agent` 不获得第二套 lifecycle。 |
| `requires` | required Package ids；只检查 presence/callability。 |
| `optional` | 可增强但缺失不阻断的 Package ids。 |
| `entrypoints` | CLI、Plugin、Skill、Tool、service 或其他可调用 capability refs；它们不是独立安装对象。 |
| `executor_adapters` | 可选 executor-specific route refs；只描述 callability，不承载 Package identity 或 installed truth。 |
| `home` | 可选 Home shortcut metadata；是否 pin/hide/排序归 App preference。 |
| `runtime` | Agent 的 Work Item inventory、launch 和 execution lookup 接口 refs。 |
| `custom_views` | 可选 typed data-view descriptors，不携带可执行任意 UI。 |

不进入普通 Package descriptor 或运行门禁：

- Package version range、Base/Capability ABI range、exact digest 和 content lock。
- OPL-owned installed lock、dependency closure lock、LKG 和 generation pointer。
- OPL-owned payload、materialization scope、activation transaction 和 lifecycle receipt。
- Framework 固定 Package、Agent、Plugin、Module 或“官方七包”清单。
- App、Shell 或 Framework 对 Codex Plugin/Git/platform inventory 的镜像账本。
- Codex plugin id、marketplace、Codex home/path、config/cache 或 executor version matrix。

release 构建 manifest、checksum、SBOM/attestation，Temporal Worker Versioning，以及
domain artifact/evidence digest 继续保留；它们各自证明 release bytes、durable worker
兼容或 domain evidence，不得反向变成 Package 安装/启动 lock。

## Owner 分工

| Owner | Planned responsibility | 明确不拥有 |
| --- | --- | --- |
| Package owner | executor-neutral descriptor、完整 runtime、独立 GHCR repository/`latest-stable`、entrypoints、required/optional ids、稳定 identity 的兼容演进、domain truth、业务接口。 | Base/App 版本、共享 currentness、其他 Package 发布节奏。 |
| Carrier platform | 自己承载的完整 Package bytes、install/list/update/remove、platform source/currentness 和平台安全校验。 | OPL Package identity、其他 carrier installed truth、executor route、domain truth。 |
| Codex Plugin Manager | Codex plugin/config/cache 的安装和投影；作为首个 carrier adapter 提供 native readback。 | Package identity、生态 registry、跨 carrier installed truth、完整 runtime 的替代品。 |
| Executor adapter | 把 installed Package capability 暴露给一个 executor，并返回该 route 的 callability。 | Package 安装、用户偏好、Work Item、typed view、其他 executor route。 |
| OPL Base | 薄 OCI download/install/update adapter、native carrier discovery、carrier-neutral installed aggregation、presence/callability、executor route readiness、Agent Work Item 与 Temporal execution 聚合、typed custom-view proxy。 | 自研 resolver/lock/payload/LKG/receipt/materializer、Package bytes 镜像、starter profile、GUI renderer。 |
| OPL App | starter/default profile、首次安装和显式恢复体验、Settings、Home preference、Runtime 与 typed-view renderer。 | Package 物理生命周期、固定 Agent registry、domain truth、Temporal history。 |
| Agent | Work Item inventory、业务状态和自定义 typed data view，例如 MAS 科研路线。 | 通用 execution 状态、App GUI、Package currentness。 |
| Temporal | Workflow/Activity execution、retry、history、Worker Versioning。 | Package 安装状态、业务进度语义、科研路线。 |

## 功能等价合同

以下全部闭合前，不得删除现有 Package lifecycle：

| 用户能力 | Planned implementation | Terminal proof |
| --- | --- | --- |
| Standard/Full 自动安装必要官方 Agent | App-owned starter profile 在首次安装调用 Base `ensure`；Full 只增加离线 seed。 | 两种 fresh install 都得到相同 installed profile；Full 无第二 truth。 |
| 用户删除后保持删除 | 首次初始化完成后，maintenance 只枚举并更新仍安装项；只有用户显式“恢复官方配置”才再次 ensure starter profile。 | remove 后跨重启/daily maintenance 不重装；显式 restore 可恢复。 |
| MAS required dependency | MAS descriptor 声明 `requires: [mas-scholar-skills]`；ensure/launch 只检查平台 presence 和 entrypoint callability。 | 空白环境安装 MAS 自动补 ScholarSkills；无版本/ABI/lock 比较。 |
| 静默更新 | 平台 adapter 对每个已安装 Package 独立 update；失败只影响该 Package。 | 单包更新成功；另一个失败不连坐 Base/App/其他 Package。 |
| Settings 状态 | Base 聚合平台 installed/current/update/error；App 渲染统一状态。 | fresh platform readback 与 Settings 一致，无镜像 registry。 |
| Home shortcut | descriptor 提供候选 metadata；App 保存 pin/hide/排序 preference。 | 更新/换 carrier 后 preference 保留；新增 Agent 无 Framework 改码。 |
| Runtime 全部 Agent | Base 动态发现 `kind=agent` descriptor 并调用 Work Item inventory；Temporal 状态按 execution id 合并。 | 新 Agent 安装后自动出现，无固定 registry 修改。 |
| MAS 科研路线 | MAS 提供 typed data view；Base 只校验和代理；App 使用受控 renderer。 | 路线可见；未知 view 安全降级，不执行 Package 提供的任意 UI 代码。 |
| Developer/local source | 平台 source/currentness 为真相；后台 maintenance 不覆盖显式 local checkout。 | local source 更新/删除行为符合平台原生策略，无 source mismatch 假警报。 |
| GHCR 独立发布 | 每个 owner 发布完整 Package runtime，并独立推进自己的 `latest-stable`。 | 一个 Package 晋升不重建或阻塞 Base/App/其他 Package；匿名 pull 得到该 owner 的完整 runtime。 |
| Full/offline snapshot | `one-person-lab-manifest` 只记录一次已选组合；普通 updater 不消费它判断 latest。 | shared manifest 落后或缺失不阻塞单包在线更新；Full/offline/integration/QA 仍可复现选定组合。 |
| executor 切换 | installed/callable 与 executor route readiness 分开。 | Codex 切到真实非 Codex/中性 adapter 后 Package、偏好、任务、依赖和 typed views 保留，仅 route 状态变化。 |
| carrier 消失 | Base 只相信 native carrier fresh readback。 | 唯一物理 carrier 被移除后报告 `physical_unavailable`；descriptor/App cache 不伪造 installed。 |

`installed/current/update/error` 中的 `current` 只表示平台当前安装项，不表示 OPL
比较出的“生态最新版”。无版本平台可以只返回 `installed/healthy/unknown_update`；
OPL 不为填满 UI 字段而重建版本解析器。

## 迁移阶段

### P0.1 冻结复杂性并取得 carrier proof

Owner: Framework

- 禁止新增 Package resolver、lock、payload、LKG、receipt、materializer、scope activation
  和 fixed registry 功能。
- 对 owner GHCR OCI、Codex Plugin Manager、Git/local path、Full offline seed 的真实能力
  做 fresh inventory；逐项区分完整 Package runtime、Codex plugin/config/cache 投影与
  executor route，只选择实际需要的 carrier adapters。
- 证明每个 first-party Package 的 GHCR repository 能独立提供完整 runtime 和 owner
  `latest-stable`；共享 `one-person-lab-manifest` 不再参与普通 currentness。
- 在空白和已有安装环境证明平台能完成 install/list/update/remove，并记录无法由平台提供
  的最小差距。不能用 unit test 或模拟 receipt 代替实际 readback。

Exit gate: owner OCI 与 developer/local carrier 完成全生命周期 readback；至少一个
Codex plugin projection 与完整 Package runtime 的差异被实测；差距表证明留下的每个 Base
adapter 都有真实 consumer。

### P0.2 发布最小 descriptor 与 dual-read 兼容桥

Owner: Framework + Package owners

- Package owners 发布最小 descriptor；Standard Agent 使用 `kind=agent`，MAS 声明
  ScholarSkills required presence dependency。
- Package owner 证明稳定 identity 的旧 consumer 在静默更新后仍可调用；breaking
  interface 使用新 identity 或 owner-side adapter，不向 Framework 增加版本求解。
- Base 先从所有 native carrier fresh readback 聚合 installed descriptors；缺 descriptor
  时只读旧 Package manifest 并投影为同一内部 shape。dual-read 不能双写，也不能让旧
  lock、Codex plugin cache 或 App metadata 赢过 native carrier inventory。
- 为 `entrypoints/executor_adapters/runtime/custom_views` 增加最小安全校验；不引入版本
  和 digest gate。installed/callable 与 route readiness 分开，完整 bytes 缺失时返回
  `physical_unavailable`。
- Codex adapter 将 plugin id、marketplace、home/path、config/cache 和 manifest shape
  封装在 adapter 内；通用 projection 不暴露这些字段。
- 现有 `opl packages ...` 在迁移期只作为 compatibility adapter。新薄操作的最终 CLI
  名称必须在真实 App/CLI consumer 对齐后确定，本计划不预造 bootstrap 命令。

Exit gate: 新旧 descriptor 产生相同 App 关键字段；平台安装的新 Agent 无需固定 registry
即可被发现；稳定 identity 的旧 consumer 在更新后仍可调用；唯一物理 carrier 移除时
正确报告 `physical_unavailable`；旧数据仍可读。

### P0.3 App starter profile 与 Standard/Full 收敛

Owner: App

- starter/default profile 从 Framework 固定七包移到 App product truth，可由发行版、用户
  和部署载体替换。
- Standard 和 Full 只在首次安装 ensure 必要官方 Agent；Full 仅提供 offline seed bytes，
  安装后仍由同一平台 inventory 定义 installed truth。
- 记录一次 `profile_initialization_complete` 产品状态。日常启动/maintenance 不能再次
  ensure 完整 starter profile，只更新当前 installed set；用户显式恢复才允许重跑 ensure。
- App/Shell 不保存 Package schema、dependency list、resolver state 或 currentness 镜像。

Exit gate: Standard/Full fresh install、显式 restore、删除后跨重启不回装、离线 seed 后在线
更新四条路径均有 terminal UI + platform readback。

### P0.4 独立静默更新

Owner: Framework thin adapter + carrier platform

- maintenance 先从平台枚举 installed set，再逐项调用平台 update；不读取 starter profile
  作为更新清单。
- 普通 first-party 更新逐包读取 owner GHCR `latest-stable`，不读取 shared manifest
  决定 currentness；Package owner 的 publish/promote 不 dispatch Base/App/其他 owners。
- required dependency 只在 ensure 或 Package 使用边界检查 presence/callability；缺失时
  调平台 ensure，不做版本解析。
- 每项更新单独形成结果；失败隔离，不能触发 Base/App/未变化 Package 重建或发布。
- source 为 developer/local/manual 时遵循平台原生 update policy；OPL 不静默覆盖。

Exit gate: 单 Package GHCR publish -> owner `latest-stable` -> update -> fresh installed
readback、失败隔离、删除不回装、shared manifest 不参与和 local source 保护全部通过。

### P1.1 动态 Runtime 与高级 Agent 视图

Owner: Framework runtime + Agent owners + App

- Base 动态发现全部 `kind=agent` 的 installed descriptors。
- Agent runtime 接口返回业务 Work Item inventory 和业务状态；Temporal execution 查询只
  绑定 workflow/run id，不能推断科研进度。
- Runtime 页面按 Agent -> Work Item -> execution 聚合；App 不枚举 MAS/MAG/RCA 私有逻辑。
- `custom_views` 只允许注册过的 typed data shape + App renderer。MAS 科研路线是首个证明；
  未知 type 显示通用 fallback，不加载 Package 自带的任意 renderer/script。
- Package/Agent discovery 只看 carrier-neutral installed aggregation；Codex plugin
  inventory 或 selected executor 不能决定 Package 是否出现在 Settings/Home/Runtime。
- 为同一测试 Package 提供一个真实非 Codex executor adapter 或 executor-neutral local
  adapter；切换 route 后 Work Item、依赖、偏好和 typed views 保持不变。

Exit gate: 新测试 Agent 零 Framework registry 变更进入 Runtime；MAS route + Temporal
execution 同屏且 truth owner 分离；未知 view 安全降级；非 Codex/中性 adapter 有 fresh
callable readback，executor 切换不触发 Package reinstall。

### P1.2 删除重复权威和旧数据面

Owner: Framework + App/Shell，按精确写集串行吸收

- 删除 Framework 固定 Package/Agent/Plugin/Module registries 和固定七包 Release Set 门禁。
- 删除 App/Shell 复制的 Package schema、fixtures、validators、状态机和 source currentness。
- 将旧 lock/receipt/LKG/payload 设为只读迁移输入；完成 installed set 和 Home preference
  迁移后停止写入，再证明无 active caller。
- 把 18 个旧公开子命令收缩为平台薄 adapter 需要的 ensure/list/update/remove/health；
  compatibility tombstone 只给明确替代入口。
- 删除 Package Manager transaction engine、resolver、materializer、scope activation 和
  package-specific durable intent。历史 release/provenance receipt 可归档读取，不能继续
  驱动 currentness。
- 删除通用 projection 中 Codex-specific plugin id、marketplace、home/path、config/cache、
  manifest shape 和 selected-executor installed 推断；仅 Codex adapter 内可保留真实需要字段。
- 普通 update/currentness 不再读取 `one-person-lab-manifest:latest-stable` 后，删除对应
  consumer；Full/offline/integration/QA snapshot producer/consumer 保留。

Exit gate: fresh install、upgrade、remove、restore、daily maintenance、Runtime、MAS route、
Full offline、developer source 全矩阵通过；旧数据稳定不再变化；CodeGraph/字面调用审计
证明无 active caller；旧 manager 物理删除后同一矩阵再次通过；真实非 Codex/中性 adapter
proof 通过且旧通用 Codex 字段 consumer 清零。

## Durable 轻量方案的取舍

2026-07-23 的 “Package Durable 轻量架构” 调研与本计划相关。它正确识别了 user intent、
installed inventory、crash recovery 和 App 状态需要清晰 owner；这些需求已分别落到 App
profile state、平台 inventory 和平台自身 mutation guarantee。

该方案建议的 OPL durable intent、desired/observed ledger、transaction record、installed
lock、receipt 或 reconciliation engine 不再作为目标。即使比旧 manager 更薄，它仍会在
平台 Package Manager 之外建立第二套状态机，增加恢复、迁移和 currentness 的维护成本。
本决策 supersede 该实现方向；只有平台 fresh proof 明确缺少且用户功能会降级时，才允许
以单个、无第二真相的 adapter 补足具体缺口。

## 删除门禁

每个待保留组件都必须通过删除测试：

1. 删除后平台能力仍完成同一结果，则删除 OPL 实现。
2. 删除后只少一层字段转换，则把转换放到 consumer boundary，不保留 manager。
3. 删除后会迫使每个 Agent/App 重复实现同一 Work Item、Temporal 或 typed-view 聚合，
   才保留一个薄 Framework owner。
4. 为 crash recovery、回滚、完整性或发布安全辩护时，先证明平台没有该能力，并区分
   Package lifecycle、release artifact、Temporal execution 和 domain evidence；不能混用。

Package Manager 终态删除声明至少需要：

- 每包 GHCR 完整 runtime、owner 独立 `latest-stable` 和匿名 pull readback。
- OCI/native carrier `install/list/update/remove` 与 carrier-neutral installed aggregation
  fresh readback。
- App Standard/Full/restore/remove/maintenance 完整路径。
- MAS -> ScholarSkills presence dependency。
- 单包独立更新与失败隔离。
- 动态新 Agent Runtime discovery。
- MAS typed route view 与未知 view fallback。
- developer/local source 不被覆盖。
- shared manifest 只服务 Full/offline/integration/QA，普通 currentness consumer 清零。
- 真实非 Codex/中性 adapter 可调用；executor 切换不重装/不丢偏好、任务、依赖和 typed
  views；adapter 缺失只局部降级 route。
- 唯一物理 carrier 移除后 `physical_unavailable`，无 metadata/cache 虚假 installed。
- Codex-specific 字段只存在于 Codex adapter；通用 projection 的旧字段 consumer 清零。
- 旧 registry/lock/receipt/payload/LKG/transaction engine 无 active caller 且已物理删除。

docs、schema、tests、dry-run、候选实现或旧 manager “不再默认调用”都不是终态证据。
