# 公共图片模型执行接口

Framework 的 `opl-framework/domain-task-runtime` 导出 `runDomainImageGeneration`。
领域 Agent 提交图片任务，由 Framework 读取调用进程选定的 Codex provider 并执行一次
OpenAI-compatible Images API 请求。图片的设计、事实、质量、版本和交付判定仍归领域 owner。

这是宿主没有注入 built-in 图片工具时的 API 执行能力。调用者从实际工具清单判断 built-in
是否可用，按领域已选路线决定回退；不会把 Skill 已安装视为工具已注入。接口也不会发起
Codex 对话、切换模型、选择其他账号或替调用者声明授权。

```js
import { runDomainImageGeneration } from 'opl-framework/domain-task-runtime';

const receipt = await runDomainImageGeneration({
  prompt: 'Create the approved slide image.',
  output_path: '/workspace/images/slide01.png',
  model: 'gpt-image-2',
  size: '2048x1152',
  quality: 'high',
});
```

`reference_image_paths` 非空时调用 `/images/edits`，否则调用 `/images/generations`；
支持 PNG、JPEG、WebP 参考图，返回一张 PNG。模型默认 `gpt-image-2`，超时默认三分钟，
上限十分钟。输出文件必须尚不存在；出现并发写入时保留已有文件并返回明确错误。
单张图片上限 64 MiB，HTTP 响应按 base64 膨胀后大小另加有限 JSON 余量限流。
写盘前检查 PNG 的 IHDR、IDAT、IEND 与 chunk CRC；视觉内容和最终渲染质量由领域审查。
完整输入与 receipt 类型由源码导出，目录、模型或账号不形成另一份注册表。

## 配置与凭据

配置继续由 Codex 和既有 Account & Access owner 保管。执行器读取当前 `CODEX_HOME` 的
`config.toml`；未指定该变量时使用当前 `HOME/.codex`。显式指定的 runtime 缺失配置时直接
返回 `image_provider_unavailable`，不会再退回个人 home 或另一个 provider。

配置解析由 Framework 的 `local-codex-defaults` owner 使用 TOML parser 完成。
读取根 `model_provider` 指向的 provider，凭据依次取 `experimental_bearer_token`、`api_key`、
`env_key` 指定的当前进程环境值；不从其他 provider 或登录会话推测 API 凭据。
调用需要该 provider 明确配置的 `base_url` 和可解析 API 凭据。已有 ChatGPT 登录会话仍由
官方 Codex 路线消费，不被转换成 Images API token。

宿主可通过第二个 context 参数指定受选运行环境；普通领域调用只传第一参数。
每次调用重新读取选定配置，配置切换无需同步副本。凭据只进入当前请求的 Authorization
header；不写配置、不注入领域 prompt、不交给子进程，也不安装额外 SDK。
请求禁止重定向，HTTP 仅接受 loopback 本地代理，其余 endpoint 使用 HTTPS。

## 结果与恢复

成功 receipt 只包含 surface、status、产物路径、SHA-256、模型、operation 和空 request id。
provider 的响应文案、endpoint、凭据、revised prompt 和任意响应 header 不进入 receipt。
领域 Agent 读取产物后执行自己的视觉审查和 provenance 管理。

失败使用 `FrameworkContractError` 的固定脱敏文案，details 为以下确定性字段：

| failure_code | outcome | 含义 |
| --- | --- | --- |
| `invalid_image_request` | `not_started` | 输入、参考图或目标路径无效，尚未请求模型 |
| `image_provider_unavailable` | `not_started` | 选定的配置、endpoint 或 API 凭据不可用 |
| `image_provider_rejected` | `rejected` 或 `unknown` | provider 返回错误；服务端 5xx 视为结果未知 |
| `image_generation_unknown` | `unknown` | 超时、断连或重定向阻断，无法确认请求结果 |
| `image_response_invalid` | `unknown` | 已返回响应，但没有可用 PNG |
| `image_output_unavailable` | `unknown` | 已返回图片，但本地写入未确认 |

所有失败 `retry_allowed` 均为 `false`，接口不会自动重试。未知结果可能已产生付费图片；
调用者先核对已有产物与 provider 状态，再决定有依据的新尝试。错误不会返回 provider 原文、
TOML 出错行或底层异常，避免把凭据带入日志。fixture 测试验证 generate/edit、配置切换、
隔离 runtime、错误脱敏和单次 dispatch；真实 provider 兼容性与模型可用性需各部署面验收。
