# OPL 白皮书

Owner: `One Person Lab`
Purpose: `public_whitepaper_artifact_index`
State: `active_public_support`
Machine boundary: 本目录是用户可读白皮书与派生产物入口。内容源由 `opl-whitepaper.source.json` 持有；Markdown、PDF 和 verification JSON 都是生成物。当前产品 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App release/user-path evidence 和真实 workspace evidence。

本目录承接面向用户分享的 `One Person Lab` 白皮书。它解释 OPL 的定位、设计哲学、九个品牌模块、Foundry Agents，以及为什么 OPL 能把高价值知识工作组织成可恢复、可审计、可交付的智能体运行体验。

## 生成物

- [OPL 白皮书 PDF](./opl-whitepaper.pdf)：用于分享、转发和离线阅读的正式版本。
- [OPL 白皮书 Markdown](./opl-whitepaper.md)：由同一内容源生成的长文版本，便于网页或仓库内阅读。
- [Verification record](./opl-whitepaper-verification.json)：记录稳定生成标记、PDF 写入状态、PDF 页数、渲染页、文本抽取检查和工具链信息。

## 内容源

- [`opl-whitepaper.source.json`](./opl-whitepaper.source.json)：canonical 白皮书内容源。需要修改正文、章节顺序、模块描述或 agent 描述时，只改这个 JSON。

不要手改 `opl-whitepaper.md`、`opl-whitepaper.pdf` 或 verification JSON。它们会在下一次生成时被覆盖。

## 更新流程

1. 修改 `opl-whitepaper.source.json`。
2. 运行 `npm run docs:whitepaper`。
3. 检查 `opl-whitepaper-verification.json`，并渲染 PDF 页面确认版式。
4. 若同步影响公开索引，更新 `docs/public/README.md` 或上层文档索引。
