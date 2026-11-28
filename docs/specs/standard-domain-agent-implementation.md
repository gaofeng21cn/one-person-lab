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

Pack compiler 的 `implementation_profile` 使用 canonical `base_profile_ref` 与领域 helper 声明，
`standard_agent_pack_abi` 仅声明 Framework `authority_ref`。完整生效 Profile 和 ABI 由
Framework 解析生成，领域声明不复制基座合同正文。

## 托管适配

Framework adapter 只负责把通用 Workspace/Stage/Attempt envelope送入 owner entrypoint，并把 refs-only结果投影回来。业务逻辑不复制到 Framework。

标准接口 v1 的 `workspace_binding` 与 `shared_resources` 条目允许附加领域描述，解析时保留，
不因 Framework 尚未认识这些元信息而阻断入口。Framework 只消费已知字段：共享资源由领域
声明相对路径与角色，路径不得越出工作区，资源路径不得重复；locator 和已知字段类型仍须有效。
附加描述不自动成为已支持的执行能力，依赖新行为的消费者须验证真实支持；运行、路由与根接口
的执行合同仍按其声明校验；已退役的 `entry_command_template`、`manifest_command_template`
不能作为元信息重新引入。省略可选的 `shared_resources` 时继续使用原有 Profile 默认值。

解析兼容性由 Framework 发布与安装版本决定，单独更新领域 Package 不会修改旧 Framework
解析器。Framework 与 Package 独立发布和更新，不引入组合锁或跨包冻结；发布入口见
[Artifact 与 Package Delivery 边界](../delivery/artifact-package-lifecycle-boundary.md)。

领域若存在 Python/R 等外部运行环境需求，应在自身 `opl-package.json` 或仓库环境配置文件中声明并在领域入口内自管准备（例如 Python `uv` / R `renv` 虚拟环境与依赖锁）；Framework v2 已移除独立 `opl env` CLI 命名空间，Base 与领域运行环境边界独立保持。准备环境时建议记录实际安装版本、解释器身份与构建运行上下文，由调用侧绑定结果而非扫描整套数据集。依赖声明记录不宣称完整科研复现，正式结果冻结仍归领域 Agent。标准包缓存由 `uv`/`renv` 管理；历史研究目录及其环境记录不作为可删除的包缓存。环境准备和进程成功不授予领域质量、发表或 App 发布结论。

产物分类通过 `standard_contract_refs.artifact_lifecycle_profile` 指向本仓 refs-only Profile。`opl workspace init` 首次将其投影到项目的 `control/opl/artifact_lifecycle/artifact_lifecycle_profile.json`，保留已有项目自定义文件。
`output_groups` 声明项目内目录 `ref` 和领域 `role`；嵌套目录使用最具体的声明，文件不重复计数。
未声明或旧 Profile 继续扫描通用产物根并使用中性角色 `output_artifact`，不会据目录名推断稿件、
插图或质量含义。盘点不替代领域验收。

## 新 Agent

OMA/Foundry 可以生成 blueprint、scaffold 和 eval spec，但 target repo owner决定采用、实现、版本和发布。新 Agent 通过 native carrier installed descriptor 自动进入发现面，不修改 Framework 固定清单。

## 完成边界

schema、scaffold 和测试通过只证明结构可消费。installed/enabled、真实 StageRun、专业产物、owner acceptance 和 publication 必须分别验证。
