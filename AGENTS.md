# One Person Lab Framework

本仓是 OPL Framework 的实现与机器真相归口；以 `contracts/`、源码、测试和 fresh `opl ... --json` readback 为准。

- Framework 持有通用 runtime、Package activation/discovery、projection、installed aggregation 和 shared contracts；领域 truth、quality verdict、artifact authority 仍归 MAS、MAG、RCA 等领域 owner。
- One Person Lab App 持有桌面产品、GUI 和发布产品 truth；Studio 承载当前 Stable/Nightly Desktop、WebUI 与 Docker 的 DSH/Cordis Application Host 和原生 Codex 实现；AionUI 仅保留旧版升级基线与历史来源，已退休的 Hermes 仓只保留 read-only Git provenance。
- Framework Host 只在 `framework_runtime_package_graph_and_app_projection` 范围内唯一；Studio Host 的范围是 `dsh_profile_plugin_lifecycle_codex_and_delivery_transport_composition`。两个 Host 通过公开 App state/action、authentication 和 channel callback 合同协作，不共享 registry、currentness、session 或内部 service graph，也不得形成第二套 OPL runtime、Package authority、App state/action、domain、product 或 release authority。
- AionCore 是只读的官方上游依赖，不是 OPL 维护面。不得为解决 OPL 问题建立或维护 AionCore fork、提交 AionCore PR/补丁，或把本地修改版纳入产品；问题必须在 OPL 自有 App/Shell 边界解决，版本升级只采用官方未修改的 release。
- 不得单独替换或热更新 `/Applications/One Person Lab.app` 内正在运行的 AionCore 二进制。AionCore 升级必须随完整 OPL App 构建和安装完成，并回读 App bundle、AionCore 与 App/Shell 选定的官方 Codex CLI 的实际版本；Codex carrier 的版本和 digest 由当前 App/Shell 合同决定。
- Package 是安装单元，Skill、Tool、Plugin、MCP 和 entrypoint 是 descriptor 可发现能力；Package identity、物理 carrier、executor route 与 publication/currentness 必须分离。
- 新 Package/Agent 通过 installed descriptor 动态发现；不得新增固定 Package、Agent、Plugin 或 Module 清单，也不得让 App starter profile 反向成为 Framework registry。
- Package 依赖只声明 required/optional presence 与可调用入口。稳定 identity 只能兼容扩展；删除旧 identity 前须有 fresh no-active-consumer proof。
- 平台原生 carrier 负责实际生命周期；Framework 只在已证实的平台缺口处提供薄 adapter，不复制 resolver、lock、payload、LKG 或平行 currentness。
- 跨仓边界变更以相关 machine-readable contract 和真实 consumer 为依据。默认验证入口：`scripts/verify.sh`。
- 所有新增或保留的执行限制遵循[必要性与作用范围政策](docs/policies/engineering-boundary-policy.md)：以具体可达故障证明必要性，优先缩小到受影响的操作；旧实现、合同或测试不能单独证明应收紧。开发验证、普通质量债与可选能力故障不得套用发布或不可逆操作的全局门禁。
- 第三方 PR 只是提案。合并前核对用户确认的原始意图、当前默认行为和权限边界；增加平台、模型或适配器不得静默放宽安全约束或缩小既有能力。修改 PR 内的 contract 和通过 CI 不能证明产品变更已获认可；默认行为变化必须有独立的必要性证据，扩展路径与原默认路径分别验证。
- 贡献按[三档信任与准入政策](docs/policies/third-party-contribution-admission-policy.md)处理：本人/自用账号直接信任并合并；指定 repo 合作者以信任为主并核对最新 SSOT；其余第三方以审慎质疑为起点，改行为或加功能前先读目标仓产品设计理念与非目标边界，区分“原 PR 是否可合”与“背后真实问题是否值得承接”，谨慎前提下以自主推进闭环为主、极少数重大设计/不可逆取舍才交人工决策，且每项判断均须沿用提出者语言公开回复并回读；身份仅按可信主线数字 ID 与精确 repo 判定，不得从写权限、历史合并或待审 PR 自改名单推导豁免。
- GitHub 上自己新建的对外文本用英文书写：commit subject/body、PR 标题与正文、Issue、comment、Release Notes。产品名、代码标识、路径、命令与原始引用除外。他人写的 Issue、PR 或 comment，无论对方用什么语言，回复沿用对方的语言；历史中已有的非英文 commit 保持原样，App 生成的公开正文会直接省略非英文条目。
- 文档入口与职责见 `docs/README.md`；创建、改写和退役统一遵循 `docs/policies/docs-lifecycle-policy.md`。代码/合同变更同批更新实际主题 owner、引用和生成源，历史通过 Git 追溯。

## Code Review Rules

- 只报告当前 diff 可复现的 runtime 正确性、安全、数据完整性、Package 生命周期或 machine-readable contract 回归；每条必须给出精确代码或 contract 证据、触发路径和可验证影响。安全路径是修复 canonical owner 或真实 consumer，不是添加平行 registry、cache 或 currentness。
- 将 installed descriptor、平台 carrier、executor route 与 App/Framework contracts 的 owner 边界视为事实来源；只有改动实际违背这些边界时才报告 P2。不得把格式、命名、主观重构或没有具体回归路径的建议升级成发现。
- 不报告与当前 diff 无关的既有问题，也不把缺少测试或文档本身当作问题；只有它们直接造成可复现的行为或契约回归时才报告。若不存在高价值可复现问题，明确返回无发现。

<!-- CODEGRAPH_START -->
## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。
<!-- CODEGRAPH_END -->
