# OPL Series Docs Governance SSOT Tranche Ledger

Owner: `One Person Lab`
Purpose: `opl_series_doc_governance_ssot_tranche_provenance`
State: `history_provenance`
Machine boundary: 本文只保留 2026-06-06 OPL series docs-governance tranche 的 compact provenance。当前机器真相继续归各 repo 的 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App evidence、repo-local active owner docs 和 repo-local history closeout。本文不得作为 production readiness、domain readiness、App release readiness、artifact authority、quality/export verdict、owner receipt、physical delete authorization、active test oracle 或 compatibility surface。

## 当前读法

该 tranche 以 `RUN_SNAPSHOT_TS=2026-06-06T07:28:54Z` 为历史快照，覆盖默认 OPL series 六仓：

- `one-person-lab`
- `med-autoscience`
- `med-autogrant`
- `redcube-ai`
- `opl-meta-agent`
- `one-person-lab-app`

同时把 `opl-doc` 作为 support repo extension 处理。它是一轮跨仓 SSOT / stale-surface / direct-retirement governance 过程记录，不是当前执行计划，也不是六仓全局 goal 的完成证明。

逐条 commit、worktree、测试命令、失败重跑和 closeout transcript 已压缩出本文。需要某个具体 lane 的细节时，读取对应 repo-local `docs/history/**` closeout、commit history、contracts/source/tests 或 live CLI/read-model。

## SSOT Owner

当前 truth owner 固定为：

- OPL 主仓：`docs/active/current-state-vs-ideal-gap.md`、核心五件套、`docs/docs_portfolio_consolidation.md`、contracts/source/tests/CLI/read-model。
- MAS/MAG/RCA/OMA/App：各 repo 的 active truth owner、core docs、contracts/source/tests/CLI/read-model、domain/App-owned receipts/evidence。
- OPL Doc support repo：`opl-doc` 自身 installer/doctor source、tests 和 history closeout。
- 历史过程：各 repo-local `docs/history/**` closeout 和本目录 process index。

本文只说明这些 owner 如何在该 historical tranche 中被确认或更新，不替代它们。

## Covered Themes

本轮已覆盖的主题按语义压缩为：

- `redcube-ai`: active baton、native PPT delivery/proof support、runtime owner boundary、source readiness、product/operator support、delivery lifecycle、domain-handler wording、public narrative、Stage Folder fixture retirement、policy/spec/reference currentness、stale physical surface no-delete/no-resurrection、docs index lifecycle、broader docs portfolio、governance checklist role、TypeScript presence-lock retirement、Python helper fallback retirement、hosted-attempt helper export retirement、MCP route fallback retirement、incremental screenshot-review stale prior shape retirement。
- `med-autoscience`: public progress-projection alias / command / workspace wrapper retirement、runtime-supervisor dispatch helper shim retirement、gate-clearing batch facade-test retirement、medical-paper-readiness currentness / readiness identity propagation、readiness surface coverage、request packet persistence / stale request payload arbitration、broader docs portfolio routing。
- `med-autogrant`: executor receipt boundary、product-entry/package authority、source/workspace lifecycle、delivery/package route-contract SSOT、package/export support readout、private physical-delete docs SSOT、runtime topology/project overview thinning、active plan/private inventory no-rewrite、default-caller evidence and owner-decision gates、stale export and package-root facade retirements、test helper star-facade retirements、`human_doc:*` support-id foldback、helper shim retirement、governance checklist role split、broader docs portfolio routing。
- `opl-meta-agent`: script-to-pack / no-resurrection、meta-agent-loop facade retirement、target-agent intake fallback retirement、target-improvement policy fallback retirement、policy contract/test helper retirement、stage-decomposition barrel retirement、production-acceptance test thinning、takeover fixture alias retirement、pack README support-index review、registry/App evidence tail review、target patch-loop scaleout, public README narrative, standard target-agent handoff vocabulary, docs index lifecycle, production-consumption read-model currentness, reviewer evidence projection currentness, broader docs portfolio routing。
- `one-person-lab-app`: user-guide SSOT and regeneration, release evidence checklist, Homebrew/updater boundary, public README install/release boundary, release-train workflow authority, legacy Build and Release workflow retirement, duplicate release/test guards retirement, release CI docs guard retirement, Runtime page SSOT, Full VM/local-authorization evidence boundary, first-run scenario alias retirement, AG-UI/Codex candidate shell no-rewrite, Settings IA, Developer Profile wording, GUI stale wording, `ppt` purpose-id wording, WebUI GHCR boundary, GUI command-center role, release-note Full first-install wording, ordinary selector boundary, AionUI Team no-rewrite, screenshot evidence boundary, release-train design no-rewrite, decisions provenance, docs index current-truth foldback, GUI definition stack, testing guide boundary, broader docs portfolio routing。
- `one-person-lab`: owner-map retired vocabulary, public roadmap legacy-route provenance, active docs role split, OPL-side MAS progress-command projection retirement, broader docs portfolio routing, public whitepaper / command-surface wording, frontdoor machine-field retirement。
- `opl-doc`: doctor entrypoint import-facade retirement、doctor parts package-root facade retirement、old `opl-doc-governance` installer cleanup-tail retirement。

These are historical coverage claims for that tranche. They do not imply current production readiness, domain readiness, App release readiness, quality/export verdict, owner receipt, artifact authority or physical stale-surface deletion beyond lanes whose source/test/contract retirement is recorded in their repo-local closeouts.

## Remaining Scope

该 tranche 之后仍保持开放的范围按 owner 归类：

- `med-autoscience`: live medical-paper-readiness owner execution、current-execution-envelope behavior beyond the recorded identity/surface/persistence fixes、paper/package/publication truth、quality verdict 和 package freshness。
- `med-autogrant`: explicit MAG owner delete authorization / keep-as-authority-adapter receipt / typed blocker、direct/hosted parity follow-through、production/App sustained consumption、Temporal long-soak 和 production evidence tails。
- `opl-meta-agent`: future cohort evidence tails、real independent reviewer invocation/context/trace/receipt samples、future target-owner evidence samples。
- `one-person-lab-app`: fresh candidate package/adoption evidence、future-cohort Full VM artifact production for actual releases、active-shell adoption gates tied to a real candidate record。
- `redcube-ai`: production evidence tail、runtime evidence scaleout、generated/default caller thinning、full product-domain action stdio route-run baseline failures、future delete authorization。
- `one-person-lab`: future specific semantic themes or live/source/contract lanes requiring fresh evidence; remaining historical `frontdoor` wording is allowed only in history/provenance/negative-guard context.

这些是后续 owner-intake / evidence / runtime lanes，不是本文继续承载的 active task list。

## Verification Record

本轮原始长验证清单已压缩。稳定验证口径为：

- 每个 repo-local lane 的具体验证回到对应 repo-local closeout 和 git commit。
- 六仓 doctor risk-map 在该 tranche 后曾返回 `finding_count=0` 与 `active_truth_health.status=pass`。
- 本文件只保留 coverage provenance，不能用 doctor pass 或历史 closeout alone 声明 production ready、domain ready、App release ready、owner delete authorized、quality/export verdict、artifact authority 或 global goal complete。

## No-Resurrection Rule

不得从本文恢复旧 gateway/frontdoor/federation/Hermes-default/Product API/local-manager/wrapper/facade/alias/compatibility wording 为 active surface。不得把本文的历史 coverage 复制回 active docs 作为 current truth、live readiness、completion proof、owner receipt、typed blocker 或 next agent prompt。当前下一步必须从 live repo truth、active owner docs、contracts/source/tests/CLI/read-model 和 fresh owner intake 重新派生。
