# 合同目录说明

这个目录只保留 `OPL` 的 machine-readable contract surface 与其目录说明。

- narrative 协作规则看仓库根 `AGENTS.md`
- 默认人类/AI 入口看 `README*` 与 `docs/README*`
- 当前 OPL framework 合同入口看 `contracts/opl-framework/README.md`
- 当前产品认知按 `OPL Framework -> One Person Lab App -> Foundry Agents` 阅读：Framework 持有合同与运行控制面，App 消费这些合同做用户工作台，MAS/MAG/RCA 等 Foundry Agents 声明并适配这些合同但不内嵌一份 OPL runtime
- 当前公开默认主路径是 `external shell or CLI -> Codex CLI first-class executor -> OPL typed family queue / activation layer -> Temporal-backed family runtime provider -> selected domain agent entry`；Full OPL family readiness 的 online runtime substrate 是已配置且 ready 的 Temporal provider，Hermes-Agent 只作为显式 Agent executor/proof/diagnostic 资产，local provider 只作为 dev/CI/offline diagnostic baseline
- 当前 active domain agent 集合是 `MAS`、`MAG`、`RCA`；`MDS` 只作为 `MAS` 下的显式可选 backend/audit/oracle companion 进入环境管理和投影，不作为默认安装依赖或顶层 domain-agent entry。
- 已退役的旧入口词族不是 OPL 当前合同面；若只在历史 gateway 语料或 domain 仓内部 command/schema contract 中出现，必须按对应层级阅读。

当前保留的 repo-tracked machine-readable truth：

- `contracts/opl-framework/*.json`：当前 stage-led OPL framework、App consumer surface、Foundry package/domain-agent catalog、runtime 与 supporting-surface contract
- `contracts/opl-framework/README.md`：这些 active JSON contract 的人类可读说明
- `contracts/opl-framework/runtime-manager-contract.json`：当前 OPL Runtime Manager 产品控制面合同；它冻结 OPL 如何管理 provider-backed family runtime、typed family queue、stage attempt ledger、domain dispatch、可选 native helper lifecycle、高频状态索引、prebuild/cache 策略与 freshness 口径，同时明确不复制 runtime kernel
- `contracts/opl-framework/family-runtime-online-substrate-contract.json`：provider-backed family runtime 合同；它冻结 `local_sqlite` 与 `temporal` 的 owner split、queue state、stage attempt ledger、degraded diagnostic mode 与 forbidden authority
- `contracts/opl-framework/native-helper-contract.json`：OPL Rust native helper 的 JSON stdio 合同；它冻结 `opl-sysprobe`、`opl-doctor-native`、`opl-runtime-watch`、`opl-artifact-indexer` 与 `opl-state-indexer` 的输入输出边界，以及 helper 的 build / doctor / repair / prebuild / package 分发面
- `contracts/opl-framework/fresh-install-test-matrix.json`：OPL fresh install 与 GUI 首启验证矩阵；它冻结 CLI clean-room 场景、首启 JSONL 日志、GUI accessibility labels 与 VM 工件要求
- `contracts/family-orchestration/*.schema.json`：跨 active 四仓线（`one-person-lab` + `MAS` + `MAG` + `RCA`）统一的 family orchestration companion schemas
- `contracts/family-orchestration/README*.md`：这些 family orchestration schema 的人类可读说明

围绕这些 machine-readable contract 的上位共享合同，当前统一在 `docs/` 层维护：

- `docs/active/shared-runtime-contract*.md`：跨 domain 共享的长期在线运行合同人读支撑
- `docs/active/shared-domain-contract*.md`：跨 domain 共享的正式行为合同人读支撑

其中：

- `family event envelope`
- `family checkpoint lineage`

属于 runtime-oriented 的 companion contract；

- `family action graph`
- `family human gate`
- `family product-entry manifest v2`
- `family runtime supervision`
- `family persistence policy`
- `family lifecycle ledger`
- `family owner route`

属于 domain-oriented / control-plane-oriented 的 companion contract。

这些 schema 只冻结跨仓 orchestration 语义，不引入 CrewAI/LangGraph 等第三方框架作为 family runtime dependency，也不改写 `Hermes-Agent` / `Codex CLI` / `domain-owned truth` 的 owner 边界。

这里不再保留 narrative 的 `project-truth/AGENTS.md` 层。
