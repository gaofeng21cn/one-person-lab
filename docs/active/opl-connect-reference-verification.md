# OPL Connect 引用校验

Owner: OPL Connect
State: active connector surface
Machine boundary: 机器真相以 `opl connect references verify` CLI、
`src/modules/connect/opl-connect-reference-verification.ts`、CLI command registry
和 focused CLI tests 为准。本文只做人读操作说明。

`opl connect references verify` 用于把 reference list 交给 provider 做只读
metadata 校验，并返回 provider receipt candidate、cache metadata 和 retry
evidence。它服务 MAS、Workspace、本机 OPL App 和 CLI 的同一条引用证据链，
但不判断引用是否支撑论文论点。

## 命令面

```bash
opl connect references verify --references-file references.json --providers crossref,pubmed --cache-root .cache/opl-connect --max-retries 1 --json
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

当前可执行 provider 是 Crossref 和 PubMed。OpenAlex 与 Semantic Scholar 先以
`deferred` 返回 provider receipt requirement，避免把未接入 provider 写成已校验。

## 输出

输出包含：

- `provider_evidence`：每个 reference / provider 的 matched 或 deferred 结果；
- `provider_receipts`：matched 结果的 `opl://connect/references/verify/...` receipt candidate；
- `cache`：cache root、hit / miss / write 状态；
- `retry_attempts`：provider 失败重试记录；
- `no_authority_boundary`：只读、不得写 domain truth、owner receipt、typed blocker 或 reference truth。

## MAS 使用方式

MAS 可以把该命令作为文献写作、审稿和 citation audit 的底层 provider evidence。
claim-evidence map、引用取舍、段落改写、review verdict、owner receipt、
typed blocker、publication readiness 和 current package authority 仍归 MAS
owner surface。
