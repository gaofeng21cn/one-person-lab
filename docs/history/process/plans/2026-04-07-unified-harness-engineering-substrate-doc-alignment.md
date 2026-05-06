# Unified Harness Engineering Substrate Doc Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一四个项目对 `Unified Harness Engineering Substrate`、`OPL Gateway`、`Domain Harness OS` 与部署形态的文档口径。

**Architecture:** 以 `OPL` 为顶层总纲，冻结共享架构语言；三个 domain 仓库分别补齐“我如何落在同一 substrate 上”的 README 与内部映射文档。公开 README 保持人类专家可读，内部文档承接完整技术语义。

**Tech Stack:** Markdown, repository contracts, bilingual public docs, Chinese internal docs

---

### Task 1: 冻结 OPL 总纲

**Files:**
- Create: `docs/unified-harness-engineering-substrate.md`
- Create: `docs/unified-harness-engineering-substrate.zh-CN.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/roadmap.zh-CN.md`
- Modify: `AGENTS.md`

- [ ] 把 `Unified Harness Engineering Substrate` 作为共享总名写入 OPL 公共面
- [ ] 明确 `OPL` 不是第四个 `Domain Harness OS`
- [ ] 明确当前本地默认部署形态与未来托管形态的区别
- [ ] 明确 shared substrate 不等于独立公共代码框架

### Task 2: 对齐 Med Auto Science

**Files:**
- Modify: `/Users/gaofeng/workspace/med-autoscience/README.md`
- Modify: `/Users/gaofeng/workspace/med-autoscience/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/med-autoscience/docs/README.md`
- Modify: `/Users/gaofeng/workspace/med-autoscience/docs/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/med-autoscience/AGENTS.md`
- Create: `/Users/gaofeng/workspace/med-autoscience/docs/domain-harness-os-positioning.md`

- [ ] 把项目写成共享 substrate 上的医学 `Research Ops` `Domain Harness OS`
- [ ] 维持 README 对医学专家友好，不写成 runtime 论文
- [ ] 保留 `MedDeepScientist` 是受控运行面，而不是系统本体的边界

### Task 3: 对齐 RedCube AI

**Files:**
- Modify: `/Users/gaofeng/workspace/redcube-ai/README.md`
- Modify: `/Users/gaofeng/workspace/redcube-ai/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/redcube-ai/docs/README.md`
- Modify: `/Users/gaofeng/workspace/redcube-ai/docs/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/redcube-ai/AGENTS.md`
- Modify: `/Users/gaofeng/workspace/redcube-ai/docs/runtime_architecture.md`
- Modify: `/Users/gaofeng/workspace/redcube-ai/docs/policies/runtime_operating_model.md`
- Create: `/Users/gaofeng/workspace/redcube-ai/docs/domain-harness-os-positioning.md`

- [ ] 把项目写成共享 substrate 上的视觉交付 `Domain Harness OS`
- [ ] 保留 `MCP / CLI / controller` 正式入口
- [ ] 保留 `host_agent` 主线、`external_llm` 兼容层的边界

### Task 4: 对齐 Med Auto Grant

**Files:**
- Modify: `/Users/gaofeng/workspace/med-autogrant/README.md`
- Modify: `/Users/gaofeng/workspace/med-autogrant/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/med-autogrant/docs/README.md`
- Modify: `/Users/gaofeng/workspace/med-autogrant/docs/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/med-autogrant/AGENTS.md`
- Create: `/Users/gaofeng/workspace/med-autogrant/docs/domain-harness-os-positioning.md`

- [ ] 把项目写成共享 substrate 上的医学 `Grant Ops` `Domain Harness OS` 方向
- [ ] 维持当前成熟度表述克制，不把未来 authoring 主线写成已完成
- [ ] 明确开发控制面与产品 runtime 的区别

### Task 5: 最终校验

**Files:**
- Verify all modified files above

- [ ] 检查 README 口径是否一致
- [ ] 检查 bilingual public docs 是否同步
- [ ] 检查内部文档是否把共享 substrate 与 domain-specific contract 分开
- [ ] 运行最小文档相关校验或说明无适用自动化校验
