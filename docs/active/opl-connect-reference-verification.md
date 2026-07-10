# OPL Connect 引用校验

Owner: OPL Connect
State: active connector surface
Machine boundary: 机器真相以 `opl connect references verify` CLI、
`src/modules/connect/opl-connect-reference-verification.ts`、CLI command registry
和 focused CLI tests 为准。本文只做人读操作说明。

`opl connect references verify` 用于把 reference list 交给 provider 做只读
metadata / identifier 校验，并返回 provider receipt candidate、cache metadata
和 retry evidence。它服务 MAS、Workspace、本机 OPL App 和 CLI 的同一条引用
证据链，但不判断引用是否支撑论文论点。

## 命令面

```bash
opl connect references verify --references-file references.json --providers crossref,openalex,semantic-scholar,crossmark,publisher --cache-root .cache/opl-connect --max-retries 1 --json
```

输入文件可以是数组，也可以是：

```json
{
  "references": [
    {
      "id": "ref-1",
      "doi": "10.1234/example",
      "pmid": "987654",
      "title": "Example title"
    }
  ]
}
```

当前可执行 provider 是 Crossref、OpenAlex、Semantic Scholar、Crossmark 和
Publisher。PubMed search 与 metadata provider 由 MAS `adapters/literature/pubmed.py`
持有，不在 OPL Connect 维护第二套 EUtils client。Crossmark provider 当前只消费 Crossref REST metadata
中的 Crossmark / update signal，不代表已调用独立 Crossmark API 做完整核验。
Publisher provider 通过 DOI resolver 读取 publisher landing page metadata；
它不下载全文、不验证 paywalled full-text body，也不把 landing page 命中写成
reference truth。

## 输出

输出包含：

- `provider_evidence`：每个 reference / provider 的 matched 或 deferred 结果，
  并通过 `match_status` 区分 `identifier_matched`、`metadata_conflict`、
  `provider_found`、`deferred` 和 `error`；
- `provider_receipts`：仅 `identifier_matched` 且无 `mismatch_details` 的
  `opl://connect/references/verify/...` receipt candidate；
- `deferred_provider_receipt_requirements`：缺少 DOI / PMID / title、provider 429 / 403 或网络失败等未形成 receipt 的 provider requirement；
- `mismatch_details`：DOI / PMID / title 与输入 reference 不一致时的机器可读
  conflict 明细；
- `cache`：cache root、hit / miss / write 状态；
- `retry_attempts`：provider 失败重试记录；
- `no_authority_boundary`：只读、不得写 domain truth、owner receipt、typed blocker 或 reference truth。

单个 provider 失败不会让整批引用校验失败；失败 provider 会被收口为
`lookup_status=error` / `status=deferred` 的 evidence，matched provider 继续
返回 receipt candidate。OpenAlex、Semantic Scholar 和 Publisher 返回 provider
item / landing page 只代表 `provider_found`；只有 DOI / PMID 严格匹配且没有
metadata conflict，才会进入 `provider_receipts`。Publisher 只返回 DOI resolver
landing metadata，并显式保留 `landing_metadata_only=true` /
`full_text_body_verified=false`。

## MAS 使用方式

MAS 可以把该命令作为文献写作、审稿和 citation audit 的底层 provider evidence。
claim-evidence map、引用取舍、段落改写、review verdict、owner receipt、
typed blocker、publication readiness 和 current package authority 仍归 MAS
owner surface。
