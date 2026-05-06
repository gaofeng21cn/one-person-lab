# Bilingual Homepage And Core Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `one-person-lab` 改造成英文默认首页，并补齐中文镜像首页和四份核心公开文档的双语镜像，同时保持首页与文档跳转的语言一致性。

**Architecture:** 保持现有 banner、HTML 总览和公开入口结构不变，只重构语言层。`README.md` 作为英文默认公开面，`README.zh-CN.md` 作为中文镜像；`docs/operating-model.md`、`docs/task-map.md`、`docs/shared-foundation.md`、`docs/roadmap.md` 改为英文默认文档，对应新增 `.zh-CN.md` 中文镜像。所有英文页面只链接英文文档，所有中文页面只链接中文文档。

**Tech Stack:** Markdown, Git

---

## File Responsibilities

- `/Users/gaofeng/workspace/one-person-lab/README.md`
  英文默认首页。
- `/Users/gaofeng/workspace/one-person-lab/README.zh-CN.md`
  中文镜像首页。
- `/Users/gaofeng/workspace/one-person-lab/docs/operating-model.md`
  英文默认 operating model。
- `/Users/gaofeng/workspace/one-person-lab/docs/operating-model.zh-CN.md`
  中文镜像 operating model。
- `/Users/gaofeng/workspace/one-person-lab/docs/task-map.md`
  英文默认 task map。
- `/Users/gaofeng/workspace/one-person-lab/docs/task-map.zh-CN.md`
  中文镜像 task map。
- `/Users/gaofeng/workspace/one-person-lab/docs/shared-foundation.md`
  英文默认 shared foundation。
- `/Users/gaofeng/workspace/one-person-lab/docs/shared-foundation.zh-CN.md`
  中文镜像 shared foundation。
- `/Users/gaofeng/workspace/one-person-lab/docs/roadmap.md`
  英文默认 roadmap。
- `/Users/gaofeng/workspace/one-person-lab/docs/roadmap.zh-CN.md`
  中文镜像 roadmap。

### Task 1: 改写首页为英文默认入口，并新增中文镜像首页

**Files:**
- Modify: `/Users/gaofeng/workspace/one-person-lab/README.md`
- Create: `/Users/gaofeng/workspace/one-person-lab/README.zh-CN.md`

- [ ] **Step 1: 在英文首页加入语言切换区**

英文首页必须加入：

```md
<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>
```

- [ ] **Step 2: 把现有首页说明改写成英文默认版**

英文首页必须保留这些 section：

```md
## Repository Position
## Why a Top-Level Blueprint
## Workstreams
## Shared Foundation
## Project Matrix
## Current Mature Project: MedAutoScience
## Scope Boundary
## Roadmap
```

并明确写出：

```md
The current reference implementation grows out of a medical research lab, but OPL is not intended to be medical-only. PIs in other disciplines are encouraged to build their own domain-specific OPL.
```

- [ ] **Step 3: 新增中文镜像首页**

中文首页必须加入：

```md
<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>
```

并保证所有 docs 链接都指向 `.zh-CN.md` 版本。

### Task 2: 把四份核心 docs 改为英文默认版

**Files:**
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/operating-model.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/task-map.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/shared-foundation.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/roadmap.md`

- [ ] **Step 1: operating-model 改为英文默认版**

结构保持：

```md
# OPL Operating Model
## Core Judgment
## Role Split
## Operating Principles
## Why This Is Not A Prompt Collection
```

- [ ] **Step 2: task-map 改为英文默认版**

结构保持：

```md
# OPL Task Map
## Overview
## Research Ops
## Grant Ops
## Thesis Ops
## Review Ops
## Presentation Ops
## How These Workstreams Reuse One Another
```

- [ ] **Step 3: shared-foundation 改为英文默认版**

结构保持：

```md
# Shared Foundation
## Asset Layer
## Memory Layer
## Governance Layer
## Delivery Layer
## Agent Execution Layer
## What Is Already Clear Today
```

- [ ] **Step 4: roadmap 改为英文默认版**

结构保持：

```md
# OPL Roadmap
## Current Phase
## Next Phase
## Later Phase
## Current Evaluation Criteria
```

### Task 3: 为四份核心 docs 新增中文镜像

**Files:**
- Create: `/Users/gaofeng/workspace/one-person-lab/docs/operating-model.zh-CN.md`
- Create: `/Users/gaofeng/workspace/one-person-lab/docs/task-map.zh-CN.md`
- Create: `/Users/gaofeng/workspace/one-person-lab/docs/shared-foundation.zh-CN.md`
- Create: `/Users/gaofeng/workspace/one-person-lab/docs/roadmap.zh-CN.md`

- [ ] **Step 1: 新增中文镜像并保留双语切换**

每份中文镜像文档顶部都必须加：

```md
`English` | **中文**
```

每份英文文档顶部都必须加：

```md
**English** | `中文`
```

- [ ] **Step 2: 保持中文镜像结构与英文版等价**

要求：

```text
- 结构等价
- 关键术语一致
- 不是摘要页
- 不做同页中英混排
```

### Task 4: 验证双语入口与链接完整性

**Files:**
- Modify: `/Users/gaofeng/workspace/one-person-lab/README.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/README.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/operating-model.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/operating-model.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/task-map.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/task-map.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/shared-foundation.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/shared-foundation.zh-CN.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/roadmap.md`
- Modify: `/Users/gaofeng/workspace/one-person-lab/docs/roadmap.zh-CN.md`

- [ ] **Step 1: 检查目标文件是否全部存在**

Run:

```bash
find /Users/gaofeng/workspace/one-person-lab -maxdepth 2 -type f | sort
```

Expected: 首页双语文件和四组 docs 双语文件都存在。

- [ ] **Step 2: 检查明显格式问题**

Run:

```bash
git -C /Users/gaofeng/workspace/one-person-lab diff --check
```

Expected: 无输出。

- [ ] **Step 3: 检查语言切换和双语链接**

Run:

```bash
rg -n "English \\| \\[中文\\]|\\[English\\].*\\*\\*中文\\*\\*|README.zh-CN|operating-model.zh-CN|task-map.zh-CN|shared-foundation.zh-CN|roadmap.zh-CN" /Users/gaofeng/workspace/one-person-lab/README.md /Users/gaofeng/workspace/one-person-lab/README.zh-CN.md /Users/gaofeng/workspace/one-person-lab/docs/*.md
```

Expected: 所有目标文件都有对应语言切换与镜像链接。
