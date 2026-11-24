import { assert, fs, os, path, test } from '../../helpers.ts';
import { loadSourceClosureEffectContract } from '../../../../../src/authority/workspace/standard-agent-source-closure/analysis.ts';

import {
  buildRepo,
  digest,
  installAudit,
  installTypescriptEntry,
  runSourceClosure,
  writeJson,
  writeSource,
} from './source-repo-fixture.ts';

export function registerMinimalAuthorityEffects() {
  test('agents source-closure routes process and network effects out of minimal authority functions', () => {
    const repoDir = buildRepo();
    const source = [
      "import fs from 'node:fs';",
      "import { spawnSync } from 'node:child_process';",
      'function save_session(_id: string) { return true; }',
      'export function main() {',
      "  fs.writeFileSync('state.json', '{}');",
      "  spawnSync('pandoc', ['input.md']);",
      "  spawnSync('codex', ['exec']);",
      "  void fetch('https://example.invalid');",
      "  return save_session('session-1');",
      '}',
      'main();',
      '',
    ].join('\n');
    installTypescriptEntry(repoDir, source);
    installAudit(repoDir, [{
      file: 'src/cli.ts',
      symbol: 'main',
      source_digest: digest(source),
      allowed_effects: [
        'filesystem_write',
        'process_spawn',
        'executor_invoke',
        'network_access',
        'runtime_state_mutation',
      ],
      role: 'minimal_authority_function',
      allowed_targets: ['state.json', 'pandoc', 'codex', 'https://example.invalid'],
    }]);

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'blocked');
    assert.equal(
      report.audit_mismatches.some((item: { mismatch_kind: string; effect_kind: string }) =>
        item.mismatch_kind === 'audit_role_effect_forbidden' && item.effect_kind === 'executor_invoke'
      ),
      true,
    );
    assert.equal(
      report.audit_mismatches.some((item: { mismatch_kind: string; effect_kind: string }) =>
        item.mismatch_kind === 'audit_role_effect_forbidden' && item.effect_kind === 'process_spawn'
      ),
      true,
    );
    assert.equal(
      report.audit_mismatches.some((item: { mismatch_kind: string; effect_kind: string }) =>
        item.mismatch_kind === 'audit_role_effect_forbidden' && item.effect_kind === 'network_access'
      ),
      true,
    );
    assert.equal(
      report.audit_mismatches.some((item: { mismatch_kind: string; effect_kind: string }) =>
        item.mismatch_kind === 'audit_role_effect_forbidden' && item.effect_kind === 'runtime_state_mutation'
      ),
      true,
    );
  });

}

export function registerAuditDigest() {
  test('agents source-closure binds exact audit to source digest and detects drift', () => {
    const repoDir = buildRepo();
    const source = [
      "import fs from 'node:fs';",
      "export function main() { fs.writeFileSync('artifact.json', '{}'); }",
      'main();',
      '',
    ].join('\n');
    installTypescriptEntry(repoDir, source);
    installAudit(repoDir, [{
      file: 'src/cli.ts',
      symbol: 'main',
      source_digest: digest(source),
      allowed_effects: ['filesystem_write'],
      role: 'minimal_authority_function',
      allowed_targets: ['artifact.json'],
    }]);

    assert.equal(runSourceClosure(repoDir).reports[0].status, 'passed');

    writeSource(repoDir, 'src/cli.ts', `${source}\n// digest drift\n`);
    const drifted = runSourceClosure(repoDir).reports[0];
    assert.equal(drifted.status, 'blocked');
    assert.equal(
      drifted.audit_mismatches.some((item: { mismatch_kind: string }) => item.mismatch_kind === 'audit_digest_mismatch'),
      true,
    );
  });

}

export function registerDomainNativeHelperRole() {
  test('agents source-closure publishes a filesystem-only false-authority domain native helper role', () => {
    const contract = loadSourceClosureEffectContract();
    const policy = contract.audit_contract.domain_native_helper_policy;

    assert.equal(contract.audit_contract.allowed_roles.includes('domain_native_helper'), true);
    assert.deepEqual(policy.allowed_effects, ['filesystem_write']);
    assert.equal(policy.can_exclude_unresolved_edges, false);
    assert.deepEqual(policy.required_effect_owner_routes, {
      process_spawn: ['native_helper_carrier', 'opl_runway'],
      network_access: ['opl_connect'],
    });
    assert.equal(Object.values(policy.authority_boundary).every((value) => value === false), true);
  });

}

export function registerDomainNativeHelperReachability() {
  test('agents source-closure admits exact reachable and unreachable domain native helper writes and detects drift', () => {
    const repoDir = buildRepo();
    const cliSource = "import { writeArtifact } from './helper.ts';\nexport function main() { writeArtifact(); }\nmain();\n";
    const helperSource = "import fs from 'node:fs';\nexport function writeArtifact() { fs.writeFileSync('artifact.json', '{}'); }\n";
    const offlineHelperSource = "import fs from 'node:fs';\nexport function writeOfflineArtifact() { fs.writeFileSync('offline.json', '{}'); }\n";
    installTypescriptEntry(repoDir, cliSource);
    writeSource(repoDir, 'src/helper.ts', helperSource);
    writeSource(repoDir, 'src/offline-helper.ts', offlineHelperSource);
    installAudit(repoDir, [
      {
        file: 'src/helper.ts',
        symbol: 'writeArtifact',
        source_digest: digest(helperSource),
        allowed_effects: ['filesystem_write'],
        role: 'domain_native_helper',
        allowed_targets: ['artifact.json'],
      },
      {
        file: 'src/offline-helper.ts',
        symbol: 'writeOfflineArtifact',
        source_digest: digest(offlineHelperSource),
        allowed_effects: ['filesystem_write'],
        role: 'domain_native_helper',
        allowed_targets: ['offline.json'],
      },
    ]);

    const admitted = runSourceClosure(repoDir).reports[0];
    assert.equal(admitted.status, 'passed');
    assert.deepEqual(
      admitted.observed_effects.map((effect: { audit_status: string; reachable: boolean }) => ({
        audit_status: effect.audit_status,
        reachable: effect.reachable,
      })),
      [
        { audit_status: 'domain_native_helper_exact', reachable: true },
        { audit_status: 'domain_native_helper_exact', reachable: false },
      ],
    );
    assert.equal(admitted.observed_effects.every(
      (effect: { private_generic_effect: boolean }) => effect.private_generic_effect === false,
    ), true);
    assert.deepEqual(admitted.unreachable_sensitive_residue, []);

    writeSource(repoDir, 'src/offline-helper.ts', `${offlineHelperSource}\n// digest drift\n`);
    const drifted = runSourceClosure(repoDir).reports[0];
    assert.equal(drifted.status, 'blocked');
    assert.equal(drifted.audit_mismatches.some(
      (item: { mismatch_kind: string; file: string }) => (
        item.mismatch_kind === 'audit_digest_mismatch' && item.file === 'src/offline-helper.ts'
      ),
    ), true);
  });

}

export function registerDomainNativeHelperGenericEffects() {
  test('agents source-closure rejects generic runtime effects from domain native helpers', () => {
    const repoDir = buildRepo();
    const source = [
      "import { spawnSync } from 'node:child_process';",
      'export function main(db: { execute: (sql: string) => void }, runtime: { recordSession: () => void }) {',
      "  spawnSync('pandoc');",
      "  spawnSync('codex');",
      "  fetch('https://example.invalid');",
      "  db.execute('INSERT INTO records VALUES (1)');",
      '  runtime.recordSession();',
      '}',
      'main({ execute() {} }, { recordSession() {} });',
      '',
    ].join('\n');
    installTypescriptEntry(repoDir, source);
    installAudit(repoDir, [{
      file: 'src/cli.ts',
      symbol: 'main',
      source_digest: digest(source),
      allowed_effects: [
        'process_spawn',
        'executor_invoke',
        'network_access',
        'database_write',
        'runtime_state_mutation',
      ],
      role: 'domain_native_helper',
      allowed_targets: ['pandoc', 'codex', 'https://example.invalid'],
    }]);

    const report = runSourceClosure(repoDir).reports[0];
    const forbiddenKinds = report.audit_mismatches
      .filter((item: { mismatch_kind: string }) => item.mismatch_kind === 'audit_role_effect_forbidden')
      .map((item: { effect_kind: string }) => item.effect_kind);

    assert.equal(report.status, 'blocked');
    const forbiddenEffectKinds = [
      'process_spawn', 'executor_invoke', 'network_access', 'database_write', 'runtime_state_mutation',
    ];
    assert.deepEqual(new Set(forbiddenKinds), new Set(forbiddenEffectKinds));
    assert.deepEqual(
      new Set(report.observed_effects.map((effect: { effect_kind: string }) => effect.effect_kind)),
      new Set(forbiddenEffectKinds),
    );
    assert.equal(report.observed_effects.every(
      (effect: { audit_status: string; private_generic_effect: boolean }) => (
        effect.audit_status === 'unapproved' && effect.private_generic_effect
      ),
    ), true);
  });

}

export function registerDomainNativeHelperDynamicEdges() {
  test('agents source-closure does not let domain native helpers exclude dynamic edges', () => {
    const repoDir = buildRepo();
    installTypescriptEntry(repoDir, "export function main() { return 'ok'; }\nmain();\n");
    const source = [
      "import fs from 'node:fs';",
      'export async function writeArtifact(moduleName: string) {',
      "  fs.writeFileSync('artifact.json', '{}');",
      '  return import(moduleName);',
      '}',
      '',
    ].join('\n');
    writeSource(repoDir, 'src/helper.ts', source);
    installAudit(repoDir, [{
      file: 'src/helper.ts',
      symbol: 'writeArtifact',
      source_digest: digest(source),
      allowed_effects: ['filesystem_write'],
      allowed_unresolved_edge_reasons: ['dynamic_import'],
      role: 'domain_native_helper',
      allowed_targets: ['artifact.json'],
    }]);

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'blocked');
    assert.equal(report.excluded_developer_tool_edges.length, 0);
    assert.equal(report.unresolved_edges.some(
      (edge: { reason: string }) => edge.reason === 'dynamic_import',
    ), true);
    assert.equal(report.audit_mismatches.some(
      (item: { mismatch_kind: string }) => item.mismatch_kind === 'audit_role_edge_exclusion_forbidden',
    ), true);
  });

}

export function registerAuditLiteralTargets() {
  test('agents source-closure requires literal targets and rejects glob or directory audits', () => {
    const repoDir = buildRepo();
    const source = [
      "import { spawnSync } from 'node:child_process';",
      "export function main() { return spawnSync('pdftotext', ['in.pdf', 'out.txt']); }",
      'main();',
      '',
    ].join('\n');
    installTypescriptEntry(repoDir, source);
    installAudit(repoDir, [{
      file: 'src/cli.ts',
      symbol: 'main',
      source_digest: digest(source),
      allowed_effects: ['process_spawn'],
      role: 'developer_tool',
      allowed_targets: [],
    }]);
    const noTarget = runSourceClosure(repoDir).reports[0];
    assert.equal(noTarget.status, 'blocked');
    assert.equal(
      noTarget.audit_mismatches.some((item: { mismatch_kind: string }) => item.mismatch_kind === 'effect_target_not_allowed'),
      true,
    );

    installAudit(repoDir, ['src/*.ts', 'src/'].map((file) => ({
      file,
      symbol: 'main',
      source_digest: digest(source),
      allowed_effects: ['process_spawn'],
      role: 'developer_tool',
      allowed_targets: ['pdftotext'],
    })));
    const broadPath = runSourceClosure(repoDir).reports[0];
    assert.equal(broadPath.status, 'blocked');
    assert.equal(
      broadPath.audit_mismatches.filter((item: { mismatch_kind: string }) =>
        item.mismatch_kind === 'audit_path_not_exact'
      ).length,
      2,
    );
  });

}

export function registerDeveloperToolEdges() {
  test('agents source-closure excludes exact unreachable developer tool edges but not registered ones', () => {
    const repoDir = buildRepo();
    const cliSource = "export function main() { return 'ok'; }\nmain();\n";
    const toolSource = [
      'export async function load(name: string) {',
      '  return import(name);',
      '}',
      'void load(process.argv[2]);',
      '',
    ].join('\n');
    installTypescriptEntry(repoDir, cliSource);
    writeSource(repoDir, 'scripts/dev.ts', toolSource);
    installAudit(repoDir, [{
      file: 'scripts/dev.ts',
      symbol: 'load',
      source_digest: digest(toolSource),
      allowed_effects: [],
      allowed_unresolved_edge_reasons: ['dynamic_import'],
      role: 'developer_tool',
      allowed_targets: [],
    }]);

    const excluded = runSourceClosure(repoDir).reports[0];
    assert.equal(excluded.status, 'passed');
    assert.equal(excluded.excluded_developer_tool_edges.length, 1);

    const packageJsonPath = path.join(repoDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.bin['sample-dev'] = './scripts/dev.ts';
    writeJson(packageJsonPath, packageJson);
    const registered = runSourceClosure(repoDir).reports[0];
    assert.equal(registered.status, 'blocked');
    assert.equal(registered.unresolved_edges.some((edge: { reason: string }) => edge.reason === 'dynamic_import'), true);
  });

}

export function registerUnreachableSensitiveResidue() {
  test('agents source-closure reports unreachable sensitive residue', () => {
    const repoDir = buildRepo();
    installTypescriptEntry(repoDir, "export function main() { return 'ok'; }\nmain();\n");
    writeSource(repoDir, 'src/legacy.ts', [
      "import fs from 'node:fs';",
      "export function persistQueue() { fs.writeFileSync('queue.json', '{}'); }",
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'blocked');
    assert.equal(report.unreachable_sensitive_residue.length, 1);
    assert.equal(report.unreachable_sensitive_residue[0].file, 'src/legacy.ts');
  });

}

export function registerNativeHelperSlots() {
  test('agents source-closure admits exact native-helper command and artifact slots without executor authority', () => {
    const repoDir = buildRepo();
    const source = [
      'import subprocess',
      'from pathlib import Path',
      'def main(command):',
      '    subprocess.run(command, check=True)',
      '    Path("proof.pdf").write_text("proof")',
      '    return {"status": "candidate"}',
      'main(["pandoc"])',
      '',
    ].join('\n');
    writeSource(repoDir, 'runtime/native_helpers/helper.py', source);
    writeJson(path.join(repoDir, 'runtime', 'native_helpers', 'helper.native-helper-probe.json'), {
      surface_kind: 'opl_pack_native_helper_probe_descriptor',
      schema_version: 1,
      helper_id: 'sample.pdf-export',
      owner: 'sample-agent',
      entrypoint_ref: 'helper.py',
      runtime_command: 'python3',
      required_commands: ['pandoc'],
      source_closure: {
        surface_kind: 'opl_native_helper_source_closure',
        version: 'opl-native-helper-source-closure.v1',
        effect_slots: [
          {
            slot_id: 'pandoc_process',
            source_ref: 'helper.py',
            symbol: 'main',
            source_digest: digest(source),
            effect_kind: 'process_spawn',
            target_policy: 'declared_command_set',
            allowed_targets: ['pandoc'],
          },
          {
            slot_id: 'proof_artifact_write',
            source_ref: 'helper.py',
            symbol: 'main',
            source_digest: digest(source),
            effect_kind: 'filesystem_write',
            target_policy: 'declared_artifact_write_slot',
            allowed_targets: [],
          },
        ],
      },
      authority_boundary: {
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_readiness: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    });

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.equal(report.entrypoints[0].source_kind, 'native_helper_descriptor');
    assert.equal(report.observed_effects.length, 2);
    assert.equal(
      report.observed_effects.every((effect: { audit_status: string }) =>
        effect.audit_status === 'native_helper_carrier_exact'
      ),
      true,
    );
    assert.equal(
      report.observed_effects.some((effect: { effect_kind: string }) => effect.effect_kind === 'executor_invoke'),
      false,
    );
  });

}

export function registerNativeHelperLocalImports() {
  test('agents source-closure resolves descriptor-local native-helper imports', () => {
    const repoDir = buildRepo();
    const entrypoint = [
      'from helper_parts.effects import render',
      'def main():',
      '    return render()',
      'main()',
      '',
    ].join('\n');
    const effects = [
      'import subprocess',
      'from pathlib import Path',
      'def render():',
      '    subprocess.run(["pandoc"], check=True)',
      '    Path("proof.pdf").write_text("proof")',
      '    return {"status": "candidate"}',
      '',
    ].join('\n');
    writeSource(repoDir, 'runtime/native_helpers/helper.py', entrypoint);
    writeSource(repoDir, 'runtime/native_helpers/helper_parts/__init__.py', '');
    writeSource(repoDir, 'runtime/native_helpers/helper_parts/effects.py', effects);
    writeJson(path.join(repoDir, 'runtime', 'native_helpers', 'helper.native-helper-probe.json'), {
      surface_kind: 'opl_pack_native_helper_probe_descriptor',
      schema_version: 1,
      helper_id: 'sample.pdf-export',
      owner: 'sample-agent',
      entrypoint_ref: 'helper.py',
      runtime_command: 'python3',
      required_commands: ['pandoc'],
      source_closure: {
        surface_kind: 'opl_native_helper_source_closure',
        version: 'opl-native-helper-source-closure.v1',
        effect_slots: [
          {
            slot_id: 'pandoc_process',
            source_ref: 'helper_parts/effects.py',
            symbol: 'render',
            source_digest: digest(effects),
            effect_kind: 'process_spawn',
            target_policy: 'declared_command_set',
            allowed_targets: ['pandoc'],
          },
          {
            slot_id: 'proof_artifact_write',
            source_ref: 'helper_parts/effects.py',
            symbol: 'render',
            source_digest: digest(effects),
            effect_kind: 'filesystem_write',
            target_policy: 'declared_artifact_write_slot',
            allowed_targets: [],
          },
        ],
      },
      authority_boundary: {
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_readiness: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    });

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.equal(report.audit_mismatches.length, 0);
    assert.equal(report.unreachable_sensitive_residue.length, 0);
    assert.equal(
      report.observed_effects.every((effect: { audit_status: string }) =>
        effect.audit_status === 'native_helper_carrier_exact'
      ),
      true,
    );
  });

}

export function registerExecutorInvocationClassification() {
  test('agents source-closure only classifies codex or opl commands on process APIs as executor invocation', () => {
    const repoDir = buildRepo();
    const source = [
      "import { spawnSync } from 'node:child_process';",
      'function label(value: string) { return value; }',
      'export function main() {',
      "  label('opl');",
      "  spawnSync('codex', ['exec']);",
      '}',
      'main();',
      '',
    ].join('\n');
    installTypescriptEntry(repoDir, source);

    const report = runSourceClosure(repoDir).reports[0];
    const executorEffects = report.observed_effects.filter(
      (effect: { effect_kind: string }) => effect.effect_kind === 'executor_invoke',
    );

    assert.equal(report.status, 'blocked');
    assert.equal(executorEffects.length, 1);
    assert.equal(executorEffects[0].target, 'codex');
  });
}
