# OPL Specs

Specs 是 machine contract 的人读行为说明，不拥有动态状态。

- [Domain Agent admission](./opl-domain-onboarding-contract.md)
- [Shared domain contract](./shared-domain-contract.md)
- [Shared runtime contract](./shared-runtime-contract.md)
- [公共图片模型执行](./domain-image-generation.md)：复用宿主模型配置的图片生成、编辑与脱敏结果。
- [Standard Agent interface](./standard-agent-interface.md)
- [Standard Domain Agent implementation](./standard-domain-agent-implementation.md)
- [工作台与共享界面](../../packages/mcp-app-shared/src/task-workbench.ts)：Framework v2 的任务工作台、表单、交接和视图共享机制。
- [知识来源与运行上下文接口](./knowledge-sources.md)：来源绑定、接受版本、冻结召回、派生核验和知识写回。
- [Package Directory 与统一安装管理](./package-directory.md)：目录 owner、GitHub 项目准入、carrier 边界和版本回读。
- [软件源控制面](./software-sources.md)：公开/私有来源配置、CLI/RPC 连接检查、凭证引用和 UI 状态规则。

字段和枚举以 `contracts/` 与源码类型为准。接口删除后同步删除 spec、fixture 和测试，不保留兼容章节。
