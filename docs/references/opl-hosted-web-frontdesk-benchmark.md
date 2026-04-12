# OPL Hosted / Web Front Desk 选型基准

状态锚点：`2026-04-12`

## 文档目的

这份文档专门冻结 `OPL` 在 hosted / web 前台上的现实选型。

它回答三个问题：

1. 现在要尽快做出一个能用的 web 前台，最适合拿什么开源壳起步。
2. 哪些常见候选看起来方便，但不适合当 `OPL` 的主前台基座。
3. 短期 pilot 与长期产品形态之间，边界应该怎么切。

这是一份 `docs/references/` 下的中文参考级文档。
它不替代：

- `README.md` / `README.zh-CN.md`
- `docs/status.md`
- `docs/decisions.md`
- `docs/architecture.md`
- `docs/references/opl-product-entry-and-hermes-kernel-integration.md`

## 当前前提

当前已经成立的事实只有这些：

- `OPL` 已有本地 `CLI-first` 的 direct product-entry shell。
- `OPL` 还没有 hosted / web 级别的正式产品前台。
- `Hermes-Agent` 在当前路线里承担的是 external kernel / runtime substrate，而不是 `OPL` 的品牌前台。
- `OPL` 仍要自己持有顶层 front desk、domain handoff、audit truth 与家族级入口语义。

因此，这里要选的不是“谁来定义 `OPL` 产品是什么”，而是：

- 谁适合当第一版 hosted / web pilot 的外层壳；
- 哪种壳不会把 `OPL` 的顶层语义挤没；
- 哪种壳最利于后续回收到自有前台。

## 评估标准

本轮只按下面五条评估：

1. 能否尽快做出可用的 hosted / web 前台。
2. 能否保留 `OPL -> domain` 的 handoff 与 audit 语义。
3. 能否与 external `Hermes-Agent` kernel 共存，而不是反客为主。
4. 能否支持后续做成 `OPL` 自有品牌前台，而不是永久套壳。
5. 改造成本是否足够低，适合先跑通第一版产品入口。

## 候选对比

### 1. `Chatbot UI`

优点：

- 很轻；
- 很容易快速跑出一个聊天壳；
- 适合做最小演示。

问题：

- 太像“单轮对话 UI”，不够像 `front desk + session ops + domain handoff + runtime ops` 的产品入口；
- 对多会话恢复、运维入口、结构化 artifact 面、审计面都偏薄；
- 更适合 demo 壳，不适合作为 `OPL` hosted 主前台基座。

结论：

- 不作为主候选。

### 2. `LibreChat`

优点：

- 当前最接近“可以尽快套壳做出第一版 hosted 前台”的形态；
- 已经有比较成熟的多模型、多会话、工具/集成、文件交互与管理能力；
- 作为 pilot 壳时，最容易把精力放在 `OPL Gateway`、`Hermes` runtime、domain handoff 与 audit 对齐上，而不是先自己从零造完整聊天前台。

问题：

- 它本质上仍是通用 chat / agent shell，不会天然等于 `OPL Front Desk`；
- 必须显式把 `OPL` 的顶层入口语义、domain 卡片、handoff 结构与会话边界叠在它之上；
- 不能把它误写成长期产品身份。

结论：

- 作为短期 hosted / web pilot 的首选壳。

### 3. `Open WebUI`

优点：

- 能力面很全；
- 自托管成熟度高；
- 对本地和私有部署都比较友好。

问题：

- 产品语义更像“大而全的 AI 工作台”；
- 如果直接拿来做 `OPL` 主前台，容易把顶层 `front desk / domain handoff / family federation` 语义稀释掉；
- 长期品牌与交互心智更容易被上游产品形态带着走。

结论：

- 可参考，但不是当前优先路线。

### 4. `LobeChat`

优点：

- 交互体验成熟；
- 前端完成度高；
- 适合快速形成漂亮的聊天产品壳。

问题：

- 它的产品形态更偏“成熟聊天产品”，不是专门为 `OPL` 这种顶层 gateway / federation / handoff 入口设计；
- 后续要改造成 `OPL` 自有 front desk，产品语义迁移成本会更高。

结论：

- 不是当前首选基座。

## 冻结结论

当前冻结的 hosted / web 选择是：

- 短期：`LibreChat-first`
- 长期：`OPL` 自有 web front desk

也就是说：

- 第一版 hosted / web 前台可以优先借 `LibreChat` 的成熟壳能力，尽快做出可用入口；
- 但长期不把 `LibreChat` 当成 `OPL` 的永久产品身份；
- `OPL` 最终仍要回到自己的 front desk、自己的 domain handoff 语义、自己的 session / audit / product wording。

固定不选的路线包括：

- 不以 `Chatbot UI` 作为主 hosted 基座；
- 不把 `Open WebUI` 直接当成长期主产品；
- 不把 `LobeChat` 当成当前最优起步路线；
- 不把“先套一个现成 chat UI”误写成“`OPL` 已经拥有正式 web 产品前台”。

## 实施分层

### W1. 冻结入口真相

这一步只冻结：

- hosted / web pilot 选型；
- `OPL` 与外部壳之间的责任边界；
- `front desk / domain handoff / runtime ops / audit surface` 仍由 `OPL` 定义。

### W2. 做第一版 hosted pilot

这一步优先做：

- `LibreChat` 外层壳；
- `OPL` 自己的 branding / routing / handoff / session 恢复入口；
- 与 external `Hermes-Agent` kernel 的产品层托管集成。

不在这一步做：

- 永久性深度 fork；
- 一开始就重写完整 web 产品。

### W3. 回收到自有前台

当 pilot 证明入口、会话、handoff、artifact 与运维面都稳定后，再逐步把 hosted 前台收敛到 `OPL` 自有 web front desk。

届时第三方开源壳的作用应降级为：

- 参考实现；
- 迁移桥；
- 局部复用来源。

## 与家族级入口板的关系

这份文档只解决 `OPL` 顶层 hosted / web 前台的选型问题。

四仓真正的 family-level direct entry 推进节奏，统一看：

- `docs/references/family-lightweight-direct-entry-rollout-board.md`

## 一句话结论

如果目标是“最快速度让 `OPL` 拥有第一版可用 hosted / web 前台”，当前最合理的路线不是 `Chatbot UI`，而是：

- 先走 `LibreChat-first` 的 hosted pilot；
- 但长期仍回到 `OPL` 自有 web front desk。
