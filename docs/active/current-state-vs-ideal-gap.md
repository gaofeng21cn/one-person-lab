# OPL 当前状态与理想目标差距

本文只记录已有具体断点、明确负责人和验收方法的未完成工作。长期职责、例行维护和未验证的猜测不作为 gap；执行进度留在对应 Issue。

## 维护方式

新增条目前必须给出当前断点证据、负责人和可观察完成条件。完成后删除条目，并仅在对应当前说明中更新行为；不追加完成区、测试总数或发布快照。

App、Cloud、Package 的部署验收与专业质量属于各 owner，本页未列出它们不表示已就绪。通用证据限制见 [当前状态](../status.md#production-evidence)。

## 私有软件源的发行与安装验收

共同访问与生命周期合同见 [Package Directory](../specs/package-directory.md#私有-package-的访问合同)。本机通过本地 carrier 运行私有 Agent，不能代替授权新用户从私有源安装的验收。

| owner | 当前具体断点 | 下一步与完成条件 |
| --- | --- | --- |
| Framework、Package 发布 owner、App/Studio | 私有 Package 的真实授权发现、私有制品发布、认证下载和 UI 生命周期尚无同一发行载体的完整验收；现有本地安装不能证明新用户可从私有源获取 | 以 OCC 为代表，在获权身份与无权身份下分别验证目录、版本、安装和更新；确认未授权身份不能读取私有制品，账号切换和撤权阻止后续远端读取；已安装条目仍能禁用或卸载，重开后状态来自 carrier 回读。正式发行验收同时核对 App/Studio、Framework 与 Package 的实际安装版本 |

## Agent 原生应用的后续验收与兼容退役

设计标准见[Agent 原生应用政策](../policies/agent-native-app-policy.md)，接入与验证见[开发指南](../mcp-apps/development.md)。领域数据与决定由各 owner 持有；共享界面、来源摘要和开发样例的源码接通，不自动消除下列真实载体与业务链路的验证边界。

| owner | 当前具体断点 | 下一步与完成条件 |
| --- | --- | --- |
| App/Studio、Framework、Relay、MAC、Photo 发布 owner | 正式隔离安装的 Studio、官方 Codex 与领域 carrier 已完成草稿保存、媒体批注、合成照片计划应用和阶段知识来源展示；知识来源撤权后可见缺口与修复提示。这组源码候选尚未完成公开发行安装验收 | 在各自正常发行中绑定同一兼容 cohort，复验已安装版本、重开和关键恢复场景；保留现有隔离安装证据，不把源码候选当公开发行字节。阶段来源概览不代替动作特定知识与冻结快照的 owner 接口 |
| Framework、RCA 与个人知识 writer 的安装 owner | 公共图片执行和知识退役已由真实消费者完成隔离合成联测；当前安装载体不因源码合入自动获得这些入口 | 沿各自正常安装路径配套交付 Framework 与 consumer，回读实际模块、命令和版本；图片调用以真实 provider 兼容性为准，私人知识维护只处理获授权的精确对象 |
| OMA + Framework | Photo/Relay 样例已在隔离安装的 Framework 中完成物化、激活、发现、调用及不重复派发的重开验证；真实模型生成与具体业务验收仍需代表性新应用证明 | 复用已有样例和正式安装入口，保留生成来源、安装身份及 owner 操作回读；第二消费者直接复用公共内容，不另设 manifest 或 SDK |
| Framework + 已安装的 Photo/MAG/OCC 消费者 | 新 owner 已直接输出通用 view shape，Framework 的历史领域 transform 仍服务旧已安装消费者；缺少 fresh 无活跃 consumer 证明 | 通过各 owner 的正常升级交付迁移消费者；从实际 discovery/descriptor 和调用证明旧 transform 无人使用后删除。不能仅因源码已迁移就移除兼容 |

| MAS、MAG、RCA、OBF、OCC 领域 owner | MAG 同申请反馈消费已验证；MAS/RCA/OBF/OCC 已用真实本地 Temporal、真实领域包和合成 executor 验证同 Task 新 StageRun、精确决定消费及 replay。真实领域成果与模型质量仍需代表任务接受 | 沿用已验证 continuation 入口完成各领域代表任务，保留产物版本、人工决定和质量依据。合成执行保留质量债，不等于论文、申请、书稿或投资决定获得接受 |
| NetFleet、U60、Cloud、Fleet、GLKVM 等产品 owner | 薄接口、状态与协作投影不证明当前原生应用、真实设备/账户或公开发布载体采用相同版本；部分新 connector 仍为 development-only | 沿用各产品发布与安装路径完成版本、身份、freshness 和实际调用回读。采购、设备控制、删除等动作仍由原 owner 执行；开发资格不能通过改 admission 字段冒充发布 |
| OPL DSH + 官方 DSH MCP 客户端 | 官方 MCP 客户端的公开连接能力协商与工具投影没有保留完整 UI metadata/visibility，当前无法通过公开接口构建合规的标准 MCP Apps host | 官方公开 UI 协商、资源与元数据能力后，用 Cordis/slots 增加必要薄适配并验收同一 Framework/Relay 资源；此前提供准确的能力诊断和无 UI 交接，不复制私有客户端或会话 authority |

## 共享知识与凭证的用户界面接线

共同基座的物理归属已经明确：凭证由 provider/系统 credential helper 持有，个人知识正文优先保留在 Obsidian，Framework 管理来源 binding、接受版本、授权和运行快照。当前仍有一个产品接线断点：软件源管理页已有来源状态合同，但知识 owner 尚未提供可供 App 消费的完整 producer projection，资源页不能把工作目录或空列表解释为已接入的 Obsidian 来源。

| owner | 当前具体断点 | 下一步与完成条件 |
| --- | --- | --- |
| Framework、OPL App/Studio、知识 owner | 应用管理页可以展示连接、模型和软件源状态；知识资源需要明确的 source id、授权、接受版本、freshness、readiness 与 Obsidian locator 摘要，当前缺少统一 producer 接线 | 由知识 owner 提供安全 refs-only projection，App/Studio 复用同一资源行和 `unknown/attention/ready` 三态；在真实 Obsidian 绑定、撤权、路径变更和重新授权场景中 fresh readback，且不复制正文或建立第二知识库 |

MAP、Link、Health 维持各自研发、冻结或试点选择边界。知识来源模型的安装与工作区验收已由其 owner 完成，见[当前状态](../status.md#长期知识与记忆)；MiniApp 仅消费其公开合同。

后续验收记录首次可用工作流所需工作、重复连接/知识/UI 实现减少、已绑定信息的重复询问次数及交接/冲突/恢复表现。先取得真实基线，再设数值目标。
