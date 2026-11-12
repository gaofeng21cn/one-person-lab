#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPublicationAdmittedOplPackageSpecs } from '../src/adapters/integration/package-distribution.ts';

export function buildDailyPackageCandidates(specs) {
  const candidate_fingerprint = {};
  const owner_managed_packages = {};
  for (const spec of specs) {
    const manifest = JSON.parse(fs.readFileSync(spec.package_manifest_ref, 'utf8'));
    // The public Framework caller cannot publish an authorized-only Package.
    // Its private owner retains registry access, signing keys and publication.
    if (spec.visibility === 'authorized_only') {
      owner_managed_packages[spec.package_id] = {
        status: 'delegated_to_private_owner',
        source_repo: manifest.source_repo,
        registry_readback: 'not_performed',
        publication_status: 'not_evaluated',
      };
      continue;
    }
    if (spec.visibility !== 'public') throw new Error(`Invalid Package visibility: ${spec.package_id}`);
    const payloadPath = path.resolve(path.dirname(spec.package_manifest_ref), manifest.codex_surface.plugin_payload_manifest_url);
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    if (payload.package_id !== spec.package_id || payload.package_version !== manifest.version
      || !/^sha256:[a-f0-9]{64}$/.test(payload.content_lock?.digest ?? '')
      || !/^[a-f0-9]{40}$/.test(payload.source_commit ?? '')) throw new Error(`Invalid Package candidate: ${spec.package_id}`);
    candidate_fingerprint[spec.package_id] = { package_version: payload.package_version,
      package_content_digest: payload.content_lock.digest, owner_source_commit: payload.source_commit };
  }
  return { candidate_fingerprint, owner_managed_packages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) throw new Error('Provide an output path for the transient detection result.');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(buildDailyPackageCandidates(getPublicationAdmittedOplPackageSpecs()), null, 2) + '\n');
}
