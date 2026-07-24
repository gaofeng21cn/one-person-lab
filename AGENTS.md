# One Person Lab Framework

本仓是 OPL Framework 的实现与机器真相归口。当前事实以 `contracts/`、源码、测试和 fresh `opl ... --json` readback 为准，文档用于解释和导航。

- Framework 持有通用 runtime、activation、discovery、projection 和 shared contracts；MAS、MAG、RCA 等领域仓持有各自的 domain truth、quality verdict 与 artifact authority。
- One Person Lab App 持有桌面产品和 GUI truth；AionUI、Hermes 等 shell 仓只承载对应实现。
- 跨仓边界变更以相关 machine-readable contract 和真实 consumer 为依据。
- Package 目标态遵循 `Base ≈ R`、`App ≈ RStudio`、`Package ≈ R Package` 和 platform-first composition；Package 是安装单元，Skill/Tool/Plugin/MCP/entrypoint 是 descriptor 可发现 capability，不得形成平行 lifecycle。Package identity、物理 carrier 和 executor route 必须独立；该目标当前为 `planned`，迁移与删除门见 `docs/active/opl-package-platform-composition-migration.md`。
- 新 Package/Agent 必须通过 installed descriptor 动态发现；标准 Agent 只是 `kind=agent` 的普通 Package。Framework 不得新增固定 Package/Agent/Plugin/Module 清单，App starter profile 不得反向成为 Framework registry。
- Package 依赖只声明 required/optional presence 与可调用入口，不新增 SemVer/ABI/exact digest 门禁。MAS -> ScholarSkills 的 required dependency 必须保留，但由实际 carrier 平台 ensure。
- 稳定 Package/capability/entrypoint identity 只能做向后兼容扩展；breaking interface 必须发布新 identity，或由 owner 保留兼容 adapter。旧 identity 只有在 fresh no-active-consumer proof 后才能删除，不能用中央版本 resolver 代替 owner 兼容责任。
- 每个 first-party Package owner 在自己的 GHCR repository 发布完整官方 Package runtime，并独立推进自己的 `latest-stable`；`one-person-lab-manifest:latest-stable` 只允许作为 Full/offline/integration/QA 快照，不得参与普通安装、更新或 currentness。
- OPL Base 只保留薄 OCI download/install/update adapter 和 carrier-neutral fresh installed aggregation；Codex Plugin Manager 只负责 Codex plugin/config/cache 投影，是首个 carrier adapter，不是 Package identity、installed truth 或生态 authority，也不得用 Plugin 子集替代完整 Package runtime。
- executor route 只描述已安装 Package 能否被 Codex CLI、Claude Code、Hermes 等 executor 调用。切换或缺少某个 executor adapter 不得重装 Package、丢失偏好/任务/依赖/typed views，且只局部降级该 route；完整物理 runtime 缺失时必须报告 `physical_unavailable`。
- Git/local/external/offline carrier 可以替代官方 OCI source，但不得建立平行 Package identity 或 currentness。未经 fresh platform gap proof，不得新增 resolver、installed lock、payload/content lock、LKG、lifecycle receipt、materializer、scope activation 或 durable package transaction。
- App Official Profile 只在首次安装或用户显式恢复时 ensure；日常 maintenance 只更新平台仍报告为 installed 的 Package，用户删除后不得静默回装。
- release checksum/attestation、Temporal Worker Versioning 和 domain artifact/evidence digest 各自留在原 owner；不得把它们提升为普通 Package 安装或运行 lock。

默认验证入口：`scripts/verify.sh`。

<!-- CODEGRAPH_START -->
## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。
<!-- CODEGRAPH_END -->
