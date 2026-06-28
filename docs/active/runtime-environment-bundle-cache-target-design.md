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

## 2026-06-21 总控证据折返

本节记录本轮总控在不接管活跃 MAS 业务写集的前提下，对 OPL managed runtime
environment substrate、MAS display dependency consumer 和 App/Console consumer boundary
做出的 fresh readback。它是 handoff/evidence foldback，不是 domain ready、publication
ready、App release ready 或 full Plan Completion Audit。

只读 gate 结论：

- `one-person-lab` root `main...origin/main` clean，HEAD 为
  `95a89e54159117628b315181079137e540f44636`；本轮接管的
  `test-transition-runtime-readback-source-boundary-20260621` lane 已吸收、push、ledger
  close，worktree / branch 均已不存在。
- `med-autoscience` root `main...origin/main` clean，HEAD 为
  `79514e41fff09f577c1a2d0fdcfabbef0c8e5a48`；当时的 MAS
  LidocaineQ/gallery/cohort-flow lane 只作为 2026-06-21 handoff snapshot 记录。
  后续行动必须重新读取 MAS owner repo、thread/worktree 和 currentness gate，不能把本节当作当前
  MAS worktree truth。
- `019ee959-b3bb-7ad3-bac6-25c266cbed9c` 已恢复为
  `核实MAS绘图模板风格`，pin 且未归档；其 recovery worktree 只作为 MAS 绘图业务上下文
  保留，不参与本轮吸收。
- `one-person-lab-app` root `main...origin/main` clean，HEAD 为
  `88f869f2129a038536a4832ae168df2c82c34629`；存在独立 release/size dirty
  worktrees。本轮只做 App consumer boundary readback，不做 release closeout。

Fresh OPL substrate evidence：

- `./bin/opl runtime env doctor --json` 返回
  `runtime_lock_materializer_verify_cache_prune_run_context_guard_available`，并显式保持
  `host_environment_fallback_allowed=false`、`can_claim_domain_ready=false`、
  `can_claim_app_release_ready=false`。
- `./bin/opl runtime env contract --json` 仍声明 OPL 是 canonical runtime environment
  owner，domain agents 只声明 dependency intent，`prepare --apply` 只安装到 OPL-managed
  library path 并写 `dependency_run_context.json`。
- `node --experimental-strip-types --test tests/src/runtime-environment-substrate.test.ts
  tests/src/cli/cases/runtime-environment-substrate-command-surface.test.ts
  tests/src/cli/cases/framework-readiness-cli-surface.test.ts` 通过 `16` 项。
- `node --experimental-strip-types --test
  tests/src/cli/cases/family-runtime-current-control-provider-admission-cases/transition-runtime-readback-intake.ts`
  通过 `7` 项；`npm run typecheck` 通过；`npm run line-budget -- --list` 通过且无输出。
- `./bin/opl runtime env cache inventory --json` 与
  `./bin/opl runtime env cache prune --dry-run --json` 返回 protected current pointer、
  zero stale deletions；cache hit/miss 仍不计入 readiness。

Fresh MAS dependency prepare / managed library evidence：

- Scoped alluvial prepare：
  `opl runtime env prepare --domain mas --profile display --platform macos-arm64
  --requirement-profile /Users/gaofeng/workspace/med-autoscience/display-packs/fenggaolab.org.medical-display-core/renderer_dependency_profile.json
  --requirement-profile-id r_ggplot2_alluvial_transition_v1 --paper-root
  /tmp/opl-mas-display-fresh-20260621-dKUSPk/alluvial/paper
  --apply --json` 返回 `status=prepared`，`run_context_ref=paper/build/dependency_run_context.json`，
  managed library 为
  `/Users/gaofeng/Library/Application Support/OPL/state/runtime-environment/targets/mas/display/macos-arm64/dependency-libraries/53608a677fe8c094fd17cc15/R`，
  fingerprint 为 `sha256:af5a45a1711428d347e86339ae2787a9e4460e3f34afd94c387fede4fe918367`。
- 同一 alluvial managed library 内 fresh `Rscript` readback 加载
  `jsonlite 2.0.0`、`ggplot2 4.0.3`、`ggsci 5.0.0`、`ggalluvial 0.12.6`，
  且 `find.package()` 均位于上述 OPL-managed library path 下。
- Full MAS display prepare 到
  `/tmp/opl-mas-display-fresh-20260621-dKUSPk/full/paper` 选择
  `r_ggplot2_evidence_subprocess_v1`、`r_ggplot2_alluvial_transition_v1`、
  `r_ggplot2_ggconsort_reporting_flow_v1`、`r_ggplot2_p1_comparison_subprocess_v1`，
  managed library 为
  `/Users/gaofeng/Library/Application Support/OPL/state/runtime-environment/targets/mas/display/macos-arm64/dependency-libraries/0df5a575494b2abe61831519/R`，
  fingerprint 为 `sha256:89ce403f396a0b5b6251cf753febf44ce1814de5b7bd1f9a8fb64ca41709d7e7`。
- 同一 full managed library 内 fresh `Rscript` readback 加载
  `jsonlite 2.0.0`、`ggplot2 4.0.3`、`ggsci 5.0.0`、`patchwork 1.3.2`、
  `gridExtra 2.3`、`Rtsne 0.17`、`uwot 0.2.4`、`ggalluvial 0.12.6`、
  `dplyr 1.2.1`、`ggconsort 0.1.0`，且 `find.package()` 均位于上述
  OPL-managed library path 下。

Fresh MAS Gallery consumer evidence on `med-autoscience` main：

- Full display prepare 到
  `/tmp/opl-mas-display-fresh-20260621-dKUSPk/full/paper`
  选择 `r_ggplot2_evidence_subprocess_v1`、
  `r_ggplot2_alluvial_transition_v1`、
  `r_ggplot2_ggconsort_reporting_flow_v1`、
  `r_ggplot2_p1_comparison_subprocess_v1`，required packages 为
  `jsonlite`、`ggplot2`、`ggsci`、`patchwork`、`gridExtra`、`Rtsne`、`uwot`、
  `ggalluvial`、`dplyr`、`ggconsort`，fingerprint 为
  `sha256:89ce403f396a0b5b6251cf753febf44ce1814de5b7bd1f9a8fb64ca41709d7e7`。
- `MAS_DISPLAY_GALLERY_DEPENDENCY_RUN_CONTEXT_PATH`、`REF` 和 `FINGERPRINT` 指向上述
  OPL run-context 后，`scripts/build-display-pack-gallery.py --output-root
  /tmp/opl-mas-display-fresh-20260621-dKUSPk/mas-gallery-full-output --force-render`
  返回 `status=rendered`、`active_template_count=34`、`visual_gallery_template_count=37`、
  `internal_rendered_image_template_count=37`、`lidocaineq_reference_coverage.coverage_complete=true`、
  `quality_audit.overall_status=not_publication_ready`、
  `quality_audit.publication_ready_claim_authorized=false`。
- `alluvial_transition` 在 Gallery manifest 中为 `renderer_family=r_ggplot2`、
  `render_status=rendered`，dependency environment 为 `prepared`，required profile 为
  `r_ggplot2_alluvial_transition_v1`，并生成
  `/tmp/opl-mas-display-fresh-20260621-dKUSPk/mas-gallery-full-output/medical_display_gallery_assets/alluvial_transition.png`
  和 `.pdf`。
- `table1_baseline_characteristics` 生成 R/ggplot2 gallery preview：
  layout sidecar `source_renderer=LidocaineQ/Figure_Template::baseline_table`，
  `renderer_family=r_ggplot2`，manifest `analysis_responsibility=table_shell`，dependency
  environment 为 `prepared`，authority 仍保留在 table shell 而非 gallery preview。
- 当前 `med-autoscience` main 的 `cohort_flow_figure` Gallery 仍输出
  `cohort_flow_figure.design.*`，`renderer_family=python`，
  layout `uses_ggconsort=false`。因此不能把 main Gallery claim 为 ggconsort ready。

Fresh fail-closed evidence：

- 缺 `MAS_DISPLAY_GALLERY_DEPENDENCY_RUN_CONTEXT_*` 时 Gallery exit `1`，
  error 为 `alluvial_transition requires OPL-prepared dependency run-context ... Run
  opl runtime env prepare --domain mas --profile display --apply or OPL doctor`。
- `MAS_DISPLAY_GALLERY_DEPENDENCY_RUN_CONTEXT_FINGERPRINT` 与 run-context fingerprint
  不一致时 Gallery exit `1`，error 为 `dependency run-context fingerprint mismatch ...
  rerun OPL prepare/doctor`。
- 使用 scoped alluvial-only run-context 跑 full Gallery 时 Gallery exit `1`，error 为
  `dependency run-context profile mismatch; missing r_ggplot2_evidence_subprocess_v1`，
  route 指回 OPL prepare。
- run-context 指向空 managed R library 时 Gallery exit `1`，error 为
  `managed R library is missing packages ggalluvial; run OPL prepare/doctor for the MAS
  display profile`。

Fresh MAS uv / clean runner evidence：

- `/Users/gaofeng/workspace/med-autoscience/scripts/run-python-clean.sh --clean-runner-status`
  返回 `status=warm`、`reuse_env_enabled=true`、`marker_current=true`、
  `sync_required=false`，cache root 在 `~/.cache/med-autoscience/clean-runner`。
- `env PYTHONPATH=src ./scripts/run-pytest-clean.sh
  tests/test_test_command_surfaces_cases/test_clean_python_runner_uv_cache.py` 通过 `12` 项。

Fresh App / Console consumer boundary evidence：

- `/Users/gaofeng/workspace/one-person-lab-app` 的
  `npm run validate:shell-convergence` 返回
  `status=closed_structure_gate_not_live_evidence`，active shell 为 AionUI，
  Hermes 是 foreground alternative，AGUI 是 archived technical proof；false-ready 字段均为 false。
- `npm run validate:release-boundary` 通过。
- `npm run test:release-boundary` 通过 `164` 项。
- 这些只证明 App/Console consumer boundary 和 false-ready guard，不证明 App release ready。

2026-06-21 historical handoff snapshot：

- 该段只记录当时未由 OPL 总控接管的 MAS LidocaineQ/gallery/parity lane 边界。
  它不是当前 MAS owner route、worktree currentness 或 handoff 状态。
- 若未来继续 MAS Gallery / LidocaineQ / cohort-flow 工作，必须先在 MAS 仓重新读取 root/worktree
  currentness、owner thread、dirty write set、diff、OPL prepare、Gallery 正向/负向证据、
  focused tests、视觉审计和 artifact evidence。
- 本节不能声明 `ggconsort cohort-flow Gallery evidence`、`LidocaineQ parity audit done`、
  `MAS docs/examples foldback to main`、MAS lane absorption / push / cleanup、domain ready、
  publication ready、App release ready 或 production ready。

## 2026-06-21 续跑证据折返

本节是同一总控目标的续跑 readback，记录 fresh evidence root
`/tmp/opl-mas-display-goal-20260621-NSqdoJ`。它更新上一节的临时证据路径和当前 gate
状态，但仍不是 domain ready、publication ready、App release ready 或最终 Plan
Completion Audit。

Current gate：

- `one-person-lab` root `main...origin/main` clean，HEAD 为
  `d8b739b7a17d95fa139f452247fea06080541d9e`，无 dirty/staged worktree，
  `codex_ops_gate.py status --repo /Users/gaofeng/workspace/one-person-lab
  --run-profile-checks` 返回 `may_write=true`、`cleanup_needed=false`。
- `med-autoscience` root `main...origin/main` clean，HEAD 为
  `79514e41fff09f577c1a2d0fdcfabbef0c8e5a48`。当时观察到的 MAS
  LidocaineQ/gallery/parity worktree 只作为 historical snapshot 记录；本节不再作为当前
  MAS handoff、owner thread 或 worktree currentness 依据。
- 线程 `019ee959-b3bb-7ad3-bac6-25c266cbed9c` 维持 pin / 未归档 / 标题
  `核实MAS绘图模板风格`，绑定 recovery worktree
  `/Users/gaofeng/.codex/worktrees/67a3/med-autoscience`，只作为 MAS 绘图业务上下文；
  不并发写前述 historical MAS LidocaineQ/gallery/parity 写集。
- `one-person-lab-app` root `main...origin/main` clean，HEAD 为
  `88f869f2129a038536a4832ae168df2c82c34629`；存在独立 release/size dirty
  worktrees。本轮只验证 App/Console consumer boundary，不接管 release/size lanes。

Fresh OPL substrate verification：

- `./bin/opl runtime env doctor --json` 返回
  `runtime_lock_materializer_verify_cache_prune_run_context_guard_available`，并保持
  `host_environment_fallback_allowed=false`、`can_claim_domain_ready=false`、
  `can_claim_app_release_ready=false`。
- `./bin/opl runtime env contract --json` 声明 OPL 是 canonical runtime environment
  owner，domain agents 只声明 dependency intent；`prepare --apply` 只把缺失语言包安装到
  OPL-managed library path，并写 dependency lock、receipt 和
  `dependency_run_context.json`。
- `npm run typecheck` 通过。
- `node --experimental-strip-types --test tests/src/runtime-environment-substrate.test.ts
  tests/src/cli/cases/runtime-environment-substrate-command-surface.test.ts
  tests/src/cli/cases/framework-readiness-cli-surface.test.ts` 通过 `16` 项。

Fresh OPL prepare / managed library evidence：

- Scoped alluvial prepare：
  `opl runtime env prepare --domain mas --profile display --platform macos-arm64
  --requirement-profile /Users/gaofeng/workspace/med-autoscience/display-packs/fenggaolab.org.medical-display-core/renderer_dependency_profile.json
  --requirement-profile-id r_ggplot2_alluvial_transition_v1 --paper-root
  /tmp/opl-mas-display-goal-20260621-NSqdoJ/alluvial/paper --apply --json`
  返回 `status=prepared`，run-context 为
  `/tmp/opl-mas-display-goal-20260621-NSqdoJ/alluvial/paper/build/dependency_run_context.json`，
  managed library 为
  `/Users/gaofeng/Library/Application Support/OPL/state/runtime-environment/targets/mas/display/macos-arm64/dependency-libraries/53608a677fe8c094fd17cc15/R`，
  fingerprint 为 `sha256:af5a45a1711428d347e86339ae2787a9e4460e3f34afd94c387fede4fe918367`。
- Full display prepare：
  `opl runtime env prepare --domain mas --profile display --platform macos-arm64
  --requirement-profile /Users/gaofeng/workspace/med-autoscience/display-packs/fenggaolab.org.medical-display-core/renderer_dependency_profile.json
  --paper-root /tmp/opl-mas-display-goal-20260621-NSqdoJ/full/paper --apply --json`
  返回 `status=prepared`，选择
  `r_ggplot2_evidence_subprocess_v1`、`r_ggplot2_alluvial_transition_v1`、
  `r_ggplot2_ggconsort_reporting_flow_v1`、`r_ggplot2_p1_comparison_subprocess_v1`；
  run-context 为
  `/tmp/opl-mas-display-goal-20260621-NSqdoJ/full/paper/build/dependency_run_context.json`，
  managed library 为
  `/Users/gaofeng/Library/Application Support/OPL/state/runtime-environment/targets/mas/display/macos-arm64/dependency-libraries/0df5a575494b2abe61831519/R`，
  fingerprint 为 `sha256:89ce403f396a0b5b6251cf753febf44ce1814de5b7bd1f9a8fb64ca41709d7e7`。
- 以 full run-context 的 `R_LIBS_USER` 强制 `.libPaths(c(managed))` 后，fresh
  `Rscript` readback 成功加载
  `jsonlite 2.0.0`、`ggplot2 4.0.3`、`ggsci 5.0.0`、`patchwork 1.3.2`、
  `gridExtra 2.3`、`Rtsne 0.17`、`uwot 0.2.4`、`ggalluvial 0.12.6`、
  `dplyr 1.2.1`、`ggconsort 0.1.0`；`find.package()` 均位于上述 OPL-managed
  library path 下。

Fresh MAS Gallery consumer evidence on `med-autoscience` main：

- 使用 full run-context 注入
  `MAS_DISPLAY_GALLERY_DEPENDENCY_RUN_CONTEXT_PATH`、`REF` 和 `FINGERPRINT` 后，
  `./scripts/run-python-clean.sh scripts/build-display-pack-gallery.py --output-root
  /tmp/opl-mas-display-goal-20260621-NSqdoJ/mas-gallery-full-output --force-render`
  返回 `status=rendered`、`active_templates=34`、`gallery_visual_templates=37`、
  `internal_rendered_image_templates=37`、`lidocaineq_reference_coverage_complete=true`、
  `quality_overall_status=not_publication_ready`、
  `publication_ready_claim_authorized=false`。
- Manifest：
  `/tmp/opl-mas-display-goal-20260621-NSqdoJ/mas-gallery-full-output/medical_display_gallery_assets/gallery_manifest.json`。
  PDF：
  `/tmp/opl-mas-display-goal-20260621-NSqdoJ/mas-gallery-full-output/medical_display_gallery.pdf`。
- `alluvial_transition` manifest 行为：`render_status=rendered`、
  `renderer_family=r_ggplot2`、`execution_mode=subprocess`，dependency environment 为
  `status=prepared`，required profile 为 `r_ggplot2_alluvial_transition_v1`，输出
  `medical_display_gallery_assets/alluvial_transition.png` 和 `.pdf`。
- `table1_baseline_characteristics` manifest 行为：`render_status=rendered`，
  `analysis_responsibility=table_shell`，输出
  `medical_display_gallery_assets/table1_baseline_characteristics.png` 和 `.pdf`；
  dependency environment 为 `prepared`，只证明 Gallery preview 走通，不改变 Table 1
  authority。
- `lidocaineq_reference_coverage.coverage_complete=true`，
  `covered_reference_template_count=33` / `reference_template_count=33`，且
  `blocked_template_count=0`、`gallery_visual_blocked_template_count=0`。
- 当前 `med-autoscience` main 的 `cohort_flow_figure` 仍在 `non_visual_inventory` 中输出
  `cohort_flow_figure.design.*`，`renderer_family=python`，dependency environment 为空。
  虽然 manifest 保留 `r_ggplot2_ggconsort_reporting_flow_v1` dependency intent 和
  `checked_in_renderer_uses_ggconsort=true` contract refs，但 main Gallery 尚未证明
  cohort flow 真实走 ggconsort；该项在 2026-06-21 snapshot 中仍需要 MAS owner repo
  后续证据，当前判断必须 fresh-read MAS。

Fresh fail-closed evidence：

- 缺 `MAS_DISPLAY_GALLERY_DEPENDENCY_RUN_CONTEXT_*` 时 Gallery exit `1`：
  `alluvial_transition requires OPL-prepared dependency run-context ... Run
  opl runtime env prepare --domain mas --profile display --apply or OPL doctor`。
- 指定错误 fingerprint `sha256:deadbeef` 时 Gallery exit `1`：
  `alluvial_transition dependency run-context fingerprint mismatch ... rerun OPL prepare/doctor`。
- 使用 scoped alluvial-only run-context 跑 full Gallery 时 Gallery exit `1`：
  `calibration_curve_binary dependency run-context profile mismatch; missing
  r_ggplot2_evidence_subprocess_v1. Run OPL prepare with the MAS display requirement profile.`
- 将 run-context 的 `R_LIBS_USER` 指向空 managed library 目录时 Gallery exit `1`：
  `alluvial_transition dependency run-context managed R library is missing packages
  ggalluvial; run OPL prepare/doctor for the MAS display profile`。

Fresh MAS clean-runner evidence：

- `./scripts/run-python-clean.sh --clean-runner-status` 返回 `status=warm`、
  `reuse_env_enabled=true`、`marker_current=true`、`sync_required=false`，环境和 uv cache
  均位于 `~/.cache/med-autoscience/clean-runner`。
- `PYTHONPATH=src ./scripts/run-pytest-clean.sh
  tests/test_test_command_surfaces_cases/test_clean_python_runner_uv_cache.py` 通过 `12` 项。

Fresh App / Console consumer boundary evidence：

- `npm run validate:shell-convergence` 返回
  `status=closed_structure_gate_not_live_evidence`，active shell 为 AionUI，Hermes 是
  foreground alternative，AGUI 是 archived technical proof；false-ready 字段均为 false。
- `npm run validate:release-boundary` 通过。
- `npm run test:release-boundary` 通过 `164` 项。
- 这些证据只证明 App/Console consumer boundary 和 release false-ready guard，不证明 App
  release ready。

Historical boundary：

- 本节只说明 2026-06-21 当时 OPL 总控没有接管 MAS LidocaineQ/gallery/parity 写集；
  不给出当前 MAS owner route、thread state、worktree state 或 cleanup 授权。
- 后续继续这些 MAS 项目前，先以 MAS 仓 fresh evidence 重新判定：
  `ggconsort cohort-flow Gallery evidence`、`LidocaineQ parity audit/artifact evidence`、
  MAS docs/examples foldback、main-session independent diff review / verification /
  absorb / push / cleanup。
