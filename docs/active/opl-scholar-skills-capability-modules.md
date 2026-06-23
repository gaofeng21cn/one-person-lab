# OPL ScholarSkills Capability Modules

Owner: `One Person Lab`
Purpose: 说明 `OPL ScholarSkills` 能力模块库的机器入口、十大品牌模块关系、runtime environment bridge 和 domain-agent 消费边界。
State: `active_structural_baseline`
Machine boundary: 本文是人读导航。机器真相以 `contracts/opl-framework/scholar-skills-capability-modules.json`、`src/scholar-skills.ts` 与 `opl scholar-skills * --json` readback 为准。

## 基本定位

`OPL ScholarSkills` 是 OPL family 的学术能力模块库，不是第十一个 OPL 品牌模块。它给 MAS、MAG、RCA、OMA 或后续 Foundry Agent 提供一组可发现、可校验、可接入 OPL runtime env 的 `capability module` descriptor。

十大 OPL 品牌模块仍保持原职责：

- `Atlas` 发现与索引能力模块。
- `Pack` 承载 descriptor、schema、artifact/ref lifecycle 与 packaging。
- `Stagecraft` 把能力模块挂到 stage / current-owner-delta 所需的 ref family。
- `Runway` 承载 runtime invocation / attempt / queue 的通用执行骨架。
- `Vault` 记录 evidence、receipt、lineage 与 refs。
- `Console` 投影 operator readback 和安全动作。
- `Connect` 分发、安装、skill/plugin 同步。
- `Charter`、`Workspace`、`Foundry Lab` 分别承载治理、workspace 和 agent factory 边界。

ScholarSkills 不改 `BrandModuleId` 枚举；它作为这些品牌模块共同管理的能力库存在。

## 当前模块目录

当前 canonical contract 固定十个 module id：

- `opl.scholarskills.display` / `Scholar Display`
- `opl.scholarskills.tables` / `Scholar Tables`
- `opl.scholarskills.stats` / `Scholar Stats`
- `opl.scholarskills.omics` / `Scholar Omics`
- `opl.scholarskills.lit` / `Scholar Lit`
- `opl.scholarskills.write` / `Scholar Write`
- `opl.scholarskills.review` / `Scholar Review`
- `opl.scholarskills.submit` / `Scholar Submit`
- `opl.scholarskills.data` / `Scholar Data`
- `opl.scholarskills.intake` / `Scholar Intake`

每个 module 都必须声明 input / output schema refs、dependency profile refs、run-context refs、invocation entries、artifact refs、receipt policy、quality evidence 和 authority boundary。

## Runtime Env 关系

ScholarSkills 只声明 dependency intent 与 run-context refs。实际依赖准备、缓存、run-context 生成和 fail-closed doctor 由 OPL runtime environment substrate 处理：

```bash
opl runtime env prepare --domain scholarskills --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json
opl runtime env run-context --domain scholarskills --profile <profile> --json
```

`cache hit`、`run-context exists`、`descriptor exists` 或 `doctor pass` 只能证明 OPL substrate 的结构/读面成立，不能声明 domain ready、runtime ready、quality verdict、artifact authority、owner receipt、typed blocker 或 production ready。

## MAS 消费边界

MAS 可以把 `opl.scholarskills.display` 作为 `current_owner_delta` 的 refs-only capability request，桥接到 MAS Display Pack 的 candidate artifact refs。但 MAS 仍持有 study truth、publication truth、quality verdict、artifact authority、owner receipt、typed blocker、human gate 和当前 package authority。

目标调用链：

```text
MAS current_owner_delta
  -> OPL Atlas capability discovery
  -> OPL Pack descriptor / contract validation
  -> OPL runtime env prepare / run-context
  -> OPL Runway invocation envelope
  -> candidate artifact refs + execution receipt
  -> MAS owner gate consume / reject
```

当前 OPL 侧落地范围是 capability catalog、descriptor validation、CLI readback 与 runtime env bridge refs。真实 domain owner consumption 要回到 MAS 等 domain repo 的 owner surface。

## CLI Readback

```bash
opl scholar-skills list --json
opl scholar-skills inspect --module opl.scholarskills.display --json
opl scholar-skills interfaces --json
opl scholar-skills validate --json
opl scholar-skills doctor --json
```

这些命令是 OPL-owned readback，保持无 domain write、无 runtime state write、无 artifact body mutation、无 owner receipt signing。
