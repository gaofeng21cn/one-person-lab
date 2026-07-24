# OPL Release 与 Package 模块化分发参考

Owner: `One Person Lab Framework`
Purpose: `references_current_support_opl_release_packages_modular_distribution`
State: `support_reference`
Machine boundary: 本文解释架构和迁移方向，不是机器 truth。机器 truth 继续归
`contracts/`、source、tests、fresh CLI/API readback、runtime ledger、provider
receipt、domain-owned manifests 和真实发布 evidence。本文不得被实现、发布脚本或
用户界面当作第二套配置读取。

## 2026-07-24 planned supersession

最新目标仍保留 `OPL Base ≈ R`、`OPL App ≈ RStudio`、`OPL Package ≈ R
Package`，但不再自建 `Registry ≈ CRAN` 或 `Release Set ≈ renv.lock` 作为普通安装
模型。Package 是安装单元，Skill/Tool/Plugin/entrypoint 是可发现 capability；依赖只
检查 presence/callability。实际 carrier 平台拥有 install/list/update/remove 与
currentness，Framework 不再拥有 resolver、installed lock、payload、LKG、receipt 或
materializer。Full 只提供离线 seed，release exact-byte evidence 只约束发布 artifact。

完整功能等价、兼容桥和物理删除门见
[`OPL Package 平台组合迁移计划`](../../active/opl-package-platform-composition-migration.md)。
以下 2026-07-23 方案保留为 dated audit/history；其中 ABI/SemVer resolver、exact lock、
LKG、固定七包 cohort 和 Framework lifecycle owner 建议已被 2026-07-24 决策
supersede，不得作为新增实现依据。

## 2026-07-23 旧方案（已 superseded）

OPL 生态采用可自由组合的标准库模型：

```text
OPL Base        ≈ R
OPL App         ≈ RStudio，可替换 GUI 和部署载体
OPL Package     ≈ R Package
Registry        ≈ CRAN 索引
Full/Release Set ≈ renv.lock，可复现的组合快照
```

这不是把 OPL 设计成一个九组件产品。Base、App 和每个 Package 都有独立 owner、
版本和发布节奏；App、Desktop、Docker/WebUI、Homebrew、Full 只是不同 carrier，
不应复制 Package 生命周期。Package 可以被任意 profile、App 载体或离线组合选取，
也可以替换为显式的 developer、external 或 local source。

设计目标是同时提供弹性和低维护成本：

- 发布时松耦合：owner 只发布自己的 manifest、SemVer 和不可变 artifact。
- 解析时检查兼容性：Framework index/resolver 按 Base/Capability ABI ranges、
  required/optional dependencies 和 trust/content policy 解析闭包。
- 安装时精确锁定：本机以 exact digest、dependency closure、installed lock 和
  receipt 记录“安装了什么”。
- 运行时绑定不可变 bytes：generation pointer 只指向已校验的 content-addressed
  root；更新采用原子切换，失败回退到 LKG。
- 通用复杂性只实现一次：Framework 是 lifecycle owner；App/Shell 只展示目录、
  状态和动作，不复制 package authority。

## 保留的生命周期内核

以下能力是 Package 管理的必要安全内核，应继续保留：

1. 每个 Package 的 owner manifest、canonical id、独立 SemVer、ABI 范围和依赖声明。
2. Framework 单一 lifecycle owner，以及可替换的 source adapters：OCI/registry、
   direct manifest、developer checkout、local path 和 Full/offline seed。
3. immutable digest、依赖闭包、事务锁、installed lock、install/update receipt、
   content-addressed generation、原子 current/LKG rollback。
4. dirty checkout protection、content/trust 校验、同一 SemVer 不得指向不同 bytes，
   以及失败候选不能污染 stable/current。
5. Plugin、Skill、shortcut、workflow profile 和 runtime module 只是 carrier 或
   projection；它们不得成为第二套 Package truth。

Source adapter 只提供候选。普通 stable currentness 必须由一个 resolver 决定，
本机 currentness 必须由 installed lock 决定；Developer、external、manual 或
bundled source 不能与 stable catalog 同时定义“当前版本”。

## 组合与发布边界

### Package 独立发布

- Package owner 独立推进 SemVer、构建 OCI artifact，并把 immutable version/tag
  绑定到唯一 digest。
- Registry/index 聚合已发布 manifest；resolver 选择满足 Base/Capability ABI
  ranges 的最新兼容版本。
- 普通 Package 发布不要求 Base、App、其他 Package 或 WebUI 同步发版。
- `latest-stable` 是普通安装的 moving channel；candidate 只表示待验证候选。
  每个 canonical id 仍只有一个 OCI repository。

### Release Set 只是组合快照

Release Set/catalog 只用于 Full、offline seed、测试矩阵或可复现部署。它保存一次
解析得到的精确 BOM、owner commit、artifact ref、digest 和 dependency closure，
类似 `renv.lock`，但不是普通 Package currentness，也不是第八个 Package。

固定的“七包”只能是可替换的 starter profile，不能成为 App 能力上限、Package
发布门槛或每次 daily 的原子写集。未选中的 Package 不应因为 starter profile 的
存在而被阻塞；新增 Package 只需进入 canonical manifest/index/resolver。

Exact App/Base/Package binding 只允许出现在本机 lock、单次构建、Full/offline
snapshot 或测试 fixture 中。普通 Package 发行只声明兼容范围，不把另一仓的
当前 commit 或 digest 写成长期双向约束。

## 安装和更新来源

“Stable”“Docker/WebUI”“Daily”不是同一维度：

| 对象 | 角色 | 长期规则 |
| --- | --- | --- |
| OPL Base | Framework 发布对象；Homebrew Formula、headless installer 和 App bootstrap 是 carrier | Base 自己版本化、更新和回滚；Packages 不反向管理 Base |
| Desktop App | App release carrier | GitHub Releases + electron-builder updater metadata；App 更新不捆绑普通 Package lifecycle |
| Docker/WebUI | App 的替代部署 carrier | App-owned image/release receipt；按 exact App digest 晋升 `stable`，不由 Framework Package workflow 发布 |
| OPL Package | 独立 capability/workflow artifact | 每个 canonical id 独立 `latest-stable`；resolver 按 ABI/dependency 选择并生成本机 lock |
| Full | 首次安装、离线或测试组合 | 消费一个 Release Set 精确快照；不是日常 updater channel，也不定义 Package 最新版本 |
| Daily | 调度与 reconciliation cadence | 逐 Package 检测 owner source/content 变化，生成 candidate 或保留 LKG；不是 Base/App/九组件共同发布器 |
| Developer/external/direct/bundled | 高级 source adapter | 仅在显式选择时替换 Package source；不得污染普通 stable currentness |

Homebrew 只承载 OPL Base 的标准 Formula。Package 不提供第二套 Formula/Cask、
独立 update manager 或隐藏的 plugin installer。

推荐的最短链路是：

```text
owner manifest
    -> Framework registry/index
    -> compatibility resolver
    -> dependency closure
    -> exact installed lock
    -> materialization + receipt
```

## 当前审计状态

下列结论是 2026-07-23 的 dated audit snapshot，不是本文的动态 currentness；
重新判断必须回到 fresh machine output 和远端 readback。

### 已确认可保留

- Framework 已具备或已有设计依据支持 immutable digest、依赖闭包、事务锁、receipt、
  原子回滚和脏 checkout 保护。
- OCI、external/direct manifest、developer checkout 和 offline seed 作为 source
  adapter 的方向与可组合目标一致。
- Package 的 owner manifest、SemVer、ABI/dependency 声明是正确的长期边界。

### 尚未落地或存在过度耦合

- App release contract 仍把固定七包和九组件精确 BOM 当成强约束；应降级为 starter
  profile 与 Full/test composition snapshot。
- App/Shell 与 Framework 之间仍存在重复 Package schema、状态或 authority 的迁移
  surface；最终应只消费 Framework directory/status/actions。
- Package 日更仍有把多个 owner、Base 和 App 绑在同一 generation/写集的残留；应改为
  owner 独立 candidate/stable，daily 只做 reconciliation。
- Developer checkout、stable catalog 或其他来源仍可能同时影响 currentness；必须收敛
  到单一 resolver + 单一 installed lock。
- 普通用户不需要暴露所有底层 repair、rollback、source 和 provider 选项；保留
  Install、Update、Remove、Enabled、Home pin，诊断/回滚进入高级入口。

### 尚未证明“可稳定发布最新版”

本轮审计观察到以下失败或分叉，均需 fresh readback 后才能更新状态：

- App Stable 运行
  [30001277460](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/30001277460)
  失败；公开的 `v26.7.21` 尚未成为 GitHub Release `Latest`，因此不能证明
  `Stable -> Latest -> updater readback` 闭环。
- Docker/WebUI 的 `stable` 仍可能停留在旧 digest；已构建的新版本未自动晋升并完成
  anonymous pull readback，因此不能证明 carrier 闭环。
- Package Daily 运行
  [29952463596](https://github.com/gaofeng21cn/one-person-lab/actions/runs/29952463596)
  因 `opl-base content changed without a version bump` 失败；这说明当前联合日更
  仍会把无关 Base/Package 变化变成阻断。
- Full/Homebrew 等组合载体可能落后于独立 Package/Base；它们只能作为组合/镜像，
  不应反过来阻塞独立 Package 的 stable。

在以下三条 fresh terminal proof 之前，不得把“最新版可稳定发布”写入 release
ready、production ready 或用户文档：

1. App `Stable -> GitHub Latest -> updater metadata readback`。
2. WebUI exact digest `-> stable -> anonymous pull`。
3. 单个 Package 独立更新成功，且未变化的 Package/Base/App 不被重新构建或阻塞。

## 迁移顺序与完成口径

本文只记录方向；代码、contracts、workflows 和测试由各自 owner 实施，不能把本节
写成已完成。

### P0：先解除错误耦合

1. Framework 发布 versioned Package/Release ABI 与兼容桥；resolver 以 ABI ranges
   解析，installed lock 成为本机唯一 currentness authority。
2. 将固定七包从 App/Release Set 强约束降为 starter profile；Release Set 只保留
   Full/offline/tested composition。
3. 将 Package channel 改为 owner 独立发布；daily 只为 changed Package 生成
   candidate、执行 reconciliation，并在失败时保留完整上一稳定状态。
4. 收回 App/Shell 重复的 Package schema、fixture、validator 和状态机；App 只消费
   Framework directory/status/actions。
5. Desktop、WebUI 和 Full 各自消费 exact receipt，互不要求共享 run id 或共同重建；
   旧的人工 promotion/retired controller 在有等价终态证明后删除。

### P1：再删外围复杂性

1. 将普通 UI 收缩到五类用户动作；repair、rollback、source override 和 provider
   drilldown 仅保留诊断/高级 CLI。
2. 删除没有第二实现的 adapter、重复 registry、空的特殊 registry authority、
   duplicated release controller 和 fail-only workflow。
3. Homebrew 只作为 Base 的同 digest 镜像；无法保持与 Base exact bytes 同步的
   Full Cask 不保留为独立更新渠道。

迁移完成的最低证据是：新增 Package 不修改 App/Shell；单包更新不触发九组件共同
发布；同一 resolver 可从 OCI、developer 和 offline source 生成等价 lock；失败
候选不污染 stable/current；App、WebUI、Full 的 carrier readback 各自闭环。

## 机器读取入口

以下路径只用于定位实现，动态值不得复制到本文：

| 入口 | 读取内容 |
| --- | --- |
| `contracts/` 与 Framework package manifests | owner、canonical id、SemVer、ABI、依赖、source policy |
| `opl connect packages manifest` / `src/modules/connect/package-distribution.ts` | 当前 registry/index、channel、carrier 和 consumption projection |
| `opl packages ... --json` | installed lock、status、dependency closure、receipt、current/LKG |
| Package build/release scripts and workflows | candidate/stable admission、digest、checksum、rollback 和 retention |
| App release contracts/workflows/evidence | Desktop、Docker/WebUI、Full carrier、updater、签名和发布终态 |

当 package channel、source override、Release Set 或 App carrier 语义变化时，先改
对应 machine contract、实现和测试，再更新本文；本文不能反向授权新 lifecycle。
