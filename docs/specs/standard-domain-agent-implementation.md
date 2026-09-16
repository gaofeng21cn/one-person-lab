# Standard Domain Agent 实现规范

本文说明 Standard Agent repo 的最小实现形态，目录细节见 [repo 结构政策](../policies/standard-agent-repo-structure.md)。

## 必需组成

- owner Package/Agent descriptor；
- capability map；
- callable domain entrypoint；
- Workspace locator；
- Stage contracts 与 artifact conventions；
- domain-owned progress、receipt、typed blocker 和 human gate；
- repo-native verify entry；
- 可 standalone 运行的 owner路径。

## 托管适配

Framework adapter 只负责把通用 Workspace/Stage/Attempt envelope送入 owner entrypoint，并把 refs-only结果投影回来。业务逻辑不复制到 Framework。

领域通过 descriptor 的 `standard_contract_refs.runtime_environment_requirement_profile`
引用本仓环境需求。该文件的 `runtime_profile_sources` 可按 Profile 声明提供方 `package_id`
和包内 `relative_path`；Framework 在首次准备时动态解析 Package 来源，并限制资源留在提供方
checkout 内。显式 `--requirement-profile` 优先。

有环境依赖的临时任务直接使用 `opl env run --domain <domain> --profile <profile>
--artifact-root <path> [--requirement-profile <path>] -- <command...>`：已有环境直接运行，
首次使用或依赖声明变化时自动准备。Python 通过 uv 安装到受管虚拟环境并绑定实际解释器；
R 通过 renv 安装到受管库并复用全局包缓存。相同依赖、来源、解释器身份可跨任务复用，依赖声明顺序不影响缓存，
每次执行使用独立进程。可重复传入 `--requirement-profile-id` 合并明确的依赖配置；来源冲突不能静默覆盖，版本和必要导出仅在准备时验证。`--cwd` 选择任务目录，`--timeout-ms` 限制执行时间；取消和超时
清理进程组。`--prepare-timeout-ms` 单独限制准备阶段（默认 600000 毫秒，含锁等待）；安装、探测与锁等待均可取消，超时退出 124。`--refresh` 重新检查和记录环境，不代表强制升级所有依赖。

准备环境时在其根目录写一次 `environment.json`，包含实际安装版本和解释器身份；
执行记录引用 `manifests/` 内的独立版本快照，显式刷新保留旧快照。
产物 `build/dependency_run_context.json` 绑定 `environment_id`、`environment_manifest_ref`、
依赖声明和执行变量；每次运行只追加 `build/executions/<uuid>.json`，记录环境引用、命令、
时间和退出码，不扫描数据集或重新生成完整依赖清单。记录失败会报告诊断，但不改变真实
命令退出结果。记录中的 `timings_ms` 包含 context_check、prepare（含 lock_wait）、command 和 total；cache_outcome 区分 artifact_hit/shared_hit/prepared/refreshed。子进程通过 `OPL_ENV_EXECUTION_ID`、`OPL_ENV_MANIFEST_REF` 直接绑定结果，不搜索最新记录。依赖声明记录不宣称完整科研复现，正式结果冻结仍归领域 Agent。

临时执行无需通用 layer/bundle/build/materialize/verify 流程。`opl env prepare --apply`
用于提前准备；`opl runtime env inspect|run-context|cache inventory|contract` 用于读取。
标准包缓存由 uv/renv 管理；历史研究目录及其环境记录不作为可删除的包缓存。
环境准备和进程成功不授予领域质量、发表或 App 发布结论。基准入口 `node scripts/benchmark-runtime-environment.mjs --help` 支持源码、编译后和正常安装入口；输出机器、版本、冷暖状态、p50/p95 及阶段耗时。

产物分类通过 `standard_contract_refs.artifact_lifecycle_profile` 指向本仓 refs-only Profile。
`workspace init/ensure` 首次将其投影到项目的
`control/opl/artifact_lifecycle/artifact_lifecycle_profile.json`，保留已有项目自定义文件。
`output_groups` 声明项目内目录 `ref` 和领域 `role`；嵌套目录使用最具体的声明，文件不重复计数。
未声明或旧 Profile 继续扫描通用产物根并使用中性角色 `output_artifact`，不会据目录名推断稿件、
插图或质量含义。盘点不替代领域验收。

## 新 Agent

OMA/Foundry 可以生成 blueprint、scaffold 和 eval spec，但 target repo owner决定采用、实现、版本和发布。新 Agent 通过 native carrier installed descriptor 自动进入发现面，不修改 Framework 固定清单。

## 完成边界

schema、scaffold 和测试通过只证明结构可消费。installed/enabled、真实 StageRun、专业产物、owner acceptance 和 publication 必须分别验证。
