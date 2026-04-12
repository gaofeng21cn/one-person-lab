# OPL Front Desk 落地推进板

状态锚点：`2026-04-12`

## 文档目的

这份板面只负责回答一个问题：

- `OPL Front Desk` 这条线现在到底已经落了什么；
- 还缺什么；
- 下一棒该继续往哪推进。

它是当前 top-level product-entry 线的内部交付板。
它不替代：

- `README.md` / `README.zh-CN.md`
- `docs/status.md`
- `docs/references/opl-hosted-web-frontdesk-benchmark.md`
- `docs/references/family-lightweight-direct-entry-rollout-board.md`

## 当前已经落地

### F0. 本地 direct product-entry shell

已完成：

- `opl`
- `opl <request...>`
- `opl doctor`
- `opl ask`
- `opl chat`
- `opl resume`
- `opl sessions`
- `opl logs`
- `opl repair-hermes-gateway`

当前含义：

- `OPL` 已不再只是“只能在 Codex 里间接调用”的顶层说明面；
- 本机用户已经可以直接通过 `opl` 进入 family-level front desk。

### F1. 顶层管理面第一版

已完成：

- `opl projects`
- `opl workspace-status`
- `opl runtime-status`
- `opl dashboard`

当前含义：

- 已经有了第一版多项目 / 工作区 / 会话 / runtime 观测面；
- `runtime-status` 已能看到 Hermes runtime 健康、最近会话以及 runtime-level 进程资源占用；
- `dashboard` 已能把 front desk、projects、workspace、runtime 汇总到一个管理面里。

### F2. 本地 web front desk pilot

已完成：

- `opl web`
- `/api/projects`
- `/api/workspace-status`
- `/api/runtime-status`
- `/api/dashboard`
- `/api/ask`
- `/api/health`
- `/api/frontdesk-manifest`
- `/api/sessions`
- `/api/resume`
- `/api/logs`

当前含义：

- `OPL` 已经不只有 CLI 入口，而是已经有了可直接打开的本地浏览器前台；
- 用户可以直接在浏览器里做 quick ask、查看项目、检查 workspace、观察 runtime；
- 这仍是 local pilot，不等于 hosted 包装完成。

### F2.B. hosted-friendly shell contract

已完成：

- `opl frontdesk-manifest`
- 本地 web 前台已开始直接消费 `health / manifest / sessions / resume / logs` surfaces

当前含义：

- `OPL` 现在不只是“有一个本地浏览器 pilot”，而是已经冻结出一层 future hosted shell 可消费的 front-desk contract；
- 这层 contract 可以服务后续 `LibreChat-first` 或自有 web front desk 的接壳工作；
- 但它仍然只是 hosted-friendly local surface，不等于 hosted packaging / hosted runtime 已完成。

### F3. hosted / web 路线冻结

已完成：

- 短期：`LibreChat-first`
- 长期：`OPL` 自有 web front desk

当前含义：

- 不再把 `Chatbot UI` 当主前台候选；
- 不再把“套一个通用 chat UI”误写成最终产品形态。

## 当前还没有完成

### W1. 真正的 hosted packaging / web 前台

未完成：

- 虽然已经有本地可打开的 web front desk pilot；
- 虽然也已经有 hosted-friendly manifest / health / session / logs contract surface；
- 但还没有 service-safe 的 hosted packaging；
- 也还没有把 `LibreChat-first` 这条 hosted pilot 路线正式接起来。

### W2. project / workspace 的可写管理能力

未完成：

- 当前只有 workspace / git / runtime 的观察面；
- 还没有正式的创建项目、切换项目、绑定 workspace、归档 workspace 的产品级可写管理流。

### W3. session 级细粒度资源归因

未完成：

- 当前资源可见性是 runtime-level / process-level；
- 还不是严格的 per-session 资源账本。

### W4. 顶层与业务仓的前台联动

未完成：

- `OPL` 顶层有 front desk 了；
- 三个业务仓各自的 lightweight direct entry 还没全部长出来。

## 当前进行中

### I1. `OPL` hosted packaging / web front desk follow-up

方向：

- 在已落地的本地 web pilot 之上继续做 hosted packaging；
- 把 service、session、handoff、runtime ops 与后续 hosted 壳接起来。

### I2. family handoff 与 domain lightweight direct entry 对齐

方向：

- `OPL` 顶层入口继续只负责 front desk 与 handoff；
- 业务仓继续补各自 direct entry，不让顶层把 domain 细节吞掉。

### I3. `Med Auto Science` 非 display 主线 cutover

方向：

- 继续走 research runtime 主线；
- 不把 display / 配图资产支线混进来。

## 下一棒

最合理的下一棒顺序：

1. 做 `OPL` hosted / web front desk pilot
2. 把 `LibreChat-first` 或等价 hosted shell 接到已冻结的 hosted-friendly shell contract 上
3. 让 `RedCube AI` 先长出真实 lightweight direct entry
4. 让 `Med Auto Grant` 继续把 grant-only entry / runtime / export 压实
5. 让 `Med Auto Science` 继续走非 display 主线的 real adapter cutover

## 一句话结论

`OPL Front Desk` 这条线现在已经从“只有 CLI 说明面”走到了“有本地 CLI 入口 + 有管理面 + 有本地 web pilot + 有 hosted-friendly shell contract + 有明确 hosted 路线”的状态。
下一步不该再回头争论方向，而是把 hosted shell 接壳、hosted packaging 和后续家族级 direct entry 继续压实。
