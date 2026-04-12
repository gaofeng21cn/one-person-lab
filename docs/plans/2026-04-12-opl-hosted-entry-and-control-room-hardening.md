# OPL Hosted Entry And Control Room Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `OPL Front Desk` 从“本地 pilot + 只读控制台”推进到“hosted-pilot-ready + 可写工作区管理 + OPL-managed session ledger + 顶层到 domain 的可交接入口”。

**Architecture:** 继续沿现有 `opl / opl web / frontdesk-service-*` 主线推进，不另起第二套前台。`OPL` 继续只持有 family-level front desk、workspace binding、session ledger 与 handoff contract；`Hermes` 继续是 external runtime substrate；domain direct entry 仍通过 handoff bundle 与可配置 binding 连接，不在本仓伪造 domain runtime。

**Tech Stack:** TypeScript CLI, Node.js HTTP server, file-backed local state, Hermes CLI integration, node:test

---

### Task 1: Hosted-Pilot Bundle And Base-Path Support

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/frontdesk-service.ts`
- Modify: `src/management.ts`
- Modify: `src/web-frontdesk.ts`
- Test: `tests/src/cli.test.ts`
- Test: `tests/built/cli.test.mjs`

- [ ] 为 hosted-pilot bundle、base-path 路由与 web/service 命令写失败测试
- [ ] 跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts`
- [ ] 在 `src/web-frontdesk.ts` 增加 `basePath` 支持与 hosted-pilot bundle API surface
- [ ] 在 `src/management.ts` 增加 hosted-pilot bundle 机器输出
- [ ] 在 `src/cli.ts` 与 `src/frontdesk-service.ts` 接出对应命令与 service config
- [ ] 复跑源码测试并同步 built CLI 覆盖

### Task 2: Workspace Registry And Project Write Ops

**Files:**
- Create: `src/frontdesk-state.ts`
- Create: `src/workspace-registry.ts`
- Modify: `src/cli.ts`
- Modify: `src/management.ts`
- Modify: `src/web-frontdesk.ts`
- Test: `tests/src/cli.test.ts`
- Test: `tests/built/cli.test.mjs`

- [ ] 为 workspace catalog / bind / activate / archive 的 CLI 与 API 行为写失败测试
- [ ] 跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts`
- [ ] 落地 file-backed workspace registry，并校验只允许绑定当前 OPL 项目面
- [ ] 把 registry 接入 dashboard / projects / web front desk
- [ ] 复跑源码测试并同步 built CLI 覆盖

### Task 3: OPL-Managed Session Ledger

**Files:**
- Create: `src/session-ledger.ts`
- Modify: `src/product-entry.ts`
- Modify: `src/management.ts`
- Modify: `src/web-frontdesk.ts`
- Test: `tests/src/cli.test.ts`
- Test: `tests/built/cli.test.mjs`

- [ ] 为 ask/chat/frontdesk/resume 触发的 session ledger 与 runtime ledger 视图写失败测试
- [ ] 跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts`
- [ ] 把 OPL-managed session event 记入 ledger，并附带 honest resource sample
- [ ] 在 runtime-status / dashboard / web front desk 中暴露 ledger summary
- [ ] 保持口径诚实：这是 OPL-managed attribution，不是假装拿到了 Hermes 全局精确 per-session 账本
- [ ] 复跑源码测试并同步 built CLI 覆盖

### Task 4: Family Handoff Bundle And Domain Direct-Entry Linkage

**Files:**
- Modify: `src/product-entry.ts`
- Modify: `src/cli.ts`
- Modify: `src/management.ts`
- Modify: `src/web-frontdesk.ts`
- Test: `tests/src/cli.test.ts`
- Test: `tests/built/cli.test.mjs`

- [ ] 为 handoff bundle、workspace locator、runtime session contract、return surface contract 写失败测试
- [ ] 跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts`
- [ ] 在 ask preview / ask result 中补齐 machine-readable handoff bundle
- [ ] 新增独立 handoff 命令与 web API，使顶层 front desk 能把请求明确交给 domain direct entry
- [ ] 利用 workspace registry 中的 direct-entry locator 把顶层与 domain 前台联动起来，但不伪造未配置 locator
- [ ] 复跑源码测试并同步 built CLI 覆盖

### Task 5: Docs And Truth Sync

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README.md`
- Modify: `docs/README.zh-CN.md`
- Modify: `docs/status.md`
- Modify: `docs/architecture.md`
- Modify: `docs/decisions.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/roadmap.zh-CN.md`
- Modify: `docs/references/opl-frontdesk-delivery-board.md`
- Modify: `docs/references/opl-product-entry-and-hermes-kernel-integration.md`
- Modify: `docs/references/family-lightweight-direct-entry-rollout-board.md`
- Test: `tests/src/opl-doc-surface-alignment.test.ts`
- Test: `tests/src/opl-public-truth-docs.test.ts`

- [ ] 为新命令、hosted-pilot-ready 口径、workspace/session/handoff 新真相写失败测试
- [ ] 更新公开与参考文档，明确“hosted pilot bundle 已落地”与“actual hosted runtime 仍未落地”的边界
- [ ] 复跑文档对齐测试

### Task 6: Full Verification And Integration

**Files:**
- Verify only

- [ ] 跑 `npm run lint`
- [ ] 跑 `npm run typecheck`
- [ ] 跑 `scripts/verify.sh full`
- [ ] 跑 `git diff --check`
- [ ] 提交、吸收回 `main`、push、清理 worktree
