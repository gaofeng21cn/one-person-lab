import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const scannedRoots = [
  'src',
  'contracts',
  'examples',
  'tests/src',
  'tests/fixtures/family-manifests',
  'python/opl-harness-shared/src',
  'python/opl-harness-shared/tests',
];

const textFileExtensions = new Set([
  '.json',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.ts',
]);

function* walk(relativeRoot: string): Generator<string> {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      yield* walk(relativePath);
      continue;
    }
    if (entry.isFile() && textFileExtensions.has(path.extname(entry.name))) {
      yield relativePath;
    }
  }
}

function scannedTextFiles(roots: string[]) {
  return roots.flatMap((relativeRoot) => [...walk(relativeRoot)]);
}

test('active OPL machine surfaces do not declare compatibility aliases as live', () => {
  const violations: string[] = [];
  const forbiddenLiveAliasClaims = [
    /\bcompatibility_alias(?:es)?_allowed\b\s*[:=]\s*true/i,
    /\bclaims_compatibility_alias_owner\b\s*[:=]\s*true/i,
    /\bcompatibility_alias_owner\b\s*[:=]\s*true/i,
    /\blegacy_alias(?:es)?_allowed\b\s*[:=]\s*true/i,
    /\b(?:default|active|live|normal)[_-]?(?:compatibility|legacy)[_-]?alias(?:es)?\b/i,
    /\b(?:compatibility|legacy)[_-]?alias(?:es)?[_-]?(?:default|active|live|normal)\b/i,
  ];

  for (const relativePath of scannedTextFiles(scannedRoots)) {
    const lines = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of forbiddenLiveAliasClaims) {
        if (pattern.test(line)) {
          violations.push(`${relativePath}:${index + 1}: ${pattern}`);
        }
      }
    });
  }

  assert.deepEqual(violations, []);
});

test('active OPL MAS command surfaces do not resurrect retired progress-projection public command', () => {
  const scannedFiles = [
    ...scannedTextFiles(['src']),
    'tests/fixtures/family-manifests/med-autoscience-product-entry-manifest.json',
  ];
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const lines = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\bstudy progress-projection\b/.test(line)) {
        violations.push(`${relativePath}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(violations, []);
});

test('active machine surfaces keep Hermes as executor-only, never provider compatibility', () => {
  const scannedFiles = scannedTextFiles([
    'src',
    'contracts',
    'tests/fixtures/family-manifests',
  ]);
  const forbiddenPatterns = [
    /\bhermes[_-]?(?:runtime|online|provider|gateway)[_-]?(?:compat|alias|fallback)\b/i,
    /\b(?:compat|alias|fallback)[_-]?hermes[_-]?(?:provider|runtime|online)\b/i,
    /\bhermes[_-]?provider[_-]?(?:ready|readiness|surface|path)\b/i,
  ];
  const allowedPatterns = [
    /hermes_agent/i,
    /hermes-agent/i,
    /hermes_agent_not_provider_or_gateway_surface/i,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (allowedPatterns.some((pattern) => pattern.test(line))) {
        return;
      }
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          violations.push(`${relativePath}:${index + 1}: ${pattern}`);
        }
      }
    });
  }

  assert.deepEqual(violations, []);
});

test('operating governance references do not claim retired surface matrix contracts are active', () => {
  const scannedFiles = [
    'docs/docs_portfolio_consolidation.md',
    'docs/references/README.md',
    'docs/history/compatibility/gateway-federation/examples-corpora/opl-gateway-example-corpus.md',
    'docs/references/operating-governance/README.md',
    'docs/history/compatibility/gateway-federation/operating-governance/opl-surface-authority-matrix.md',
    'docs/history/compatibility/gateway-federation/operating-governance/opl-surface-lifecycle-map.md',
    'docs/history/compatibility/gateway-federation/operating-governance/opl-surface-review-matrix.md',
  ];

  const forbiddenPatterns = [
    /Machine-Readable Artifact/,
    /## 机器可读工件/,
    /paired machine-readable artifacts/i,
    /machine artifacts still cover/i,
    /machine-readable compatibility artifact/i,
    /derived JSON artifact/i,
    /配套机器可读工件/,
    /配套 derived JSON 工件/,
    /retained compatibility contracts/i,
    /保留兼容合同/,
    /\]\(\.\.\/\.\.\/\.\.\/contracts\/opl-framework\/surface-(?:authority|lifecycle|review)-matrix\.json\)/,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('human docs do not retire the canonical hermes_agent executor adapter', () => {
  const scannedFiles = [
    'docs/docs_portfolio_consolidation.md',
    'docs/references/README.md',
    'docs/references/runtime-substrate/family-executor-adapter-defaults.md',
    'docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md',
    'docs/references/runtime-substrate/hermes-agent-executor-evaluation.md',
    'docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md',
    'docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md',
    'docs/references/convergence-governance/opl-positioning-convergence-lessons.md',
    'docs/public/roadmap.md',
    'docs/project.md',
    'docs/architecture.md',
    'docs/decisions.md',
    'docs/status.md',
  ];

  const forbiddenPatterns = [
    /`hermes_agent`[^.\n;；]{0,80}(?:is|=|为|是)?[^.\n;；]{0,40}(?:unsupported|not supported|retired|不可选|不支持|已退役)/i,
    /(?:unsupported|not supported|retired|不可选|不支持|已退役)[^.\n;；]{0,80}`hermes_agent`/i,
    /(?:canonical|allowed)[^\n]*(?:codex_cli\s*(?:\||,|and|和)\s*claude_code)[^\n]*(?:only|仅|只有)/i,
    /Active executor\/proof routes,\s*\n\s*provider-bridge interfaces[\s\S]{0,120}retired/i,
    /Hermes-Agent[^\n]*(?:retained only|only retained|只作为|只保留)[^\n]*(?:migration|proof|迁移)/i,
    /Hermes-Agent[^\n]*(?:retained only|only retained|只作为|只保留)[^\n]*(?:historical provenance|diagnostic vocabulary|negative guard|历史 provenance|诊断语料|负向 guard)/i,
    /Hermes[：:][^\n]*(?:外部 )?runtime substrate owner/i,
    /Hermes-Agent[^\n]*(?:是|as|=)[^\n]*(?:外部 )?runtime substrate(?:\s|$|[，。；,;])/i,
    /Hermes-Agent[^\n]*(?:是|as|=)[^\n]*online-management gateway owner/i,
    /^(?!.*(?:历史|historical|history|当时|设想|supersede))[^。\n]*Hermes-Agent[^\n]*(?:持有|owns|负责)[^\n]*长期在线 runtime orchestration/i,
    /长跑和 online-management 由外部 `Hermes-Agent` substrate 管/,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('core executor surfaces keep hermes_agent in the canonical explicit non-default backend set', () => {
  const contract = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/family-executor-adapter-defaults.json'),
    'utf8',
  )) as {
    canonical_executor_backends?: string[];
    executor_registry?: { non_default_equivalence?: string };
    guardrails?: Record<string, unknown>;
  };

  assert.deepEqual(contract.canonical_executor_backends, ['codex_cli', 'hermes_agent', 'claude_code', 'antigravity_cli']);
  assert.equal(contract.executor_registry?.non_default_equivalence, 'connectivity_lifecycle_receipt_audit_only');
  assert.equal(contract.guardrails?.hermes_agent_not_provider_or_gateway_surface, true);

  const requiredDocPatterns: Array<[string, RegExp]> = [
    [
      'docs/status.md',
      /`hermes_agent`、`claude_code` 与 `antigravity_cli` 同属显式非默认 executor adapter\/backend/,
    ],
    [
      'docs/decisions.md',
      /`hermes_agent` 仍可作为显式非默认 executor adapter\/backend.*`antigravity_cli`/s,
    ],
    [
      'docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md',
      /`hermes_agent` 是 canonical 显式非默认 executor adapter\/backend/,
    ],
    [
      'docs/references/runtime-substrate/family-executor-adapter-defaults.md',
      /`canonical_executor_backends = \[codex_cli, hermes_agent, claude_code, antigravity_cli\]`/,
    ],
  ];

  const missing = requiredDocPatterns
    .filter(([relativePath, pattern]) => !pattern.test(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')))
    .map(([relativePath]) => relativePath);

  assert.deepEqual(missing, []);
});

test('Agent Lab and observability eval surfaces stay refs-only and non-authoritative', () => {
  const requiredDocPatterns: Array<[string, RegExp]> = [
    [
      'docs/status.md',
      /OPL 只消费 refs，不写入 body、truth、artifact、owner receipt 或 quality verdict/,
    ],
    [
      'docs/architecture.md',
      /OPL Agent Lab 属于 Framework 内部 eval \/ improvement control plane[\s\S]{0,220}不接管 MAS\/MAG\/RCA 的 domain truth、quality verdict、artifact authority、memory body 或 owner receipt authority/,
    ],
    [
      'docs/invariants.md',
      /巡检必须通过 OPL Agent Lab 或等价 refs-only control plane[\s\S]{0,160}不得静默写 domain truth、artifact、memory body、quality verdict 或 managed runtime/,
    ],
    [
      'docs/runtime/opl-agent-lab-control-plane.md',
      /不是 MAS\/MAG\/RCA 之上的质量裁判/,
    ],
    [
      'docs/runtime/opl-agent-lab-control-plane.md',
      /不能把 provider completion、harness pass、descriptor aligned、agent-lab score 或 OPL operator judgment 写成 domain ready verdict/,
    ],
    [
      'docs/runtime/opl-agent-lab-control-plane.md',
      /App 不能把这些 refs 升级成 domain quality verdict、artifact readiness、memory apply 或高风险 default agent promotion/,
    ],
  ];

  const missingDocs = requiredDocPatterns
    .filter(([relativePath, pattern]) => !pattern.test(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')))
    .map(([relativePath]) => relativePath);

  assert.deepEqual(missingDocs, []);

  const authoritySource = fs.readFileSync(path.join(repoRoot, 'src/modules/foundry-lab/agent-lab-authority.ts'), 'utf8');
  for (const flag of [
    'can_write_domain_truth',
    'can_write_memory_body',
    'can_accept_or_reject_memory_writeback',
    'can_authorize_domain_ready',
    'can_authorize_quality_verdict',
    'can_authorize_export_verdict',
    'can_mutate_domain_artifact',
    'can_write_owner_receipt',
    'can_modify_managed_runtime',
    'can_promote_default_agent_without_gate',
  ]) {
    assert.match(authoritySource, new RegExp(`${flag}: false`));
  }

  const workbenchSource = fs.readFileSync(path.join(repoRoot, 'src/modules/foundry-lab/agent-lab-complete.ts'), 'utf8');
  assert.match(workbenchSource, /observability_export_readiness:\s*\{[\s\S]{0,240}upload_external_service: false,[\s\S]{0,80}reads_domain_body: false,/);
  assert.match(workbenchSource, /online_learning_refs:\s*\{[\s\S]{0,240}can_train_or_deploy_model_weights: false,[\s\S]{0,80}can_promote_default_agent_without_gate: false,/);
});

test('examples and admission references do not preserve domain_gateway as an active route', () => {
  const scannedFiles = [
    'docs/history/compatibility/gateway-federation/examples-corpora/opl-operating-example-corpus.md',
    'docs/history/compatibility/gateway-federation/examples-corpora/opl-operating-record-catalog.md',
    'docs/history/compatibility/gateway-federation/examples-corpora/opl-routed-safety-example-corpus.md',
    'docs/references/domain-admission/opl-candidate-domain-backlog.md',
    'docs/history/process/domain-admission/opl-phase2-ecosystem-sync-owner-line.md',
  ];

  const forbiddenPatterns = [
    /still routes through `domain_gateway`/i,
    /routes through `domain_gateway` only/i,
    /keeps? `domain_gateway` as the only follow-on route surface/i,
    /registered domain gateway currently owns/i,
    /domain gateway boundary/i,
    /future `domain_gateway` entry/i,
    /only successful target at `domain_gateway`/i,
    /`domain_gateway` 才是唯一允许的 successful handoff target/,
    /仍然必须 route 到 `domain_gateway`/,
    /仍然必须 route 进 `domain_gateway`/,
    /仍然只能通过 `domain_gateway` 路由/,
    /把 `domain_gateway` 保持为唯一 follow-on route surface/,
    /已注册 domain gateway 正式拥有/,
    /domain gateway 边界/,
    /未来的 `domain_gateway` 入口/,
    /保持 `domain_gateway` 仍是唯一 allowed successful target/,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('examples-corpora references do not link retired example artifacts as active files', () => {
  const scannedFiles = [
    'docs/history/compatibility/gateway-federation/examples-corpora/opl-gateway-example-corpus.md',
    'docs/history/compatibility/gateway-federation/examples-corpora/opl-operating-example-corpus.md',
    'docs/history/compatibility/gateway-federation/examples-corpora/opl-operating-record-catalog.md',
    'docs/history/compatibility/gateway-federation/examples-corpora/opl-routed-safety-example-corpus.md',
  ];

  const forbiddenPatterns = [
    /\]\(\.\.\/\.\.\/\.\.\/examples\/opl-framework\/[^)]+\.json\)/,
    /\]\(\.\.\/\.\.\/examples\/opl-framework\/[^)]+\.json\)/,
    /each example stays machine-readable/i,
    /examples validate directly against the frozen/i,
    /每个 example 都保持 machine-readable/,
    /examples 直接通过 frozen/,
    /## Machine-Readable Artifact/,
    /## 机器可读工件/,
    /## Current Example Set/,
    /## 当前 Example Set/,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('domain admission references do not publish retired candidate backlog contracts', () => {
  const scannedFiles = [
    'docs/references/domain-admission/opl-candidate-domain-backlog.md',
  ];

  const forbiddenPatterns = [
    /\]\(\.\.\/\.\.\/\.\.\/contracts\/opl-framework\/candidate-domain-backlog\.json\)/,
    /## Machine-Readable Artifact/,
    /## 机器可读工件/,
    /formally admitted as independent domain gateways/i,
    /正式收录为独立 domain gateway/,
    /public gateway docs/i,
    /gateway\s*\/\s*harness surface metadata/i,
    /独立的 gateway\s*\/\s*harness surface/,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('convergence governance snapshots do not promote gateway federation wording as current truth', () => {
  const scannedFiles = [
    'docs/history/process/convergence-governance/contract-convergence-v1-execution-board-2026-04-11.md',
    'docs/history/process/convergence-governance/contract-convergence-v1-decision-note-2026-04-08.md',
    'docs/history/process/convergence-governance/ecosystem-status-matrix-2026-04.md',
  ];

  const requiredLifecyclePatterns = [
    /2026-05-14/,
    /stage-led/i,
    /current (?:OPL )?truth|current active truth|当前(?: OPL)? truth|当前读法|当前活跃入口/i,
    /not provide active gateway\/federation compatibility interface|不提供 active gateway\/federation compatibility interface|不得作为.*active compatibility interface|不恢复 gateway\/federation compatibility surface/i,
  ];
  const forbiddenPatterns = [
    /^- `OPL` 是顶层 `Gateway \/ Federation`$/m,
    /^- `OPL` 是顶层 `gateway`、`federation` 与 shared-language 仓。$/m,
    /^  - `OPL` 是顶层 `Gateway \/ Federation`$/m,
    /^\| `one-person-lab` \| 顶层 `Gateway \/ Federation` \|/m,
    /它是顶层 `Gateway` 的 formal entry，不等于 domain runtime owner 入口。/,
    /\| 顶层 gateway 合同与只读入口 \| 中 \|/,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    for (const pattern of requiredLifecyclePatterns) {
      if (!pattern.test(content)) {
        violations.push(`${relativePath}: missing ${pattern}`);
      }
    }
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('retired internal write and fallback helper exports do not return', () => {
  const sourceExpectations: Array<[string, RegExp[]]> = [
    [
      'src/kernel/runtime-modes.ts',
      [
        /\bexport\s+function\s+writeOplRuntimeModes\b/,
        /\bFrameworkContractError\b/,
      ],
    ],
    [
      'src/modules/ledger/current-owner-delta-projection.ts',
      [
        /\bbuildIdleCurrentOwnerDeltaReadModel\b/,
        /\bno_opl_operator_actionable_delta_required\b[\s\S]{0,240}\btyped_blocker_ref\b/,
      ],
    ],
    [
      'src/modules/ledger/current-owner-delta-read-model-cache.ts',
      [
        /\bexport\s+function\s+buildCurrentOwnerDeltaReadModelCachePayload\b/,
      ],
    ],
    [
      'src/modules/runway/family-runtime-temporal-client.ts',
      [
        /\bexport\s+const\s+DEFAULT_TEMPORAL_CLIENT_CONNECT_TIMEOUT_MS\b/,
        /\bexport\s+const\s+DEFAULT_TEMPORAL_CLIENT_RPC_TIMEOUT_MS\b/,
        /\bexport\s+function\s+resolveTemporalClientConnectTimeoutMs\b/,
      ],
    ],
    [
      'src/modules/foundry-lab/default-caller-surface-gates.ts',
      [
        /\bexport\s+const\s+DEFAULT_CALLER_TARGET_KINDS\b/,
      ],
    ],
  ];
  const violations: string[] = [];

  for (const [relativePath, forbiddenPatterns] of sourceExpectations) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
