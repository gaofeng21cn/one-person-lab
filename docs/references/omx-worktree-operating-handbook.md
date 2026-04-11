# 四仓统一 OMX Worktree 使用规程

> 历史说明（2026-04-11 OMX offboarding）：本文件仅保留为迁移/审计参考，不再作为当前活跃执行入口。

## 文档目的

这份手册把四仓当前共同适用的 `OMX` 使用纪律冻结成一套可以直接执行的操作规程。

它解决的不是：

- 把 `oh-my-codex` 上游实现改成严格 session 级 hook
- 让同一个工作目录天然完全无污染

它解决的是：

- 怎样在当前实现条件下，把 hook 干扰、历史 session 残留、tmux 残留与 `.omx/state/` 污染降到可控
- 怎样把四仓的 `Codex Host -> OMX -> absorb -> cleanup` 流程统一到同一套工程纪律

## 一、统一结论

当前四仓统一执行下面这条硬规则：

> 所有重型 `OMX` 任务，都必须在独立 owner `worktree` 中执行；根工作树默认只承担规划、吸收进 `main`、push 与清理。

这里的“重型 `OMX` 任务”至少包括：

- `ralph`
- `team`
- `autopilot`
- 其他会长期占用 tmux、持续写回 `.omx/state/**`、或会在多个回合中反复触发 hook 的长跑子线

轻操作可以继续留在根工作树：

- 读代码
- 看文档
- Codex App 里梳理思路
- 冻结阶段边界
- review
- absorb to `main`
- push
- cleanup

## 二、为什么必须这样做

当前实际污染源不是单一 session，而是三层叠加：

1. 宿主级 SessionStart hook
2. 仓级 `.codex/AGENTS.md`
3. 工作目录内的 `.omx/state/**`、tmux session、team mailbox、`skill-active` 残留

因此：

- “换一个对话”不等于隔离
- “session 结束了”不等于状态已经释放
- 真正可靠的隔离手段仍然是物理 `worktree`

## 三、统一角色划分

### `Codex Host`

负责：

- 在 Codex App 中梳理理想形态
- 冻结当前 active mainline
- 冻结 phase / tranche / stop 条件
- 冻结验证标准
- 判断是否 absorb / abandon / continue

### `OMX`

负责：

- 在 owner `worktree` 内长时间连续执行
- 验证
- reports 回写
- 结构化停车

### 根工作树

只负责：

- 轻读
- planning freeze
- absorb to `main`
- push
- 清理 branch / worktree / tmux / session 残留

根工作树不负责：

- 长期 `ralph/team/autopilot` owner 执行

## 四、统一启动条件

启动一条新的重型 `OMX` 子线前，必须同时满足：

1. 根工作树 `main` 是当前集成基线
2. 当前没有未决的 active owner `worktree`
3. 当前线的 truth source、最高自动推进上限、stop 条件已经由 `Codex Host` 冻结
4. 已明确这条线的 owner `worktree` 路径、branch 名称、验证命令、report 路径

如果这四条有任一不满足，不要直接开跑。

## 五、统一启动流程

### Step 1. 在根工作树完成 planning freeze

先在 `Codex App` 或同等级 `Codex Host` 会话中明确：

- 当前理想长线目标
- 本轮 active mainline
- 本轮最高自动推进上限
- 当前验证命令
- 当前必须同步回写的 durable surfaces
- 必须停止回报的条件

### Step 2. 从最新 `main` 新建 fresh owner worktree

统一建议：

```bash
git worktree add .worktrees/codex/<lane>-<timestamp> -b codex/<lane>-<timestamp> main
```

要求：

- 从当前最新 `main` 起建
- 不复用漂移很久的历史 worktree
- 一条长跑子线一个 owner `worktree`

### Step 3. 进入 owner worktree 做 baseline check

至少检查：

```bash
git status --short --branch
find .omx/state/sessions -maxdepth 2 2>/dev/null
tmux ls 2>/dev/null
```

若一打开就带着：

- 旧 `.omx/state/session.json`
- 旧 `.omx/state/sessions/*`
- 旧 `skill-active-state.json`
- 旧 tmux session

先清掉，再启动新线。

### Step 4. 只在 owner worktree 内启动重型 OMX

从这一步开始：

- `ralph/team/autopilot` 只能在这个 owner `worktree` 里启动
- 根工作树不再承担这条线的 owner 角色
- 不允许在同一个工作目录里再开第二条重型 `OMX` 主线

## 六、统一运行纪律

运行中必须满足：

1. 一条 owner `worktree` 只对应一条 active heavy `OMX` mainline
2. 任何新增第二条重型线，都必须新开第二个 owner `worktree`
3. `.omx/context/CURRENT_PROGRAM.md`、reports、plans 必须持续回写
4. 阶段停车必须给出结构化结论，例如：
   - `ready for review`
   - `ready to commit`
   - `ready for manual test`
   - `absorbed to main`
   - `blocked`
5. 不允许把“当前实现看起来还能继续做”当成越过冻结边界的理由

## 七、统一收尾流程

每条 owner 线停车后，都必须经过下面固定收尾链路：

> 验证 -> absorb or abandon -> 清理 session/tmux/state -> 删除 worktree/branch

### Step 1. 先确认停车结论

至少明确：

- 当前到达哪个 checkpoint / tranche
- 是否 `ready for review` / `ready to commit` / `absorbed to main`
- blocker 是否真实存在
- 当前验证结果

### Step 2. absorb 或 abandon

如果这条线产出了合法提交：

- 先决定是否 absorb 回 `main`
- absorb 完再决定是否 push

如果这条线不应保留：

- 明确 abandon
- 不要把未吸收的历史 worktree 留作“以后也许继续”

### Step 3. 清理 runtime 残留

至少清理：

- 对应 tmux session
- `.omx/state/sessions/*`
- `.omx/state/team/*`
- `session.json`
- `skill-active-state.json`
- 其他与该线直接相关的本地状态残留

目标不是“清空一切本地配置”，而是让旧线不再继续被 hook 扫到。

### Step 4. 删除 owner worktree / branch

收尾完成后应删除：

- owner `worktree`
- 该线 branch
- 该线留下的空壳 integration / worker worktree

不要长期保留空壳 worktree。

## 八、四仓统一检查清单

下一条 `OMX` 长线开始前，四仓统一检查下面五项：

1. 根工作树 `git status --short --branch` clean
2. `git worktree list` 中没有遗留的已关闭 owner `worktree`
3. `tmux ls` 里没有该仓已关闭但仍活着的 `omx-*` session
4. `.omx/state/sessions/` 里没有旧线残留
5. 本轮 truth freeze、stop 条件、验证命令已经写清

只要这五项没过，就不应直接开下一条重型 `OMX` 线。

## 九、四仓统一非目标

当前不要假设下面这些已经成立：

- hook 已经严格做到 session 级
- 同一工作目录里并行多个重型对话也能天然无污染
- 历史 session 目录可以长期堆着不管
- 根工作树可以长期既做集成面、又做长跑 owner 面

## 十、对四仓的直接要求

### `one-person-lab`

- 默认也是同一条规则
- 即使它更偏 docs / contract-first，只要进入重型 `OMX` 长跑，也必须开独立 owner `worktree`

### `med-autoscience`

- 继续沿用现有最严格做法
- display、runtime、intake 等长期线都必须各自独立 owner `worktree`
- 现有更细 runbook 仍可保留，但不得弱于本手册

### `redcube-ai`

- 后续 runtime hardening、family/pack、manual-test-driven 长跑线，统一按 owner `worktree` 执行

### `med-autogrant`

- 后续 `R1 -> R5` runtime-first 长跑线，统一按 owner `worktree` 执行
- `CURRENT_PROGRAM + reports + activation package` 继续作为长跑 truth handoff，但不替代 worktree 隔离

## 十一、统一一句话版本

后面四仓统一按这句话执行即可：

> 先在 `Codex App` 冻结理想目标、当前阶段和 stop 条件；再从最新 `main` 开一个独立 owner `worktree` 交给 `OMX` 长跑；停车后先验证，再 absorb 或 abandon，最后清理 tmux / session / state 并删除 worktree / branch。
