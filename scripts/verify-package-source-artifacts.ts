#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { listCurrentPackageProjections } from '../src/kernel/standard-agent-registry.ts';
import { installPayloadMarketplace } from '../src/adapters/integration/agent-package-registry-parts/configured-codex-plugin-carrier-payload.ts';

/** Exercise the selected owner transport without invoking native carrier mutation. */
export function verifyPackageSourceArtifacts(packageIds: string[], options: {
  packageDirectory?: string;
  materialize?: typeof installPayloadMarketplace;
} = {}) {
  const roots = [...new Set(packageIds)];
  if (!roots.length || roots.some((id) => !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id))) {
    throw new Error('Provide at least one valid --package-id.');
  }
  const projections = listCurrentPackageProjections(options.packageDirectory);
  const selected = roots.map((packageId) => {
    const projection = projections.find((entry) => entry.payload.package_id === packageId);
    const surface = projection?.payload.codex_surface as Record<string, any> | undefined;
    const pluginId = surface?.configured_codex_plugin_carrier?.plugin_selector;
    if (typeof pluginId !== 'string' || !surface?.plugin_payload_manifest_url) {
      throw new Error(`Package ${packageId} has no declared payload carrier to verify.`);
    }
    return { packageId, pluginId };
  });
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-preflight-'));
  try {
    const items = selected.map(({ packageId, pluginId }) => {
      const started = Date.now();
      try {
        const source = (options.materialize ?? installPayloadMarketplace)({
          packageId,
          pluginId,
          packageDirectory: options.packageDirectory,
          env: { ...process.env, OPL_STATE_DIR: path.join(temporaryRoot, packageId) },
        });
        if (!source) throw new Error('The declared payload was not materialized.');
        return { package_id: packageId, status: 'passed' as const, duration_ms: Date.now() - started };
      } catch (error) {
        const failure = error as { code?: string; details?: { failure_code?: string } };
        const code = failure.details?.failure_code ?? failure.code ?? 'package_source_verification_failed';
        // Do not forward raw subprocess output, registry tokens or arbitrary error details.
        throw new Error(`Package ${packageId} source verification failed (${String(code).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 128)}).`, { cause: error });
      }
    });
    return {
      schema: 'opl_package_source_artifact_preflight.v1',
      status: 'passed' as const,
      root_package_ids: roots,
      items,
      native_carrier_mutation: false,
      scope: 'selected_root_payloads_only',
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const { values } = parseArgs({
      options: { 'package-id': { type: 'string', multiple: true } },
      strict: true, allowPositionals: false,
    });
    console.log(JSON.stringify(verifyPackageSourceArtifacts(values['package-id'] ?? []), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: { message: error instanceof Error ? error.message : String(error) } }));
    process.exitCode = 1;
  }
}
