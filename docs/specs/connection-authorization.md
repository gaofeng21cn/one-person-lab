# OPL Connect 连接授权

本文说明 Framework Connect 如何让已安装 Agent 和 Mini App 使用同一外部连接；机器权威为 [`packages/connect/src/`](../../packages/connect/src/index.ts) 与 `opld` RPC 合同。

## 责任边界

Connect 统一管理连接引用、消费者请求、逐项 grant、provider 路由和不含业务内容的调用观察。连接表示“哪个 provider/account”；grant 表示“哪个已验证 Package 可以对该 connection 调用哪些 capability”；invocation 表示一次调用及其派发结果。

凭据、OAuth refresh、账号切换及外部 API 语义仍归 Relay 或对应 provider owner。Provider adapter 使用自己的凭据存储完成代理调用；Framework、App、Studio、Prompt 与 Mini App 页面都不读取或返回长期密钥。Gateway 的模型账号仍归 Account & Access，不能因 Connect 管理外部服务连接而并入通用账号入口。

## 使用流程

1. 用户在 App“应用管理 → 共享资源”的连接区添加/选择连接；设置页复用同一管理组件与 owner action。现有注册表继续只保存 owner-backed credential handle。
2. Mini App/Agent 的 Host 从 Framework fresh descriptor discovery 解析已安装且可调用的 Package；调用方不能通过页面字段声明自己的消费者身份。
3. Consumer 从该 Host 绑定的 `connect` 上下文列出脱敏连接，并为 provider 声明的 capability 创建待批准请求。
4. App 用户批准精确的连接与 capability 集合。批准动作读取 owner projection 并由 Framework 写入 grant；Mini App 请求本身不能自授。
5. 每次 invocation 都重新解析 descriptor、连接、grant、connection security revision 和 provider capability，再路由至 provider adapter。
6. 用户撤销单个 grant 后，该 Package 的后续调用在派发前失败；同一连接上的其他 grant 保持独立。切换 provider/account binding 会提升 connection security revision，使旧 grant 失效。

## 接口约定

Framework Connect 服务由 [`packages/connect/src/`](../../packages/connect/src/index.ts) 与 `opld` RPC（`connect.*`）统一承载；安装与上下文绑定通过 `opld` 与已安装 descriptor 解析，不允许页面和工具参数提供消费者身份或安装根。对于 Codex local marketplace，运行根以 fresh native descriptor 的 `source.path` 为准；`plugin add` 返回的缓存路径可能不同，不能凭缓存目录名替代实际载体绑定。隔离验收可先把精确提交展开为不可变 marketplace，再走原生安装和回读。

作用域对象只提供 `listConnections()`、`requestAccess(connectionId, capabilityIds)` 与 `invoke(connectionId, capabilityId, input)`。`requestAccess` 只产生待审批记录。管理请求和 grant 使用 owner action；Studio 页面与通用 App action 不接收 token，也不能写 grant 外的身份。

Provider adapter 是 Framework 显式装配的可信 owner 接口，以 connection type 选择。它接收 connection id、capability id 和 bounded input，在其 owner 边界读取凭据并返回 bounded result；连接注册表不会把 handle 解引用后传入 adapter。适配器缺失、连接更新或授权失效均 fail closed。Framework 不自动重试，特别是写调用的派发结果未知时。

共享资源中的连接行只投影连接 ID、provider、账户显示名、授权 capability 与 owner 声明的操作。连接检查、停用和移除继续调用现有 Connect action；移除 Connect 引用不删除 Relay 邮箱账户。模型账号显示在模型访问区并由 Account & Access 管理，内置 Gateway 不再重复显示为通用连接。模型访问尚未被 owner 回读时保持“未知”，不能据缺失字段判断失败。

## 运行边界

Codex 的 MCP 权限/审批、App 连接授权与 provider 的业务批准是不同层次。获得某个 capability 的 grant 不代表获得该 provider 的所有操作，不代表邮件发送等不可逆操作已获批准，也不改变 provider owner 的审批合同。

Package 级授权用于约束遵守 OPL Host 接口的 Agent/Mini App，不能隔离以同一操作系统用户执行的恶意本机代码。OPL 不将本功能描述为进程 sandbox；跨主机/Cloud/Fleet 使用必须由对应执行环境明确委派连接，不自动转移本机 grant。

## 与现有模块的结合

Connect 的统一能力采用三层模型，而不是建立一个把所有密钥集中暴露给插件的全局凭证库：

| 层 | 唯一责任 | 不能越过的边界 |
| --- | --- | --- |
| Credential | Relay、Gateway、OPL Link 或其他 provider owner 持有 OAuth、Keychain、refresh 和账号切换 | 不进入 Framework、App、Prompt、Mini App 页面或通用 action |
| Connection | Connect 注册 provider/account 的 opaque 引用和 security revision | 不解引用长期密钥；不能由连接本身推导调用权限 |
| Grant / invocation | Connect 按已安装 consumer 和 capability 路由调用、撤销授权并记录有限元数据 | 每次调用重新核对 descriptor、grant、revision 和 capability；未知派发结果不自动重试 |

各模块沿用现有 owner：Pack 在 manifest 中声明 provider 与 capability/risk，App/Console 在“资源与连接”展示连接、请求、授权和撤销，Studio Host 与 `opld` 注入绑定的 `connect` context，Relay 等 provider 继续执行凭据访问和业务确认。Gateway 的模型账号仍由 Account & Access 管理；OPL Link 的 companion hosting 由 Studio `opl-host-core` 独占管理。Ledger 与 Runway 只传 grant/invocation 元数据，不传 token。

## Relay 参考消费路径

Relay 已配置邮箱通过既有 `opl connect list --json` 本地只读操作进入连接选择器。Framework 仅保留 `mailbox_ref`、显示名、账户标签及 provider；不读取 token、密码或 Keychain，不发起邮箱联网探测。读取最多等待 1.5 秒、最多接受 100 条记录。`available_connections_status=available` 且列表为空表示 Relay 本地尚无配置；`unavailable` 表示本次无法读取，UI 应引导恢复 Relay 后刷新。选择已有邮箱再执行导入才创建 Connect 引用，读取列表不会导入或批准任何授权。

Relay 专用 MCP App 的 `connection_*` 操作与“已连接邮箱”界面共用同一个领域服务。该服务从自身 installed carrier 激活固定的 `opl-relay` consumer；列出连接只返回脱敏字段，请求授权只创建 pending request，查找、读取和本地回复分别映射到 `mailbox.search`、`mailbox.read`、`draft.create`。已有 grant 可直接调用，无需再次配置邮箱。

Framework 通过已安装 Package 及 `opl pack` 维护连接上下文。缺少所需能力或版本不兼容时，Relay 返回明确修复结果，不能转向未授权的 provider 调用。关闭再打开界面不会创建新的授权或更改 consumer；撤权、连接 revision 和 installed descriptor 变化由每次调用的原 owner 复核。未知调用返回 invocation ID 和 disposition，不自动重发。

Relay 原有本地邮箱工具仍是直接由用户使用的领域入口，其草稿保存与发送确认合同不由 Connect grant 替代。共享 `opl-apps` 中的 `package_id` 继续只用于导航与贡献路由，不暴露任意 Package 的 consumer 工厂。

源码检查与合成场景可验证身份、授权、同对象/版本以及恢复语义；真实邮箱和发行安装的运行结果由对应 carrier/领域验收分别记录。

## 已安装的通道 provider 与原生接管

`opld` 托管通过 Package manifest 声明的普通 `channel_access` provider；当 Studio 客户端宿主配置了原生通道插件（如微信原生插件 `opl-channel-weixin`）时，仅按精确 `package_id` 接管对应原生界面，不得误过滤其他 `opld` 托管通道。OPL Link companion 宿主不再由 Framework `@opl/connect` 托管，完全由 Studio `opl-host-core` 负责。

## Cloud 跨宿主连接

`opl-cloud` provider 将外部 Agent Host 接到 Cloud 原有 MCP 只读工具。CloudIdentity 签发固定 tenant、`opl-cloud-mcp` audience 和只读 action 范围的短期凭证，最长一小时且不超过父登录会话。用户从已登录的 Cloud 界面取得连接文件，由 Cloud 自有 `opl-cloud-connect` helper 导入和保管；Framework 只登记 helper 返回的 `cloud:<UUID>` 引用与 binding revision。

```bash
opl connect cloud list --json
opl connect cloud import --cloud-ref cloud:<UUID> --json
```

可信宿主通过已安装的 `opl-cloud-connect`，或显式 `OPL_CLOUD_CONNECT_BINARY` 选择该 helper。导入连接不批准 Package grant；消费者仍通过上面的 installed context 请求并使用精确能力。凭证的建立、保管和服务部署由 [Cloud](https://github.com/gaofeng21cn/one-person-lab-cloud) 维护。

每次调用由 CloudIdentity 重验凭证、父会话、成员状态、tenant 与 action，业务 owner 继续检查目标 Workspace 或 operation。Connect 撤权在派发前生效；Cloud 撤权或父会话到期则由 Cloud 拒绝后续访问。用户重新建立连接后，helper revision 变化会使旧 grant 失效。此入口不提供长期 PAT、OAuth 或自动刷新；过期后回到 Cloud 登录与连接流程，不借用浏览器 cookie。未知结果回读原对象或 operation，不重放业务操作。

## OPL Link 的现有账号授权桥

桌面 Host 通过 `opl connect gateway authorize-companion --request-stdin --credential-file <new-private-file> --json` 复用 App 已登录的 OPL Gateway 账号，向固定的 `https://link.medopl.com` 注册公开电脑身份。请求只包含 `service: "opl_link"` 和上游 Host descriptor；不从界面接收服务器地址。手机端可选择通过同 Gateway 账号登录（经受信任的账号交换接口发现已授权在线电脑）或继续使用扫码/粘贴配对建立连接。

Framework v2 的桌面登录通过认证后的本机 daemon socket 调用 `connect.gateway.login`，成功时返回 `gateway_account`。可信 App 和 CLI 通过 `connect.gateway.status` 读取同一份账号状态，通过 `connect.gateway.authorizeCompanion` 兑换手机连接凭据。已有 `opl connect gateway` 命令沿用相同的 daemon 接口，无头容器与冒烟脚本可通过 `opl connect configure-codex --api-key-stdin [--json]` 从标准输入写入 Codex API Key 并调用 `connect.configureCodexApiKey` RPC（拒绝命令行参数明文传密）。连接测试、状态切换与删除（`connection_test`、`connection_update`、`connection_delete`）通过 App actions 与 `ConnectService` 共用单写者边界。通用 `connect.add` 只在识别到此前 Studio 的两个登录表单时，将请求交给对应的账号或 Codex 配置功能。

可信 App 与 CLI 在 daemon 握手时提交当前 Codex 配置目录。登录后的模型配置、手工 Key 保存和设置回读按该连接解析目录，多个配置可共用一个 daemon。每个 Gateway 安装账号保存一个自动绑定的恢复快照，在另一份 Codex 配置激活账号前，先断开原绑定。

Framework 在现有账号锁内轮换会话并持久化 refresh token，再兑换 Relay 专用凭据。凭据只写入调用者拥有的 0700 目录中的全新 0600 文件；已有文件、符号链接和宽权限目录在联网前拒绝。Studio 导入后删除临时文件。标准输出仅含已写入状态、固定服务地址、scope 和电脑 ID；Gateway bearer、密码、模型 Key 与 Relay token 不进入 Renderer、CLI 输出或通用连接注册表。

这次兑换仅授权传输。手机仍须通过电脑公钥固定的 Noise 通道完成账号认领或兑换 120 秒单次配对码；会话、审批、工作区及设备撤销继续由 Studio 和已有 Codex owner 执行。产品和互联网合同由 [App](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-remote-companion-internet.json) 持有。

面向源码交付的固定范围 [GitHub 源码只读桥](../../.github/workflows/link-source-access.yml) 复用已有 GitHub App installation，仅为 Framework、Studio、Link 三仓请求 `contents/actions: read`。它核对私有源码和准确构建 run 的 artifact 可读后，以 RSA-OAEP/AES-256-GCM 将短时 token 加密给本机临时公钥；密文绑定当前 workflow run、源码提交与接收公钥，调用方仅在 50 分钟保守窗口内使用。

此桥只承担源码与构建产物只读获取，不请求 Packages 权限或核验镜像。GHCR 读取及个人 OAuth 沿用各自 owner；GitHub 拒绝请求时直接终止并由账号 owner 核对既有 App installation 授权，不扩大 grant 或自动重试。
