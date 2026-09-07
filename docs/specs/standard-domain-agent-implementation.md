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
和包内 `relative_path`；`opl env prepare` 使用动态 Package 来源解析，并限制资源留在提供方
checkout 内。显式 `--requirement-profile` 仍优先，环境构建和就绪证据归 Framework。

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
