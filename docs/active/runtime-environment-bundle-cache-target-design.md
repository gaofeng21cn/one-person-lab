# OPL Runtime Environment Bundle / Cache Target Design

Owner: `One Person Lab`
Purpose: `runtime_environment_bundle_cache_target_design`
State: `active_target_design`
Machine boundary: 本文是人读目标架构和迁移计划。当前机器真相归
`contracts/opl-framework/runtime-environment-substrate-contract.json`、
`src/runtime-environment-substrate.ts`、`opl runtime env * --json`、focused tests、
runtime artifacts、provider receipts、App release artifacts 和 domain-owned manifests。
Last reviewed: `2026-06-21`

Current machine slice: `runtime environment substrate` 已落成 contract、deterministic lock /
bundle manifest、OPL-managed materialization receipt、verify readback、filesystem cache inventory /
protected prune receipt，以及 dependency prepare lock / receipt / run-context。可执行入口是 `opl
runtime env inspect|lock|build|prepare|materialize|verify|cache status|cache inventory|cache
prune|doctor|run-context|contract --json`；`materialize --apply` 只写 `${OPL_STATE_DIR}/runtime-environment`
下的 runtime root、lock、manifest、env 和 receipt，`cache prune --apply` 只删除未被 current /
rollback pointer 保护且带 receipt 的 stale runtime root，`prepare --apply` 只把缺失语言包安装进
OPL-managed library path 并给 consumer 写 run-context refs。这些入口可证明指定 OPL runtime
environment root 已物化/可验证；它们仍不签 owner receipt、不写 domain truth / memory body /
artifact body，也不证明 domain、App release 或 production ready。

## 目标结论

OPL family 需要一个基座级 `Runtime Environment Bundle` 能力，而不是让
One Person Lab App Full、MAS、MAG、RCA、BookForge、OMA、CI/VM smoke 和部署
脚本分别预热 Python、uv、Node、native helper、domain repo、skills 和 cache。

目标形态是：

`Domain Environment Intent -> OPL Runtime Lock -> Content-Addressed Layers -> Runtime Bundle Manifest -> Materialized Runtime Root -> Receipt / Cleanup / Rollback`

它属于 OPL Framework 的 shared substrate：

- 主模块：`OPL Runway`，负责 runtime materialization、provider/run consumption 和
  receipt。
- 协同模块：`OPL Pack`，负责 descriptor、lock、layer manifest 和 distribution
  refs；`OPL Connect` 负责 CLI/App/install/update 入口；`OPL Console` 负责 operator
  projection；`OPL Vault` 负责 refs-only evidence；`OPL Workspace` 负责 runtime root
  与 workspace state 分离；`OPL Atlas` 负责 package/module registry。
- 不触碰：domain truth、domain owner receipt、quality/export verdict、artifact body、
  memory body、App release verdict。

One Person Lab App Full 现有 Full runtime cache 只能作为迁移输入。长期 owner 不应是
App repo；App 只是消费者和发布入口。MAS 也不应持有通用 Python/uv 环境 bootstrap；
MAS 只声明医学研究环境意图、domain dependency profile 和复现实验约束。

## 外部工程经验提炼

本设计吸收的是工程模式，不导入外部 authority：

- `uv`：项目环境应从 lock 同步，安装环境是 lock 的 materialization，不是手工状态。
  对 OPL 的含义是 domain repo 提供 dependency intent / lock input，OPL 生成和消费
  runtime lock 与 materialization receipt。
- OCI / container image spec：artifact 应由 descriptor、media type、size、digest 和
  layer refs 描述。对 OPL 的含义是 runtime bundle 不应只是一包文件，而应有可寻址、
  可验证、可复用的 layer manifest。
- Docker / BuildKit cache：构建 cache 应支持外部 backend、导入/导出和跨 build 复用。
  对 OPL 的含义是 App Full、CI、VM smoke 和部署都消费同一个 cache key，而不是各自
  重新构建。
- Bazel hermetic/remote cache：可复现构建依赖明确输入、隔离环境和稳定 action key。
  对 OPL 的含义是 runtime layer key 必须包含 Python/uv/Node/native helper/domain
  repo refs/lock/packager policy，而不是按 release version 或路径启发式命名。
- Spack buildcache / Conda-lock / repo2docker / renv：成熟科研和数据环境通常把
  platform lock、binary cache、environment spec、restore receipt、cache pruning 分开。
  对 OPL 的含义是论文复现环境应分成 declarative intent、platform-specific lock、
  binary/materialized layer、receipt 和 cleanup policy。

## 当前问题归类

当前 App Full 包过大只是表层现象。底层问题是同一批重依赖同时承担了三种职责：

1. `first_install_payload`：让干净机器可以打开 App 并启动 Core path。
2. `runtime_environment`：让 MAS 等 domain agent 在固定版本工具链里跑论文。
3. `build_acceleration_cache`：让 CI / Full packaging / VM smoke 不重复下载和解压。

这三种职责若塞进一个 DMG，会导致：

- App 安装包体积随 domain/runtime 增长线性膨胀。
- MAS 部署和 App Full 打包不能共享同一个环境成果。
- CI cache 命中只能服务 App release，不能服务 domain deployment。
- runtime cache events 容易被误读成 release/domain readiness。
- domain repo 容易重新长出私有 `.venv`、uv cache、runtime bundle 和 helper install
  surface。

理想态必须把它们拆开：payload 是分发策略，environment 是可寻址 runtime artifact，
cache 是 materialization 加速机制，readiness 是另一个 evidence surface。

## 目标边界

### OPL Framework owns

- `Runtime Environment Descriptor`：声明 toolchain、Python、uv、Node、native helper、
  domain modules、skills、platform、ABI 和 policy refs。
- `Runtime Lock`：把 descriptor 解析为 platform-specific immutable lock，包含 digest、
  refs、versions、source commits、package hashes、layer IDs 和 exclusion policy hash。
- `Layer Cache`：content-addressed layer archives，支持 local cache、GitHub Actions
  cache、release asset、OCI-compatible registry 或 future artifact store。
- `Runtime Bundle Manifest`：完整 bundle 的 manifest、size、digests、component refs、
  materialization command、trust boundary 和 no-authority flags。
- `Materialization`：把 selected bundle/layers materialize 到 managed runtime root，
  写 receipt，更新 active pointer，保留 rollback pointer。
- `Runtime cleanup`：按 current/rollback pointer 和 receipt prune stale roots/layers；
  默认 dry-run，执行需 receipt。

### App owns

- 选择 first-install policy：standard package、Full first-install、lazy fetch、hybrid
  payload、offline kit。
- 在 release workflow 中消费 OPL runtime bundle manifest 和 receipts。
- 在 Settings / Storage / first-run / Runtime page 中显示 OPL projection。
- 对 App release gate 保持 cohort-bound evidence；不能把 runtime cache hit 当 release
  ready。

### MAS and other Foundry Agents own

- domain dependency intent：例如 `analysis` profile、paper-line extra、native needs、
  allowed Python major/minor、scientific package constraints。
- study/reproducibility requirements：软件环境文档、paper package provenance、analysis
  replay requirements。
- domain owner receipt、typed blocker、quality/publication/export verdict。

Domain repo 不拥有通用 environment manager、cache store、installer、global runtime
cleanup、provider bootstrap 或 App package assembly。

## 目标数据模型

### Runtime Environment Descriptor

建议路径：domain repo `contracts/runtime_environment_intent.json` 或 pack descriptor 的
`runtime_environment` section。

最小字段：

- `schema`
- `domain_id`
- `profiles[]`: `core`, `analysis`, `submission`, `display`, `publication_proof`
- `requires_python`
- `dependency_sources`: `pyproject.toml`, `uv.lock`, extra groups, wheelhouse refs
- `toolchain_needs`: `uv`, `node`, `temporal`, `officecli`, `mineru`, `pandoc`,
  `latex`, native helpers
- `platforms[]`: `macos-arm64`, later `linux-x64`, `linux-arm64`
- `authority_boundary`: all domain verdict fields false

### OPL Runtime Lock

建议路径：OPL generated artifact，不写回 domain repo unless explicitly requested as
review artifact。

字段：

- descriptor digest
- resolved platform
- Python distribution digest/version
- uv binary digest/version
- package lock digest and selected wheel/sdist digests
- Node/native helper digests
- domain repo commits / pack refs
- layer graph and cache keys
- packager source hash and exclusion policy hash
- remote/local source refs
- trust boundary and no-authority flags

### Layer Types

初始 layer 不应照搬 App Full 当前四层，而应按复用价值重切：

1. `base-toolchain`
   - uv, Python distribution, Node, Codex, rg, Temporal CLI, native helper binaries.
   - 变更低，跨 domain 复用高。
2. `python-wheelhouse`
   - per platform/profile 的 wheel/sdist cache 或 unpacked site-packages layer。
   - 变更中等，MAS/MAG/RCA 可共享科学栈子集。
3. `opl-framework-runtime`
   - OPL Framework package、production node_modules、runtime wrappers、provider
     integration。
4. `domain-pack`
   - MAS/MAG/RCA/BookForge/OMA domain source snapshot 或 generated domain pack refs。
   - 变更高，不应污染 toolchain cache。
5. `companion-skills`
   - Codex skills/plugins/package surface，按 product profile 或 domain pack 选择。
6. `optional-heavy-tools`
   - LaTeX/Pandoc/Poppler/MinerU/Office helpers 等体积大且场景相关的 layer。

App Full 可以选择打包全部、打包 base + manifest 后 lazy fetch、或提供 offline kit。
MAS deployment 可以选择 base + python-wheelhouse + domain-pack，不必下载 GUI App。

## CLI / API 目标面

建议 OPL-owned CLI：

```bash
opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json
opl runtime env lock --domain mas --profile analysis --platform macos-arm64 --json
opl runtime env cache status --json
opl runtime env doctor --json
opl runtime env run-context --domain bookforge --profile publication_proof --json
opl runtime env contract --json
```

Materializer / lifecycle CLI：

```bash
opl runtime env build --lock <runtime-lock.json> --cache-mode readwrite --json
opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --paper-root paper [--apply] --json
opl runtime env materialize --domain mas --profile analysis --platform macos-arm64 --target current --apply --json
opl runtime env verify --runtime-root <path> --json
opl runtime env cache prune --dry-run --json
opl runtime env cache prune --apply --json
opl runtime env export --bundle <manifest.json> --format tar.zst --json
```

App-facing action IDs：

- `runtime_environment_check`
- `runtime_environment_materialize`
- `runtime_environment_update`
- `runtime_environment_prune_dry_run`
- `runtime_environment_prune_apply`
- `runtime_environment_reveal_cache`

这些 action 只管理 OPL runtime environment，不执行 domain stage，不写 domain truth。

## Distribution Strategy

理想分发不应只有一个 Full DMG：

### Standard App

小包，只含 App、shell、Core bootstrap、manifest resolver。首次运行根据 profile 拉取或
materialize runtime bundle。适合普通更新。

### Full First-Install

完整 first-install 包，但内部仍由 bundle manifest 描述；可以携带必要 layers，而不是把
“Full package assembly”作为唯一 source of truth。适合网络不稳定或一次性安装。

### Offline Runtime Kit

独立 `opl-runtime-kit-<profile>-<platform>-<digest>.tar.zst`。可被 App Full、MAS 部署、
CI、VM smoke 和迁移脚本共同消费。它不是 App release，也不是 domain ready evidence。

### Remote Cache / Registry

长期可用 GitHub Release assets、GitHub Actions cache、OCI artifact registry 或 OPL
artifact store。必须按 digest 验证，不按 tag 信任。

## Readiness and Evidence Boundaries

Runtime environment receipt 只能证明：

- 指定 descriptor/lock 的 runtime 已 materialized。
- layer digest、size、platform、tool versions 与 manifest 匹配。
- active pointer / rollback pointer 已按 OPL policy 更新。
- cleanup/prune 没有触碰 current/rollback/user workspace/domain artifact body。

它不能证明：

- MAS paper ready。
- domain quality/export/publication ready。
- App release ready。
- provider long-soak ready。
- owner receipt satisfied。
- artifact body correct。

App release 仍需要 same-cohort VM smoke、route smoke、remote verification 和 release
owner record。MAS 仍需要 study progress / DHD / owner receipt / typed blocker / publication
gate 等 domain-owned evidence。

## Maintenance Rules

- Cache key 不含 release version，除非 release version 改变了 layer input。
- Layer input 必须包括 packager source hash 和 exclusion policy hash。
- Runtime root 不写进 development checkout。
- `.venv`、`__pycache__`、pytest cache、uv cache、node cache 和 install sync 副产物
  必须落到 user/runtime/cache root。
- Cleanup 默认 dry-run，执行需要 receipt，并保护 current / rollback pointers。
- Remote cache miss 不是 readiness failure；materialization failure 才是环境 failure。
- Cache hit 不是 readiness proof；verify receipt 才是环境 proof。
- Bundle manifest 不能携带 domain artifact body、memory body 或 owner answer body。

## 迁移计划

### Phase 0: Contract-first architecture foldback

- 在 OPL Framework 增加 `runtime-environment-substrate` contract。
- 把 App Full 现有 runtime cache 分层经验映射成 OPL layer taxonomy。
- 在 App docs 中把 Full cache 明确降级为 OPL runtime bundle consumer。

Current landing：`contracts/opl-framework/runtime-environment-substrate-contract.json`、
`src/runtime-environment-substrate.ts` 和 `opl runtime env inspect|lock|build|prepare|materialize|verify|cache
status|cache inventory|cache prune|doctor|run-context|contract` 已提供 fail-closed readback、deterministic
lock / bundle projection、OPL-managed materialization receipt、verify readback、protected prune receipt，
并支持 dependency prepare receipt/run-context。Gate：contract/readback tests pass；docs 不宣称
domain/App release/production ready。

### Phase 1: Extract key and manifest library

- 从 App Full packager 中抽出 layer key、manifest、size、receipt、exclusion policy
  的通用库到 OPL Framework。
- App Full 改为调用 OPL library 或 CLI 生成 manifest。

Gate：App Full 生成的 manifest 与旧 manifest semantically equivalent；cache events
仍可被 release readiness 读取。

### Phase 2: MAS profile lock

- MAS 增加 `runtime_environment_intent`，只声明 domain profile。
- OPL `runtime env lock` 能从 MAS `pyproject.toml` / `uv.lock` 生成 platform lock。
- 生成软件环境文档时引用 OPL runtime lock / receipt refs。

Gate：MAS clean run 不再依赖现场网络下载核心科学栈；但不声明 paper ready。

### Phase 3: Shared remote cache

- CI warmup 生成 `base-toolchain`、`python-wheelhouse`、`opl-framework-runtime` layers。
- App Full、VM smoke、MAS deployment 都使用相同 digest key。

Gate：相同 lock 产生相同 cache key；cache hit/miss 被记录但不替代 runtime verify。

### Phase 4: App packaging split

- Standard App 默认 small installer + lazy runtime materialization。
- Full App 可选择 embedded layers 或 offline runtime kit。
- Release size budget 按 App binary、embedded runtime layers、external runtime kit 分开
  度量。

Gate：Full/standard install evidence 各自 cohort-bound；remote runtime kit digest verified。

### Phase 5: Lifecycle and cleanup convergence

- Settings / Storage 和 CLI 都通过 OPL runtime env cache inventory / prune receipt。
- Domain workspace cleanup 与 runtime cache cleanup 完全分离。

Gate：prune dry-run / apply receipt 证明不触碰 current/rollback/domain artifacts。

## 推荐第一步

第一步已经不是继续优化 DMG 压缩，也不是在 MAS 里新增私有 bootstrap。OPL Framework 已
落 `runtime-environment-substrate` contract、materializer、verify、filesystem inventory 和 protected
prune receipt，使 App Full 当前 cache 有一个上收目标。下一步是让 App Full 从“owner of Full
runtime cache”变成“consumer of OPL runtime bundle manifest”，同时让 MAS 只声明 display
dependency intent 并消费 OPL-managed run-context。

这一步的收益最大：

- 不改变用户安装路径即可稳定 owner boundary。
- 给 MAS 部署和 App Full 共享同一个环境成果留出正式接口。
- 后续再拆 Full DMG / remote cache / offline kit 时，不会把 release packaging 和 runtime
  substrate 继续搅在一起。

## 当前 tranche closeout

本轮只关闭 OPL-owned runtime environment substrate 的非 Live 功能/结构缺口，不声明 MAS
gallery、App release、provider long-soak、真实用户路径或 production ready。当前机器
状态是 `runtime_lock_materializer_cache_prune_run_context_guard_available`：

- `prepare` 生成 dependency lock、dependency receipt 和成功时的
  `dependency_run_context.json`，并写入 requirement profile identity、lock digest、
  run-context fingerprint、consumer boundary 和 consumer preflight。
- `run-context --paper-root <path>` 在缺少 `dependency_run_context.json` 时返回
  `missing_run_context`，在 domain/profile/platform 与请求目标不一致时返回
  `target_mismatch`，两者都 `fail_closed=true`。
- consumer boundary 固定 `host_environment_fallback_allowed=false`，
  `can_schedule_domain_stage=false`，并且不能声明 provider ready、runtime ready、domain
  ready、App release ready 或 publication ready。
- `doctor` 暴露 `runtime_environment_run_context_consumer_preflight_available`，用于把
  consumer route 指回 `opl runtime env prepare`，而不是让 domain repo 或 App 私下回落到
  宿主机环境。

### Milestone Backlog

| Milestone | Priority | Owner repo | Current state | Next non-Live action |
| --- | --- | --- | --- | --- |
| Runtime env substrate guard | P0 | `one-person-lab` | Contract、CLI、readback、prepare/materialize/verify/cache 和 run-context consumer preflight 已进入同一 OPL-owned false-ready boundary | 后续只补共享 cache / App consumer action；不再在 domain repo 私有化通用 env manager |
| Domain consumer migration | P0/P1 | MAS/MAG/RCA/OMA owner repos | 仍按各 repo fresh source 判断；OPL 只提供 run-context / materialized runtime root 消费边界 | domain repo 迁移 consumer 时必须 fail closed，并保留 domain truth / owner receipt authority |
| App / Console consumer projection | P1/P2 | `one-person-lab-app` / shell owner | App 只应消费 OPL runtime projection；release cohort 仍后置 | Storage / Runtime action 只发 OPL action，不把 runtime proof 写成 App release ready |
| Shared cache / prewarm | P2 | `one-person-lab` + release/CI owner | OPL 已有 deterministic layer key、inventory 和 protected prune | 后续建立 remote/offline cache manifest；cache hit/miss 不进入 readiness claim |

## Adoption Audit

| Item | Target surface | Current state | Status | Completion | Next action |
| --- | --- | --- | --- | --- | --- |
| OPL runtime environment contract/materializer/readback | `contracts/opl-framework/runtime-environment-substrate-contract.json`; `src/runtime-environment-substrate.ts`; `opl runtime env inspect|lock|build|prepare|materialize|verify|cache status|cache inventory|cache prune|doctor|run-context|contract --json` | Deterministic lock / bundle manifest、explicit `materialize --apply` OPL-managed runtime root、materialization receipt、verify readback、filesystem inventory、protected prune receipt、dependency prepare run-context、run-context consumer preflight 已落地 | `done_for_substrate_boundary` | Executable substrate behavior can be verified by focused tests and CLI readbacks; domain/App/production readiness remains `0%` | 后续 consumer lane 必须在各 owner repo 用 fresh source/readback 验证 |
| Shared layer key library | OPL `src/runtime-environment-substrate.ts`; App / CI consumer contracts | OPL 已有 layer key / digest / manifest refs；remote/offline cache manifest 仍未成为 shared release/deployment surface | `partial` | `70%` for local substrate, not for remote cache | 建立 digest-based shared cache / offline kit manifest |
| Domain environment intent consumers | MAS/MAG/RCA/BookForge/OMA owner repos | 本文不冻结 domain repo 状态；domain consumer 是否迁移必须从对应 repo fresh source、contracts、CLI/API/readback 判断 | `not_claimed_here` | `0%` for cross-repo consumer closeout in this OPL-only tranche | 后续 domain lane 只消费 OPL run-context / runtime root，不私有化通用 env manager |
| App / Console consumer boundary | App owner repo and shell owner | 本文不冻结 App release 或 shell currentness；App 只能消费 OPL runtime projection | `not_claimed_here` | `0%` for App release ready | App consumer lane 需保持 AionUI 主线、Hermes foreground alternative、AGUI archived |
| Runtime cleanup convergence | OPL CLI + App Settings | OPL env cache inventory / protected prune apply receipt 已可执行；App Storage 仍应只是 consumer projection | `partial` | Local cleanup substrate available; App projection not claimed | App Settings consumer 可后续接入；cleanup receipt 不授权 delete outside OPL runtime root |

这些条目是目标设计 audit，不是全目标 Plan Completion Audit。任何 domain ready、App release
ready、provider production ready、Brand L5 或真实项目完成声明，都必须等待对应 owner repo 的
fresh executable evidence。
