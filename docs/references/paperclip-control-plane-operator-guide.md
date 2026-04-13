# Paperclip Control Plane Operator Guide

状态锚点：`2026-04-13`

## 定位

`Paperclip` 是 `OPL` 的可选下游外部 control plane。

它的作用是承接 issue / approval / audit UI，让长任务、人工审批和审计记录可以出现在现成的外部界面里。
它不是 `OPL` 的 runtime owner，也不是 `Hermes-Agent` 的替代品。

如果没有安装或配置 `Paperclip`，`OPL` 仍然应该正常运行：

- `opl ask / chat / resume / sessions / logs`
- `opl dashboard`
- `opl session-ledger`
- `opl handoff-envelope`
- `opl web`

这些主入口继续承担自然语言交互、进度可见性、handoff 与审计上下文。
只有 `paperclip-open-task`、`paperclip-open-gate`、`paperclip-sync`、`paperclip-operator-loop` 这类下游 bridge 动作需要 `Paperclip` 配置。

## Bootstrap

先看当前是否配置完整：

```bash
opl paperclip-bootstrap
```

最小配置：

```bash
opl paperclip-config \
  --base-url https://paperclip.example.com \
  --auth-header-env OPL_PAPERCLIP_AUTH_HEADER \
  --control-company-id company-opl-control
```

绑定 admitted OPL project surface 到现有 Paperclip company / project / workspace：

```bash
opl paperclip-bind \
  --project redcube \
  --company-id company-redcube \
  --paperclip-project-id project-redcube \
  --project-workspace-id workspace-redcube \
  --execution-workspace shared_workspace
```

检查状态：

```bash
opl paperclip-status
```

## Task Loop

用于普通长任务：

```bash
opl paperclip-open-task "Prepare a defense-ready slide deck." \
  --preferred-family ppt_deck \
  --workspace-path /Users/gaofeng/workspace/redcube-ai \
  --priority high
```

然后继续在对应 domain surface 内执行。
执行过程中或阶段结束时，把 `OPL` 当前审计状态回写到 Paperclip issue comment：

```bash
opl paperclip-sync --all
```

`paperclip-sync` 会先拉取远端 Paperclip issue / approval 当前状态。
如果 projection 对应的是 human gate，它会先把 approval decision、decision time 与 gate status 回流到本地 tracked projection 和 `family-human-gate` 记录里，然后再决定是否回写新的审计 comment。

如果只同步某个 issue：

```bash
opl paperclip-sync --issue-id issue-1 --path /Users/gaofeng/workspace/redcube-ai
```

`paperclip-sync` 会记录本地 projection fingerprint。
如果 OPL 派生出的 handoff / workspace / manifest / session 状态没有变化，它会跳过重复 comment。
需要强制重写时使用：

```bash
opl paperclip-sync --issue-id issue-1 --force
```

## Automatic Sync Loop

如果希望把“审批回流 + 审计 comment sync”持续跑起来，可以直接开本地 operator loop：

```bash
opl paperclip-operator-loop --all --interval-ms 30000
```

调试或 CI 中也可以限制轮数：

```bash
opl paperclip-operator-loop --issue-id issue-1 --interval-ms 1000 --cycles 2
```

这个 loop 不要求你独立运维 Paperclip。
它只是 OPL 本地的轮询 reconcile 进程，会把最近一次运行摘要写进 `paperclip-status.operator_loop`，供 CLI 和 web status surface 观察。

## Human Gate Loop

用于需要人工审批、审核或发布判断的节点：

```bash
opl paperclip-open-gate "Review publish readiness for the defense deck." \
  --preferred-family ppt_deck \
  --workspace-path /Users/gaofeng/workspace/redcube-ai \
  --gate-kind publish_readiness
```

这会把 `family-human-gate` 语义投射到 Paperclip control company 的 issue / approval。
后续仍用 `opl paperclip-sync` 或 `opl paperclip-operator-loop` 把 OPL 的 handoff bundle、workspace 状态、domain manifest 摘要与相关 session aggregate 回写到 issue comment。
一旦审批在 Paperclip 里被 approve / request_changes / reject，对应 decision 也会先回流到 OPL 侧 tracked gate state，再进入新的审计快照。

## Web Surface

`opl web` 也暴露同一组 optional Paperclip bridge endpoint：

- `GET /api/paperclip/control-plane`
- `GET /api/paperclip/control-plane/bootstrap`
- `POST /api/paperclip/control-plane/sync`

这些 endpoint 只是本地 front desk 的 downstream bridge surface。
其中 `GET /api/paperclip/control-plane` 返回的 status payload 会带上 tracked projection 的远端 issue / approval 状态，以及最近一次 operator loop 运行摘要。
它们不改变 `OPL`、`Hermes-Agent` 或各 domain 仓的 runtime ownership。

## 不做的事

- 不要求用户安装或运维 `Paperclip` 才能使用 `OPL`。
- 不把 `Paperclip` 并入 `OPL` 主前台。
- 不让三个 domain 仓直接依赖 `Paperclip`。
- 不把 Paperclip issue / approval 状态写成 domain canonical truth。
- 不把 `Paperclip` 写成 runtime owner、gateway truth owner 或 `Hermes-Agent` 替代品。
