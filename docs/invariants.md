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
8. native carrier 持有物理安装、启停和 currentness；Framework 只做薄 adapter、presence/callability 和聚合。
9. required dependency 只表达 presence 与 callable entrypoint；不得恢复中央 SemVer resolver、ABI resolver、installed lock、payload lock、LKG 或第二 updater。
10. App starter profile 只用于首次安装或显式恢复，不能成为成员资格和 maintenance authority。
11. 独立 repo 和独立 publication 必须由真实 owner、consumer、release cadence 或隔离需求证明，不能为未来假设提前建立。

## Runtime

12. Stage 定义目标、输入、产物和责任边界；AI/executor 决定阶段内方法，不由静态路由器替代专业判断。
13. provider 持有 durable execution history；Framework 持有 Attempt projection；两者都不能声明 domain ready。
14. owner receipt、typed blocker 和 artifact ref 必须来源可回读，不能由 operator 或 provider 合成。
15. provider healthy、workflow completed、gate passed 或 evidence count 为零都不等于质量、交付或生产就绪。
16. 普通可恢复失败优先返回可执行 repair route；安全、权限、数据完整性和不可逆动作必须 fail closed。

## Cordis

17. 正式进程内 composition runtime 是 `@deepseek-ai/cordis`，不建立平行 service locator、event bus、effect 或 lifecycle。
18. Cordis 只管理进程内依赖、event、effect 和 teardown；不持有 durable workflow、Package installed truth、领域事实或 App product truth。
19. composition profile 必须显式、可回读；运行中的 attempt 不热换 composition identity。
20. Cordis plugin 身份不等于安全沙箱或独立 Package。

## Source

21. `source-module-map.json` 定义源码 owner 和依赖方向；目录对称、品牌名称和文件数量不能替代 responsibility boundary。
22. 跨 source unit 通过公开 entrypoint 调用；禁止恢复退役 root、兼容 barrel、无 caller facade 或第二 registry。
23. 新抽象、新状态和新依赖必须有当前 caller、合同或已观察故障付账。
24. active caller 切换后，旧 writer、reader、schema、fixture、alias 和测试一起删除，不保留永久 dual path。

## Evidence and delivery

25. source、build、test、installed、effective runtime、publication 和 user path 是不同证据层，不能互相替代。
26. release artifact 必须由真实 owner workflow、签名/校验和远端 readback证明；本地 commit 或候选分支不等于发布。
27. dynamic count、receipt、health 和 version 只从 fresh machine surface 读取，不写入长期文档。

## Documentation

文档的单一职责、保留与退役规则由 [文档生命周期政策](./policies/docs-lifecycle-policy.md) 统一持有。本页不复制该政策，也不通过文档断言改变 runtime 合同。
