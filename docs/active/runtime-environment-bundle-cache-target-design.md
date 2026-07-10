# OPL Runtime Environment Bundle / Cache Target Design

Owner: `One Person Lab`
Purpose: `runtime_environment_bundle_cache_target_design`
State: `active_target_design`
Machine boundary: 本文是人读目标架构和迁移计划。当前机器真相归
`contracts/opl-framework/runtime-environment-substrate-contract.json`、
`src/runtime-environment-substrate.ts`、`opl runtime env * --json`、focused tests、
runtime artifacts、provider receipts、App release artifacts 和 domain-owned manifests。

Current machine slice: `runtime environment substrate` 已落成 contract、deterministic lock /
bundle manifest、OPL-managed materialization receipt、verify readback、filesystem cache inventory /
protected prune receipt，以及 dependency prepare lock / receipt / run-context。普通用户入口是
`opl env doctor|prepare|run`；advanced/operator 入口是 `opl runtime env
inspect|lock|build|prepare|materialize|verify|cache status|cache inventory|cache
prune|doctor|run-context|contract --json`。`materialize --apply` 只写 `${OPL_STATE_DIR}/runtime-environment`
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
  projection；`OPL Ledger` 负责 refs-only evidence；`OPL Workspace` 负责 runtime root
  与 workspace state 分离；`OPL Atlas` 负责 package/module registry。
- 不触碰：domain truth、domain owner receipt、quality/export verdict、artifact body、
  memory body、App release verdict。

重要负边界：本设计不把 OPL 扩成自研底层 agent sandbox。Runtime environment substrate
保留 env profile、compiler、doctor、run-context、descriptor、lock、bundle manifest、
managed runtime root、receipt、cache inventory 和 no-host-fallback 边界。当前默认路径是
`Fast Local Env`，服务 R / Python / MAS 画图等本机高频环境；Local Sandbox / Docker
和 Remote Sandbox / E2B 只作为显式后置 provider。这些 provider 不替换 OPL Framework、
Runway 或 Temporal：Temporal 仍负责 durable workflow / wakeup / retry / human gate，
sandbox provider 只负责 selected stage executor 的隔离执行环境。

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
- Dev Containers / Docker：成熟本地 agent sandbox substrate，作为需要隔离或复现时的
  `Local Sandbox` 后置 provider，不作为所有 runtime env profile 的全局硬依赖。
- E2B 是当前已实现的显式 remote sandbox provider；Daytona / Modal 只保留为参考候选，尚无 runner，不声明 supported。
  E2B 是外部 provider / Connect 配置辅助，不是默认依赖。
  对 OPL 的含义是不要在 runtime env lane 里自研 VM/container sandbox；只定义
  provider profile、credential preflight、run-context binding、receipt projection
  和 no-authority flags。

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
- `Environment strategy binding`：默认选择 `Fast Local Env`，由 env profile、compiler、
  doctor 和 run-context 证明当前 R / Python / MAS 画图等本机环境可消费；R 标准
  handoff 是 `renv.lock` refs + `R_LIBS_USER` managed library，Python 标准 handoff 是
  `uv.lock` / project refs + `UV_PROJECT_ENVIRONMENT` managed env；显式选择
  Local Sandbox / Docker 或 Remote Sandbox / E2B 等 provider 时，OPL 只持有 provider
  profile、image / template ref、credential preflight、run-context binding、receipt
  projection 和 false-ready guard。

OPL Framework 不拥有底层 VM/container sandbox implementation。Fast Local Env 是显式
environment profile，不是 host fallback；local Docker/devcontainer 或 remote provider-side
filesystem、process、network 和 resource isolation 只提供执行隔离；OPL 不因 doctor pass、
run-context exists 或 sandbox run 成功而获得 domain truth、owner receipt、quality/export
verdict、App release verdict 或 production readiness。

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

普通用户 OPL-owned CLI：

```bash
opl env doctor --json
opl env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts [--apply] --json
opl env run --domain bookforge --profile publication_proof --artifact-root artifacts --json
```

Advanced / operator CLI：

```bash
opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json
opl runtime env lock --domain mas --profile analysis --platform macos-arm64 --json
opl runtime env cache status --json
opl runtime env doctor --json
opl runtime env run-context --domain bookforge --profile publication_proof --json
opl runtime env contract --json
```

Materializer / lifecycle CLI 仍属于 advanced/operator surface：

```bash
opl runtime env build --lock <runtime-lock.json> --cache-mode readwrite --json
opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts [--apply] --json
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
- live Docker/devcontainer run 或 live E2B / Daytona / Modal credential run 已通过。
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
- Fast Local Env 必须是显式 environment profile 和 run-context，不得作为 sandbox provider
  失败后的隐式 host fallback。Local Sandbox / Docker 或 Remote Sandbox / E2B 接入不得回落到
  host process / host workspace 伪装成功；本地 Docker/devcontainer image 缺失、remote provider
  credential 缺失或 sandbox receipt 缺失时只能 fail closed 或输出 repair / preflight work order。
- Fast Local Env doctor 只检查 host binary、language packages 和 system hints；它不能声明
  runtime ready、domain ready、App ready、provider ready 或 production ready。

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
- Release size budget 按 installation carrier、embedded runtime layers、external runtime kit 分开
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

## 当前读回面

当前 runtime-environment substrate 应从本文开头列出的机器面读取，而不是从本目标设计里的历史 proof 日志读取。当前读法是：

- OPL 持有 runtime environment substrate contract、deterministic lock / bundle projection、materialization receipt、verification readback、dependency prepare receipt、run-context handoff、cache inventory、protected prune receipt 和 doctor findings。
- `prepare` 可以把 dependency lock / receipt / `dependency_run_context.json` 写入请求的 artifact root，并且只能把缺失 R 包安装到 OPL-managed R library、把缺失 Python 包安装到 OPL-managed uv environment；`paper root` 只作为旧输入别名保留。
- `run-context` 在缺少必需 refs 或请求 target identity 与 prepared context 不一致时 fail closed。
- cache inventory 与 prune receipt 必须保护 current / rollback pointers，且不得触碰 development checkout、user workspace、domain artifact body、memory body 或 owner answer。
- doctor 输出可以把普通 consumer route 指回 `opl env prepare` 或 `opl env doctor`，把 operator route 指回 `opl runtime env prepare` 或 `opl runtime env doctor`；它不是 domain readiness、App release readiness、provider readiness、publication readiness 或 production readiness oracle。

## 剩余 Owner Lane

| Lane | 当前读法 | Owner |
| --- | --- | --- |
| OPL substrate guard | 当前 contract / source / CLI / tests 定义 active runtime environment boundary。 | `one-person-lab` contracts/source/tests/read-model |
| Shared cache / offline kit | 仍是 distribution 与 release-support lane，不是 readiness claim。 | OPL Framework 与 release/CI owner surfaces |
| Domain consumers | MAS/MAG/RCA/BookForge/OMA 必须消费 OPL run-context / runtime-root refs，不能长出私有 environment manager。 | 各 domain repo active owner docs、contracts、source 与 fresh readbacks |
| App / Console projection | App 和 shell 只渲染 OPL runtime projection 并通过 OPL 路由 action；App release evidence 仍按 cohort-bound 读取。 | `one-person-lab-app` contracts、release owner records 与 shell validators |

## 过程 Provenance

早期 2026-06-21 总控 readback、MAS display dependency prepare、MAS Gallery run-context check、App shell validation output、branch/worktree state 和 command transcript 已有意从本文移除。它们只是 runtime environment substrate 与 MAS/App consumer-boundary 探索的历史 evidence foldback。

这些 transcript 不得作为当前 MAS owner route、App release state、runtime currentness、domain readiness、publication readiness、production readiness、provider long-soak、owner receipt、typed blocker 或 Full plan-completion evidence 使用。若需要这些 claim，必须从当前 source 重新运行对应 OPL / domain / App owner readback，并把结果记录到对应 owner surface，而不是写回本目标设计文档。
