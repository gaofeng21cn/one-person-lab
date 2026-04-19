# OPL Frontdesk Workbench V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `opl web` 从 dashboard 式页面升级成接近 Codex App / Onyx 的 workspace-first workbench，并把 settings 里的 environment / modules / executor mode 管理一起接通。

**Architecture:** 继续复用现有 `frontdesk` truth surfaces，避免重写后端 contract。浏览器端改成单一 workbench 壳：左侧做 workspace/task 导航，中间承载 conversation/progress narration，右侧收纳 files/progress/settings 抽屉；桌面壳保持 Tauri wrapper，只把 waiting page 和入口语义对齐到同一视觉语言。

**Tech Stack:** TypeScript, Node HTTP server, server-rendered HTML with inline client controller, node:test

---

### Task 1: Lock The New Workbench Contract In Tests

**Files:**
- Modify: `tests/src/cli.test.ts`
- Test: `tests/src/cli.test.ts`

- [ ] 给 `opl web` 页面增加新的结构断言，覆盖左中右工作台、settings/modules、human progress feed 这些核心文案
- [ ] 跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern "web starts a local front-desk pilot and serves dashboard plus ask surfaces"`
- [ ] 确认测试因旧页面结构而失败

### Task 2: Build The Workbench Shell

**Files:**
- Create: `src/frontdesk-workbench.ts`
- Modify: `src/web-frontdesk.ts`
- Test: `tests/src/cli.test.ts`

- [ ] 在新文件里集中生成 workbench bootstrap state、HTML、CSS 和 client controller
- [ ] 让左栏消费 workspace/task/session 信息，中栏消费 progress narration 与 ask surface，右栏提供 progress/files/settings 三种抽屉
- [ ] 让 settings 直接接 `frontdesk_settings`、`frontdesk_environment`、`frontdesk_modules`
- [ ] 复跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern "web starts a local front-desk pilot and serves dashboard plus ask surfaces"`

### Task 3: Align The Desktop Wrapper

**Files:**
- Modify: `src/frontdesk-desktop-package.ts`
- Test: `tests/src/cli.test.ts`

- [ ] 调整桌面 waiting page 文案与视觉 token，让 desktop fallback 和 web workbench 处于同一产品语言
- [ ] 复跑 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/cli.test.ts --test-name-pattern "frontdesk bootstrap prepares the local Onyx-style Desktop shell and removes compatibility bridge payloads"`

### Task 4: Full Verification

**Files:**
- Verify only

- [ ] 跑 `npm test`
- [ ] 跑 `npm run test:meta`
- [ ] 跑 `npm run test:artifact`
- [ ] 跑 `scripts/verify.sh`
- [ ] 跑 `git diff --check`
