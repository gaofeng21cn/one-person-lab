import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

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

const forbiddenTerms = [
  ['front', 'door'].join(''),
  ['front', 'desk'].join(''),
  ['product', '-', 'front', 'door'].join(''),
  ['product', '_', 'front', 'door'].join(''),
  ['open', '_', 'front', 'door'].join(''),
  ['open', '_', 'front', 'desk'].join(''),
  ['gateway', '_interaction_contract'].join(''),
  ['front', 'door_owner'].join(''),
  ['natural_language_', 'front', 'door'].join(''),
  ['host', '_agent'].join(''),
  ['hermes_native', '_proof'].join(''),
  ['compatibility', '_aliases'].join(''),
  ['legacy', '_boundary_terms'].join(''),
  ['mcp', '-stdio'].join(''),
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

test('active OPL source, contracts, fixtures, and tests do not reintroduce retired compatibility vocabulary', () => {
  const violations: string[] = [];

  for (const relativePath of scannedTextFiles(scannedRoots)) {
    const lower = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').toLowerCase();
    for (const term of forbiddenTerms) {
      if (lower.includes(term.toLowerCase())) {
        violations.push(`${relativePath}: ${term}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('active machine surfaces do not keep retired Hermes provider or gateway compatibility aliases', () => {
  const scannedFiles = scannedTextFiles([
    'src',
    'contracts',
    'tests/fixtures/family-manifests',
  ]);
  const forbiddenPatterns = [
    /compatibility[_-]?aliases/i,
    /legacy[_-]?aliases/i,
    /hermes[_-]?legacy/i,
    /hermes[_-]?(?:runtime|online|provider|proof|readiness|gateway)[_-]?(?:compat|alias|bridge|fallback|surface|path)?/i,
    /gateway[_-]?(?:compat|alias|bridge|fallback|provider|readiness|surface|path)/i,
    /(?:compat|alias|bridge|fallback)[_-]?(?:gateway|hermes[_-]?provider|hermes[_-]?runtime|hermes[_-]?online)/i,
  ];
  const allowedPatterns = [
    /hermes_agent/i,
    /hermes-agent/i,
    /hermes_agent_not_provider_or_gateway_surface/i,
    /openai_compatible_gateway_backend_forbidden/i,
    /without hermes compatibility diagnostics/i,
    /repair_hermes_legacy_provider/,
    /install_hermes_online_runtime/,
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
  const contract = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/family-executor-adapter-defaults.json'),
    'utf8',
  )) as {
    canonical_executor_backends?: string[];
    executor_registry?: { non_default_equivalence?: string };
    guardrails?: Record<string, unknown>;
  };

  assert.deepEqual(contract.canonical_executor_backends, ['codex_cli', 'hermes_agent', 'claude_code']);
  assert.equal(contract.executor_registry?.non_default_equivalence, 'connectivity_lifecycle_receipt_audit_only');
  assert.equal(contract.guardrails?.hermes_agent_not_provider_or_gateway_surface, true);

  const requiredDocPatterns: Array<[string, RegExp]> = [
    [
      'docs/status.md',
      /`hermes_agent` 与 `claude_code` 同属显式非默认 executor adapter\/backend/,
    ],
    [
      'docs/decisions.md',
      /`hermes_agent` 仍可作为显式非默认 executor adapter\/backend/,
    ],
    [
      'docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md',
      /`hermes_agent` 是 canonical 显式非默认 executor adapter\/backend/,
    ],
    [
      'docs/references/runtime-substrate/family-executor-adapter-defaults.md',
      /`canonical_executor_backends = \[codex_cli, hermes_agent, claude_code\]`/,
    ],
  ];

  const missing = requiredDocPatterns
    .filter(([relativePath, pattern]) => !pattern.test(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')))
    .map(([relativePath]) => relativePath);

  assert.deepEqual(missing, []);
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
    'docs/references/convergence-governance/contract-convergence-v1-execution-board.md',
    'docs/references/convergence-governance/ecosystem-status-matrix.md',
    'docs/references/convergence-governance/contract-convergence-v1-decision-note.md',
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
