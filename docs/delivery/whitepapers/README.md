# 白皮书交付证据

Owner: `OPL Connect`
Purpose: `whitepaper_delivery_evidence_boundary`
State: `active_support`
Machine boundary: 本文只解释白皮书构建与发布证据边界，不持有正文、产品状态、运行状态或领域结论。

白皮书构建会在 ignored `docs/site/latest/whitepapers/` 中生成
`*.verification.json`。该记录绑定正文、Profile、renderer、样式、工具版本、
HTML、PDF 和渲染页面字节，但只证明 artifact 已渲染，不证明已经发布，也不
证明 OPL、App、Cloud 或 MAS ready。

显式发布工作流消费同一份已审核 bundle，更新保留提交历史的 `gh-pages`，
再从公开 HTML/PDF URL 回读 exact bytes。只有
`opl_whitepaper_publication_receipt.v1` 的状态为
`publication_readback_verified`，才能声明该 bundle 已发布。Receipt 作为
GitHub Actions artifact 保存，不在 `main` 复制一份会漂移的运行记录。
