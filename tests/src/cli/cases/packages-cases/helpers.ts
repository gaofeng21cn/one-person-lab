import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

import { assert, fs, os, path, repoRoot, runCli, runCliAsync, runCliFailure, test } from '../../helpers.ts';
import { formatJsonPayload, parseJsonText } from '../../../../../src/kernel/json-file.ts';

export { repoRoot };

export function createPluginSourceFixture(input: { includeRequiredSkill?: boolean } = {}) {
  const pluginSourcePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-plugin-source-'));
  fs.mkdirSync(path.join(pluginSourcePath, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginSourcePath, '.codex-plugin', 'plugin.json'),
    formatJsonPayload({
      name: 'third-party-research',
      version: '1.2.3',
      displayName: 'Third Party Research',
      description: 'Fixture third-party OPL agent package plugin.',
    }),
    'utf8',
  );
  if (input.includeRequiredSkill !== false) {
    fs.mkdirSync(path.join(pluginSourcePath, 'skills', 'third-party-research'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginSourcePath, 'skills', 'third-party-research', 'SKILL.md'),
      '# Third Party Research\n\nUse for fixture package materialization tests.\n',
      'utf8',
    );
  }
  return pluginSourcePath;
}

export function sha256Fixture(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function remotePayloadManifest(baseUrl?: string) {
  const pluginJson = formatJsonPayload({
    name: 'third-party-research',
    version: '1.2.3',
    displayName: 'Third Party Research',
    description: 'Fixture third-party OPL agent package plugin.',
  });
  const skillMarkdown = '# Third Party Research\n\nUse for fixture package materialization tests.\n';
  return {
    surface_kind: 'opl_agent_package_payload_manifest',
    files: [
      {
        path: '.codex-plugin/plugin.json',
        content_utf8: pluginJson,
        sha256: sha256Fixture(pluginJson),
      },
      {
        path: 'skills/third-party-research/SKILL.md',
        ...(baseUrl
          ? { source_url: `${baseUrl}/skills/third-party-research/SKILL.md` }
          : { content_utf8: skillMarkdown }),
        sha256: sha256Fixture(skillMarkdown),
      },
    ],
  };
}

export function distributionPayload(input: { digest?: string; immutableTag?: string } = {}) {
  const immutableTag = input.immutableTag ?? '1.2.3';
  return {
    payload_kind: 'ghcr_oci_agent_package',
    payload_ref: `ghcr.io/example-org/opl-agent-third-party-research:latest`,
    payload_digest_ref: input.digest ?? 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    required_skill_pack_lock_refs: [
      'opl://agent-package-lock/third-party-research-required-skills/1.2.3/fixture',
    ],
    proof_status: 'non_live_contract_fixture',
    live_download_proof: false,
    installed_reload_proof: false,
    oci_ref: `ghcr.io/example-org/opl-agent-third-party-research:latest`,
    oci_media_type: 'application/vnd.oci.image.manifest.v1+json',
    immutable_tag: immutableTag,
    rolling_tag: 'latest',
    promotion_policy: 'daily_candidate_gates_then_promote_latest',
    install_truth: 'resolved_digest_lock',
  };
}

export function agentPackageManifest(input: {
  pluginSourcePath?: string;
  pluginPayloadManifestUrl?: string;
  packageId?: string;
  agentId?: string;
  permissions?: unknown[];
  distributionPayload?: Record<string, unknown> | null;
} = {}) {
  return {
    surface_kind: 'opl_agent_package_manifest.v1',
    package_id: input.packageId ?? 'third.party.research',
    agent_id: input.agentId ?? 'third-party-research',
    display_name: 'Third Party Research',
    publisher: 'example-org',
    version: '1.2.3',
    source: 'third_party',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_ids: ['third-party-research'],
      required_skill_ids: ['third-party-research'],
      optional_skill_ids: ['officecli-docx'],
      ...(input.pluginSourcePath ? { plugin_source_path: input.pluginSourcePath } : {}),
      ...(input.pluginPayloadManifestUrl ? { plugin_payload_manifest_url: input.pluginPayloadManifestUrl } : {}),
    },
    capability_dependencies: [],
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
    permissions: input.permissions ?? [],
    ...(input.distributionPayload === null ? {} : { distribution_payload: input.distributionPayload ?? distributionPayload() }),
    update_channel: 'manifest_url',
    rollback_ref: 'package-receipt-ref:previous',
  };
}

export function registryPayload(baseUrl: string, input: { packageId?: string } = {}) {
  return {
    registry_id: 'test-agent-registry',
    discovery_only: true,
    install_authority_allowed: false,
    entries: [
      {
        package_id: input.packageId ?? 'third.party.research',
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
        ordinary_user_source: {
          kind: 'ghcr_oci_artifact_rolling_latest',
          registry: 'ghcr.io',
          artifact_ref: 'ghcr.io/example-org/opl-agent-third-party-research',
          ordinary_user_ref: 'ghcr.io/example-org/opl-agent-third-party-research:latest',
          immutable_version_ref: 'ghcr.io/example-org/opl-agent-third-party-research:1.2.3',
          latest_is_only_ordinary_user_channel: true,
          latest_role: 'ordinary_user_rolling_pointer_after_daily_candidate_gates',
          install_truth: ['immutable_version_tag', 'oci_digest', 'package_lock_receipt'],
          latest_is_install_truth: false,
          developer_checkout_auto_apply_allowed: false,
        },
      },
    ],
  };
}

export async function withAgentPackageServer(
  run: (baseUrl: string) => Promise<void>,
  manifest = agentPackageManifest(),
) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/manifest.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(manifest));
      return;
    }
    if (url.pathname === '/registry.json') {
      const address = server.address();
      assert.equal(typeof address, 'object');
      const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(registryPayload(baseUrl, { packageId: manifest.package_id })));
      return;
    }
    if (url.pathname === '/payload.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(remotePayloadManifest()));
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

export async function withRemotePayloadAgentPackageServer(run: (baseUrl: string) => Promise<void>) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const address = server.address();
    assert.equal(typeof address, 'object');
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    if (url.pathname === '/manifest.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(agentPackageManifest({
        pluginPayloadManifestUrl: 'payload.json',
      })));
      return;
    }
    if (url.pathname === '/registry.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(registryPayload(baseUrl)));
      return;
    }
    if (url.pathname === '/payload.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(remotePayloadManifest(baseUrl)));
      return;
    }
    if (url.pathname === '/skills/third-party-research/SKILL.md') {
      response.writeHead(200, { 'content-type': 'text/markdown' });
      response.end('# Third Party Research\n\nUse for fixture package materialization tests.\n');
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


export { assert, fs, os, path, pathToFileURL, runCli, runCliAsync, runCliFailure, test, formatJsonPayload, parseJsonText };
