# 2026-04-16 跨仓 CLI / MCP Surface Convergence 计划

## 背景

当前 `OPL / MedAutoScience / MedAutoGrant / RedCube AI` 四仓都存在不同程度的命令面膨胀问题：

- CLI 一级命令过多，用户很难靠命令名推断真正入口。
- MCP tool 面虽然比 CLI 小，但仍然混入了大量 operator-oriented 或过细粒度的动作。
- 前台自然语言壳容易被迫暴露后台术语，导致“能调用工具但不会像人一样工作”。
- `OPL` 的执行入口虽然语义上走 OPL，但实现上存在 `/api/ask -> task store -> Hermes` 的旁路，看起来不像统一的 `opl ask` 主路径。

本轮不做兼容层，不保留旧平铺命令别名，直接收敛为新的分层入口。

## 目标

1. 把四仓 CLI 从“平铺命令表”收敛为“少数一级入口 + 二级命令分组”。
2. 把 OPL / MAS / RCA 的 MCP tool 收敛成任务导向工具，而不是状态字段导向工具。
3. 明确前台执行入口统一经由各仓自己的 product-entry / ask 主路径，不再让实现细节看起来像直接操纵底层 runtime。
4. 删除旧命令，不做历史兼容。
5. 同步更新测试、帮助信息、文档入口，避免出现“代码改了但帮助面和前台 wiring 还是旧的”。

## 非目标

- 本轮不改 `MedDeepScientist`。
- 不借这次重构扩大到 runtime 语义、controller truth 或 domain scientific policy 重写。
- 不把 OPL 升格成 runtime owner；只整理入口面与工具面。

## 统一收敛原则

### CLI

- 保留少数顶层产品入口。
- 需要表达“对象 + 动作”的命令，改成二级命令。
- `help` 输出按分组展示，不再把几十条平级命令一股脑列给用户。
- 所有旧平铺命令直接删除。

### MCP

- 默认只暴露用户任务向工具。
- 把“读一点状态 / 再读一点状态 / 再恢复一下”合并成更大的任务型工具。
- operator / raw 控制面继续留在 CLI / API / repo 内部，不默认进前台 MCP 上下文。

### 前台执行

- 前台执行入口必须被描述为“经由产品入口”。
- OPL 前台执行面统一对齐 `opl ask` 语义，不再让实现看起来像前台直接绕过 OPL 去调 Hermes。

## 分仓方案

## OPL

### CLI 目标形态

保留顶层：

- `opl`
- `opl ask`
- `opl chat`
- `opl doctor`
- `opl web`
- `opl mcp-stdio`

其余改成分组：

- `opl status ...`
- `opl workspace ...`
- `opl frontdesk ...`
- `opl paperclip ...`
- `opl contract ...`
- `opl domain ...`
- `opl session ...`

### MCP 目标形态

收敛到约 5 个工具：

- `opl_project_progress`
- `opl_execute_request`
- `opl_task_status`
- `opl_workspace`
- `opl_session`

### 关键改动面

- `src/cli.ts`
- `src/frontdesk-mcp-stdio.ts`
- `src/frontdesk-librechat-identity.ts`
- `src/frontdesk-task-store.ts`
- `src/web-frontdesk.ts`
- `tests/src/cli.test.ts`

## MedAutoScience

### CLI 目标形态

按主题分组到少数二级入口，例如：

- `medautosci doctor ...`
- `medautosci workspace ...`
- `medautosci data ...`
- `medautosci runtime ...`
- `medautosci study ...`
- `medautosci publication ...`
- `medautosci product ...`

### MCP 目标形态

收敛为任务导向工具，避免大面积暴露 controller 级碎片状态。优先保留：

- workspace/data readiness
- runtime/study progress
- publication/product entry
- doctor / upgrade audit

### 关键改动面

- `src/med_autoscience/cli.py`
- `src/med_autoscience/mcp_server.py`
- 相关 CLI/MCP tests

## MedAutoGrant

### CLI 目标形态

从平铺命令收敛为：

- `medautogrant workspace ...`
- `medautogrant mainline ...`
- `medautogrant product ...`
- `medautogrant runtime ...`
- `medautogrant pass ...`
- `medautogrant package ...`

### 关键改动面

- `src/med_autogrant/cli.py`
- 相关 CLI tests / 文档入口

## RedCube AI

### CLI 目标形态

继续沿已有二级结构整理，但收掉残留不统一面，优先稳定为：

- `redcube workspace ...`
- `redcube source ...`
- `redcube deliverable ...`
- `redcube review ...`
- `redcube product ...`
- `redcube run ...`

### MCP 目标形态

按任务聚类，减少“一个 gateway action 一个 tool”的暴露方式，优先收敛到：

- workspace/topic discovery
- source orchestration
- product entry
- deliverable execution
- review/publication/progress

### 关键改动面

- `apps/redcube-cli/src/cli.js`
- `apps/redcube-mcp/src/server.js`
- 相关测试

## 实施顺序

1. 先改 OPL，作为命名与前台收口锚点。
2. 再改 MAS，使医学域的命令面与 MCP 面对齐同一思路。
3. 再改 MAG，主要完成 CLI 分组收敛。
4. 最后改 RCA，把现有二级结构进一步统一到同一风格，并收紧 MCP tool 面。
5. 逐仓跑最小充分验证。
6. 逐仓提交、吸收到 `main`、push、清理 worktree。

## 验证

### OPL

- `npm run build`
- `npm run test:fast`

### MedAutoScience

- `scripts/verify.sh`

### MedAutoGrant

- `scripts/verify.sh`

### RedCube AI

- `scripts/verify.sh`

## 风险

- 帮助信息和测试大面积依赖旧命令名，若改动不彻底会出现半新半旧状态。
- MCP wiring、前台提示词、LibreChat identity 若未同步，会继续把旧工具名暴露给前台。
- OPL 的 `/api/ask` 异步任务面若仍保留旁路语义，前台执行体验仍会割裂。

## 完成标准

- 四仓旧平铺命令已删除。
- 新 CLI 分组可以覆盖现有能力，无“只能回退到旧命令”的场景。
- OPL / MAS / RCA 的 MCP tool 面明显缩小且更任务导向。
- 帮助信息、测试、前台 wiring、文档入口全部对齐新命名。
- 每个仓都完成验证、提交、吸收回 `main`、push，并清理 worktree。
