# OPL 当前状态与理想目标差距

本文只记录已有具体断点、明确负责人和验收方法的未完成工作。长期职责、例行维护和未验证的猜测不作为 gap；执行进度留在对应 Issue。

## 知识来源模型的安装与实际工作区验收

来源合同、直接正文解析、必要知识匹配、授权与版本核验以及接受写回已在源码链路实现。当前仍需确认已安装的 Framework 与领域包采用同一合同，并在实际工作区完成来源绑定、阶段上下文和写回入口的回读。设计依据由[知识来源与记忆政策](../policies/knowledge-source-and-memory-policy.md)持有。

Framework 负责安装入口与通用运行回读，各领域 owner 负责现役工作区的绑定、消费和写回验证，Persona 负责派生上下文入口的实装核验。完成条件是安装包与当前合同一致，内部目录、外部个人库和混合来源在实际入口形成可验证的正文快照与消费证据，并证明私有正文未被复制成第二主源。源码测试不能代替这些安装与使用路径证据。

## 维护方式

新增条目前必须给出当前断点证据、负责人和可观察完成条件。完成后删除条目，并仅在对应当前说明中更新行为；不追加完成区、测试总数或发布快照。

App、Cloud、Package 的部署验收与专业质量属于各 owner，本页未列出它们不表示已就绪。通用证据限制见 [当前状态](../status.md#production-evidence)。

## Agent 原生应用的后续验收与兼容退役

设计标准见[Agent 原生应用政策](../policies/agent-native-app-policy.md)，接入与验证见[开发指南](../mcp-apps/development.md)。领域数据与决定由各 owner 持有；共享界面、来源摘要和开发样例的源码接通，不自动消除下列真实载体与业务链路的验证边界。

| owner | 当前具体断点 | 下一步与完成条件 |
| --- | --- | --- |
| Framework、App/Studio；Relay、MAC、Photo | 领域 CLI/载体和 shared App/Host 已有各自验收，发行安装中的三条完整协作链仍需分别核验 | 使用同一 exact Framework、Host 和 carrier，在隔离安装宿主验证精确对象打开、人的修改/决定、owner 应用及 Agent 回读；记录重开、旧版本、撤权、unknown 与无 UI 降级。源码构建安装与公开发行分别记录 |
| OMA + Framework | Photo/Relay 的共享内容样例已通过真实 Blueprint 校验与物化；尚未完成从 `engineer-agent` 产出到安装激活、连接/知识复用及 UI 交接的一次完整新应用验收 | 复用已有样例和正式安装入口，保留生成来源、安装身份及 owner 操作回读；第二消费者直接复用公共内容，不另设 manifest 或 SDK |
| Framework + 已安装的 Photo/MAG/OCC 消费者 | 新 owner 已直接输出通用 view shape，Framework 的历史领域 transform 仍服务旧已安装消费者；缺少 fresh 无活跃 consumer 证明 | 通过各 owner 的正常升级交付迁移消费者；从实际 discovery/descriptor 和调用证明旧 transform 无人使用后删除。不能仅因源码已迁移就移除兼容 |
| MAS、MAG、RCA、OBF、OCC + Framework StageRun owner | 精确产物、决定引用及返回原任务入口已具备；`human_gate` 只记录决定。quality Attempt 不允许通用 `resume`，不能据此宣称专业审阅后已经继续执行 | 各领域按原公开 action 或带原 `task_id` 的 attempt 创建入口，验证同一任务创建后续 StageRun 并消费精确决定/产物；保留质量门禁。MAG 已有同 grant run 的反馈消费与修订测试，其余实际任务续跑仍由领域 owner 验收 |
| NetFleet、U60、Cloud、Fleet、GLKVM 等产品 owner | 薄接口、状态与协作投影不证明当前原生应用、真实设备/账户或公开发布载体采用相同版本；部分新 connector 仍为 development-only | 沿用各产品发布与安装路径完成版本、身份、freshness 和实际调用回读。采购、设备控制、删除等动作仍由原 owner 执行；开发资格不能通过改 admission 字段冒充发布 |
| OPL DSH + 官方 DSH MCP 客户端 | 官方 MCP 客户端的公开连接能力协商与工具投影没有保留完整 UI metadata/visibility，当前无法通过公开接口构建合规的标准 MCP Apps host | 官方公开 UI 协商、资源与元数据能力后，用 Cordis/slots 增加必要薄适配并验收同一 Framework/Relay 资源；此前提供准确的能力诊断和无 UI 交接，不复制私有客户端或会话 authority |

MAP、Link、Health 维持各自研发、冻结或试点选择边界。知识来源模型的安装与工作区验收由上文独立 owner 继续，MiniApp 仅消费其公开合同。

后续验收记录首次可用工作流所需工作、重复连接/知识/UI 实现减少、已绑定信息的重复询问次数及交接/冲突/恢复表现。先取得真实基线，再设数值目标。
