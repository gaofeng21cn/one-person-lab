# OPL Front Desk And Family Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `opl` 升级成默认自然语言前台，同时补齐会话/运维入口、family entry 对齐文档与 MAS 顶层 cutover board。

**Architecture:** 在不动 `Phase 1` read-only gateway contract 的前提下，给 `OPL` 增加一个更完整的本地 front-desk surface。入口层继续复用 Hermes 作为 session/logs/gateway/profile substrate，`OPL` 只负责 family routing、handoff 和产品壳语义。

**Tech Stack:** TypeScript CLI, Node.js child_process, Hermes CLI integration, repo-tracked markdown docs, node:test

---

### Task 1: Front Desk Default Entry

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/product-entry.ts`
- Test: `tests/src/cli.test.ts`
- Test: `tests/built/cli.test.mjs`

- [ ] 为 `opl` 裸命令与 `opl <自然语言请求>` 写失败测试
- [ ] 运行 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts`
- [ ] 在 `src/cli.ts` 中把“未知命令但看起来是自然语言请求”的路径收敛到 front-desk ask
- [ ] 在 `src/product-entry.ts` 中新增默认 front-desk seed / interactive 入口逻辑
- [ ] 再跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts`
- [ ] 补 built CLI 覆盖并跑 `npm run build && NODE_NO_WARNINGS=1 node --test tests/built/**/*.test.mjs`

### Task 2: Session / Logs / Repair Entry

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/hermes.ts`
- Modify: `src/product-entry.ts`
- Test: `tests/src/cli.test.ts`
- Test: `tests/built/cli.test.mjs`

- [ ] 为 `resume / sessions / logs / repair-hermes-gateway` 写失败测试
- [ ] 跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts`
- [ ] 在 `src/hermes.ts` 里补 Hermes CLI 复用封装
- [ ] 在 `src/cli.ts` 里接出新的产品层命令面
- [ ] 让输出保持 machine-readable，不把 Hermes 原始表格直接裸透出为唯一结果
- [ ] 复跑源码测试与 built CLI 测试

### Task 3: Family Entry Contract And Docs

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README.md`
- Modify: `docs/README.zh-CN.md`
- Modify: `docs/architecture.md`
- Modify: `docs/status.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/roadmap.zh-CN.md`
- Modify: `docs/references/family-product-entry-and-domain-handoff-architecture.md`
- Modify: `assets/branding/opl-architecture-blueprint.svg`
- Test: `tests/src/opl-public-truth-docs.test.ts`
- Test: `tests/src/opl-doc-surface-alignment.test.ts`

- [ ] 写失败测试，锁定新的 front-desk、family entry、domain handoff 口径
- [ ] 跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/opl-public-truth-docs.test.ts tests/src/opl-doc-surface-alignment.test.ts`
- [ ] 更新公开文档和 SVG，使其与新入口行为一致
- [ ] 复跑上述测试

### Task 4: MAS Top-Level Cutover Board

**Files:**
- Create: `docs/references/mas-top-level-cutover-board.md`
- Modify: `docs/status.md`
- Modify: `docs/references/family-product-entry-and-domain-handoff-architecture.md`
- Test: `tests/src/opl-public-truth-docs.test.ts`

- [ ] 新增 MAS 顶层 cutover board 文档，明确 OPL 与 MAS 的协作边界
- [ ] 在核心状态文档和 family entry 文档中挂接这个 board
- [ ] 跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/opl-public-truth-docs.test.ts`

### Task 5: Full Verification And Integration

**Files:**
- Verify only

- [ ] 跑 `npm run lint`
- [ ] 跑 `npm run typecheck`
- [ ] 跑 `scripts/verify.sh full`
- [ ] 跑真实烟测：`node dist/cli.js doctor`
- [ ] 跑真实烟测：`node dist/cli.js ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --dry-run`
- [ ] 跑真实烟测：`node dist/cli.js` 与 `node dist/cli.js "Plan a medical grant proposal revision loop." --dry-run`（若实现为默认自然语言入口）
- [ ] `git diff --check`
- [ ] 提交、吸收回 `main`、push、清理 worktree
