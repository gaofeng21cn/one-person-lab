# Workspace 与 Source Intake 边界

Framework只提供通用workspace/source locator、scope、freshness和refs transport；domain owner解释source内容并决定是否可用。

## Framework

- workspace registry和binding；
- source locator、ref、fingerprint和freshness projection；
- StageRun/Attempt scope；
- App/operator refs-only view；
- missing input和owner action。

## Domain owner

- 读取和解释source body；
- 数据、文献、基金材料或视觉素材的专业判断；
- source readiness；
- mapping、cleaning和acceptance；
- privacy、consent和domain governance；
- owner receipt、typed blocker和human gate。

## Intake flow

```text
external source
  -> owner locator and access policy
  -> Workspace binding
  -> Stage input refs/fingerprint
  -> domain interpretation
  -> owner readiness or blocker
```

Framework可以发现ref缺失、不可读或fingerprint变化，不能决定内容质量。

## Repo boundary

source repo保存contract、schema、locator和deterministic fixture。真实source body、用户数据和work in progress进入外部workspace。规则见 [Workspace与Artifact Hygiene](../policies/runtime-artifact-hygiene-policy.md)。

## App

App只展示workspace/source refs、freshness、blocked reason、owner和inspect/action route。Framework 可按已授权 intake receipt，将 exact-bound source bytes 写入内容存储并传给指定执行者；这属于受控输入传输，不取得 source truth 或 readiness 判断权。普通 App 读面保持 refs-only。具体实现见 [`foundry-source-material.ts`](../../src/adapters/execution/foundry-source-material.ts)。

## Verification

至少验证locator、scope、access、fingerprint、domain owner readback和缺失输入route-back。workspace binding成功或ref可见不等于source accepted、domain ready或artifact ready。
