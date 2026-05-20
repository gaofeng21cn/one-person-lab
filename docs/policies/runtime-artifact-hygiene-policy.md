# Workspace / File Lifecycle 政策

Owner: `OPL framework governance`
Purpose: `workspace_file_lifecycle_policy`
State: `active_policy`
Machine boundary: 本文是人读政策。机器约束由各仓 `scripts/verify.sh`、clean runner、pytest 配置、repo hygiene 测试和 CI 行为承担。

## 目标

OPL 系列仓库的开发 checkout 只承载 repo-source、合同、测试和文档。测试、验证、build、proof 或本地运行产生的 Python bytecode、pytest cache、egg-info、`uv sync` project venv、安装/同步副产物、build 输出、session 状态、receipt 实例、workspace state、临时输入输出和交付物实例，都必须进入系统临时目录、用户级 runtime-state、workspace 或 runtime artifact root。

这条规则用于从源头减少二次污染：验证入口应默认把生成物导向仓库外部，而不是先允许写入开发目录，再依赖测试或人工清理发现问题。

## Repo-source 边界

MAS、MAG、RCA 和后续 Foundry Agent 的源码仓应只承载可审查、可版本化、可重放的 repo-source surface。标准边界是：

| 路径 | 允许承载 |
| --- | --- |
| `agent/` | domain pack、stage、prompt、skill、knowledge、quality gate、policy、rubric 和 agent-facing 语义文件。 |
| `contracts/` | machine-readable descriptor、schema、pack compiler input、receipt schema、artifact/source/workspace locator contract 和 authority boundary。 |
| `runtime/authority_functions/` | 无法声明化的最小领域裁决函数；只能通过 OPL 标准 ABI 返回 verdict、owner receipt、typed blocker、safe action refs 或 no-forbidden-write evidence。 |
| `src/` / `packages/` | domain-owned 业务实现、薄 adapter、generated/hosted surface 的源码或包入口；不得长期承载通用 scheduler、queue、workspace lifecycle、artifact lifecycle、memory transport、session store 或 App/workbench runtime。 |
| `docs/` | 人读 truth、policy、boundary、gap、history 和 docs taxonomy；不得作为机器稳定接口。 |

源码仓可以存 locator、index、schema、fixture、contract、receipt ref、restore / retention policy 和 migration policy。源码仓不得存真实 runtime artifact body、workspace state body、session ledger 实例、临时 build/cache、project venv、install sync 副产物、交付物实例或 owner receipt 实例。

## Family 级纪律

- OPL 持有 family 级生成物隔离纪律，并把它作为 admitted domain agent 的接入要求之一。
- MAS、MAG、RCA 和后续 domain agent 必须提供 repo-local clean runner 或等价机制，让默认验证入口不会把 `.venv`、`__pycache__`、`.pytest_cache`、`*.egg-info`、`dist/`、`build/`、`out/` 写入开发 checkout。
- Python 测试入口必须显式设置 `PYTHONDONTWRITEBYTECODE`、`PYTHONPYCACHEPREFIX`、pytest `cache_dir` 和仓外 project venv 路径；使用 `uv sync` 时必须通过 `UV_PROJECT_ENVIRONMENT` 或等价机制把 project venv 指向临时目录。
- Python package 测试不得为了验证本仓代码而把当前项目安装回源码目录；需要依赖同步时，应使用不安装项目本体的环境同步方式，并通过 `PYTHONPATH` 或等价源码入口读取待测代码。
- Node、shell、native helper 或 product-entry 测试只要会启动 Python 子进程，也必须继承同一套仓外 cache 环境。
- OPL 主仓的默认验证入口必须先进入 `scripts/run-with-repo-temp-env.sh`，统一设置 `OPL_REPO_TEMP_ROOT`、`TMPDIR`、`PYTHONPYCACHEPREFIX`、pytest `cache_dir`、`UV_PROJECT_ENVIRONMENT`、`NPM_CONFIG_CACHE`、`NODE_COMPILE_CACHE`、`CARGO_TARGET_DIR` 和 `XDG_CACHE_HOME`。同一次验证里的 Node、Python、Cargo 和 npm 子进程共享这个外部临时根。
- Foundry Agent 的默认启动包必须携带 workspace / runtime artifact root locator、scope refs、idempotency key、consumed refs、expected receipt refs 和 authority boundary；启动包可以引用源码仓中的 contract/schema/policy，但不得把源码仓目录当作 runtime artifact root。

## 目录边界

- 开发 checkout：只保存源码、测试、合同、文档和可审查 fixture；不保存运行实例状态。
- 系统临时目录：保存短生命周期 pycache、pytest cache、临时 import/build 缓存和验证中间态。
- 用户级 runtime-state：保存机器私有 session、prompt、log、report、operator state 和本机 overlay。
- workspace root：保存某次任务或项目运行所需的真实输入、source cohort、work-in-progress、operator handoff 和 domain workspace state。
- runtime artifact root：保存中间产物、receipt 实例、最终交付物、provider/event refs、restore proof 所需 artifact body 和可恢复运行产物。

workspace root 与 runtime artifact root 可以同属一个受管外部根，也可以按 provider / domain / task 分开；无论采用哪种布局，源码仓只保存 locator、index、schema、receipt refs 与 retention / restore policy。需要恢复运行时，先通过 locator / index 找到外部根，再由 domain owner receipt、provider receipt 或 restore proof 证明可用性。

## Docs taxonomy 落点

workspace / file lifecycle 内容按职责落点：

- `docs/policies/`：长期 file lifecycle、checkout hygiene、repo-source 边界和运行生成物隔离纪律。
- `docs/source/`：workspace registry、source locator、source scope、source truth transport 与 source readiness projection；domain source semantics 仍归 MAS/MAG/RCA。
- `docs/delivery/`：artifact locator、package/export lifecycle、restore/retention、handoff projection 与 artifact gallery；domain artifact body、mutation authority、ready/export/quality verdict 仍归 MAS/MAG/RCA。
- `docs/runtime/`：provider/executor、stage attempt ledger、typed queue、resume/wakeup、operator projection 和 runtime manager 语义。
- `docs/specs/` 与 `contracts/`：当前 active boundary spec 与机器可读 contract；人读 prose 不作为稳定机器接口。
- `docs/history/`：旧 workspace 布局、旧 artifact 存放路线、旧 cleanup 计划、完成 proof 和 tombstone。

## 守门口径

`.gitignore` 和 repo hygiene 测试是兜底守门，不是主要治理手段。若一次验证后开发 checkout 出现 `.venv`、`__pycache__`、`.pytest_cache` 或 `*.egg-info`，应修启动入口、环境传播或 build/sync 方式；清理已有生成物只是收口步骤。

不可避免且确实属于本机运行环境的目录必须显式 ignore，并且 repo hygiene 只阻断两类问题：被错误纳入 Git 的 forbidden path，以及新出现但尚未 ignore 的运行生成物。已 ignore 的 `node_modules/`、`dist/`、`target/`、`.worktrees/`、`.DS_Store`、Python cache 等本机状态不得阻断提交面；需要清掉短生命周期 Python / pytest / Finder 残留时使用 `scripts/repo-hygiene.sh --fix`。

如果某个运行产物必须长期保留，应提升为外部 runtime artifact root 下的受管 artifact，并在源码仓登记 locator / index / receipt ref / retention policy。不得通过把 artifact body commit 进源码仓来获得可恢复性。

长期规则需要冻结时，同步上提到 `docs/invariants.md` 或相应机器合同；本文件负责解释维护纪律和落地口径。
