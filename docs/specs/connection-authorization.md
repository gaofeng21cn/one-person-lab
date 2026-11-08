# OPL Connect 连接授权

本文说明 Framework Connect 如何让已安装 Agent 和 Mini App 使用同一外部连接；机器权威为[连接授权合同](../../contracts/opl-framework/connection-authorization-contract.json)。

## 责任边界

Connect 统一管理连接引用、消费者请求、逐项 grant、provider 路由和不含业务内容的调用观察。连接表示“哪个 provider/account”；grant 表示“哪个已验证 Package 可以对该 connection 调用哪些 capability”；invocation 表示一次调用及其派发结果。

凭据、OAuth refresh、账号切换及外部 API 语义仍归 Relay 或对应 provider owner。Provider adapter 使用自己的凭据存储完成代理调用；Framework、App、Studio、Prompt 与 Mini App 页面都不读取或返回长期密钥。Gateway 的模型账号仍归 Account & Access，不能因 Connect 管理外部服务连接而并入通用账号入口。

## 使用流程

1. 用户在 App 的“资源与连接”添加/选择连接；现有注册表继续只保存 owner-backed credential handle。
2. Mini App/Agent 的 Host 从 Framework fresh descriptor discovery 解析已安装且可调用的 Package；调用方不能通过页面字段声明自己的消费者身份。
3. Consumer 从该 Host 绑定的 `connect` 上下文列出脱敏连接，并为 provider 声明的 capability 创建待批准请求。
4. App 用户批准精确的连接与 capability 集合。批准动作读取 owner projection 并由 Framework 写入 grant；Mini App 请求本身不能自授。
5. 每次 invocation 都重新解析 descriptor、连接、grant、connection security revision 和 provider capability，再路由至 provider adapter。
6. 用户撤销单个 grant 后，该 Package 的后续调用在派发前失败；同一连接上的其他 grant 保持独立。切换 provider/account binding 会提升 connection security revision，使旧 grant 失效。

## 接口约定

Framework Host 可从 `createOplConnectionAuthorizationService({ descriptorDiscovery, providers })` 创建 service。Host 通过 `forPackage(packageId)` 在 fresh discovery 中找到唯一的当前 descriptor 后创建作用域对象。此工厂供 Host 内部使用，不能作为用户可调用的“任选 Package 身份”API。

作用域对象只提供 `listConnections()`、`requestAccess(connectionId, capabilityIds)` 与 `invoke(connectionId, capabilityId, input)`。`requestAccess` 只产生待审批记录。管理请求和 grant 使用 owner action；Studio 页面与通用 App action 不接收 token，也不能写 grant 外的身份。

Provider adapter 是 Framework 显式装配的可信 owner 接口，以 connection type 选择。它接收 connection id、capability id 和 bounded input，在其 owner 边界读取凭据并返回 bounded result；连接注册表不会把 handle 解引用后传入 adapter。适配器缺失、连接更新或授权失效均 fail closed。Framework 不自动重试，特别是写调用的派发结果未知时。

## 运行边界

Codex 的 MCP 权限/审批、App 连接授权与 provider 的业务批准是不同层次。获得某个 capability 的 grant 不代表获得该 provider 的所有操作，不代表邮件发送等不可逆操作已获批准，也不改变 provider owner 的审批合同。

Package 级授权用于约束遵守 OPL Host 接口的 Agent/Mini App，不能隔离以同一操作系统用户执行的恶意本机代码。OPL 不将本功能描述为进程 sandbox；跨主机/Cloud/Fleet 使用必须由对应执行环境明确委派连接，不自动转移本机 grant。

## 与现有品牌模块的结合

Connect 的统一能力采用三层模型，而不是建立一个把所有密钥集中暴露给插件的全局凭证库：

| 层 | 唯一责任 | 不能越过的边界 |
| --- | --- | --- |
| Credential | Relay、Gateway、OPL Link 或其他 provider owner 持有 OAuth、Keychain、refresh 和账号切换 | 不进入 Framework、App、Prompt、Mini App 页面或通用 action |
| Connection | Connect 注册 provider/account 的 opaque 引用和 security revision | 不解引用长期密钥；不能由连接本身推导调用权限 |
| Grant / invocation | Connect 按已安装 consumer 和 capability 路由调用、撤销授权并记录有限元数据 | 每次调用重新核对 descriptor、grant、revision 和 capability；未知派发结果不自动重试 |

品牌模块沿用现有 owner：Pack 在 manifest 中声明 provider 与 capability/risk，Atlas 只索引需求和可用性，App/Console 在“资源与连接”展示连接、请求、授权和撤销，Studio Host 注入绑定的 `connect` context，Relay 等 provider 继续执行凭据访问和业务确认。Gateway 的模型账号仍由 Account & Access 管理；OPL Link 的传输凭据仍由其 provider adapter 管理。Ledger、Runway 和 Stagecraft 只传 grant/invocation 元数据，不传 token。

## 当前实现与验收状态

截至 2026-11-08，以下能力已经在对应 owner 的实现写集中完成，并以 focused checks 验证：

| Owner | 已落地内容 | 验收证据 |
| --- | --- | --- |
| Framework Connect | connection security revision、逐 consumer request/grant、capability risk snapshot、Host `connect` 闭包、脱敏 projection、fail-closed recheck、unknown-after-dispatch 无重试 | authorization/Host/Relay provider 28 项通过；`tsc`、strict module boundary、CLI registry 和 connection actions 通过 |
| Relay | `mailbox.search`、`mailbox.read`、Relay 本地 review draft；provider 绑定 mailbox revision，未提供发送 | provider/CLI focused tests 25 项通过 |
| App | Resources & Connections 投影、deny/revoke/import action、fast/full read model；审批不进入通用 action catalog | App contract tests、typecheck、active-shell quick 通过 |
| Studio | typed approval bridge、Web route、连接授权设置页面；审批只接受 request id | approval/HTTP、typecheck、WebUI build 和 Connect UI tests 通过 |
| Mini App artifact preview | `opl-workspace://artifact` 先做当前 thread workspace 的精确词法 containment，再交既有 canonical byte API 做 realpath/inode 校验；POSIX 路径大小写敏感 | Mini App host/provider 9 项和 Studio workspace service 13 项通过 |

这些证据仍分属任务 worktree，必须在各仓 fresh `main` 上完成语义重放、canonical 吸收和远端 tree/readback 后，才能称为产品 SSOT。共享 `opl-apps` MCP 服务目前没有可信的 per-Package 初始化入口，因此本规范不宣称所有 Mini App 已经接通 Connect consumer 调用；该接线是后续明确 owner 的交付项。真实邮箱、跨宿主 clean-install 和生产发布也不在本地 fixture 证据之内。
