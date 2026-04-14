# 四仓文档 intake 模板

## 用途

这份模板用于 `One Person Lab`、`Med Auto Science`、`Med Auto Grant`、`RedCube AI` 的跨仓 docs intake。
它只负责记录本轮变更的 intake / 审计 / 吸收与清理状态，不替代各仓核心五件套、公开入口或 machine-readable contract。

## 使用方式

1. 在 intake 开始前，先跑一次 `npm run audit:doc-series`，确认四仓当前 docs surface 是否已经漂移。
2. 把本次变更逐项填入下面模板；若某仓不受影响，明确写 `不涉及`，不要留空。
3. intake 完成后，重新跑一次 `npm run audit:doc-series`，并把结果回填到“验证结果”和“吸收 / 清理状态”。

## 模板

```md
# 四仓文档 intake 记录：<YYYY-MM-DD / topic>

## 1. 基本信息

- intake 日期：
- 负责人：
- 触发来源：
- 本轮目标：

## 2. 影响仓范围

- One Person Lab：
- Med Auto Science：
- Med Auto Grant：
- RedCube AI：

## 3. 公开真相面检查

- 是否触及默认公开入口（`README*` / `docs/README*`）：
- 是否触及核心五件套（`docs/project.md` / `docs/status.md` / `docs/architecture.md` / `docs/invariants.md` / `docs/decisions.md`）：
- 是否触及 docs skeleton / docs index：
- 是否触及 machine-readable contract / current-program pointer：

## 4. 关键 wording / boundary 检查

- 是否触及 formal entry wording：
- 是否触及 runtime owner wording：
- 是否触及 product-entry truth：
- 是否触及 federation / admission wording：
- 是否触及 `Hermes-Agent` 命名边界：

## 5. 中央同步判定

- 是否需要触发 central sync：
- 若需要，中央基线更新到哪里：
- 若不需要，为什么可以保持单仓闭环：

## 6. 验证结果

- intake 前 `npm run audit:doc-series`：
- intake 后 `npm run audit:doc-series`：
- OPL 验证：
- Med Auto Science 验证：
- Med Auto Grant 验证：
- RedCube AI 验证：

## 7. 吸收 / 清理状态

- OPL worktree / branch：
- Med Auto Science worktree / branch：
- Med Auto Grant worktree / branch：
- RedCube AI worktree / branch：
- 是否已吸收到各自 `main`：
- 是否已清理 worktree / 分支 / 临时状态：
- 未清理项与原因：
```
