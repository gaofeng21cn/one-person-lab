# OPL 当前状态与理想目标差距

本文只记录已有具体断点、明确负责人和验收方法的未完成工作。长期职责、例行维护和未验证的猜测不作为 gap；执行进度留在对应 Issue。

## 知识来源模型的安装与实际工作区验收

来源合同、直接正文解析、必要知识匹配、授权与版本核验以及接受写回已在源码链路实现。当前仍需确认已安装的 Framework 与领域包采用同一合同，并在实际工作区完成来源绑定、阶段上下文和写回入口的回读。设计依据由[知识来源与记忆政策](../policies/knowledge-source-and-memory-policy.md)持有。

Framework 负责安装入口与通用运行回读，各领域 owner 负责现役工作区的绑定、消费和写回验证，Persona 负责派生上下文入口的实装核验。完成条件是安装包与当前合同一致，内部目录、外部个人库和混合来源在实际入口形成可验证的正文快照与消费证据，并证明私有正文未被复制成第二主源。源码测试不能代替这些安装与使用路径证据。

## 维护方式

新增条目前必须给出当前断点证据、负责人和可观察完成条件。完成后删除条目，并仅在对应当前说明中更新行为；不追加完成区、测试总数或发布快照。

App、Cloud、Package 的部署验收与专业质量属于各 owner，本页未列出它们不表示已就绪。通用证据限制见 [当前状态](../status.md#production-evidence)。

## Agent 原生应用基座与开发路径

目标遵循[开发标准](../policies/agent-native-app-policy.md)；技术接入见[开发指南](../mcp-apps/development.md)。下面按可独立交付的切片组织。先完成一条真实协作闭环，再增加消费者；已有知识迁移由其当前 owner 继续，MiniApp 工作不接管或复制它。

| 顺序 / owner | 当前具体断点 | 最小交付与复用 | 完成条件 |
| --- | --- | --- | --- |
| P0 / Framework MCP App、App/Studio；Relay、MAC、Photo 各自提供场景 | `tests/src/opl-mcp-app-stdio.test.ts`、Studio host tests 与领域贡献 tests 分属不同链路，协议/fixture 不能证明发行安装中的完整人机协作 | 从既有测试提取可复用场景与合成数据：共享审阅采用 MAC/Photo；专用编辑采用 Relay。统一记录所验收 Host 与 exact carrier，不新造测试运行平台 | 在实际安装宿主完成 Agent 发起→精确对象 UI→人修改/决定→owner 应用→Agent 回读；覆盖重开、旧 revision、撤权、未知 outcome、无 UI 降级；结果按证据层分开 |
| P0 / Framework Connect + 首个 provider/领域 owner | shared `mcp-app-stdio.ts` 的 `package_id` 只做导航；它没有可依据 UI 参数激活的可信 consumer 上下文 | 一个领域服务在可信安装激活时获得 `createOplConnectionContextHost`；Agent 与 UI 都调用该服务。复用已有 Connect/账号设置的状态和修复入口 | 已授权连接无需重新配置；伪造 Package 身份被拒；撤销/连接 revision 变化立即影响下一次调用；长期凭据不进入 UI/模型；业务确认仍由 owner 检查 |
| P0 / Framework 知识 owner + 当前知识迁移任务 | 现行知识 catalog 混合归属、物理目录和日期状态；新的来源/主题模型需完成消费者与真实安装闭环 | 由知识 owner 交付来源模型、绑定、冻结与写回；MiniApp 只接入其最终公开合同，展示本次知识来源、过期/缺失项和修复入口。Persona 摘要绑定来源依赖 | 有 Obsidian/只有目录两种环境可用；同一主题跨项目引用且不复制正文；任务读取同版；源改动/撤权影响后续动作；条件写回原处。该切片成果由原任务验收 |
| P1 / OMA + Framework；Flow 只链接开发入口 | OMA 已有共享/专用/专业应用选型知识，但缺一项实际生成应用同时复用连接、个人知识并完成协作的验收 | 在现有 Blueprint/EvalSpec 和生成模板补知识/连接需求及交接场景；以两个真实消费者抽取最小可复用样例，不新增 MiniApp manifest 或独立 SDK publication | 新应用不复制凭证、个人正文、任务库、loader；从生成、发现、调用到必要 UI 与结果回读全部可操作；第二个消费者直接复用同一公共部分 |
| P1 / Framework + 相关领域 owner | `app-contribution-adapter.ts` 的 transform 枚举仍包含 `photo_status`、`grant_workspace`、`capital_decision` 等领域命名；增加领域会扩大中心适配器 | 先按真实重复程度选择两个 owner，把领域 shape 转换移入 owner read，Framework 保留通用 renderer/schema 路由；兼容现有已装消费者后退役对应分支 | 迁移前后同对象/版本/动作语义一致；现行 carrier 可调用；源码与 fresh consumers 证明旧分支无人使用后删除。不要一次重写所有适配 |
| P1 / RedNote、Travel；Framework 仅提供共享交互 | RedNote 的 package capability 明示无 graphical MCP App；Travel `scripts/update-atlas.mjs` 写结果仍主要为人读输出 | RedNote 复用 Controller/SQLite 增加精确内容/素材审阅；Travel 先提供结构化成功/错误和 owner receipt，再按需要接共享差异/审阅 | Agent 可读真实写结果；人核对精确版本/目标；未知结果可查询；不复制发布、地图或状态 owner |
| P1 / MAS、MAG、RCA、OBF、OCC 各领域 owner | 共享进度/产物或研究视图已存在，但不自动证明“专业审阅→原任务继续”已验收 | 每个 owner 选一个真实代表任务；共享 renderer 展示已有证据、候选与判断输入。先复用已存在 runtime action；只补缺失的领域反馈操作 | 人的决定进入原任务/StageRun，保留精确 artifact revision 和来源；专业编辑交给合适应用；领域接受与执行完成分别记录 |
| P2 / NetFleet、U60、Vault、Cloud、Fleet 各 owner | NetFleet 连接包仍 development-only；U60 尚缺统一 discovery；Vault 以 CLI 为主；Cloud API 与专业界面分散 | 逐项复用已有 API：NetFleet 补载体交付/调用验收，U60 先加发现与结构化诊断，Vault 用共享筛选/清理预览，Cloud 用受权只读工具与报价审阅，Fleet 保留持续显示端 | 真实设备/账户/对象绑定明确；破坏性或付费操作经原 owner；发布/安装与实时状态各自回读。设备和 Cloud 不因统一品牌被重写成 iframe |

开始时 P0 三条可并行，各自有可执行的 owner 工作；P1 的样例、领域操作和视图可用公开合同与 fixture 独立开发。最终集成以实际 owner 合同和消费者回读决定顺序，不创建只等待其他仓 main 的空任务。P2 根据实际使用频率推进；冻结或仅规划的产品不增加迁移承诺。

验收关注：新应用首条可用工作流所需工时、重复连接/知识/UI代码减少、已绑定信息的重复询问次数，以及交接/冲突/恢复场景的通过情况。先取得首批真实基线再设置数值目标，避免用新模块数量或测试数量代替开发效率与产品质量。
