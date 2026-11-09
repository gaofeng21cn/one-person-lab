# OPL 当前状态与理想目标差距

本文只记录已有具体断点、明确负责人和验收方法的未完成工作。长期职责、例行维护和未验证的猜测不作为 gap；执行进度留在对应 Issue。

## 维护方式

新增条目前必须给出当前断点证据、负责人和可观察完成条件。完成后删除条目，并仅在对应当前说明中更新行为；不追加完成区、测试总数或发布快照。

App、Cloud、Package 的部署验收与专业质量属于各 owner，本页未列出它们不表示已就绪。通用证据限制见 [当前状态](../status.md#production-evidence)。

## Agent 与应用的共用基座接入

适用范围与复用规则由[Agent 原生应用政策](../policies/agent-native-app-policy.md)持有。下列缺口来自真实调用链；领域业务库、原生凭据保管和专用 UI 各自保留原 owner，不作为批量迁移对象。

| owner | 当前具体断点 | 下一步与完成条件 |
| --- | --- | --- |
| Relay、Persona、iPhone Steward + Framework Knowledge | Relay 已委托共享来源检索与依赖验证，Persona 已接共享写回，iPhone 已接长期偏好读取；它们新增依赖的 Framework `sources/search/discover/resolve-target/register` 接口仍在生产者主线集成中 | 完成生产者与消费者配套集成及所选安装载体回读；同一来源登记一次即可被多个消费者使用，修订后版本一致，撤权、过期、原文漂移均使旧内容退出上下文。保留领域业务证据，不能把消费端已合入等同整条已安装链路可用 |
| 个人知识写入工具 + Framework Knowledge | 原处写入或移动正文的工具尚未统一衔接已登记知识的接受版本/locator；普通文件保存与共享知识可消费状态分离 | 已登记条目优先以 `knowledge_id` 调用既有 `propose/review/apply`，原处编辑沿 `inspect-source/review-source`；普通未登记笔记保留原流程。合成来源验证一次获准修订可被下一消费者读取、移动保留身份、冲突不覆盖、撤权后不可读；不批量导入私人正文 |
| Cloud + Framework Connect | Cloud `/api/v2/mcp` 仍依赖同源 CloudIdentity 浏览器会话；它不构成其他 Agent Host 可直接复用的外部连接 | 沿 Cloud 现有 identity/权限提供所需跨宿主认证与薄 Connect provider，复用原业务 API。用真实外部消费者验证连接、授权、撤销和同一工作区回读；保留同源工作台路径，不复制 Cloud identity 或业务库 |

知识侧沿已有消费者迁移完成配套集成，并让其他已登记正文写入工具衔接同一生命周期；Cloud 在公共入口具备等价能力后切换消费者。新增 provider 由真实复用需求驱动，设备或社交产品尚无第二消费者时不预建适配。

## Agent 原生应用的后续验收与兼容退役

设计标准见[Agent 原生应用政策](../policies/agent-native-app-policy.md)，接入与验证见[开发指南](../mcp-apps/development.md)。领域数据与决定由各 owner 持有；共享界面、来源摘要和开发样例的源码接通，不自动消除下列真实载体与业务链路的验证边界。

| owner | 当前具体断点 | 下一步与完成条件 |
| --- | --- | --- |
| App/Studio、Framework、Relay、MAC、Photo 发布 owner | 正式隔离安装的 Studio、官方 Codex 与领域 carrier 已完成草稿保存、媒体批注、合成照片计划应用和阶段知识来源展示；知识来源撤权后可见缺口与修复提示。这组源码候选尚未完成公开发行安装验收 | 在各自正常发行中绑定同一兼容 cohort，复验已安装版本、重开和关键恢复场景；保留现有隔离安装证据，不把源码候选当公开发行字节。阶段来源概览不代替动作特定知识与冻结快照的 owner 接口 |
| OMA + Framework | Photo/Relay 样例已在隔离安装的 Framework 中完成物化、激活、发现、调用及不重复派发的重开验证；真实模型生成与具体业务验收仍需代表性新应用证明 | 复用已有样例和正式安装入口，保留生成来源、安装身份及 owner 操作回读；第二消费者直接复用公共内容，不另设 manifest 或 SDK |
| Framework + 已安装的 Photo/MAG/OCC 消费者 | 新 owner 已直接输出通用 view shape，Framework 的历史领域 transform 仍服务旧已安装消费者；缺少 fresh 无活跃 consumer 证明 | 通过各 owner 的正常升级交付迁移消费者；从实际 discovery/descriptor 和调用证明旧 transform 无人使用后删除。不能仅因源码已迁移就移除兼容 |
| MAS、MAG、RCA、OBF、OCC 领域 owner | MAG 同申请反馈消费已验证；MAS/RCA/OBF/OCC 已用真实本地 Temporal、真实领域包和合成 executor 验证同 Task 新 StageRun、精确决定消费及 replay。真实领域成果与模型质量仍需代表任务接受 | 沿用已验证 continuation 入口完成各领域代表任务，保留产物版本、人工决定和质量依据。合成执行保留质量债，不等于论文、申请、书稿或投资决定获得接受 |
| NetFleet、U60、Cloud、Fleet、GLKVM 等产品 owner | 薄接口、状态与协作投影不证明当前原生应用、真实设备/账户或公开发布载体采用相同版本；部分新 connector 仍为 development-only | 沿用各产品发布与安装路径完成版本、身份、freshness 和实际调用回读。采购、设备控制、删除等动作仍由原 owner 执行；开发资格不能通过改 admission 字段冒充发布 |
| OPL DSH + 官方 DSH MCP 客户端 | 官方 MCP 客户端的公开连接能力协商与工具投影没有保留完整 UI metadata/visibility，当前无法通过公开接口构建合规的标准 MCP Apps host | 官方公开 UI 协商、资源与元数据能力后，用 Cordis/slots 增加必要薄适配并验收同一 Framework/Relay 资源；此前提供准确的能力诊断和无 UI 交接，不复制私有客户端或会话 authority |

MAP、Link、Health 维持各自研发、冻结或试点选择边界。知识来源模型的安装与工作区验收已由其 owner 完成，见[当前状态](../status.md#长期知识与记忆)；MiniApp 仅消费其公开合同。

后续验收记录首次可用工作流所需工作、重复连接/知识/UI 实现减少、已绑定信息的重复询问次数及交接/冲突/恢复表现。先取得真实基线，再设数值目标。
