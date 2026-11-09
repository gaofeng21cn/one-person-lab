# OPL Specs

Specs 是 machine contract 的人读行为说明，不拥有动态状态。

- [Domain Agent admission](./opl-domain-onboarding-contract.md)
- [Shared domain contract](./shared-domain-contract.md)
- [Shared runtime contract](./shared-runtime-contract.md)
- [Standard Agent interface](./standard-agent-interface.md)
- [Standard Domain Agent implementation](./standard-domain-agent-implementation.md)
- [工作台服务接口](./workbench-services.md)：计划任务、记忆纠错、只读用量和受控日志清理的 Framework 插件接口。
- [知识来源与运行上下文接口](./knowledge-sources.md)：来源绑定、接受版本、冻结召回、派生核验和知识写回。

字段和枚举以 `contracts/` 与 schema 为准。接口删除后同步删除 spec、fixture 和测试，不保留兼容章节。
