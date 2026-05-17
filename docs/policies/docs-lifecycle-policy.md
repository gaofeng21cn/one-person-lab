# 文档生命周期政策

Owner: `One Person Lab`
Purpose: `docs_lifecycle_policy`
State: `active_support`
Machine boundary: 本文是人读政策。机器真相继续归 contracts、schema、source、CLI/API、runtime ledgers、domain manifests 和 semantic `human_doc:*` ids。

## 当前政策

OPL、MAS、MAG、RCA 采用同一套 canonical docs 目录：

`active/public/product/runtime/delivery/source/policies/specs/references/history`

这套目录不是按“当前有没有文件”决定保留，而是按四仓长期生命周期职责决定保留。一个目录如果承接长期职责，可以在某个仓暂时只有索引；但索引必须写清 owner、purpose、state、machine boundary、当前承载状态和何时应新增正文。没有长期职责的目录不进入 taxonomy。

## 文档基本原则

OPL 系列开发文档必须先设理想态，再用现状找差距。理想态不是从当前代码和历史目录里折中推出来的，而是从目标产品、目标架构、标准 OPL Agent 形态、owner boundary 和长期可维护性推导出来的。

差距文档不是妥协清单。它的任务是把现状与理想态之间的距离逐项显性化，并给出上收、重构、收薄、迁移、删除或归档路径。为了理想态，可以做革命式重构，可以完全抛弃旧模块、旧接口、旧测试、旧目录和旧文案；只要 active caller、证据、provenance 和替代 surface 被处理清楚，就不需要为历史兼容保留额外接口。

因此，文档中的 `当前实际` 只用于描述迁移起点和风险，不用于限制理想态。`功能/结构差距` 记录目标结构还未达到的 owner、模块、接口、目录、调用链和 generated surface 缺口；`测试/证据差距` 记录目标结构已经落位但还缺真实 receipt、workspace proof、provider-hosted apply、App drilldown、soak 或 regression proof 的缺口。不得把“当前已有实现”写成“长期合理”，也不得把“缺少证据”写成“功能必须继续留在旧位置”。

## 中文 canonical 规则

`docs/**` 是开发文档和维护参考，默认只保留中文内容。稳定路径优先使用无语言后缀的 `.md` 文件承载中文 canonical 内容。历史文档可以保留旧双语计划描述作为 provenance，但 active/reference 索引必须指向当前无后缀路径。

根层 `README*` 是否继续保留公开双语入口由各仓 public/product 需求单独决定；它不改变 `docs/**` 作为中文内部开发文档的规则。

## 直接退役规则

当旧模块、旧接口、旧 CLI alias、旧 wrapper、旧 facade、旧测试入口或旧文档入口已经被当前 owner surface 替代时，默认处理是 direct retirement：

1. 先确认 active caller、合同引用、`human_doc:*` 语义 ID、fixture/provenance 需求。
2. active caller 存在时，先迁移到最新 owner surface。
3. caller 迁完后删除旧模块、接口、alias、wrapper、facade 或 aggregate compatibility test。
4. 需要保留来龙去脉时，放入 `docs/history/`、tombstone 或明确的 provenance/reference。
5. 不新增兼容 shim、别名、re-export facade 或 compatibility-only 聚合测试。

文档清理不能替代内容清理。旧内容必须按当前 owner surface 吸收、归档或删除，避免在 active/reference 层继续污染新规划。
