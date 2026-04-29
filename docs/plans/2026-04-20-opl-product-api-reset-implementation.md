# OPL Product API Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `OPL` 从历史 `frontdoor` 公开语义重置为新的 `Product API` 模型，并先完成主仓文档收束，再推进主线接口与实现重组。

**Architecture:** 公开产品模型统一收敛为 `system / engines / modules / agents / workspaces / sessions / progress / artifacts`。`frontdoor`、`readiness`、`domain-wiring` 等历史概念退出当前主线，只保留为内部实现遗留或历史归档。各 domain 仓继续保持独立 agent entry，`OPL` 只持有 family-level shared runtime 与 API truth。

**Tech Stack:** TypeScript CLI, JSON contracts, Markdown docs, repo-tracked API surfaces

---

### Task 1: 收束 OPL 主仓当前文档真相

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README.md`
- Modify: `docs/README.zh-CN.md`
- Modify: `docs/project.md`
- Modify: `docs/status.md`
- Modify: `docs/architecture.md`
- Modify: `docs/decisions.md`
- Modify: `docs/invariants.md`
- Modify: `docs/specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md`

- [ ] 让 `README*` 只面向潜在使用者，统一讲清 `OPL` 的产品定位、使用方式、产品家族与交付逻辑。
- [ ] 让核心五件套统一使用新的 `Product API` 叙事，明确 `OPL` 负责 shared runtime 与 API，domain 仓负责 agent entry 与领域逻辑。
- [ ] 在 `docs/decisions.md` 与 `docs/status.md` 里冻结“`frontdoor` 公开语义退役”的当前决策。
- [ ] 把旧 `frontdoor / handoff / readiness` 相关表述从当前主线文档中删干净。
- [ ] 验证：`rg -n "frontdoor|readiness|entry-guide|domain-wiring|hosted-bundle|hosted-package" README* docs/{README*,project.md,status.md,architecture.md,decisions.md,invariants.md}`

### Task 2: 清理 OPL 主仓历史文档入口，避免继续污染主线

**Files:**
- Modify: `docs/history/README.md`
- Modify: `docs/history/frontdoor-legacy/README.md`
- Modify: `docs/references/README.md`
- Modify: `docs/specs/2026-04-12-opl-frontdoor-and-family-entry-design.md`
- Modify: `docs/history/frontdoor-legacy/2026-04-19-opl-initialize-and-environment-manager-design.md`
- Modify: `docs/plans/2026-04-12-opl-frontdoor-and-family-entry-implementation.md`

- [ ] 给仍然保留的历史 `frontdoor` 设计和计划文档加上“已退役 / superseded”标识。
- [ ] 更新历史索引和参考索引，明确这些文档只作历史审计，不再作为当前实现依据。
- [ ] 保证当前读者从 `README*` 和 `docs/README*` 进入时，不会再被引导到旧主线。
- [ ] 验证：人工检查 `README* -> docs/README* -> core working set` 的链接链路。

### Task 3: 对齐其他三个仓的用户面文档口径

**Files:**
- Modify: `/Users/gaofeng/workspace/med-autoscience/README.md`
- Modify: `/Users/gaofeng/workspace/med-autoscience/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/med-autogrant/README.md`
- Modify: `/Users/gaofeng/workspace/med-autogrant/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/redcube-ai/README.md`
- Modify: `/Users/gaofeng/workspace/redcube-ai/README.zh-CN.md`
- Modify: 这三个仓里与当前入口定位直接相关的核心 docs 索引文件

- [ ] 统一口径：这些仓是独立 domain agents / current implementation，不是 `OPL` 的 GUI 子模块。
- [ ] 统一写法：README 面向潜在使用者，突出“解决什么问题、适合什么场景、怎么开始”，不暴露底层 `frontdoor / handoff` 历史术语。
- [ ] 明确它们与 `OPL` 的关系：可被 `OPL` 调用，也可被 `Codex` 直接调用，行为语义一致。
- [ ] 验证：逐仓 `rg -n "frontdoor|handoff|readiness|entry-guide|domain-wiring"` 仅允许出现在历史/参考区。

### Task 4: 重组 OPL 主线 API 命名和路径

**Files:**
- Create: `src/opl-api-paths.ts`
- Modify: `src/cli.ts`
- Modify: `src/web-frontdoor.ts`
- Modify: `src/frontdoor-paths.ts`
- Modify: `src/frontdoor-installation.ts`
- Historical target: `src/management.ts`（已退役；当前实现使用 `src/management/*` leaf surfaces）
- Modify: `src/frontdoor-mcp-stdio.ts`
- Modify: `tests/src/cli.test.ts`

- [ ] 先定义新的公开路径模型：
  - `/api/opl/system`
  - `/api/opl/engines`
  - `/api/opl/modules`
  - `/api/opl/agents`
  - `/api/opl/workspaces`
  - `/api/opl/sessions`
  - `/api/opl/sessions/{id}/progress`
  - `/api/opl/sessions/{id}/artifacts`
- [ ] 保留旧实现文件时，只允许作为过渡内部实现，不再把 `frontdoor` 作为当前公开产品命名。
- [ ] 把当前 `/ask`、`/task-status`、`/project-progress` 的公开概念逐步收口到 `sessions / progress / artifacts`。
- [ ] 在 CLI 帮助和 API root payload 里改写公开资源名。
- [ ] 验证：`tests/src/cli.test.ts` 和相关契约测试更新后通过。

### Task 5: 按新的对象模型拆实现边界

**Files:**
- Create or Modify:
  - `src/opl-system.ts`
  - `src/opl-engines.ts`
  - `src/opl-modules.ts`
  - `src/opl-agents.ts`
  - `src/opl-workspaces.ts`
  - `src/opl-sessions.ts`
  - `src/opl-progress.ts`
  - `src/opl-artifacts.ts`
- Modify:
  - `src/product-entry.ts`
  - `src/workspace-registry.ts`
  - `src/session-ledger.ts`
  - `src/status-narration.ts`

- [x] 把历史 `frontdoor-installation.ts` 与 `management.ts` 聚合入口中混杂的公开职责拆开；当前实现使用 `system-installation/*` 与 `management/*` leaf surfaces。
- [ ] 明确 `OPL` 内部真正保留的 shared runtime 组成：
  - engine adapter
  - agent registry
  - workspace registry
  - session store
  - progress narrator
  - artifact discovery
- [ ] 保持 domain logic 不回流到 `OPL`。
- [ ] 验证：核心类型在 TypeScript 层收束，不再用 `frontdoor_*` 作为主线 public type。

### Task 6: 验证与收口

**Files:**
- Modify as needed based on failures

- [ ] Run: `npm test`
- [ ] Run: `npm run test:meta`
- [ ] Run: `npm run typecheck`
- [ ] 对其他三个仓至少做 README / 核心 docs 的 `rg` 验证
- [ ] 汇总：
  - 当前公开 API 还残留哪些旧路径
  - 哪些历史 surface 已经正式退役
  - 哪些功能清理进入下一 tranche
