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
  'python/opl_framework',
  'python/tests',
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
});

test('Agent Lab and observability eval surfaces stay refs-only and non-authoritative', () => {
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

  const workbenchSource = [
    'src/modules/foundry-lab/agent-lab-complete.ts',
    'src/modules/foundry-lab/agent-lab-complete-control-plane.ts',
  ]
    .map((relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'))
    .join('\n');
  assert.match(workbenchSource, /observability_export_readiness:\s*\{[\s\S]{0,240}upload_external_service: false,[\s\S]{0,80}reads_domain_body: false,/);
  assert.match(workbenchSource, /online_learning_refs:\s*\{[\s\S]{0,240}can_train_or_deploy_model_weights: false,[\s\S]{0,80}can_promote_default_agent_without_gate: false,/);
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
