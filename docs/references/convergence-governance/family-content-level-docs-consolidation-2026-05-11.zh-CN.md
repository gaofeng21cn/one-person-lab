# OPL Family Content-Level Docs Consolidation 2026-05-11

Status: `active family governance reference`
Owner: `One Person Lab`
Purpose: record the cross-repo content-level docs consolidation lane for the current OPL family
State: `support_reference`
Machine boundary: human-readable governance only. Machine behavior must use contracts, schemas, source paths, generated artifacts, CLI/API behavior, runtime ledgers, provider receipts, domain-owned manifests, or semantic `human_doc:*` ids.

## 结论

本轮整理按内容块判断生命周期状态。2026-05-14 后，长期落点统一服从同名 canonical docs taxonomy。不同文件中的同一判断只保留一个当前 owner；仍有价值的内容吸收到当前 owner doc；过时内容进入 history/provenance 语境；因合同、审计或历史路径仍需保留的文件先做 lifecycle 标注，不做不安全搬移。

优先级固定为：

1. `OPL` 先完成 family-level 智能体框架口径：stage-led、provider-backed，并以 Agent executor 为最小执行单位，`Codex CLI` 是 stage 内默认最小执行单元。
2. `MAS`、`MAG`、`RCA` 作为 admitted domain agents 迁入这套框架，同时保留各自 domain truth、quality verdict、runtime/detail owner、artifact authority 与 direct skill path。
3. `MDS` 只作为 MAS 声明的 archive / provenance / backend audit / explicit archive import / upstream intake / diagnostic / parity oracle reference。
4. 旧 `Hermes-first`、`Gateway`、`frontdoor`、`federation`、`MDS default`、旧 local manager 与重复 UI/runtime 入口完成替代证据后退役或归档。
5. 真实 MAS paper、MAG grant、RCA visual 线的 soak 在迁移目标形态下验证，不再用即将退役的旧路径做主验收。

## 当前仓库 Owner Map

| Repo | 当前角色 | 文档整理 owner | 不应承担的角色 |
| --- | --- | --- | --- |
| `one-person-lab` | OPL family agent framework owner | core five、`docs/active/`、runtime-substrate roadmap、family governance references | 不持有 domain truth、domain quality verdict、domain artifact authority |
| `med-autoscience` | medical research domain agent | `docs/program/`、`docs/runtime/`、`docs/capabilities/`、`docs/policies/`、core five | 不把 MDS / Hermes / OPL App 写成医学 truth owner |
| `med-autogrant` | grant domain agent | core five、`docs/specs/README*`、`specs_lifecycle_map`、plans/references/history indexes | 不把 dated specs 文件名当成 current truth；不把 product-entry 写成成熟 public frontdesk |
| `redcube-ai` | visual-deliverable domain agent | product/runtime/delivery/source/program/references/history 分层与 `human_doc:*` contract-linked docs | 不把 OPL-hosted、Hermes 或 gateway/harness 语汇写成默认 runtime owner |
| `med-deepscientist` | MAS-declared archive/reference/oracle | core five、policies、references/upstream intake、en/zh guide corpus entry notes | 不作为 OPL admitted domain agent，不作为 MAS 默认 runtime 或 product entry |

## 内容级处理规则

- 先读正文，再判断 `owner / purpose / state / machine boundary`。
- 同一主题只保留一个当前 owner；其他文件变成 support、history、provenance 或 tombstone 指针。
- `README*` 和目录 index 先呈现当前事实、下一跳和旧新关系，再列长清单。
- 可以在原文件中调整段落、加 lifecycle banner 或缩短重复内容；只有引用安全后才物理移动文件。
- `human_doc:*`、contract、source、test、history evidence 仍指向旧路径时，优先 index-level lifecycle separation。
- 历史命令、旧路径、旧状态可以保留，但必须位于 provenance/history/legacy 语境。
- 不新增测试去固定 Markdown 文案、章节或措辞；只验证合同、schema、source、CLI/API、生成物或 semantic id。

## 当前落地 Lane

| Lane | 仓库 | 内容级动作 | 验收信号 |
| --- | --- | --- | --- |
| `0` | `one-person-lab` | family governance 入口、cross-repo owner map、旧 runtime-substrate 语义退役说明 | docs index 指向本文件；旧 gateway/Hermes/MDS 语义只在 legacy/provenance/support 语境出现 |
| `1` | `med-autoscience` | runtime/control 旧 MDS daemon/transport 口径收敛，program P0/P1/P2/P3/P3a 分工稳定，Portal/OPL App 分工去重 | MAS 保持 medical truth owner；MDS 为 archive/provenance/parity oracle |
| `2` | `med-autogrant` | core docs 精简，specs lifecycle explicit file table，product-entry 和 provider 口径校准 | `codex_cli` 是默认 runtime owner；旧 specs 不再冒充 current truth |
| `3` | `redcube-ai` | `human_doc:*` 审计后再移动，runtime doc 瘦身，phase-2 absorbed tranche 标注，Hermes/history 降级 | contract-linked program docs 不被无证移动；RCA 保持 visual truth owner |
| `4` | `med-deepscientist` | en/zh guide corpus 入口边界、compat pointer 检查、archive/reference/oracle 口径 | MDS 不回流为 MAS 默认 runtime 或 OPL domain agent |

## 验证规则

每条 docs-only lane 至少执行：

- `git diff --check`
- focused `rg`：`Hermes-first`、`MDS.*default`、`gateway first`、`frontdoor`、`replaceable backend`、`Current Truth`
- 对移动文件执行 inbound reference check：`rg -n "<old-path>|human_doc:|docs/program|docs/specs" docs src tests contracts`

触及 machine-readable contracts、runtime manifests、schema refs、CLI/API 或验证入口时，必须跑对应仓库的 meta/full verification。

## 完成标准

- OPL 的 family docs 能一眼说明框架 owner 与 domain owner split。
- MAS/MAG/RCA/MDS 的入口文档都先说明当前 owner truth，再说明参考和历史层。
- 旧 `Hermes-first`、`Gateway`、`frontdoor`、`federation`、`MDS default` 语义在 active docs 中只能以 legacy/provenance/diagnostic/test/support 方式出现。
- 仍有效内容被吸收到当前 owner doc；旧文档只保留 provenance 或 path-stability 价值。
- 每仓 worktree 分支吸收回本仓 `main` 后清理。
