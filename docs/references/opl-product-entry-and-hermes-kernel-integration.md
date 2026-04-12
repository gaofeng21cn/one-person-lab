# OPL 产品入口与 Hermes Kernel Integration 决策

## 1. 这份决策要解决什么问题

当前 `OPL` 最大的产品形态缺口，不是某个单点功能缺失，而是：

- 用户还不能把 `OPL` 当成一个可直接使用的独立产品入口；
- 用户当前仍主要需要先进入 `Codex`，再由 `Codex` 调用 `OPL` 相关 `CLI / MCP`；
- 三个业务仓虽然有的已经具备本地 `CLI` / runtime baseline，但大多也仍停留在 `operator entry` 或 `agent entry`，还不是成熟的 `product entry`；
- 文档虽然已经说明上游 `Hermes-Agent` 是优选的未来 runtime substrate，但还没有把“到底怎么接入、由谁维护、用户需不需要自己理解 Hermes”冻结成不可误解的决策。

这份文档的目的，就是把这三个问题一次讲清。

## 2. 当前真实状态

截至当前主线，真实情况是：

- `OPL` 仍是顶层 gateway / federation / shared-contract layer；
- `OPL` 已经落下本地 direct product-entry shell，但还不是 hosted / web 形态的完整产品前台；
- 三个业务仓也大多仍是 “可被 operator / host-agent 调用的 runtime surface”，而不是面向普通用户的独立产品入口；
- 四个仓已经不在同一集成深度上，至少 `Med Auto Grant` 已经落下真实上游 `Hermes-Agent` substrate；
- `Codex` 仍是当前活跃的开发宿主，而不是未来产品 runtime 的真相；
- 三个业务仓当前仍各自处于过渡态 runtime 形状。

所以，当前最诚实的用户使用链路应分两层看：

- 当前已落地的本地入口：`User -> OPL local product-entry shell -> OPL Gateway -> Hermes Kernel -> Domain Handoff -> Domain Gateway / Domain Product Entry`
- 当前仍未落地的形态：hosted / web 级产品前台

开发上，`Codex` 仍然是高质量开发宿主；但它不再是本机直达 `OPL` 的唯一前台。

这里要明确区分三层：

- `operator entry`
  - 人类工程操作者直接运行命令、脚本或调试入口；
- `agent entry`
  - `Codex` 这类 host-agent 能稳定调用的入口；
- `product entry`
  - 普通用户可直接进入、无需先学会底层 runtime 拼装方式的正式产品入口。

当前四个仓里，很多已经有前两层的一部分；而第三层现在已经在 `OPL` 顶层先落下一版本地入口壳，但全家族都还没有把这层做成熟。

## 3. 理想目标形态

`OPL` 的理想形态不是继续把 `Codex` 当产品前台，而是让用户直接进入 `OPL`：

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Adapter -> Domain Gateway -> Domain Harness OS -> Domain Repository`

在这条目标链路里：

- `OPL Product Entry`
  - 负责用户直接可见的入口，例如本地 launcher / CLI shell、未来的 web/chat entry、以及后续平台侧入口；
- `OPL Gateway`
  - 负责顶层路由、federation、共享 contract、domain discovery；
- `Hermes Kernel`
  - 负责长期在线 runtime substrate，例如 session、memory、scheduler、interrupt / resume、gateway process、delivery / cron；
- `Domain Adapter`
  - 负责把通用 runtime substrate 接到具体 domain contract；
- `Domain Gateway / Domain Harness OS`
  - 继续负责各自 domain 的对象、gate、audit、delivery 与 canonical truth。

也就是说，未来 `OPL` 要变成独立产品，但它并不自己复制一整套 runtime kernel。

## 4. 三种可选方案

### 方案 A：把 Hermes-Agent 代码 fork / vendor 到 OPL 里，长期自己维护

优点：

- 所有代码看起来都在自己体系里；
- 短期内改什么都不需要顾虑外部依赖接口。

问题：

- 会把 `OPL` 直接拖进永久 fork 维护；
- runtime substrate 与 `OPL` gateway / domain logic 的边界会重新变糊；
- 后续跟进上游 bugfix、版本升级、安全补丁都会变成长期运维负担；
- 会再次诱发“仓内自己写了一层 runtime 就算 Hermes integration”的错误叙事。

结论：

- 不选。

### 方案 B：要求用户自己安装和理解独立 Hermes-Agent，再让 OPL 去调用

优点：

- `OPL` 仓内最省事；
- 从代码归属看边界也比较清楚。

问题：

- 用户必须先知道 Hermes 是什么、怎么装、怎么升级、怎么排错；
- 对开源本地版和未来商业版都不是好产品体验；
- 最终支持成本会转嫁成用户教育成本和运维排障成本；
- 这仍然不能把 `OPL` 变成真正的独立产品入口。

结论：

- 不选。

### 方案 C：代码层外部依赖，产品层托管集成

英文固定表述：

- `external kernel, managed by OPL product packaging`

中文固定表述：

- 代码层外部依赖，产品层托管集成

含义是：

- 不 fork / vendor 上游 `Hermes-Agent` kernel 代码；
- `Hermes-Agent` 继续作为外部 kernel / runtime substrate owner；
- 但对用户来说，不需要先学会 Hermes 再能用 `OPL`；
- `OPL` 自己的 bootstrap / launcher / packaging / version pinning / runtime management 负责把一个受支持版本的 Hermes runtime provision 好并接起来。

本地开源版的形态：

- 用户进入的是 `OPL` 的入口；
- `OPL` 负责检测、安装或拉起受支持版本的 `Hermes-Agent`；
- `OPL` 负责版本 pin、profile 初始化、adapter wiring、runtime root 约定、日志与诊断入口；
- 用户不需要手工维护一套“先会 Hermes 才能会 OPL”的流程。

未来托管版的形态：

- 用户进入的是 `OPL` 的 web / hosted 入口；
- 平台内部运行 `Hermes` kernel；
- `OPL Gateway` 负责对外暴露产品能力、会话语义与 domain federation；
- Hermes 作为平台内部 runtime substrate，不直接暴露为产品身份。

结论：

- 选择方案 C。

## 5. 为什么选择方案 C

这条路线同时满足了四个目标：

### 5.1 保持代码边界清楚

- `OPL` 继续是 gateway / federation / product entry owner；
- `Hermes-Agent` 继续是 runtime kernel owner；
- 业务仓继续是 domain truth owner。

### 5.2 不把运维灾难引进仓内

- 不需要长期背一个私有 fork；
- 不需要自己维护完整 runtime kernel 生命周期；
- 可以跟着上游升级，而不是把所有 substrate 能力都变成私有债务。

### 5.3 不把复杂度转嫁给用户

- 用户不应该被要求先理解 `Hermes-Agent` 才能使用 `OPL`；
- 用户接触的是 `OPL` 产品，而不是一个运行时拼装教程。

### 5.4 兼容本地版与托管版

- 本地开源版可以通过 `OPL bootstrap / launcher` 自动 provision kernel；
- 商业托管版可以把 `Hermes` 放进平台内部运行；
- 这两种形态共用同一套 “external kernel, managed by OPL product packaging” 原则。

## 6. 对四仓分工意味着什么

### 6.1 OPL

- 负责 direct product entry、gateway、federation、shared contract、packaging policy；
- 不负责长期自维护一份 fork 后的 Hermes kernel；
- 不把 `Hermes-Agent` 伪装成“仓内某层类似命名的 helper”。

### 6.2 RedCube AI / Med Auto Science / Med Auto Grant

- 负责各自的 domain adapter、domain workflow、gate、audit、delivery、artifact truth；
- 不再把“重复造 runtime substrate”当成长期目标；
- 真实接入 `Hermes-Agent` 时，只保留 domain-facing adapter 与 contract hydration。

它们未来也应各自拥有轻量 direct entry，而不是长期停留在“只能被 `Codex` 调用”的状态。
更准确地说，它们当前的很多入口已经可以算 `operator entry` 或 `agent entry`，但还不是打磨完成的 `product entry`。

### 6.3 Codex

- 继续是开发宿主；
- 可以继续作为本地开发、调试、验证和人工操作时的高质量 operator brain；
- 但它不再是未来产品入口的前提条件。

## 7. 明确不允许的误写

下面这些说法都不成立：

- “仓内有个 `Hermes` 命名的 helper / shim / scaffold，所以已经完成 Hermes integration”
- “Hermes Kernel Integration 的意思是把 Hermes 代码抄进 OPL 自己养”
- “未来用户需要自己安装 Hermes，再自己理解怎么把它接给 OPL”
- “既然当前开发靠 Codex，会不会产品就继续依赖 Codex”

正确口径应统一为：

- 当前：`Codex` 是开发宿主；
- 目标：`OPL` 是 direct product entry；
- kernel：`Hermes-Agent` 是 external kernel；
- 集成方式：`managed by OPL product packaging`。

## 8. 后续实施顺序

### S1. 冻结顶层真相

- 把 `OPL` 不是 direct product entry 的当前状态写清；
- 把目标链路与 integration choice 写清；
- 把 README、核心文档、参考文档与测试统一。

### S2. 先在业务仓做真实 Hermes pilot

- 从更轻的 domain 开始证明上游 `Hermes-Agent` 真的能接住 runtime substrate；
- 不再继续把 repo-local pseudo-runtime 写成目标本体。

### S3. 形成 OPL 本地 direct entry

- 引入 `OPL bootstrap / launcher`；
- 让本地用户通过 `OPL` 入口直接启动受支持的 runtime；
- 把 Hermes 的版本、profile、wiring、diagnostics 纳入 `OPL` 产品层管理。

这一步现在已经先落下了第一版本地 shell：

- `opl doctor`
- `opl ask`
- `opl chat`

这一步现在已经继续往前落下了一层 service-safe 的本地 front desk packaging；
后续剩余工作则变成把这层本地 packaging 继续往真正的 hosted shell 接壳与 hosted / web 入口推进。

### S4. 进入 hosted / web 化

- 平台内部托管 Hermes kernel；
- `OPL` 作为产品入口、会话层与 domain federation 层对外暴露。

这一步的 hosted / web 前台并不是“随便找一个聊天壳就算完成”。
当前已经冻结的前台选型是：

- 短期：`LibreChat-first`
- 长期：`OPL` 自有 web front desk

对应的选型说明见：

- `docs/references/opl-hosted-web-frontdesk-benchmark.md`

## 9. 一句话结论

`Hermes Kernel Integration` 的正确方向不是抄代码自己养，也不是把安装和理解 Hermes 的负担甩给用户，而是：

- `external kernel, managed by OPL product packaging`

也就是：

- 代码层外部依赖，产品层托管集成。
