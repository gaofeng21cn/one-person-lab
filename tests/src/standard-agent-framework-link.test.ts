import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { materializeStandardAgentFrameworkLink } from '../../src/modules/connect/standard-agent-framework-link.ts';
import { runManagedModuleWorkflow } from '../../src/modules/connect/system-installation/module-action-workflow.ts';
import { runCli, runCliFailure } from './cli/helpers.ts';

function withAgent(run: (agentRoot: string) => void) {
  const agentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-link-'));
  try {
    fs.mkdirSync(path.join(agentRoot, 'src'));
    fs.writeFileSync(path.join(agentRoot, 'package.json'), JSON.stringify({
      name: 'fixture-standard-agent',
      private: true,
      type: 'module',
      dependencies: {},
    }, null, 2));
    fs.writeFileSync(
      path.join(agentRoot, 'src', 'consumer.mjs'),
      "import { canonicalFoundryAgentSeriesPolicy } from 'opl-framework/foundry-agent-series-policy';\nexport default canonicalFoundryAgentSeriesPolicy();\n",
    );
    run(agentRoot);
  } finally {
    fs.rmSync(agentRoot, { recursive: true, force: true });
  }
}

function withPythonAgent(run: (agentRoot: string) => void) {
  const agentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-python-framework-link-'));
  try {
    fs.mkdirSync(path.join(agentRoot, 'src'));
    fs.writeFileSync(
      path.join(agentRoot, 'src', 'consumer.py'),
      'from opl_framework.schema_validation import SchemaSubsetValidator\n',
    );
    run(agentRoot);
  } finally {
    fs.rmSync(agentRoot, { recursive: true, force: true });
  }
}

function withRuntimePythonAgent(run: (agentRoot: string) => void) {
  const agentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-python-framework-link-'));
  try {
    const helperRoot = path.join(agentRoot, 'runtime', 'native_helpers');
    fs.mkdirSync(helperRoot, { recursive: true });
    fs.writeFileSync(
      path.join(helperRoot, 'consumer.py'),
      'from opl_framework.artifact_inspection import sha256_bytes\n',
    );
    run(agentRoot);
  } finally {
    fs.rmSync(agentRoot, { recursive: true, force: true });
  }
}

test('Standard Agent framework link is OPL-owned, checkable, and does not install a local runtime tree', () => {
  withAgent((agentRoot) => {
    assert.throws(
      () => materializeStandardAgentFrameworkLink({ agentRoot, checkOnly: true }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'framework_link_missing',
    );
    const dryRun = materializeStandardAgentFrameworkLink({ agentRoot, dryRun: true });
    assert.equal(dryRun.status, 'validated_no_write');
    assert.equal(fs.existsSync(path.join(agentRoot, 'node_modules')), false);

    const linked = materializeStandardAgentFrameworkLink({ agentRoot });
    assert.equal(linked.status, 'linked');
    assert.equal(fs.lstatSync(linked.link_path).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(linked.link_path), fs.realpathSync(linked.target_root));
    assert.equal(fs.existsSync(path.join(agentRoot, 'node_modules', '@temporalio')), false);
    const manifest = JSON.parse(fs.readFileSync(path.join(agentRoot, 'package.json'), 'utf8'));
    assert.equal(Object.hasOwn(manifest.dependencies, 'opl-framework'), false);
    assert.equal(materializeStandardAgentFrameworkLink({ agentRoot, checkOnly: true }).status, 'already_linked');

    const imported = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', "import('opl-framework/foundry-agent-series-policy').then(() => process.stdout.write('ok'))"],
      { cwd: agentRoot, encoding: 'utf8' },
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, 'ok');
  });
});

test('Standard Agent framework link detects Framework imports in monorepo app sources', () => {
  const agentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-app-link-'));
  try {
    const appSource = path.join(agentRoot, 'apps', 'agent-cli', 'src');
    fs.mkdirSync(appSource, { recursive: true });
    fs.writeFileSync(path.join(agentRoot, 'package.json'), JSON.stringify({
      name: 'fixture-monorepo-agent',
      private: true,
      type: 'module',
      dependencies: {},
    }, null, 2));
    fs.writeFileSync(
      path.join(appSource, 'consumer.ts'),
      "import 'opl-framework/domain-task-runtime';\n",
    );

    const linked = materializeStandardAgentFrameworkLink({ agentRoot });
    assert.equal(linked.status, 'linked');
    assert.equal(fs.realpathSync(linked.link_path), fs.realpathSync(linked.target_root));
  } finally {
    fs.rmSync(agentRoot, { recursive: true, force: true });
  }
});

test('managed module workflow automatically links JavaScript Standard Agent checkouts after bootstrap', () => {
  withAgent((agentRoot) => {
    const workflow = runManagedModuleWorkflow({
      module_id: 'oplmetaagent',
      label: 'Fixture OMA',
      repo_name: 'fixture-oma',
      repo_url: 'https://example.invalid/fixture-oma.git',
      scope: 'domain_module',
      default_install: true,
      description: 'fixture',
    }, agentRoot, {
      readPackagedModuleGitSnapshot: () => null,
    });
    assert.equal(workflow.bootstrap.status, 'skipped');
    assert.equal(workflow.framework_link.status, 'completed');
    assert.equal(workflow.framework_link.result?.status, 'linked');
    assert.equal(fs.existsSync(path.join(agentRoot, 'node_modules', '@temporalio')), false);
  });
});

test('Python-only Standard Agents receive the OPL-owned Framework source carrier', () => {
  withPythonAgent((agentRoot) => {
    assert.throws(
      () => materializeStandardAgentFrameworkLink({ agentRoot, checkOnly: true }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'framework_link_missing',
    );

    const linked = materializeStandardAgentFrameworkLink({ agentRoot });
    assert.equal(linked.status, 'linked');
    assert.equal(linked.javascript_link_path, null);
    assert.equal(fs.realpathSync(linked.python_link_path!), fs.realpathSync(linked.python_target_root!));
    assert.equal(fs.existsSync(path.join(agentRoot, 'node_modules')), false);

    const imported = spawnSync(
      'python3',
      ['-c', 'from opl_framework.schema_validation import SchemaSubsetValidator; print(SchemaSubsetValidator.__name__)'],
      {
        cwd: agentRoot,
        encoding: 'utf8',
        env: { ...process.env, PYTHONPATH: path.join(agentRoot, 'src') },
      },
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout.trim(), 'SchemaSubsetValidator');
    assert.equal(materializeStandardAgentFrameworkLink({ agentRoot, checkOnly: true }).status, 'already_linked');
  });
});

test('Python helpers outside src receive the same Framework source carrier', () => {
  withRuntimePythonAgent((agentRoot) => {
    const preview = materializeStandardAgentFrameworkLink({ agentRoot, dryRun: true });
    assert.equal(preview.status, 'validated_no_write');
    assert.equal(
      preview.python_link_path,
      path.join(fs.realpathSync.native(agentRoot), 'src', 'opl_framework'),
    );

    const linked = materializeStandardAgentFrameworkLink({ agentRoot });
    assert.equal(linked.status, 'linked');
    assert.equal(fs.realpathSync(linked.python_link_path!), fs.realpathSync(linked.python_target_root!));
    assert.equal(materializeStandardAgentFrameworkLink({ agentRoot, checkOnly: true }).status, 'already_linked');
  });
});

test('modules without JavaScript framework imports remain a safe no-op', () => {
  const agentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-link-noop-'));
  try {
    fs.writeFileSync(path.join(agentRoot, 'package.json'), JSON.stringify({ name: 'python-or-standalone-module' }));
    const result = materializeStandardAgentFrameworkLink({ agentRoot });
    assert.equal(result.status, 'not_applicable');
    assert.equal(result.reason, 'no_static_opl_framework_imports');
    assert.equal(fs.existsSync(path.join(agentRoot, 'node_modules')), false);
  } finally {
    fs.rmSync(agentRoot, { recursive: true, force: true });
  }
});

test('link-framework CLI checks, previews, creates, and rechecks the OPL-owned link', () => {
  withAgent((agentRoot) => {
    const missing = runCliFailure([
      'packages', 'link-framework', '--agent-root', agentRoot, '--check',
    ]);
    assert.equal(missing.status, 3);
    assert.equal(missing.payload.error.details.failure_code, 'framework_link_missing');
    assert.equal(fs.existsSync(path.join(agentRoot, 'node_modules')), false);

    const conflicting = runCliFailure([
      'packages', 'link-framework', '--agent-root', agentRoot, '--check', '--dry-run',
    ]);
    assert.equal(conflicting.status, 2);
    assert.deepEqual(conflicting.payload.error.details.conflicting, ['--check', '--dry-run']);

    const preview = runCli([
      'packages', 'link-framework', '--agent-root', agentRoot, '--dry-run',
    ]).opl_agent_package_framework_link;
    assert.equal(preview.status, 'validated_no_write');
    assert.equal(preview.writes_performed, false);
    assert.equal(fs.existsSync(path.join(agentRoot, 'node_modules')), false);

    const linked = runCli([
      'packages', 'link-framework', '--agent-root', agentRoot,
    ]).opl_agent_package_framework_link;
    assert.equal(linked.status, 'linked');
    assert.equal(linked.writes_performed, true);
    assert.equal(fs.realpathSync(linked.link_path), fs.realpathSync(linked.target_root));

    const checked = runCli([
      'packages', 'link-framework', '--agent-root', agentRoot, '--check',
    ]).opl_agent_package_framework_link;
    assert.equal(checked.status, 'already_linked');
    assert.equal(checked.writes_performed, false);
  });
});
