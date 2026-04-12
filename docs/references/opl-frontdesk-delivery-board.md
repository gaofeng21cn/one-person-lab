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
- `opl workspace-catalog`
- `opl workspace-bind`
- `opl workspace-activate`
- `opl workspace-archive`
- `opl runtime-status`
- `opl session-ledger`
- `opl dashboard`
- `opl handoff-envelope`

当前含义：

- 已经有了第一版多项目 / 工作区 / 会话 / runtime 观测与可写管理面；
- `runtime-status` 已能看到 Hermes runtime 健康、最近会话以及 runtime-level 进程资源占用；
- `session-ledger` 已能提供 OPL-managed 的会话事件、诚实资源样本，以及按 session 聚合后的归因视图；
- `workspace-bind|activate|archive` 已能把 workspace registry 与 direct-entry locator 作为顶层可写状态管理起来；
- `workspace-catalog` 现在还会输出 project-level binding summary、最近更新时间与可写 action 提示；
- `handoff-envelope` 已能把顶层 front desk 到 domain direct entry / domain gateway 的最小交接面冻结出来；
- `dashboard` 已能把 front desk、projects、workspace、workspace registry、session ledger 与 runtime 汇总到一个管理面里。

### F2. 本地 web front desk pilot

已完成：

- `opl web`
- `/api/projects`
- `/api/workspace-status`
- `/api/workspace-catalog`
- `/api/workspace-bind`
- `/api/workspace-activate`
- `/api/workspace-archive`
- `/api/runtime-status`
- `/api/session-ledger`
- `/api/dashboard`
- `/api/ask`
- `/api/health`
- `/api/frontdesk-manifest`
- `/api/hosted-bundle`
- `/api/hosted-package`
- `/api/handoff-envelope`
- `/api/sessions`
- `/api/resume`
- `/api/logs`

当前含义：

- `OPL` 已经不只有 CLI 入口，而是已经有了可直接打开的本地浏览器前台；
- 用户可以直接在浏览器里做 quick ask、查看项目、检查与绑定 workspace、查看 managed session ledger、观察 runtime；
- 这仍是 local pilot，不等于 hosted 包装完成。

### F2.B. hosted-friendly shell contract 与 pilot package

已完成：

- `opl frontdesk-manifest`
- `opl frontdesk-hosted-bundle`
- `opl frontdesk-hosted-package`
- `opl frontdesk-librechat-package`
- 本地 web 前台已开始直接消费 `health / manifest / hosted-bundle / hosted-package / librechat-package / sessions / resume / logs / handoff-envelope` surfaces

当前含义：

- `OPL` 现在不只是“有一个本地浏览器 pilot”，而是已经冻结出一层 future hosted shell 可消费的 front-desk contract；
- hosted-pilot-ready shell bundle 已经把 base-path-aware 的 entry / API endpoint 一并冻结下来；
- self-hostable hosted pilot package 已经把 app snapshot、run script、env 模板、`systemd` unit 与反向代理资产一并导出来；
- `frontdesk-librechat-package` 已经把 `LibreChat` 外层壳、同源反向代理与 `OPL Front Desk` 的真实 pilot 组合导出来；
- 这层 contract 现在不再只是“等未来接壳”的 prep，而是已经支撑一条真实的 `LibreChat-first` hosted shell pilot；
- 但它仍然不等于 managed hosted runtime 已完成。

### F2.C. service-safe 本地包装层

已完成：

- `opl frontdesk-service-install`
- `opl frontdesk-service-status`
- `opl frontdesk-service-start`
- `opl frontdesk-service-stop`
- `opl frontdesk-service-open`
- `opl frontdesk-service-uninstall`

当前含义：

- `OPL` 的本地浏览器前台已经不再只能依赖“手动开一个终端跑 `opl web`”；
- 当前已经有了 launchd 驱动的 service-safe 本地包装层，可以把本地 front desk 作为长期运行的入口服务管理；
- 但这仍然只是 host-side 的 local product packaging；`LibreChat-first` pilot 已接上，不代表 managed hosted runtime 已完成。

### F3. hosted / web 路线冻结

已完成：

- 短期：`LibreChat-first`
- 长期：`OPL` 自有 web front desk

当前含义：

- 不再把 `Chatbot UI` 当主前台候选；
- 不再把“套一个通用 chat UI”误写成最终产品形态。

## 当前还没有完成

### W1. managed hosted runtime / hosted hardening

未完成：

- 虽然已经有本地可打开的 web front desk pilot；
- 虽然也已经有 hosted-friendly manifest / health / session / logs contract surface；
- 虽然现在也已经有了 service-safe 的本地 packaging；
- 虽然也已经有了 self-hostable hosted pilot package；
- 虽然现在也已经有了真实的 `LibreChat-first` hosted shell pilot package；
- 但还没有 managed hosted runtime；
- 也还没有把 pilot 收紧到更低运维摩擦的正式 hosted 运行面。

### W2. 顶层与业务仓的前台联动

未完成：

- `OPL` 顶层现在已经有 front desk、workspace registry 与 family handoff bundle；
- 三个业务仓现在都已经长出了 repo-tracked lightweight direct-entry shell，但 maturity、locator 配置与真正可直接进入的产品面仍不一致；
- 当前仍只能通过 workspace registry 中显式配置的 direct-entry locator 把已知 domain 前台接进来，不能假装全家都已经齐了；
- 顶层还需要把 domain shell metadata、locator wiring 与 family handoff proof 继续压实。

## 当前进行中

### I1. `OPL` hosted packaging / web front desk follow-up

方向：

- 在已落地的本地 web pilot、hosted-friendly shell contract、self-hostable hosted pilot package、真实的 `LibreChat-first` hosted shell pilot package 与本地 service packaging 之上继续做 hosted follow-up；
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

1. 继续把已落地的 `LibreChat-first` hosted shell pilot 往 managed hosted runtime / hosted hardening 推进
2. 让 `RedCube AI`、`Med Auto Grant`、`Med Auto Science` 的已 landed shell 与顶层 locator / handoff 继续对齐
3. 让 `Med Auto Grant` 继续把 grant-only entry / runtime / export 压实
4. 让 `Med Auto Science` 继续走非 display 主线的 real adapter cutover

## 一句话结论

`OPL Front Desk` 这条线现在已经从“只有 CLI 说明面”走到了“有本地 CLI 入口 + 有可写管理面 + 有 managed session ledger + 有 family handoff bundle + 有本地 web pilot + 有 hosted-friendly shell contract / hosted pilot bundle / self-hostable pilot package + 有真实的 LibreChat-first hosted shell pilot package + 有 service-safe 本地包装层 + 有明确 hosted 路线”的状态。
下一步不该再回头争论方向，而是把 managed hosted runtime hardening 和后续家族级 direct entry 继续压实。
