[English](./opl-gateway-acceptance-test-spec.md) | **中文**

# OPL Gateway Acceptance Test Spec

## 目的

这份文档冻结当前 `OPL Gateway` 文档/合同体系的 acceptance / test-spec。

它的作用是：让 gateway 的推进变成“可检查”，而不是每次都重新解释一遍架构。

目标不是 runtime verification。
目标是 contract verification、wording verification、routing-safety verification，以及 federation-boundary verification。

## 范围

这份 acceptance spec 覆盖：

- `G1` 机器可读 registry / handoff 完整性
- `G2` 只读 discovery 正确性
- `G3` routed action 安全性
- domain onboarding gate 完整性
- `P5.M1` governance / audit operating surface 完整性
- `P5.M2` publish / promotion operating surface 完整性
- `P7` example corpus 完整性
- `P8` public surface index 完整性
- `P10` routed-safety example 完整性
- `P12` operating example 完整性
- 各公开表面之间的 cross-domain wording consistency

## 上位依据

下面这些文档与工件构成此 acceptance spec 的依据：

- [README](../README.zh-CN.md)
- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Public Surface Index](./opl-public-surface-index.zh-CN.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.zh-CN.md)
- [OPL Gateway 落地路线](./opl-gateway-rollout.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)
- [`acceptance-matrix.json`](../contracts/opl-gateway/acceptance-matrix.json)

## 配套参考示例

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.zh-CN.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.zh-CN.md)

这两组 corpus 都是 illustrative、non-governing 的配套参考。gateway corpus 展示跨层组合；operating corpus 则把独立的 `P5.M1` / `P5.M2` record materialize 成可直接检查的 example。它们帮助人类与 Agent 理解已冻结 surface，但不替代上面的 contracts 与 acceptance gates。

## A. G1 Registry Completeness

### 验收标准

`G1` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/workstreams.json` 存在，且是合法 JSON。
2. `contracts/opl-gateway/domains.json` 存在，且是合法 JSON。
3. `contracts/opl-gateway/routing-vocabulary.json` 存在，且是合法 JSON。
4. `contracts/opl-gateway/handoff.schema.json` 存在，且是合法 JSON Schema JSON。
5. workstream registry 显式编码了：
   - `research_ops -> medautoscience`
   - `presentation_ops -> redcube`
   - `ppt_deck` 直接映射到 `presentation_ops`
   - `xiaohongshu` 可路由到 `redcube`，但不自动等于 `presentation_ops`
6. domain registry 显式保持 canonical truth 留在各自 domain，而不在 `OPL`。
7. routing vocabulary 显式包含顶层 routing order 与 special-case family handling。
8. handoff schema 定义的是从 OPL 到 domain gateway 的冻结 payload，而不是授权直接 targeting harness。

### 验证方式

- 使用 `json.load` 解析 `contracts/opl-gateway/` 下所有 JSON / schema 文件。
- 检查 `workstreams.json`、`domains.json`、`routing-vocabulary.json` 与 `handoff.schema.json` 中的必需映射和边界字段。
- 确认 contract README 将该目录描述为 machine-readable contract materialization，而不是 runtime。

## B. G2 Discovery Correctness

### 验收标准

`G2` 只有在下面全部成立时才算通过：

1. discovery contract 定义了：
   - `list_workstreams`
   - `get_workstream`
   - `list_domains`
   - `get_domain`
   - `resolve_request_surface`
   - `explain_domain_boundary`
2. `G2` discovery 被显式写成 read-only。
3. `G2` 显式**不**负责：
   - 创建 deliverable
   - 修改 workspace
   - 启动 run
   - 绕过 domain gateway
   - 拥有 canonical runtime truth
4. `resolve_request_surface` 明确建立在已冻结的 G1 registries 与 routing vocabulary 之上。
5. `xiaohongshu` 可以解析到 `redcube`，但不能被自动标记成 `presentation_ops`。

### 验证方式

- 检查 `docs/opl-read-only-discovery-gateway.md` 与 `.zh-CN.md` 中的必需操作和非目标。
- 验证 discovery 文档反向链接到机器可读 G1 工件。
- 验证 discovery wording 没有把 `G2` 提升成 mutation surface。

## C. G3 Routing Safety

### 验收标准

`G3` 只有在下面全部成立时才算通过：

1. routed action contract 定义了：
   - `route_request`
   - `build_handoff_payload`
   - `audit_routing_decision`
2. `route_request` 支持显式未决状态：
   - `refused`
   - `unknown_domain`
   - `ambiguous_task`
3. `build_handoff_payload` 的目标只能是 `domain_gateway`。
4. routed contract 明确禁止绕过 domain gateway 直接调用 harness。
5. 机器可读 routed-action schema 与公开 G3 文档保持一致。
6. routing evidence 保持显式、可审计，而不是藏在 best-effort wording 后面。

### 验证方式

- 解析 `contracts/opl-gateway/routed-actions.schema.json`。
- 检查 `docs/opl-routed-action-gateway.md` 与 `.zh-CN.md` 中的全部必需操作和失败状态。
- 用 `rg` 检查 no-bypass wording，并确认它被写成硬规则，而不是偏好建议。

## D. Domain Onboarding Gate

### 验收标准

onboarding gate 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/domain-onboarding-readiness.schema.json` 存在，且是合法 JSON Schema JSON。
2. `examples/opl-gateway/domain-onboarding-readiness.json` 存在，且能通过该 schema 校验。
3. onboarding contract 要求新 domain 提供完整 `G1` registry material。
4. onboarding contract 要求显式 public documentation surface。
5. onboarding contract 要求显式 truth-ownership declaration。
6. onboarding contract 要求显式 review surface。
7. onboarding contract 定义了正式收录门槛，覆盖：
   - registry complete
   - boundary explicit
   - truth ownership explicit
   - discovery ready
   - routing ready
   - review ready
   - cross-domain wording aligned
8. onboarding contract 保持 non-executing、不会自动收录 domain，也不会替代 prose review gate。
9. onboarding contract 显式禁止“先挂名，后补边界”。
10. onboarding contract 显式禁止把未来 domain 写成 `OPL` 内部模块。

### 验证方式

- 解析 `contracts/opl-gateway/domain-onboarding-readiness.schema.json`，并用 `examples/opl-gateway/domain-onboarding-readiness.json` 校验它。
- 检查 `docs/opl-domain-onboarding-contract.md` 与 `.zh-CN.md` 是否覆盖全部 required gate。
- 确认 onboarding gate 建立在 G1/G2/G3 之后，而不是替代它们。
- 确认 onboarding contract 没有把 canonical truth 上收给 `OPL`。

## E. P5.M1 Governance / Audit Operating-Surface Integrity

### 验收标准

`P5.M1` 只有在下面全部成立时才算通过：

1. `docs/opl-governance-audit-operating-surface.md` 与 `.zh-CN.md` 存在。
2. `contracts/opl-gateway/governance-audit.schema.json` 存在，且是合法 JSON Schema JSON。
3. governance / audit surface 只允许这些顶层 record kind：
   - `routing_audit`
   - `governance_decision`
   - `publish_readiness_signal`
   - `cross_domain_review_index`
4. governance / audit 文档与 schema 把 `OPL` 保持在 index/signal 层，而不是 runtime truth、review truth 或 publish truth owner。
5. 机器可读 governance / audit envelope 仍然要求 `domain_truth_refs` 必须存在。
6. governance schema 保持 kind-specific record 显式分离，并且不允许 `decision_source = opl_gateway`。
7. `publish_readiness_signal` 仍被显式写成不等于 publication、submission、release、export 或 domain approval truth。
8. governance / audit wording 仍然禁止绕过 domain gateway 去直接碰 harness。

### 验证方式

- 解析 `contracts/opl-gateway/governance-audit.schema.json`。
- 检查 `docs/opl-governance-audit-operating-surface.md` 与 `.zh-CN.md` 中的 allowed record kind 和 no-truth-shift wording。
- 确认 schema 使用了 kind-specific discrimination，且 `decision_source` 不包含 `opl_gateway`。
- 确认 governance / audit wording 仍然位于 routed action 之后，而没有重新发明执行 runtime。

## F. P5.M2 Publish / Promotion Operating-Surface Integrity

### 验收标准

`P5.M2` 只有在下面全部成立时才算通过：

1. `docs/opl-publish-promotion-operating-surface.md` 与 `.zh-CN.md` 存在。
2. `contracts/opl-gateway/publish-promotion.schema.json` 存在，且是合法 JSON Schema JSON。
3. publish / promotion surface 显式声明：只有在 domain-owned publish / release / export / submission outcome 已经存在之后，它才开始生效。
4. publish / promotion 文档与 schema 只允许这些顶层 record kind：
   - `publish_outcome_index`
   - `promotion_candidate_signal`
   - `promotion_surface_index`
5. publish / promotion 文档与 schema 把 `OPL` 保持在 index/signal 层，而不是 publish truth、release truth、export truth、submission truth 或 public-channel posting truth owner。
6. 机器可读 publish / promotion envelope 仍然要求 `domain_truth_refs` 必须存在。
7. publish / promotion wording 仍然禁止 direct venue submission、direct export/release、direct public posting，以及 direct harness bypass。
8. `P5.M1 -> P5.M2` 的边界仍然显式成立：readiness 留在 `P5.M1`；post-publish indexing 与 promotion signaling 留在 `P5.M2`。

### 验证方式

- 解析 `contracts/opl-gateway/publish-promotion.schema.json`。
- 检查 `docs/opl-publish-promotion-operating-surface.md` 与 `.zh-CN.md` 中的 post-publish boundary 和 no-truth-shift wording。
- 确认 schema 保持 kind-specific record 显式分离，且 `domain_truth_refs` 仍为 mandatory。
- 确认 publish / promotion wording 没有把 `OPL` 变成 venue-submission runtime 或 public-channel posting runtime。

## G. Cross-Domain Wording Consistency

### 验收标准

wording-consistency gate 只有在下面全部成立时才算通过：

1. `OPL` 的公开表面都把 `OPL` 写成 top-level gateway / federation surface。
2. `OPL` 的公开表面**不会**把 `OPL` 写成：
   - 所有 runtime 行为都已经落在这里
   - domain gateway 的替代品
   - 单体 runtime
3. `MedAutoScience` 仍被写成 active 的 `Research Ops` domain gateway 与 harness。
4. `RedCube AI` 仍被写成视觉交付 / 承接 `Presentation Ops` 的 domain gateway 与 harness。
5. `ppt_deck` 仍被显式写成直接映射 `Presentation Ops`。
6. `xiaohongshu` 在 OPL 顶层仍被显式写成不自动等于 `Presentation Ops`。
7. 任何公开 wording 都不能把 domain 项目降格成 OPL 的私有实现细节。
8. governance / audit wording 仍然保持 index-only，而不是 runtime-owning。
9. publish / promotion wording 仍然保持 index-only，而不是 publish-owning 或 promotion-owning。

### 验证方式

- 阅读 `README.md`、`README.zh-CN.md`、`docs/roadmap*.md` 与相关 gateway 文档。
- 用定向 `rg` 检查废弃 wording 与必需的 domain-role wording。
- 将 OPL 仓库中的公开 wording 与 `med-autoscience`、`redcube-ai`、`gaofeng21cn` 的 README 做交叉核对。

## H. P7 Example Corpus 完整性

### 验收标准

`P7` 只有在下面全部成立时才算通过：

1. `docs/opl-gateway-example-corpus.md` 与 `.zh-CN.md` 存在。
2. `examples/opl-gateway/research-ops-submission.json` 与 `examples/opl-gateway/presentation-ops-publish.json` 存在，且是合法 JSON。
3. example corpus 文档显式保持 illustrative、non-governing、non-executing 边界。
4. research example 显式保持：
   - `research_ops -> medautoscience`
   - `entry_surface = domain_gateway`
   - 受 schema 约束的 routing / handoff / governance / publish record 与已冻结 contracts 一致
5. presentation example 显式保持：
   - `presentation_ops -> redcube`
   - `ppt_deck` 直接映射到 `presentation_ops`
   - `xiaohongshu` 可路由到 `redcube`，但不自动等于 `presentation_ops`
6. example records 仍把 domain truth 留在各自 domain，而不是上收给 `OPL`。
7. example corpus 不暗示 runtime execution、direct harness targeting，或凌驾于已冻结 contracts 之上的新 governing layer。

### 验证方式

- 使用 `json.load` 解析 example JSON 文件。
- 用已冻结的 routed-action、governance/audit、publish/promotion schemas 校验受约束的 example 子对象。
- 检查 example-corpus 文档中的 illustrative / non-governing / no-runtime wording。
- 确认 examples 保留 `ppt_deck` / `xiaohongshu` 的特殊边界。

## I. P8 Public Surface Index 完整性

### 验收标准

`P8` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/public-surface-index.json` 存在，且是合法 JSON。
2. `docs/opl-public-surface-index.md` 与 `.zh-CN.md` 存在。
3. public surface index 显式保持 machine-readable、non-executing。
4. public surface index 显式区分：
   - OPL-owned public-entry / contract / supporting surfaces
   - domain-owned public-entry surfaces
5. 这个 index 只链接 domain public-entry surface，而不索引 harness internals、runtime launch surface，或 domain canonical-truth registry。
6. 这个 index 保持当前已冻结映射：
   - `research_ops -> medautoscience`
   - `presentation_ops -> redcube`
   - `ppt_deck` 直接映射到 `presentation_ops`
   - `xiaohongshu` 可路由到 `redcube`，但不自动等于 `presentation_ops`
7. 被链接的 README / roadmap / federation / rollout / contract-hub wording 不会把 public surface index 升格成 launcher、runtime registry 或 truth-owner surface。

### 验证方式

- 解析 `contracts/opl-gateway/public-surface-index.json`。
- 检查 category 引用、`routes_to` 目标，以及本地 `repo_path` refs 的结构完整性。
- 检查 `docs/opl-public-surface-index.md` 与 `.zh-CN.md` 中的 no-runtime / no-truth-shift / no-internal-module wording。
- 验证被接入的 OPL public surface 确实在应有位置链接到 public-surface index。

## J. P10 Routed-Safety Example 完整性

### 验收标准

`P10` 只有在下面全部成立时才算通过：

1. `docs/opl-routed-safety-example-corpus.md` 与 `.zh-CN.md` 存在。
2. `examples/opl-gateway/ambiguous-task-routing.json`、`unknown-domain-routing.json` 与 `refusal-routing.json` 存在，且是合法 JSON。
3. 每个 routed-safety example 都保持在 routed boundary 之下：
   - 不生成 `build_handoff_payload`
   - 不暗示 hidden best-effort reroute
   - 不把 domain truth 上收给 `OPL`
4. ambiguous-task example 保持 `candidate_workstreams` / `candidate_domains` 显式存在，不发明 resolved owner。
5. unknown-domain example 保持 unowned workstream 显式可见，不把请求强行塞进现有 domain。
6. refusal example 保持顶层 refusal reason 显式存在，不把 direct-harness bypass 淡化成 routed outcome。
7. routed-safety 文档与被链接 surface 仍把这组 corpus 写成 illustrative、non-governing、non-executing。

### 验证方式

- 使用 `json.load` 解析 routed-safety example JSON 文件。
- 用已冻结 schemas 校验其中的 routed-action 与 governance-audit 子对象。
- 检查 `docs/opl-routed-safety-example-corpus.md` 与 `.zh-CN.md` 中的 no-runtime / no-fallback / no-truth-shift wording。
- 确认 public-surface index 与 routed-action 文档在应有位置链接到 routed-safety corpus。

## K. P12 Operating Example 完整性

### 验收标准

`P12` 只有在下面全部成立时才算通过：

1. `docs/opl-operating-example-corpus.md` 与 `.zh-CN.md` 存在。
2. 六个独立 operating example 文件存在，且是合法 JSON：
   - `examples/opl-gateway/governance-decision-record.json`
   - `examples/opl-gateway/cross-domain-review-index.json`
   - `examples/opl-gateway/publish-readiness-signal.json`
   - `examples/opl-gateway/publish-outcome-index.json`
   - `examples/opl-gateway/promotion-candidate-signal.json`
   - `examples/opl-gateway/promotion-surface-index.json`
3. governance 侧 example 直接通过 `contracts/opl-gateway/governance-audit.schema.json` 校验。
4. publish / promotion 侧 example 直接通过 `contracts/opl-gateway/publish-promotion.schema.json` 校验。
5. operating-example corpus 文档显式保持 illustrative、non-governing、non-executing。
6. governance / audit 与 publish / promotion 文档都把该 corpus 指向为 canonical 的独立 machine-readable example surface。
7. contract hub、public-surface index 与 acceptance surface 都把该 corpus 暴露为 supporting surface，而不是 runtime。
8. examples 继续把 review、publish 与 promotion truth 留在 domain 内部，并把任何 follow-on action 保持在 `domain_gateway` 之后。
9. 该 corpus 不授权 `OPL` 直接执行 publish、release、export、submission 或 public posting。

### 验证方式

- 使用 `json.load` 解析六个 operating-example JSON 文件。
- 用 `governance-audit.schema.json` 校验三个 governance 侧 example，用 `publish-promotion.schema.json` 校验三个 publish 侧 example。
- 检查 `docs/opl-operating-example-corpus.md` 与 `.zh-CN.md` 中的 illustrative / non-governing / non-executing wording。
- 确认 governance / audit 文档、publish / promotion 文档、contract README、public-surface index 与 acceptance spec 都在应有位置链接到该 corpus。

## 标准验证命令

```bash
git diff --check
python3 - <<'PY'
import json
from pathlib import Path
for path in sorted(list(Path('contracts/opl-gateway').glob('*.json')) + list(Path('examples/opl-gateway').glob('*.json'))):
    json.load(path.open())
    print('OK', path)
PY
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker, RefResolver

contracts = Path('contracts/opl-gateway')
routed_schema_path = contracts / 'routed-actions.schema.json'
handoff_schema_path = contracts / 'handoff.schema.json'
gov_schema_path = contracts / 'governance-audit.schema.json'
pub_schema_path = contracts / 'publish-promotion.schema.json'

routed_schema = json.loads(routed_schema_path.read_text())
handoff_schema = json.loads(handoff_schema_path.read_text())
gov_schema = json.loads(gov_schema_path.read_text())
pub_schema = json.loads(pub_schema_path.read_text())

store = {
    routed_schema['$id']: routed_schema,
    handoff_schema['$id']: handoff_schema,
    str(handoff_schema_path.resolve().as_uri()): handoff_schema,
    './handoff.schema.json': handoff_schema,
    'handoff.schema.json': handoff_schema,
}
resolver = RefResolver.from_schema(routed_schema, store=store)

routed = Draft202012Validator(
    routed_schema,
    resolver=resolver,
    format_checker=FormatChecker(),
)
gov = Draft202012Validator(gov_schema, format_checker=FormatChecker())
pub = Draft202012Validator(pub_schema, format_checker=FormatChecker())

for rel in [
    'examples/opl-gateway/research-ops-submission.json',
    'examples/opl-gateway/presentation-ops-publish.json',
    'examples/opl-gateway/ambiguous-task-routing.json',
    'examples/opl-gateway/unknown-domain-routing.json',
    'examples/opl-gateway/refusal-routing.json',
]:
    data = json.loads(Path(rel).read_text())
    routed.validate(data['route_request'])
    routed.validate(data['audit_routing_decision'])
    if 'build_handoff_payload' in data:
        routed.validate(data['build_handoff_payload'])
    gov.validate(data['governance_audit_record'])
    if 'publish_promotion_record' in data:
        pub.validate(data['publish_promotion_record'])
    print('examples schema OK', rel)

for rel in [
    'examples/opl-gateway/governance-decision-record.json',
    'examples/opl-gateway/cross-domain-review-index.json',
    'examples/opl-gateway/publish-readiness-signal.json',
]:
    gov.validate(json.loads(Path(rel).read_text()))
    print('governance example OK', rel)

for rel in [
    'examples/opl-gateway/publish-outcome-index.json',
    'examples/opl-gateway/promotion-candidate-signal.json',
    'examples/opl-gateway/promotion-surface-index.json',
]:
    pub.validate(json.loads(Path(rel).read_text()))
    print('publish example OK', rel)
PY
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

schema = json.loads(Path('contracts/opl-gateway/domain-onboarding-readiness.schema.json').read_text())
Draft202012Validator.check_schema(schema)
example = json.loads(Path('examples/opl-gateway/domain-onboarding-readiness.json').read_text())
Draft202012Validator(schema, format_checker=FormatChecker()).validate(example)
print('onboarding readiness schema OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())
category_ids = {category['category_id'] for category in idx['surface_categories']}
surface_ids = [surface['surface_id'] for surface in idx['surfaces']]
surface_id_set = set(surface_ids)
assert len(surface_ids) == len(surface_id_set), 'duplicate surface_id'
for surface in idx['surfaces']:
    assert surface['category_id'] in category_ids
    for ref in surface['refs']:
        if ref['ref_kind'] == 'repo_path':
            assert Path(ref['ref']).exists(), ref
        elif ref['ref_kind'] == 'external_url':
            assert ref['ref'].startswith('https://'), ref
        else:
            raise AssertionError(ref)
    # routes_to 只要求目标在 index 中存在，不依赖声明顺序。
    for target in surface['routes_to']:
        assert target in surface_id_set, (surface['surface_id'], target)
print('public surface index OK')
PY
python3 - <<'PY'
import re
from pathlib import Path
files = [
    Path('README.md'),
    Path('README.zh-CN.md'),
    Path('docs/roadmap.md'),
    Path('docs/roadmap.zh-CN.md'),
    Path('docs/opl-federation-contract.md'),
    Path('docs/opl-federation-contract.zh-CN.md'),
    Path('docs/opl-read-only-discovery-gateway.md'),
    Path('docs/opl-read-only-discovery-gateway.zh-CN.md'),
    Path('docs/opl-routed-action-gateway.md'),
    Path('docs/opl-routed-action-gateway.zh-CN.md'),
    Path('docs/opl-domain-onboarding-contract.md'),
    Path('docs/opl-domain-onboarding-contract.zh-CN.md'),
    Path('docs/opl-governance-audit-operating-surface.md'),
    Path('docs/opl-governance-audit-operating-surface.zh-CN.md'),
    Path('docs/opl-publish-promotion-operating-surface.md'),
    Path('docs/opl-publish-promotion-operating-surface.zh-CN.md'),
    Path('docs/opl-gateway-example-corpus.md'),
    Path('docs/opl-gateway-example-corpus.zh-CN.md'),
    Path('docs/opl-routed-safety-example-corpus.md'),
    Path('docs/opl-routed-safety-example-corpus.zh-CN.md'),
    Path('docs/opl-operating-example-corpus.md'),
    Path('docs/opl-operating-example-corpus.zh-CN.md'),
    Path('docs/opl-public-surface-index.md'),
    Path('docs/opl-public-surface-index.zh-CN.md'),
    Path('docs/opl-gateway-acceptance-test-spec.md'),
    Path('docs/opl-gateway-acceptance-test-spec.zh-CN.md'),
    Path('contracts/opl-gateway/README.md'),
    Path('contracts/opl-gateway/README.zh-CN.md'),
]
link_re = re.compile(r'\[[^\]]+\]\(([^)]+)\)')
for path in files:
    text = path.read_text()
    for raw in link_re.findall(text):
        if raw.startswith(('http://', 'https://', 'mailto:', '#')):
            continue
        target = (path.parent / raw.split('#', 1)[0]).resolve()
        if not target.exists():
            raise SystemExit(f'missing link: {path} -> {raw}')
print('links OK')
PY
rg -n "top-level blueprint only|不是统一运行时入口|本仓库本身不承担运行时角色"           README.md README.zh-CN.md           docs/gateway-federation.md docs/gateway-federation.zh-CN.md           docs/opl-federation-contract.md docs/opl-federation-contract.zh-CN.md           docs/opl-read-only-discovery-gateway.md docs/opl-read-only-discovery-gateway.zh-CN.md           docs/opl-routed-action-gateway.md docs/opl-routed-action-gateway.zh-CN.md           docs/opl-domain-onboarding-contract.md docs/opl-domain-onboarding-contract.zh-CN.md           docs/opl-governance-audit-operating-surface.md docs/opl-governance-audit-operating-surface.zh-CN.md           docs/opl-publish-promotion-operating-surface.md docs/opl-publish-promotion-operating-surface.zh-CN.md           docs/opl-gateway-example-corpus.md docs/opl-gateway-example-corpus.zh-CN.md           docs/opl-routed-safety-example-corpus.md docs/opl-routed-safety-example-corpus.zh-CN.md           docs/opl-operating-example-corpus.md docs/opl-operating-example-corpus.zh-CN.md           docs/opl-public-surface-index.md docs/opl-public-surface-index.zh-CN.md           docs/opl-gateway-rollout.md docs/opl-gateway-rollout.zh-CN.md           docs/roadmap.md docs/roadmap.zh-CN.md           contracts/opl-gateway/README.md contracts/opl-gateway/README.zh-CN.md
```

## 完成定义

只有在下面这些条件都成立时，当前 OPL gateway 文档/合同体系才算 acceptance-green：

- A-K 十一部分全部通过
- 关联的机器可读合同存在且有效
- discovery 与 routing 文档仍然禁止 direct harness bypass
- governance / audit 仍然保持 index-only
- publish / promotion 仍然保持 index-only，且只在 post-publish 阶段生效
- example corpus 仍然保持 illustrative 且 schema-aligned
- routed-safety corpus 仍然保持 illustrative，且在应当 unresolved 的地方显式 unresolved
- operating example corpus 仍然保持 illustrative，且直接通过 schema 校验
- public surface index 仍然保持 discoverability-only
- domain onboarding 仍然是 boundary-first
- cross-domain wording 保持稳定

只要其中任何一条不成立，这套体系就还没有达到 post-P12 discoverability surface 的 acceptance-green 状态。
