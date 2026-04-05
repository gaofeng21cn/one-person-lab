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
- 各公开表面之间的 cross-domain wording consistency

## 上位依据

下面这些文档与工件构成此 acceptance spec 的依据：

- [README](../README.zh-CN.md)
- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Gateway 落地路线](./opl-gateway-rollout.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)

## A. G1 Registry Completeness

### 验收标准

只有当下面全部成立时，`G1` 才算通过：

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

只有当下面全部成立时，`G2` 才算通过：

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

只有当下面全部成立时，`G3` 才算通过：

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

只有当下面全部成立时，onboarding gate 才算通过：

1. onboarding contract 要求新 domain 提供完整 `G1` registry material。
2. onboarding contract 要求显式 public documentation surface。
3. onboarding contract 要求显式 truth-ownership declaration。
4. onboarding contract 要求显式 review surface。
5. onboarding contract 定义了正式收录门槛，覆盖：
   - registry complete
   - boundary explicit
   - truth ownership explicit
   - discovery ready
   - routing ready
   - review ready
   - cross-domain wording aligned
6. onboarding contract 显式禁止“先挂名，后补边界”。
7. onboarding contract 显式禁止把未来 domain 写成 `OPL` 内部模块。

### 验证方式

- 检查 `docs/opl-domain-onboarding-contract.md` 与 `.zh-CN.md` 是否覆盖全部 required gate。
- 确认 onboarding gate 建立在 G1/G2/G3 之后，而不是替代它们。
- 确认 onboarding contract 没有把 canonical truth 上收到 `OPL`。

## E. Cross-Domain Wording Consistency

### 验收标准

只有当下面全部成立时，wording-consistency gate 才算通过：

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

### 验证方式

- 阅读 `README.md`、`README.zh-CN.md`、`docs/roadmap*.md` 与相关 gateway 文档。
- 用定向 `rg` 检查废弃 wording 与必需的 domain-role wording。
- 将 OPL 仓库中的公开 wording 与 `med-autoscience`、`redcube-ai`、`gaofeng21cn` 的 README 做交叉核对。

## 标准验证命令

```bash
git diff --check
python3 - <<'PY'
import json
from pathlib import Path
for path in sorted(Path('contracts/opl-gateway').glob('*.json')):
    json.load(path.open())
    print('OK', path)
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
    Path('docs/opl-gateway-acceptance-test-spec.md'),
    Path('docs/opl-gateway-acceptance-test-spec.zh-CN.md'),
]
link_re = re.compile(r'\\[[^\\]]+\\]\\(([^)]+)\\)')
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
rg -n "top-level blueprint only|不是统一运行时入口|本仓库本身不承担运行时角色" \
  README.md README.zh-CN.md \
  docs/gateway-federation.md docs/gateway-federation.zh-CN.md \
  docs/opl-federation-contract.md docs/opl-federation-contract.zh-CN.md \
  docs/opl-read-only-discovery-gateway.md docs/opl-read-only-discovery-gateway.zh-CN.md \
  docs/opl-routed-action-gateway.md docs/opl-routed-action-gateway.zh-CN.md \
  docs/opl-domain-onboarding-contract.md docs/opl-domain-onboarding-contract.zh-CN.md \
  docs/opl-gateway-rollout.md docs/opl-gateway-rollout.zh-CN.md \
  docs/roadmap.md docs/roadmap.zh-CN.md \
  contracts/opl-gateway/README.md contracts/opl-gateway/README.zh-CN.md
```

## 完成定义

只有在下面这些条件都成立时，当前 OPL gateway 文档/合同体系才算 acceptance-green：

- A-E 五部分全部通过
- 关联的机器可读合同存在且有效
- discovery 与 routing 文档仍然禁止 direct harness bypass
- domain onboarding 仍然是 boundary-first
- cross-domain wording 保持稳定

只要其中任何一条不成立，这套体系就还没有冻结到足以支撑下一层 governance / audit / publish surface。
