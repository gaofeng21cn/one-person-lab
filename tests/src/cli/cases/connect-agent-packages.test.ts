import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

import { assert, fs, os, path, runCli, runCliAsync, runCliFailure, test } from '../helpers.ts';
import { formatJsonPayload, parseJsonText } from '../../../../src/kernel/json-file.ts';

function agentPackageManifest() {
  return {
    package_id: 'third.party.research',
    agent_id: 'third-party-research',
    display_name: 'Third Party Research',
    publisher: 'example-org',
    version: '1.2.3',
    source: 'third_party',
    codex_surface: {
      plugin_ids: ['third-party-research'],
      required_skill_ids: ['third-party-research'],
      optional_skill_ids: ['officecli-docx'],
    },
    skill_packs: [
      {
        id: 'third-party-research-required-skills',
        source: 'github:example/third-party-research-skills',
        version: '1.2.3',
        lock_sha: 'sha256:fixture',
        install_mode: 'bundled_required',
      },
    ],
    entrypoints: [
      {
        shortcut_id: 'research',
        label: 'Research',
        required_skill_ids: ['third-party-research'],
        shortcut_eligible: true,
      },
    ],
    health_check: {
      kind: 'opl_package_receipt',
      required_surfaces: ['plugin_registry', 'required_skill_ids'],
    },
    permissions: [],
    update_channel: 'manifest_url',
    rollback_ref: 'package-receipt-ref:previous',
  };
}

function registryPayload(baseUrl: string) {
  return {
    registry_id: 'test-agent-registry',
    discovery_only: true,
    install_authority_allowed: false,
    entries: [
      {
        package_id: 'third.party.research',
        display_name: 'Third Party Research',
        publisher: 'example-org',
        source: 'third_party',
        manifest_url: `${baseUrl}/manifest.json`,
        latest_version: '1.2.3',
        trust_tier: 'third_party_verified',
        codex_visible_entry: 'third-party-research',
        required_skill_ids: ['third-party-research'],
        optional_skill_ids: ['officecli-docx'],
        home_shortcut_ids: ['research'],
        display_policy: 'refs_only_no_domain_verdict',
      },
    ],
  };
}

async function withAgentPackageServer(
  run: (baseUrl: string) => Promise<void>,
) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/manifest.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(agentPackageManifest()));
      return;
    }
    if (url.pathname === '/registry.json') {
      const address = server.address();
      assert.equal(typeof address, 'object');
      const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(registryPayload(baseUrl)));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(formatJsonPayload({ error: 'not_found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('connect agent-packages fetches registry URL, validates manifest, and writes lock receipt', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-packages-state-'));
  try {
    await withAgentPackageServer(async (baseUrl) => {
      const registryUrl = `${baseUrl}/registry.json`;
      const refresh = await runCliAsync([
        'connect',
        'agent-packages',
        'registry',
        'refresh',
        '--registry-url',
        registryUrl,
      ], { OPL_STATE_DIR: stateDir }) as {
        opl_agent_package_registry: {
          status: string;
          registry_url: string;
          entry_count: number;
          cache_file: string;
          lifecycle_receipt: {
            action: string;
            writes_performed: boolean;
            authority_boundary: { can_write_domain_truth: boolean };
          };
        };
      };

      assert.equal(refresh.opl_agent_package_registry.status, 'refreshed');
      assert.equal(refresh.opl_agent_package_registry.registry_url, registryUrl);
      assert.equal(refresh.opl_agent_package_registry.entry_count, 1);
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.action, 'registry_refresh');
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.writes_performed, true);
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.authority_boundary.can_write_domain_truth, false);
      assert.equal(fs.existsSync(refresh.opl_agent_package_registry.cache_file), true);

      const validated = await runCliAsync([
        'connect',
        'agent-packages',
        'validate-manifest',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], { OPL_STATE_DIR: stateDir }) as {
        opl_agent_package_manifest: {
          status: string;
          package_id: string;
          lifecycle_receipt: {
            action: string;
            writes_performed: boolean;
          };
        };
      };

      assert.equal(validated.opl_agent_package_manifest.status, 'valid');
      assert.equal(validated.opl_agent_package_manifest.package_id, 'third.party.research');
      assert.equal(validated.opl_agent_package_manifest.lifecycle_receipt.action, 'manifest_validate');
      assert.equal(validated.opl_agent_package_manifest.lifecycle_receipt.writes_performed, true);

      const install = await runCliAsync([
        'connect',
        'agent-packages',
        'install',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], { OPL_STATE_DIR: stateDir }) as {
        opl_agent_package_install: {
          status: string;
          package_lock: {
            package_id: string;
            trust_tier: string;
            source_kind: string;
            action_receipt_id: string;
            rollback_ref: string;
            bundled_required_skill_ids: string[];
          };
          lifecycle_receipt: {
            receipt_ref: string;
            action: string;
            package_lock_ref: string;
            writes_performed: boolean;
          };
          lock_file: string;
          lifecycle_ledger_file: string;
        };
      };

      assert.equal(install.opl_agent_package_install.status, 'installed');
      assert.equal(install.opl_agent_package_install.package_lock.package_id, 'third.party.research');
      assert.equal(install.opl_agent_package_install.package_lock.trust_tier, 'third_party_verified');
      assert.equal(install.opl_agent_package_install.package_lock.source_kind, 'manifest_url');
      assert.equal(
        install.opl_agent_package_install.package_lock.action_receipt_id,
        install.opl_agent_package_install.lifecycle_receipt.receipt_ref,
      );
      assert.equal(install.opl_agent_package_install.package_lock.rollback_ref, 'package-receipt-ref:previous');
      assert.deepEqual(
        install.opl_agent_package_install.package_lock.bundled_required_skill_ids,
        ['third-party-research'],
      );
      assert.equal(install.opl_agent_package_install.lifecycle_receipt.action, 'install');
      assert.equal(install.opl_agent_package_install.lifecycle_receipt.writes_performed, true);
      assert.equal(fs.existsSync(install.opl_agent_package_install.lock_file), true);
      assert.equal(fs.existsSync(install.opl_agent_package_install.lifecycle_ledger_file), true);

      const list = runCli([
        'connect',
        'agent-packages',
        'list',
      ], { OPL_STATE_DIR: stateDir }) as {
        opl_agent_packages: {
          installed_package_count: number;
          installed_packages: Array<{ package_id: string }>;
          lifecycle_receipt_count: number;
          registry_cache: { entry_count: number };
        };
      };

      assert.equal(list.opl_agent_packages.installed_package_count, 1);
      assert.equal(list.opl_agent_packages.installed_packages[0].package_id, 'third.party.research');
      assert.equal(list.opl_agent_packages.lifecycle_receipt_count, 3);
      assert.equal(list.opl_agent_packages.registry_cache.entry_count, 1);
    });
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('app action execute routes install_from_manifest_url to Framework package lock receipt writer', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-app-action-state-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-manifest-'));
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest()), 'utf8');
    const manifestUrl = pathToFileURL(manifestPath).href;
    const output = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'install_from_manifest_url',
      '--payload',
      JSON.stringify({
        manifest_url: manifestUrl,
        trust_tier: 'third_party_verified',
      }),
    ], { OPL_STATE_DIR: stateDir }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_install: {
            status: string;
            package_lock: { package_id: string; source_kind: string };
            lifecycle_receipt: { writes_performed: boolean };
          };
        };
      };
    };

    assert.equal(output.app_action_execution.delegated_surface, 'opl connect agent-packages install --manifest-url <manifest_url>');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.status, 'installed');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.package_lock.package_id, 'third.party.research');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.package_lock.source_kind, 'local_manifest_file');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.lifecycle_receipt.writes_performed, true);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('connect agent-packages rejects invalid manifests before writing locks', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-invalid-state-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-invalid-'));
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      formatJsonPayload({
        package_id: 'invalid.package',
        agent_id: 'invalid',
        display_name: 'Invalid',
        publisher: 'example',
        version: '0.0.1',
      }),
      'utf8',
    );
    const failure = runCliFailure([
      'connect',
      'agent-packages',
      'install',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], { OPL_STATE_DIR: stateDir });

    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'invalid_package_manifest');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
    assert.doesNotThrow(() => parseJsonText(JSON.stringify(failure.payload)));
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
