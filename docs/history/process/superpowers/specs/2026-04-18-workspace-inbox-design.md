# OPL Workspace Inbox design

## Context

- `opl web` 已经完成第一版 `workspace-first` 首页，当前有 `Current Task`、`Progress Feed` 和 `Files & Deliverables`。
- 用户还缺一层更自然的任务视图：进入某个 workspace 后，想直接知道一共有多少任务、谁正在跑、谁在等待、谁已经形成交付。
- 这层视图必须继续沿用现有 truth surface，尤其是 `workspace_cockpit` 的 `studies` 队列、domain manifest 的 `task_lifecycle`、`session_ledger` 和 `project_progress`，不发明第二套 runtime 状态系统。

## Goal

这次 slice 只做四件事：

1. 在 `project-progress` 里新增一个用户态 `workspace_inbox` 摘要面。
2. 优先用真实 `studies` 队列派生任务卡，补上 workspace 级任务分组。
3. 在 `opl web` 首页主栏新增 `Workspace Inbox`，让用户一眼看懂运行中、等待中和已交付任务。
4. 保持当前 `Progress Feed`、`Files & Deliverables` 和 operator surfaces 的结构不回退。

## Non-goals

- 不引入新的前端框架、组件库或状态管理层。
- 不重写 `opl web` 的整体布局。
- 不改 Hermes runtime、domain repo runtime 或 task 执行协议。
- 不把 task board 做成可交互调度器；当前只做 honest summary，不做控制面。

## Technical route

技术路线是 `contract-first + server-side aggregation + thin frontdoor rendering`：

1. 历史版本曾由 `src/management.ts` 负责聚合；当前实现已退役该顶层 barrel，改为直接维护 `src/management/*` leaf surfaces。
2. 任务 truth 优先级按：
   - `workspace_cockpit.studies`
   - `project_progress.current_study`
   - manifest `task_lifecycle`
   - `recent_sessions`
   - `workspace_files`
3. `workspace_inbox` 在 server 侧统一组装成用户态卡片，前端只做薄渲染。
4. 卡片分组只输出 `running / waiting / ready / delivered` 四类，文案继续使用人话字段，不直接暴露机器字段。

## Design

### 1. `workspace_inbox` surface

新增到 `project_progress` 顶层：

- `summary`
  - `known_task_count`
  - `running_count`
  - `waiting_count`
  - `ready_count`
  - `delivered_count`
  - `active_task_id`
- `sections`
  - `running`
  - `waiting`
  - `ready`
  - `delivered`

每个 section 都是任务卡数组，卡片字段统一为：

- `task_id`
- `title`
- `lane`
- `status_label`
- `summary`
- `latest_update`
- `next_step`
- `inspect_path`
- `deliverable_count`
- `source_surface`

### 2. Study queue first

如果当前 workspace 能读到 `workspace_cockpit.studies`：

- 每个 study 变成一张 inbox 卡。
- `live / recovering` 归到 `running`。
- 明确 blocker、human gate 或 runtime blocked 的 study 归到 `waiting`。
- 有可恢复入口但当前不活跃的 study 归到 `ready`。
- 当前 study 若已经产出 deliverable，则额外补一张 `delivered` 卡，用来把“任务”和“文件”显式串起来。

这样 `MAS` 这类 workspace 可以直接显示真实 study 队列，而不是只显示当前一篇论文。

### 3. Fallback path

如果没有 `studies` 队列：

- 用 manifest `task_lifecycle` 生成主任务卡。
- 用 `recent_session` 生成最近活跃任务卡。
- 用 `workspace_files` 生成交付卡。

这保证 `RedCube`、`MAG` 或普通绑定 workspace 也能有 `Workspace Inbox`，哪怕没有 study queue。

### 4. Homepage layout

主栏结构调整为：

1. `Current Task`
2. `Workspace Inbox`

右栏保持：

1. `Progress Feed`
2. `Files & Deliverables`
3. `Where to inspect`
4. `Hosted shell origin`

`Workspace Inbox` 顶部先显示 summary chips，再按 section 展示卡片。

## Validation

- source tests 覆盖 `workspace_inbox` payload 结构和关键分组
- web tests 覆盖 `Workspace Inbox` 页面文案和 section 呈现
- `npm run build`
- `npm test`
- `./scripts/verify.sh typecheck`

## Risks

- 当前 repo 对“任务”最强的真实面仍然是 `MAS study queue`，其他项目更多依赖 `task_lifecycle` 和 session 信息，所以 `Workspace Inbox` 的丰富度会随项目类型不同。
- 这次 slice 会坚持 honest summary：只展示当前真能读到的任务，不伪造完整 task graph。

## Conclusion

这次不是在首页再堆一块状态面板，而是把 `workspace -> task -> file` 这条用户心智补完整，让 OPL frontdoor 从“只看当前论文和文件”升级成“能看懂整个 workspace 的任务分布和推进状态”。
