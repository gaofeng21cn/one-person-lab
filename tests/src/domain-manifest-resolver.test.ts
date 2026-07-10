import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { WorkspaceBinding } from '../../src/modules/workspace/workspace-registry.ts';
import { resolveBindingManifest } from '../../src/modules/atlas/domain-manifest/resolver.ts';
import { loadFamilyManifestFixtures } from './cli/helpers.ts';

function withEnvVar<T>(name: string, value: string | undefined, run: () => T): T {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-resolver-'));
}

function createBinding(workspacePath: string, manifestCommand: string | null): WorkspaceBinding {
  return {
    binding_id: 'binding-medautoscience',
    project_id: 'medautoscience',
    project: 'med-autoscience',
    workspace_path: workspacePath,
    label: 'MedAutoScience',
    status: 'active',
    direct_entry: {
      command: null,
      manifest_command: manifestCommand,
      url: null,
      workspace_locator: null,
    },
    created_at: '2026-06-14T00:00:00.000Z',
    updated_at: '2026-06-14T00:00:00.000Z',
    archived_at: null,
  };
}

function writeScript(workspacePath: string, name: string, source: string) {
  const scriptPath = path.join(workspacePath, name);
  fs.writeFileSync(scriptPath, source, 'utf8');
  return scriptPath;
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function minimalManifest(targetDomainId = 'med-autoscience') {
  return {
    manifest_kind: 'product_entry_manifest',
    target_domain_id: targetDomainId,
    formal_entry: {
      default: 'direct',
      supported_protocols: ['direct'],
    },
    workspace_locator: {
      surface_kind: 'workspace_locator',
    },
    product_entry_shell: {
      direct: {
        command: 'medautoscience product-status',
      },
    },
    shared_handoff: {
      direct_entry_builder: {
        command: 'medautoscience build-product-entry --entry-mode direct',
        entry_mode: 'direct',
      },
    },
    manifest_version: 1,
  };
}

function rcaVisualManifest() {
  return {
    ...loadFamilyManifestFixtures().redcube,
    visual_transition_spec: {
      surface_kind: 'visual_transition_spec',
      spec_id: 'redcube-ai.visual-transition.v1',
      owner: 'redcube_ai',
      covered_family_stage_kinds: ['visual_intake', 'visual_export_review'],
      transition_table: [{
        transition_id: 'intake_to_export_review',
        from_stage: 'visual_intake',
        to_stage: 'visual_export_review',
        required_guard_refs: ['source_assets_indexed'],
        owner_action: 'review_visual_export',
      }],
      guard_contract: {
        source_assets_indexed: {
          owner: 'redcube_ai',
        },
      },
      oracle_fixture: {
        fixture_id: 'visual-intake-ready',
        covered_families: ['redcube_ai'],
        expected_return_shapes: ['domain_owner_receipt'],
        forbidden_oracle_fields: ['visual_ready_claimed', 'exportable_claimed'],
      },
      runner_boundary: {
        opl_can_execute_transition_spec: true,
      },
      repository_boundary: {
        domain_truth_owner: 'redcube_ai',
      },
    },
  };
}

function resolveWithCommand(
  workspacePath: string,
  manifestCommand: string,
  options: Parameters<typeof resolveBindingManifest>[3] = {},
) {
  return resolveBindingManifest(
    'medautoscience',
    'med-autoscience',
    createBinding(workspacePath, manifestCommand),
    {
      materializeFamilyTransitions: false,
      ...options,
    },
  );
}

test('resolveBindingManifest resolves a configured command with env timeout policy', () => {
  const workspacePath = createWorkspace();
  try {
    const manifest = loadFamilyManifestFixtures().medautoscience;
    const scriptPath = writeScript(
      workspacePath,
      'manifest.cjs',
      `process.stdout.write(${JSON.stringify(`${JSON.stringify(manifest)}\n`)});\n`,
    );

    const entry = withEnvVar('OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS', '2500', () =>
      resolveWithCommand(workspacePath, `${process.execPath} ${scriptPath}`));

    assert.equal(entry.status, 'resolved', entry.error?.message ?? undefined);
    assert.equal(entry.error, null);
    assert.equal(entry.manifest?.target_domain_id, 'med-autoscience');
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('resolveBindingManifest consumes the real RCA visual transition profile by contract ref', {
  skip: !fs.existsSync('/Users/gaofeng/workspace/redcube-ai/contracts/visual_transition_adapter_profile.json'),
}, () => {
  const workspacePath = createWorkspace();
  try {
    const contractsDir = path.join(workspacePath, 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.copyFileSync(
      '/Users/gaofeng/workspace/redcube-ai/contracts/visual_transition_adapter_profile.json',
      path.join(contractsDir, 'visual_transition_adapter_profile.json'),
    );
    fs.writeFileSync(path.join(contractsDir, 'domain_descriptor.json'), `${JSON.stringify({
      standard_contract_refs: {
        visual_transition_adapter_profile: 'contracts/visual_transition_adapter_profile.json',
      },
    })}\n`);
    const manifest = rcaVisualManifest();
    const scriptPath = writeScript(
      workspacePath,
      'rca-manifest.cjs',
      `process.stdout.write(${JSON.stringify(`${JSON.stringify(manifest)}\n`)});\n`,
    );

    const entry = resolveWithCommand(workspacePath, `${process.execPath} ${scriptPath}`);

    assert.equal(entry.status, 'resolved', entry.error?.message ?? undefined);
    assert.equal(
      entry.manifest?.visual_transition_adapter_profile_registry?.surface_kind,
      'opl_domain_transition_adapter_profile_registry',
    );
    assert.equal(
      entry.manifest?.visual_transition_adapter_profile_registry?.source_ref,
      'contracts/visual_transition_adapter_profile.json',
    );
    assert.equal(entry.manifest?.family_transition.status, 'matrix_evaluated');
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('resolveBindingManifest rejects conflicting visual transition profile contract refs', () => {
  const workspacePath = createWorkspace();
  try {
    const contractsDir = path.join(workspacePath, 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.writeFileSync(path.join(contractsDir, 'domain_descriptor.json'), `${JSON.stringify({
      standard_contract_refs: {
        visual_transition_adapter_profile: 'contracts/visual-transition-a.json',
      },
    })}\n`);
    fs.writeFileSync(path.join(contractsDir, 'pack_compiler_input.json'), `${JSON.stringify({
      source_refs: {
        visual_transition_adapter_profile_source_ref: 'contracts/visual-transition-b.json',
      },
    })}\n`);
    const manifest = rcaVisualManifest();
    const scriptPath = writeScript(
      workspacePath,
      'rca-manifest.cjs',
      `process.stdout.write(${JSON.stringify(`${JSON.stringify(manifest)}\n`)});\n`,
    );

    const entry = resolveWithCommand(workspacePath, `${process.execPath} ${scriptPath}`);

    assert.equal(entry.status, 'invalid_manifest');
    assert.match(entry.error?.message ?? '', /visual transition adapter profile refs disagree/i);
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('resolveBindingManifest rejects visual transition profile refs that escape the domain repo', () => {
  const workspacePath = createWorkspace();
  const externalPath = path.join(os.tmpdir(), `opl-visual-profile-${process.pid}-${Date.now()}.json`);
  try {
    const contractsDir = path.join(workspacePath, 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.writeFileSync(externalPath, '{}\n');
    fs.symlinkSync(externalPath, path.join(contractsDir, 'visual-transition.json'));
    fs.writeFileSync(path.join(contractsDir, 'domain_descriptor.json'), `${JSON.stringify({
      standard_contract_refs: {
        visual_transition_adapter_profile: 'contracts/visual-transition.json',
      },
    })}\n`);
    const manifest = rcaVisualManifest();
    const scriptPath = writeScript(
      workspacePath,
      'rca-manifest.cjs',
      `process.stdout.write(${JSON.stringify(`${JSON.stringify(manifest)}\n`)});\n`,
    );

    const entry = resolveWithCommand(workspacePath, `${process.execPath} ${scriptPath}`);

    assert.equal(entry.status, 'invalid_manifest');
    assert.match(entry.error?.message ?? '', /escapes its domain repo/i);
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
    fs.rmSync(externalPath, { force: true });
  }
});

test('resolveBindingManifest ignores env timeout when timeout policy is fixed', () => {
  const workspacePath = createWorkspace();
  try {
    const scriptPath = writeScript(
      workspacePath,
      'slow-fixed-timeout.cjs',
      'setTimeout(() => process.stdout.write("{}\\n"), 120);\n',
    );

    const entry = withEnvVar('OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS', '1', () =>
      resolveWithCommand(
        workspacePath,
        `${process.execPath} ${scriptPath}`,
        {
          timeoutMs: 1000,
          timeoutPolicy: 'fixed',
        },
      ));

    assert.equal(entry.status, 'invalid_manifest');
    assert.equal(entry.error?.timeout_ms, null);
    assert.match(entry.error?.message ?? '', /formal_entry/);
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('resolveBindingManifest reports command timeout and preserves timeout metadata', () => {
  const workspacePath = createWorkspace();
  try {
    const scriptPath = writeScript(
      workspacePath,
      'timeout.cjs',
      'setTimeout(() => process.stdout.write("{}\\n"), 500);\n',
    );

    const entry = resolveWithCommand(workspacePath, `${process.execPath} ${scriptPath}`, {
      timeoutMs: 25,
      timeoutPolicy: 'fixed',
    });

    assert.equal(entry.status, 'command_timeout');
    assert.equal(entry.error?.code, 'command_timeout');
    assert.equal(entry.error?.timeout_ms, 25);
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('resolveBindingManifest accepts parseable stdout even when the process times out', () => {
  const workspacePath = createWorkspace();
  try {
    const manifest = minimalManifest();
    const scriptPath = writeScript(
      workspacePath,
      'stdout-before-timeout.sh',
      `printf '%s\\n' ${shellSingleQuote(JSON.stringify(manifest))}\n`
        + 'sleep 1\n',
    );

    const entry = resolveWithCommand(workspacePath, `/bin/sh ${scriptPath}`, {
      timeoutMs: 50,
      timeoutPolicy: 'fixed',
    });

    assert.equal(entry.status, 'resolved');
    assert.equal(entry.error, null);
    assert.equal(entry.manifest?.target_domain_id, 'med-autoscience');
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('resolveBindingManifest distinguishes invalid JSON from invalid manifest shape', () => {
  const workspacePath = createWorkspace();
  try {
    const invalidJsonScript = writeScript(
      workspacePath,
      'invalid-json.cjs',
      'process.stdout.write("{not json");\n',
    );
    const invalidJson = resolveWithCommand(workspacePath, `${process.execPath} ${invalidJsonScript}`, {
      timeoutMs: 1000,
      timeoutPolicy: 'fixed',
    });
    assert.equal(invalidJson.status, 'invalid_json');
    assert.equal(invalidJson.error?.code, 'invalid_json');

    const invalidManifestScript = writeScript(
      workspacePath,
      'invalid-manifest.cjs',
      'process.stdout.write("{}\\n");\n',
    );
    const invalidManifest = resolveWithCommand(
      workspacePath,
      `${process.execPath} ${invalidManifestScript}`,
      {
        timeoutMs: 1000,
        timeoutPolicy: 'fixed',
      },
    );
    assert.equal(invalidManifest.status, 'invalid_manifest');
    assert.equal(invalidManifest.error?.code, 'invalid_manifest');
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('resolveBindingManifest retries uv cache install failures with a fresh command tmp root', () => {
  const workspacePath = createWorkspace();
  try {
    const manifest = loadFamilyManifestFixtures().medautoscience;
    const markerPath = path.join(workspacePath, 'attempt-count.txt');
    const envPath = path.join(workspacePath, 'retry-env.txt');
    const scriptPath = writeScript(
      workspacePath,
      'uv-cache-retry.cjs',
      `const fs = require('node:fs');\n`
        + `const markerPath = ${JSON.stringify(markerPath)};\n`
        + `const envPath = ${JSON.stringify(envPath)};\n`
        + `const count = fs.existsSync(markerPath) ? Number(fs.readFileSync(markerPath, 'utf8')) : 0;\n`
        + `fs.writeFileSync(markerPath, String(count + 1));\n`
        + `if (count === 0) {\n`
        + `  process.stderr.write('Failed to install: archive-v0 METADATA No such file or directory\\n');\n`
        + `  process.exit(1);\n`
        + `}\n`
        + `fs.writeFileSync(envPath, process.env.OPL_DOMAIN_COMMAND_TMP_ROOT || '');\n`
        + `process.stdout.write(${JSON.stringify(`${JSON.stringify(manifest)}\n`)});\n`,
    );

    const entry = resolveWithCommand(workspacePath, `${process.execPath} ${scriptPath}`, {
      timeoutMs: 1000,
      timeoutPolicy: 'fixed',
    });

    assert.equal(entry.status, 'resolved');
    assert.equal(fs.readFileSync(markerPath, 'utf8'), '2');
    const retryTmpRoot = fs.readFileSync(envPath, 'utf8');
    assert.ok(path.isAbsolute(retryTmpRoot));
    assert.ok(path.relative(workspacePath, retryTmpRoot).startsWith('..'));
    assert.ok(retryTmpRoot.includes(`${path.sep}recovery${path.sep}`));
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});
