# OPL 复用优先治理政策

Owner: `One Person Lab`
Purpose: `reuse_first_governance_policy`
State: `active_policy`
Machine boundary: 本文是人读维护政策。可执行守门继续归 `contracts/opl-framework/reuse-first-governance.json`、`scripts/reuse-first-scan.mjs`、`./scripts/verify.sh reuse-first`、source 和 tests。

## 适用范围

本政策用于 OPL Framework、OPL App / Aion consumer surface、OPL family standard agent 迁移和 domain repo private platform residue 的复用优先判断。它不替代 domain truth、owner receipt、typed blocker、release/currentness authority、runtime provider evidence 或 App release gate。

## 治理结论

2026-07-04 的 reuse-first 治理经验固定为三条长期规则：

1. **先复用现有 owner surface，再考虑新增实现。** 新增 runtime、schema、CLI、package/update、workspace、observability 或 catalog 逻辑前，必须先查本仓已有 helper / registry / owner boundary；本仓没有再看 Node 标准库、平台能力和已安装依赖；只有这些都不覆盖时才写最小新代码。
2. **只保留 strict diff gate。** 不再维护 full scan、历史 finding 分类或 owner worklist；`reuse-first:scan:diff` 只检查当前 diff 新增行与未跟踪文件，并在出现未解释 hard finding 时失败。
3. **结构证据不能越权成 ready claim。** docs、contract、focused tests、worklist 分类、line split、fixture/live-test proof、readback clean 和 clean diff gate 都不能声明 runtime ready、domain ready、release ready、production ready、owner acceptance 或 physical delete authorization。

## 默认沉淀路线

发现新的可复用经验时，按下面路线落点，不开第二套真相源：

| 经验类型 | 默认落点 | 不应落点 |
| --- | --- | --- |
| 当前执行进度、fresh evidence、完成度和剩余 worklist | `docs/active/reuse-first-platform-risk-audit-and-landing-plan.md` | 新建平行 closeout 文档 |
| 可执行扫描与 diff gate | `contracts/opl-framework/reuse-first-governance.json` 与 `scripts/reuse-first-scan.mjs` | 只写 prose checklist 或复制历史 worklist |
| 长期维护规则、默认路由、forbidden claims | 本文；必要时上提 `docs/invariants.md` | 临时聊天总结或散落 TODO |
| 跨会话 / worktree / absorption / currentness 操作纪律 | `codex-ops-kit` ledger / profile / reusable guard | OPL 项目事实或 domain truth |
| domain repo 私有平台 residue 的 owner route | domain repo owner surface；OPL 只保 refs-only projection | OPL 持有 domain quality / artifact verdict |

## 执行纪律

- 新增通用能力必须先回答：已有 OPL owner surface 是否覆盖、是否能删除旧入口、是否能用标准库或已有依赖、是否需要新 contract、验证证据证明什么、不能证明什么。
- 对 reuse-first finding 的处理优先级是：替换 active caller、迁移到共享 owner boundary、收敛为 generated / hosted surface、记录明确 owner decision、最后才允许保留 projection boundary；执行状态回现有 active plan 或 owner surface，不写回扫描器。
- 同一类 helper 只能有一个 owner。JSON / record / schema 边界默认走 `kernel` 或明确 owner module；command 参数默认走 CLI registry / parser adapter；managed update vocabulary 默认走 managed update owner boundary；queue vocabulary 默认走 Runway queue projection boundary；observability vocabulary 默认走 semantic convention / projection vocabulary。
- 对 tests / fixtures 的 cleanup 只迁移真实解析或真实 boundary；作为测试输入字符串出现的旧 pattern 不改成 helper 行为测试。
- 对 line split / parts 拆分，只有在降低文件边界复杂度或明确 owner 内聚时才做；不新增 facade、factory、compat wrapper 或单实现接口。
- 外部成熟系统只吸收工程边界：Temporal 承接 durable lifecycle，Kubernetes-style reconciler 承接 desired/current，Ajv/schema registry 承接 trust boundary，Commander/Yargs-style registry 承接 CLI，OCI/content-addressed descriptor 承接 package，OpenTelemetry 承接 telemetry vocabulary，Backstage-like descriptor 承接 catalog projection。不得把外部系统产品模型直接搬成 OPL truth。

## 停止条件

一次 reuse-first cleanup 可以声明完成，仅当本次写集满足：

- active caller 已迁到目标 owner surface，或明确记录为 owner decision / projection boundary；
- `reuse-first:scan:diff` 没有新增未解释 hard finding；
- 对应 focused tests / typecheck / source-module / docs check 按风险通过；
- final report 明确 strict diff gate 不证明历史风险清零，并保留 forbidden claims；
- 没有把 unrelated dirty diff、active worktree 或 sibling owner lane 混入本次完成声明。

strict diff gate 只证明本次新增写集没有未解释 hard finding，不能外推为全量历史风险清零。
