# Bilingual Homepage And Core Docs Design

Date: `2026-04-02`

## Context

`one-person-lab` 当前已经具备：

- 一个相对稳定的顶层 banner 与首页结构
- 明确的 `OPL -> Shared Foundation -> Workstreams -> MedAutoScience` 叙事
- 已经对外可见的 GitHub 仓库与 profile 入口

但公开入口仍有一个明显问题：

- 首页主体仍是中文
- 下游核心文档也仍是中文
- 这会让国际读者在第一屏就失去可读性，也会让 GitHub 默认公开面不够国际化

同时，当前叙事还有一个容易被误读的点：

- `OPL` 的首个成熟样板来自医学实验室和医学自动科研
- 如果不明确说明，外部读者会自然把 `OPL` 理解为“只服务医学”的体系

用户已经明确要求：

1. `README.md` 改成英文默认首页。
2. 首页顶部增加明显的 `English | 中文` 语言入口。
3. 不是只改首页，而是连同核心公开文档一起补双语，避免点击后退回中文。
4. 首页应明确写出：当前样板来自医学实验室，但欢迎各个领域的 `PI` 创建自己领域的 `OPL`。

## Problem Statement

当前的主要问题不是信息缺失，而是公开表达层没有完成国际化分层。

具体有三类问题：

### 1. Default public surface is not internationally readable

GitHub 仓库的默认入口是 `README.md`。

如果默认首页是中文，那么：

- 国际读者第一屏无法稳定理解项目定位
- `one-person-lab` 更像一个中文内部说明仓库，而不是面向国际读者的顶层 blueprint

### 2. README-only localization would still create language breaks

如果只把 `README.md` 改成英文，但下游核心文档继续保持中文，那么用户点击后仍会掉回中文面，体验是不连续的。

因此，这次不能只做首页翻译，至少要补齐：

- operating model
- task map
- shared foundation
- roadmap

这四份核心公开文档的双语镜像。

### 3. OPL needs to be framed as medical-origin, not medical-only

当前 `OPL` 的最成熟子项目是 `MedAutoScience`，它天然带有医学研究语境。

这既是优势，也是风险：

- 优势：体系不是空的，有真实样板
- 风险：外界可能误以为 `OPL` 本身只适合医学实验室

因此首页必须更明确地表达：

- 当前样板来自医学实验室
- 但 `OPL` 作为实验室任务体系并不限定于医学
- 欢迎不同领域的 `PI` 在各自学科里建立自己的 `OPL`

## User-Level Requirements

本轮改版必须满足：

1. `README.md` 为英文默认首页。
2. 首页顶部有清晰可见的语言入口：`English | 中文`。
3. 提供完整中文镜像首页：`README.zh-CN.md`。
4. 四份核心公开文档提供双语镜像：
   - `docs/operating-model.md`
   - `docs/task-map.md`
   - `docs/shared-foundation.md`
   - `docs/roadmap.md`
5. 英文首页与英文文档互相链接；中文首页与中文文档互相链接。
6. banner、HTML 总览区块与项目结构不推倒重来，只做语言层改版。
7. `OPL` 必须被表述为：
   - medical-origin sample
   - not medical-only
   - open to PIs in other domains

## Scope

本轮覆盖：

- `README.md` 英文化
- `README.zh-CN.md` 新增
- 四份核心 docs 的英文默认版整理
- 四份核心 docs 的中文镜像新增
- 首页语言入口与文档内部链接切换

本轮不覆盖：

- 不改变项目总结构
- 不新增文档站
- 不调整 banner 之外的视觉系统
- 不修改 `MedAutoScience` 仓库本身的语言策略

## Considered Approaches

### Option A. English default + complete Chinese mirror

做法：

- `README.md` 作为英文首页
- `README.zh-CN.md` 作为中文镜像
- 核心 docs 维持英文默认版
- 同步新增对应中文镜像

优点：

- 国际读者默认体验完整
- 中文读者仍保留完整入口
- 首页和下游文档之间不会出现语言断层

缺点：

- 后续维护需要同步双语

结论：

- 这是本次选定方案。

### Option B. English README only

做法：

- 只把首页改成英文
- 核心 docs 继续保留中文

优点：

- 改动最小

缺点：

- 首页国际化后，点击下游会立刻语言断层
- 公开面不够完整

结论：

- 不选。

### Option C. Mixed-language single-file approach

做法：

- 一个文件里同时放英文和中文
- `docs/` 也做中英混排

优点：

- 文件数量少

缺点：

- 首页会明显变重
- 对国际读者不友好
- GitHub 阅读体验差

结论：

- 不选。

## Chosen Design

采用 `Option A`：

- 英文作为默认公开面
- 中文作为完整镜像面
- 首页与核心 docs 都保持语言一致性

## Design

### A. File Strategy

首页与核心 docs 的文件策略如下：

- `README.md`
  - 英文默认首页
- `README.zh-CN.md`
  - 中文首页镜像
- `docs/operating-model.md`
  - 英文默认文档
- `docs/operating-model.zh-CN.md`
  - 中文镜像
- `docs/task-map.md`
  - 英文默认文档
- `docs/task-map.zh-CN.md`
  - 中文镜像
- `docs/shared-foundation.md`
  - 英文默认文档
- `docs/shared-foundation.zh-CN.md`
  - 中文镜像
- `docs/roadmap.md`
  - 英文默认文档
- `docs/roadmap.zh-CN.md`
  - 中文镜像

### B. Language Switcher

首页顶部语言入口固定为：

英文首页：

```md
<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>
```

中文首页：

```md
<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>
```

核心 docs 也采用相同模式，只是链接改成对应文档的双语版本。

### C. Content Policy

本轮语言转换遵守这些规则：

- 项目名、仓库名、任务面名保持英文：
  - `One Person Lab`
  - `OPL`
  - `Research Ops`
  - `Grant Ops`
  - `MedAutoScience`
- 解释性语句做本地语言表达
- 不做同一页面中英混排
- 英文页全部链接指向英文 docs
- 中文页全部链接指向中文 docs

### D. Homepage Messaging

英文首页必须明确表达三层信息：

1. `OPL` 是一个 top-level blueprint，不是单一产品。
2. 当前最成熟样板来自医学实验室，即 `MedAutoScience`。
3. `OPL` 不是 medical-only framework；欢迎不同领域的 `PI` 在各自学科中创建自己的 `OPL`。

推荐加入一段明确表述：

> The current reference implementation grows out of a medical research lab, because that is the environment in which the first mature workstream was built. But OPL is not intended to be medical-only. PIs in other disciplines are encouraged to build their own domain-specific OPL around the same operating idea.

中文镜像则表达为：

> 当前样板来自医学实验室，因为首个成熟 workstream 诞生于这一环境。但 `OPL` 并不限定于医学。欢迎不同学科领域的 `PI` 围绕同样的 operating idea，建立各自领域的 `OPL`。

### E. Document Translation Scope

四份核心 docs 的翻译策略：

- 不是逐句机器直译
- 保持结构等价
- 保持关键术语一致
- 以公开说明文风为准，而不是内部注释风

### F. Compatibility Constraint

这次改版不能破坏现有公开入口的稳定性：

- `README` 顶部 banner 继续保留
- HTML 结构总览继续保留
- `MedAutoScience` 链接位置继续保留
- 路线图与项目矩阵仍然作为首页核心区块

## Acceptance Criteria

如果这次设计被正确实现，则应满足：

1. 国际读者打开仓库默认看到英文首页。
2. 中文读者可以从首页顶部一键进入完整中文镜像。
3. 英文首页点击核心 docs 后不会退回中文。
4. 中文首页点击核心 docs 后不会跳回英文。
5. 首页明确表达 `OPL` 是 medical-origin but not medical-only。
6. `MedAutoScience` 仍然清楚地呈现为当前最成熟子项目，而不是整个 `OPL` 的同义词。
