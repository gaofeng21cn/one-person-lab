# OPL Family Live Evidence 维护入口

Owner: `One Person Lab`
Purpose: `family_live_evidence_maintenance`
State: `support_reference`
Machine boundary: 本文是人读 live / production / release / owner-evidence lane 维护入口。当前证据真相继续归各 repo 的 contracts、source、tests、CLI/API readback、runtime ledger、provider receipt、release artifact、domain-owned owner receipt / typed blocker / human gate 和真实 workspace / App evidence。

## 读法

本文单独维护 OPL family 的 live evidence / production evidence / release evidence / Brand L5 / owner-chain scaleout 读法，避免这些后置证据继续混入 ideal-state、current-state gap 和 active development 文档。

日常开发的 active gap plan 只维护功能面落地、结构收薄、历史遗留清理、no-second-truth guard、generated / hosted surface、App shell / contracts、domain pack、authority function、wrapper retirement 和文档 SSOT。Live evidence 只在下列情况作为 hard gate：

- 正在声明 release-ready、production-ready、domain-ready、Brand L5、App release/user-path ready、provider production ready 或 target-agent ready。
- 正在执行不可逆 mutation、physical delete、owner receipt / typed blocker / human gate authority closeout。
- 正在判断真实 paper / grant / visual / target-agent 项目是否完成。

除此之外，缺少 live evidence 不反向打开 repo-source、contract、schema/readback、App shell、docs lifecycle、wrapper retirement 或 no-resurrection 的功能/结构 backlog。

## Current Owner Map

| Evidence lane | Truth owner | Active docs should say |
| --- | --- | --- |
| OPL provider long-soak / Temporal residency / retry-dead-letter / recovery | `one-person-lab` runtime contracts、provider receipts、CLI/read-model | 后置 runtime evidence lane；不能替代 domain progress。 |
| Brand L5 / cross-agent scaleout / module operating evidence | OPL brand module contracts、verified refs-only ledger、module owner receipts | 后置 L5 lane；contract pass 或 verified ledger 不是 maturity complete。 |
| One Person Lab App release / install / packaged GUI / user path | `one-person-lab-app` release artifacts、contracts、validators、screenshots、cohort evidence | App release lane；不回写为 OPL Framework 或 domain readiness。 |
| MAS paper progress / owner-chain / reviewer / publication gate | `med-autoscience` study/runtime/controller surfaces、owner receipts、typed blockers、human gates、artifacts | MAS evidence lane；OPL transport/readback 不声明 paper progress。 |
| MAG grant readiness / submission-ready / fundability / export | `med-autogrant` owner receipts、human-gate receipts、quality/export/package evidence | MAG evidence lane；provider completion 或 package existence 不是 grant-ready。 |
| RCA visual ready / exportable / handoffable / no-regression | `redcube-ai` visual artifacts、review/export gates、owner receipts、typed blockers、workspace evidence | RCA evidence lane；mock proof或单次样片不是 production soak。 |
| OMA target-agent qualification / activation / live registry-App consumption | FoundryRun、EvidenceBundle、AgentVersion、Owner decision、canary/activation receipts 与 OPL/App registry evidence | OPL Foundry lane；materialized candidate 或 isolated suite pass 不是 target ready。 |
| BookForge long-book / publication proof / final export acceptance | `opl-bookforge` manuscript/package refs、proof/export receipts、owner acceptance、workspace lifecycle receipts | BookForge evidence lane；scaffold、pilot export、render helper 或 OMA evidence 不是 publication-ready。 |

## 禁止混写

- `docs/active/*ideal*gap*plan.md` 可以引用本文，但不要在 active gap 表里维护 live receipt id、cohort id、run id、attempt id、provider tick、CI run、screenshot path、release artifact hash 或 dated closeout 流水。
- ideal-state / north-star 文档只描述目标结构和 owner boundary，不列 live evidence worklist。
- current-state gap 文档只列当前非 live 功能/结构缺口；live-only evidence tail 用本文或 owner repo evidence contracts 指针表达。
- release/currentness/CI 状态必须 fresh readback；不要把本文或任何历史 closeout 当当前 release truth。

## 当前非 Live 缺口归位

截至本次文档维护，family-level active docs 应把“除了 live evidence 之外”的缺口读成：

| Repo | 非 live 功能/结构缺口 |
| --- | --- |
| `one-person-lab` | 文档 SSOT 仍需防止 active docs 重新承载 dated evidence；new surfaces 必须继续从 contracts/source/CLI 同源派生；retained wrappers / private residue 只按 owner decision / no-active-caller / tombstone gate 清理。 |
| `med-autoscience` | 当前 tracked non-live 缺口主要是 `src/med_autoscience/cli_parts/paper_mission_commands.py` 超长，需要后续按 paper-mission 命令族自然拆分；其余 Paper Progress runtime 功能面已按 contract/source/control-plane 关闭，live acceptance 后置。 |
| `med-autogrant` | product/status/user-loop/domain-handler/domain_runtime/autonomy/CLI handler shells 仍是 physical-delete-not-authorized tail；需要 OPL generated/default caller parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance 后再删或收薄。 |
| `redcube-ai` | generated/default caller thinning、repo-local adapter delete after cutover、compatibility-free retirement、naming / legacy string hygiene 仍是 active source hygiene tail；visual production evidence 后置。 |
| `opl-meta-agent` | strict source-purity / script-to-pack hygiene 仍需持续治理；新增或保留 scripts/materializers 必须有真实 active caller、repo-local refs、no-forbidden-write 和退役门。 |
| `opl-bookforge` | 标准 scaffold/interface、golden-path route、revision entrypoint、PDF/proof helper plumbing、artifact lifecycle handoff refs、default-caller structural gates 与 evidence package navigation 仍需持续守住 structural boundary；long-book / final export / owner acceptance evidence 后置。 |
| `one-person-lab-app` | App-owned contracts、active-shell sync、GUI definition stack、Settings / Storage / release-boundary validators 和 shell-candidate policy 仍是功能/结构维护面；packaged GUI / clean-VM / release cohort evidence 后置。 |

## 验证入口

Docs-only 更新最小检查：

```bash
rtk git diff --check
rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs
```

涉及 repo-specific source/contracts/tests 时回到对应 repo 的 `scripts/verify.sh`、`npm test`、`npm run test:smoke`、focused pytest 或 active gap plan 中列出的验证入口。
