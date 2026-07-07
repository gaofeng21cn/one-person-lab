# 公开文档入口

Owner: `One Person Lab`
Purpose: `public_support_index`
State: `active_support`
Machine boundary: 本文是人读索引。公开产品 truth 继续归 README、核心五件套、contracts、source、CLI/API 行为、release artifacts、runtime ledger 和真实 App evidence。

本目录收纳仓库首页之后给外部读者继续阅读的公开文档。它应该保持小而清楚：一类公开材料一个入口；维护过程、过程证据、历史归档和支撑参考不从这里平铺给普通用户。

安装和启动入口仍然是仓库 `README*`。当前技术真相仍然回到 docs core five、contracts、source、CLI/API 行为和 runtime/readback evidence。

## 公开条目

| 条目 | 用途 | 边界 |
| --- | --- | --- |
| [OPL 白皮书](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/opl-whitepaper.html) | 面向外部读者分享 OPL 定位、设计哲学、品牌模块和 Foundry Agents；PDF 用于转发和离线阅读。 | 用户可读公开材料。白皮书内容源在 `docs/whitepapers/`，HTML/PDF 由 `npm run docs:latest` 生成到 `docs/site/latest/whitepapers/`，不声明 runtime、release、domain 或 production ready。 |
| [产品路线](./roadmap.md) | 解释公开产品方向和 staged roadmap。 | 方向支撑，不替代 active plan、contracts 或 fresh evidence。 |
| [任务版图](./task-map.md) | 解释 OPL family 面向哪些高价值知识工作任务。 | 用户视角任务地图，不是 domain backlog 或 authority surface。 |
| [运行模型](./operating-model.md) | 解释用户视角的阶段推进、阻塞、交接和交付模型。 | 人读模型说明，不替代 runtime ledger、provider receipt 或 owner receipt。 |
| [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md) | 保留底座叙事支撑。 | 支撑叙事，不作为当前实现 oracle。 |
