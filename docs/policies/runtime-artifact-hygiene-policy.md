# 运行生成物隔离政策

Owner: `OPL framework governance`
Purpose: `runtime_artifact_hygiene_policy`
State: `active_policy`
Machine boundary: 本文是人读政策。机器约束由各仓 `scripts/verify.sh`、clean runner、pytest 配置、repo hygiene 测试和 CI 行为承担。

## 目标

OPL 系列仓库的开发 checkout 只承载 repo-source、合同、测试和文档。测试、验证、build、proof 或本地运行产生的 Python bytecode、pytest cache、egg-info、`uv sync` project venv、安装/同步副产物、build 输出、session 状态、receipt 实例和交付物实例，都必须进入系统临时目录、用户级 runtime-state、workspace 或 runtime artifact root。

这条规则用于从源头减少二次污染：验证入口应默认把生成物导向仓库外部，而不是先允许写入开发目录，再依赖测试或人工清理发现问题。

## Family 级纪律

- OPL 持有 family 级生成物隔离纪律，并把它作为 admitted domain agent 的接入要求之一。
- MAS、MAG、RCA 和后续 domain agent 必须提供 repo-local clean runner 或等价机制，让默认验证入口不会把 `.venv`、`__pycache__`、`.pytest_cache`、`*.egg-info`、`dist/`、`build/`、`out/` 写入开发 checkout。
- Python 测试入口必须显式设置 `PYTHONDONTWRITEBYTECODE`、`PYTHONPYCACHEPREFIX`、pytest `cache_dir` 和仓外 project venv 路径；使用 `uv sync` 时必须通过 `UV_PROJECT_ENVIRONMENT` 或等价机制把 project venv 指向临时目录。
- Python package 测试不得为了验证本仓代码而把当前项目安装回源码目录；需要依赖同步时，应使用不安装项目本体的环境同步方式，并通过 `PYTHONPATH` 或等价源码入口读取待测代码。
- Node、shell、native helper 或 product-entry 测试只要会启动 Python 子进程，也必须继承同一套仓外 cache 环境。
- OPL 主仓的默认验证入口必须先进入 `scripts/run-with-repo-temp-env.sh`，统一设置 `OPL_REPO_TEMP_ROOT`、`TMPDIR`、`PYTHONPYCACHEPREFIX`、pytest `cache_dir`、`UV_PROJECT_ENVIRONMENT`、`NPM_CONFIG_CACHE`、`NODE_COMPILE_CACHE`、`CARGO_TARGET_DIR` 和 `XDG_CACHE_HOME`。同一次验证里的 Node、Python、Cargo 和 npm 子进程共享这个外部临时根。

## 目录边界

- 开发 checkout：只保存源码、测试、合同、文档和可审查 fixture。
- 系统临时目录：保存短生命周期 pycache、pytest cache、临时 import/build 缓存和验证中间态。
- 用户级 runtime-state：保存机器私有 session、prompt、log、report、operator state 和本机 overlay。
- workspace / runtime artifact root：保存真实输入、中间产物、receipt 实例、最终交付物和可恢复运行产物。

## 守门口径

`.gitignore` 和 repo hygiene 测试是兜底守门，不是主要治理手段。若一次验证后开发 checkout 出现 `.venv`、`__pycache__`、`.pytest_cache` 或 `*.egg-info`，应修启动入口、环境传播或 build/sync 方式；清理已有生成物只是收口步骤。

不可避免且确实属于本机运行环境的目录必须显式 ignore，并且 repo hygiene 只阻断两类问题：被错误纳入 Git 的 forbidden path，以及新出现但尚未 ignore 的运行生成物。已 ignore 的 `node_modules/`、`dist/`、`target/`、`.worktrees/`、`.DS_Store`、Python cache 等本机状态不得阻断提交面；需要清掉短生命周期 Python / pytest / Finder 残留时使用 `scripts/repo-hygiene.sh --fix`。

长期规则需要冻结时，同步上提到 `docs/invariants.md` 或相应机器合同；本文件负责解释维护纪律和落地口径。
