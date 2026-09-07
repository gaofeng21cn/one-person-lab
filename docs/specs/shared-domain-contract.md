# Shared Domain Contract

本文定义 Standard Agent 与 Framework 的共享行为边界。具体字段由 domain descriptor、capability map 和 family orchestration schema 持有。

## Domain owner

每个 domain Package 必须明确：

- stable Package 和 Agent identity；
- workspace locator 与 entrypoints；
- Stage/capability descriptor；
- domain truth、artifact body 和 quality owner；
- owner receipt、typed blocker 与 human gate；
- required/optional Package dependencies；
- Framework 可读取的 refs-only progress 和 artifact surfaces。

## Framework consumer

Framework 可以：

- 发现 installed descriptor；
- 校验 identity、entrypoint 和 contract shape；
- 建立 Workspace binding；
- 发起 StageRun/Attempt；
- 投影 progress、artifact refs、blocker 和 owner action；
- 将 owner answer route back 给调用者。

Framework 不可以：

- 未经 domain owner 合同授权修改 domain truth 或 artifact body；
- 生成专业 verdict；
- 把 runtime/provider状态当作 domain readiness；
- 通过固定成员清单决定 domain 是否存在；
- 把 domain 私有 command/template 嵌入通用 registry。

## Capability

capability 通过 stable id、kind、owner、entrypoint 或 source ref、required inputs、outputs 和 authority boundary 描述。相同 capability id 只能有一个 owner；projection 可以有多个 consumer。

新增 capability 应先进入 owner descriptor。只有多个真实 domain 共享且语义稳定时，才上收通用 contract 或独立 Package。

## Progress and artifacts

progress projection 只回答当前 Stage、最新可验证增量、阻塞、下一 owner action 和相关 refs。artifact ref 必须可定位，不能用摘要替代 artifact body。

quality、export、publication 和 submission 状态由 domain owner显式给出；Framework 不从文件存在、测试通过或模型文本推断。

## Dependency

required Package 缺失或入口不可调用时，Framework 返回 typed blocker。optional Package 缺失只影响对应 capability，不阻断无关入口。

dependency 不比较 Framework 自有 SemVer range、ABI lock、payload digest 或 LKG。

## Admission

满足 [Domain Agent admission](./opl-domain-onboarding-contract.md) 的 installed `kind=agent` Package 可被动态发现，不需要修改 Framework 固定 registry。
