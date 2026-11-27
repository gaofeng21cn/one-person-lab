# OPL 硬约束

本文只记录实现和演进不可破坏的规则。产品定位见 [项目概览](./project.md)，当前实现见 [状态](./status.md)。

## Authority

1. 每项事实只有一个 writer；cache、projection、UI、Markdown 和 generated report 不能成为第二 owner。
2. Framework 持有通用 runtime 与 projection，不持有 domain truth、quality verdict、artifact authority、owner receipt 或 human gate。
3. App 持有桌面产品、交互和 release truth；Cloud 与 Package owner 持有各自资源和发布事实。
4. 跨仓变更先修改真实 owner contract，再更新 consumer；consumer 不反向定义 owner。

## Package

5. Package 是唯一安装单元；Skill、Tool、Plugin、MCP、workflow 和 entrypoint 是 descriptor 能力。
6. Framework 从 installed descriptor 动态发现 Package 和 Agent，不新增固定成员 registry。
7. Package identity、native carrier、executor route、Cordis contribution 和 publication identity 必须分离。
8. Pack 持有自身管理的安装与启停状态；通过原生载体接入的能力由对应载体回读，投影须标明来源。
9. required dependency 只表达 presence 与 callable entrypoint；由 Pack 校验所选制品的内容锁。
10. App starter profile 只用于首次安装或显式恢复，不能成为成员资格和 maintenance authority。
11. 独立 repo 和独立 publication 必须由真实 owner、consumer、release cadence 或隔离需求证明，不能为未来假设提前建立。

## Runtime

12. Stage 定义目标、输入、产物和责任边界；AI/executor 决定阶段内方法，不由静态路由器替代专业判断。
13. Runway 在本地 SQLite 中持久化 StageRun 和 Attempt，executor 提供实际执行结果。领域负责人或人工评审决定专业完成度。
14. owner receipt、typed blocker 和 artifact ref 必须来源可回读，不能由 operator 或 provider 合成。
15. provider healthy、workflow completed、gate passed 或 evidence count 为零都不等于质量、交付或生产就绪。
16. 普通可恢复失败优先返回可执行 repair route；安全、权限、数据完整性和不可逆动作必须 fail closed。

## Studio 的 Cordis 宿主

17. Studio 的进程内组合使用 `@deepseek-ai/cordis`，不建立平行 service locator、event bus、effect 或 lifecycle。
18. Cordis 只管理进程内依赖、event、effect 和 teardown；不持有 durable workflow、Package installed truth、领域事实或 App product truth。
19. composition profile 必须显式、可回读；运行中的 attempt 不热换 composition identity。
20. Cordis plugin 身份不等于安全沙箱或独立 Package。

## Source

21. 源码 owner 按[现行包结构](./architecture.md#source-topology)划分；包导入方向通过 `npm run v2:guard` 检查。
22. 跨 source unit 通过公开 entrypoint 调用；禁止恢复退役 root、兼容 barrel、无 caller facade 或第二 registry。
23. 新抽象、新状态和新依赖必须有当前 caller、合同或已观察故障付账。
24. active caller 切换后，旧 writer、reader、schema、fixture、alias 和测试一起删除，不保留永久 dual path。

## Evidence and delivery

25. source、build、test、installed、effective runtime、publication 和 user path 是不同证据层，不能互相替代。
26. release artifact 必须由真实 owner workflow、签名/校验和远端 readback证明；本地 commit 或候选分支不等于发布。
27. dynamic count、receipt、health 和 version 只从 fresh machine surface 读取，不写入长期文档。

## Knowledge and memory

28. 知识的 scope、内容性质、来源位置与访问范围独立表达；Agent 执行任务不转移用户、主题或项目正文的所有权。
29. 同一知识对象只有一个可编辑正文主源。已有个人库与普通工作目录使用同一来源机制，运行快照和派生摘要不能成为第二正文权威。
30. 已接受版本、来源权限和时效约束共同决定可用性；冻结快照不延续已撤回的权限，关键约束变化须在真实行动前核验。
31. 语义接受与业务行动权归相应 owner。通用来源解析、写入、回执和结构检查不能替代它们。

## v2 收敛边界

32. Framework 的本机 durable state 只有 `opld` JSON-RPC 这一条写入路径，CLI、Studio 和 SDK 不得直接写 flat JSON、绕过 `opl.db`，或在非 macOS 主机回写 macOS 专用状态路径。
33. `v2_release` 只有在不可变 OCI publication 与 manifest readback 成功后才能进入 Catalog。GHCR manifest 缺失必须 fail closed，resolver 不得从 Catalog 选择的 v2 release 静默降级到 v1。
34. `OPL_FULL_RUNTIME_HOME` 只可作为匹配版本和 commit 的公开 Package 字节加速器。在线目录、私有 `authorized_only` Package 和授权检查不能因 seed 存在而消失。
35. OPL Link companion 的 server owner 是 Studio `opl-host-core`；Framework 与 `@opl/connect` 只维护 Gateway companion authorization，不得创建第二 companion host。
36. 活跃 Catalog Package 完成 `opl.package.v2` 迁移后，必须删除 pre-v2 发布工具 pin 和 v1→v2 runtime adapter，不保留永久双轨执行链。
37. v2 只保留只读 `opl_base` 当前版本投影和公共 Catalog `source_refresh`；Homebrew Tap 原生软件管理、多安装切换 UI、通用 Action Rollback 及旧工作流 `provider_*` 控制不属于受支持的 Framework surface。
38. `one-person-lab` 只持有 Framework 自身运行时与发布（`publish-framework.yml`），不再吸纳新的跨产品发布编排、产品私有回执解析或固定产品发布清单；横向发布流水线与全景状态回读归专职交付平台 `opl-release`，软件目录数据归只读信任根 `opl-catalog`。

共同生命周期与保留规则由[知识来源与记忆政策](./policies/knowledge-source-and-memory-policy.md)持有。

## Documentation

文档的单一职责、保留与退役规则由 [文档生命周期政策](./policies/docs-lifecycle-policy.md) 统一持有。本页不复制该政策，也不通过文档断言改变 runtime 合同。
