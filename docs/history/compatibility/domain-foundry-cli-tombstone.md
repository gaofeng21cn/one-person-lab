# Domain Foundry CLI 历史 tombstone

Status: `retired_tombstone`
Owner: `One Person Lab`
Purpose: `domain_foundry_cli_historical_provenance`
State: `history_only`
Machine boundary: 本文只保存旧命令面的来源追溯和退役读法。当前机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts、OPL generated/hosted Foundry Agent surfaces 和 App/workbench projection；本文不得作为 active command contract、compatibility interface、smoke target、membership/status/list 分组依据或保留旧 alias/facade 的依据。

## 结论

历史上 MAS、MAG、RCA 曾分别出现过专属 Foundry 命令面，例如 `medautosci foundry ...`、`medautogrant foundry ...` 和 `redcube foundry ...` / repo-local redcube Foundry launcher。这些命令只按 historical provenance 读取。

当前标准 OPL Agent 的纯净形态是：

```text
Declarative Domain Pack
  + OPL generated/hosted Foundry Agent surfaces
  + minimal authority functions
```

这些历史命令不是 active / public standard surface，不是 current smoke，不是 compatibility requirement，不是 membership/status/list 分组依据，也不需要 OMA、BookForge 或后续 Agent 补同类命令。

## 当前替代边界

- Public / active Foundry Agent 列表、状态和 inspection 归 OPL generated/hosted surfaces 与 series membership policy。
- Domain repo 保留 declarative pack、domain handler target、direct skill path、必要 native helper 和 minimal authority function。
- 旧命令若仍出现在历史文档、fixture 或提交记录中，只作为 provenance、regression archaeology 或 no-resurrection scan 输入读取。
- 新 Agent onboarding 不复制这些命令面；如果需要用户入口，应从 pack compiler、generated/hosted surface、App action 或 direct skill / handler path 派生。

## 禁止恢复

- 不把旧专属命令写成当前 smoke、standard surface、compatibility command、fallback command、direct launcher 或 operator default path。
- 不把旧命令是否存在作为 Foundry Agent membership、status、list、OMA / BookForge 分类或 production maturity 的判断依据。
- 不为 OMA、BookForge 或后续 Agent 补同类命令来“对齐”历史形态。
- 不用历史 `--format json` / wrapper alias / repo-local launcher 作为当前 JSON output policy 或 generated surface parity 的证据。
