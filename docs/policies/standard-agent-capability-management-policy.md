# Standard Agent Capability 管理政策

本文定义 Agent capability 的 owner、准入、暴露和复用规则。具体 capability 以各 Package 的 `capability_map.json` 和 descriptor 为准。

## Capability kinds

- `primary_skill`：Agent 的主要专业入口；
- `professional_skill`：可复用的专业方法；
- `stage_prompt`：某个 Stage 的 owner prompt；
- `stage_projection` / `runtime_projection`：refs-only 状态投影；
- `tool_connector`：外部 tool/provider adapter；
- `reference_pack`：只读知识或模板；
- `contract_module`：稳定 machine contract；
- `domain_skill_declaration`：domain 对能力的显式声明。

kind 只描述能力形态，不创建新的安装生命周期。所有能力仍归某个 Package。

## Owner

每项 capability 必须有一个真实 owner 和 canonical source ref。Framework 可以索引、校验和投影，不能复制正文、专业判断或 provider credential。

domain-specific 能力留在 domain owner；多个真实 consumer共享且语义稳定时，才上收 shared Package 或 contract。

## Package boundary

- capability 随 owner Package 安装；
- required Package dependency 只表达 presence 和 callable entrypoint；
- optional capability 缺失只关闭该能力；
- Skill、Tool、MCP 和 Cordis contribution 不形成平行 installer、registry 或 currentness。

## Exposure

能力只在存在真实 caller 的 surface 暴露：

- owner repo direct entry；
- Codex Plugin/Skill；
- Framework Host contribution；
- CLI/MCP；
- App custom view。

不同 surface 应调用同一 owner entrypoint或projection，不能复制实现。默认 surface 保持最少，诊断和 operator 入口按需展开。

## Admission

新增或上收 capability 必须证明：

1. 稳定 identity 和 owner；
2. 当前 caller；
3. inputs/outputs 与 authority boundary；
4. source 和 verification ref；
5. 与现有 capability 不重复；
6. Package 和 publication 层级合理。

没有真实 consumer、只为目录对称、未来复用或文档完整性而新增的 capability 不准入。

## Change and removal

不改变既有语义的增量字段沿用原 identity。语义 breaking change 使用新 identity并切换 caller。旧 identity 在 fresh caller=0 后直接删除：

- descriptor 字段；
- implementation；
- projection/adapter；
- fixture 和测试；
- docs 和示例。

Framework 不保留 alias、facade 或 dual registry。

## Quality and authority

capability callable 只证明入口可用。专业质量、artifact acceptance、publication、submission 和 human decision 仍由 domain owner决定。

## Verification

至少验证 owner descriptor、capability map、真实 caller、entrypoint callability、required dependencies 和受影响 consumer。动态 installed 状态使用 `opl pack list --json`，不写入本政策。
