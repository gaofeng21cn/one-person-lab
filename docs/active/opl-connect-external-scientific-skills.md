# OPL Connect 外部科学 Skill 库

Owner: OPL Connect
State: active connector surface
Machine boundary: 机器真相以 `opl connect external-skills *` CLI、
`src/modules/connect/opl-connect-external-skills.ts` 和 focused CLI tests 为准。
本文只做人读操作说明。

OPL Connect 负责把经过批准的外部 Agent Skills 库登记成可发现 source，
并支持按需搜索、查看和选择性同步。MAS 继续持有医学论文判断、产物权威和
owner route；外部库只提供可选专业能力。

当前第一条外部 source：

- source id: `kdense-scientific-agent-skills`
- alias: `kdense`
- upstream: `https://github.com/K-Dense-AI/scientific-agent-skills`

## 命令面

```bash
opl connect external-skills sources add --source kdense --repo https://github.com/K-Dense-AI/scientific-agent-skills --pin <commit-or-tag> --json
opl connect external-skills list --registry-root <workspace-root> --json
opl connect external-skills search --query "single cell RNA-seq" --source kdense --json
opl connect external-skills inspect --skill kdense/scanpy --json
opl connect external-skills sync --skill kdense/scanpy --scope workspace --target-workspace <workspace-root> --json
```

`sources add` 写入 OPL Connect source registry，默认位置是：

```text
<workspace-root>/.opl/connect/external-skill-sources.json
```

该 registry 记录 source id、repo、pin 和可选本地 checkout 路径。普通用户不需要
知道、clone 或安装 K-Dense repo；`list`、`search`、`inspect` 和 `sync` 在 source 缺失时
会按登记的 repo/pin materialize 到 OPL state cache。`--source-root` 只作为维护者
调试、离线复核或私有 checkout 覆盖入口，不是普通使用路径。

`list`、`search` 和 `inspect` 是只读发现面。普通 MAS 任务优先使用
`search -> inspect`，因为 `list` 是 source/index 审阅面，可能返回整个外部库的
metadata。`sync` 只把一个明确选中的 external skill 写入：

```text
<workspace-or-quest>/.codex/skills/<skill-id>/
```

同步时会在目标 skill 目录写入 `.opl-install-receipt.json`，记录 source、
pin、选中 Skill 的 `content_sha256`、target scope、trigger policy 和
no-authority boundary。Skill card 同时暴露 `source_license`、`category`、
`keywords` 和 `risk_flags`：这些字段用于发现、审阅和策略判断，不把外部
Skill 变成 MAS 默认能力或 domain authority。该 fingerprint 绑定实际同步的
Skill 目录内容；本地 checkout 路径只作为定位信息，不作为可复现证据。
`list/search/inspect` 同时给出 category、keywords 和 risk flags，用于把
K-Dense 这类大库压缩成可审阅的单 Skill 候选；当前分类覆盖 omics、clinical
AI、medical imaging、workflow/compute、chemistry、literature、statistics、
scientific documents、visualization、writing 和 database/API。

## MAS 使用方式

MAS 优先使用默认医学论文专业 Skill 包：

- `medical-manuscript-writing`
- `medical-manuscript-review`
- `medical-figure-design`
- `medical-figure-style`
- `medical-figure-composer`
- `medical-research-lit`
- `medical-statistical-review`
- `medical-table-design`
- `medical-submission-prep`
- `medical-data-governance`

外部科学 Skill 用于默认包覆盖不到的专科任务，例如 `scanpy`、`pydeseq2`、
`pathway-enrichment`、`nextflow`、`rdkit`、`pyhealth`、`pydicom`、
`scikit-survival` 或 `pyzotero`。

粗入口 Skill 或聚合入口看到罕见专科能力时，先问 OPL Connect：
`search/inspect` 读取 skill card 和 `trigger_policy`，确认确实超出默认
MAS medical-paper pack 后，再选择单个 skill 做 `sync`。`list` 用于维护者审阅
source index，不作为普通执行上下文的默认入口。
不要把 K-Dense 全库塞进上下文，也不要把外部库当作 MAS 默认能力包的一部分。

`plugins/opl-foundation-skills/skills/opl-external-specialist-skill-router/SKILL.md`
是这个路径的通用极薄 source-only router。科研场景不再保留单独 compatibility alias，
而是作为 generic specialist router 的 trigger specialization。它只在默认 MAS / professional skills
覆盖不了专业工具、数据库、工作流或方法时触发 Codex 走
`opl connect external-skills search -> inspect -> sync`，并且只选择一个外部
Skill 候选。它不读取 K-Dense 全量正文，不批量同步 source，不签 owner receipt、
typed blocker 或 domain verdict。

有效触发方式：

- 用户明确命名外部工具、软件包、数据库或工作流；
- MAS 专业 Skill 生成默认包无法覆盖的 route-back candidate；
- MAS stage 主提示词识别出默认专业 Skill 之外的专科能力；
- 任务需要联网、云计算、敏感数据或受治理的软件环境策略检查。

## 边界

OPL Connect 持有 source registry、skill cards、search/inspect、选择性同步和
sync receipt。它不持有 MAS stage policy、manuscript truth、reviewer
verdict、owner receipt、typed blocker、publication readiness 或 artifact
authority。

默认策略是 `selective_sync_only`。MAS 热路径只同步被明确选中的单个外部
Skill，默认包能力仍由 MAS / `mas-scholar-skills` 的专业 Skill 维护。
机器读面同时暴露 `default_mas_pack_remains_primary=true`、
`external_skill_requires_explicit_selection=true`、`default_install=false` 和
`can_install_all_skills_by_default=false`。
