# OPL Domain Agent Admission Contract

本文定义一个 `kind=agent` Package 进入 OPL 发现、启动和 Stage runtime 的准入条件。它不维护候选 Agent 清单。

## Admission source

Framework 从已配置的原生 carrier 读回 Package owner 的 installed descriptor，以此确定成员资格。

本地开发时，将 owner 的 `opl-package.json`、domain descriptor 和 capability map 随插件放入本地 Codex marketplace，并在 Package manifest 中声明实际的原生插件入口。使用 Framework 所选的同一 Codex CLI 和 `CODEX_HOME` 注册并安装插件。

```sh
codex plugin marketplace add /path/to/local-marketplace --json
codex plugin add my-agent@local-marketplace --json
opl pack sync codex --json
opl pack inspect my-agent --json
```

用 `opl pack inspect` 核对 installed、enabled 和 carrier 状态，再从 App 状态（`app.state.get`）核对 Agent 目录中的 `package_id`。公开软件源的 Package projection 用于分发，本地安装通过原生载体读回进入动态发现。

## Required descriptor

Agent Package 必须提供：

- stable `package_id`、`agent_id`、`kind=agent` 和 owner；
- 可读取的 Package descriptor 与 capability map；
- 至少一个 callable public entrypoint；
- workspace requirement 和 locator；
- Stage/capability contracts；
- domain truth、artifact、quality、receipt、blocker 和 human-gate authority boundary；
- required/optional Package identities；
- verification entry。

字段以当前 schema 为准。

## Admission flow

```text
native carrier installed descriptor
  -> identity and schema validation
  -> entrypoint callability
  -> required dependency presence
  -> Workspace binding
  -> Stage/Attempt contract availability
  -> dynamic App/CLI projection
```

任一步失败都返回精确 typed blocker 或 repair action，不创建临时成员记录。

## Runtime boundary

Agent 可以 standalone 运行，也可以由 Framework Host 调用。托管运行时：

- Framework 传递 Workspace、scope、Stage 和 runtime envelope；
- executor/provider 执行 Attempt；
- Agent/domain owner 写专业产物和结论；
- Framework 只读回 progress、artifact refs 和 owner answer。

托管调用不改变 Agent 的 owner、Package identity 或 standalone contract。

## Dependency

required dependency 必须 installed 且所需 entrypoint callable。optional dependency 缺失只关闭相应增强能力。

Framework 不求解跨包版本，不生成 installed lock，不把依赖 payload 复制到自身状态。

## Generated and hosted surfaces

CLI、MCP、Skill、App view 或 Host contribution 都是 descriptor/capability 的 consumer projection。它们不能成为第二 owner，也不能要求 Agent 为每个 consumer 复制一套业务实现。

## Security and authority

- credential 由对应 provider/carrier owner 管理；
- 不可信执行使用已有 sandbox 或独立进程；
- irreversible action、publication 和 human decision 必须显式授权；
- provider completion 不生成 domain receipt；
- Framework 不读取或写入 domain 私有 memory/artifact body，除非 owner contract明确授权具体 surface。

## Verification

准入至少验证：

1. owner descriptor/schema；
2. native carrier installed/enabled readback；
3. public entrypoint callable；
4. required dependency presence；
5. Stage/Attempt envelope；
6. owner receipt或typed blocker回路；
7. standalone 与 hosted authority 一致。

验证通过只说明该 Package 可被 OPL 使用，不等于专业结果或 production acceptance。
