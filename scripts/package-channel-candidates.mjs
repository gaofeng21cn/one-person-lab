#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getPublicationAdmittedOplPackageSpecs } from '../src/adapters/integration/package-distribution.ts';
const candidate_fingerprint = {};
for (const spec of getPublicationAdmittedOplPackageSpecs()) {
  const manifest = JSON.parse(fs.readFileSync(spec.package_manifest_ref, 'utf8'));
  const payloadPath = path.resolve(path.dirname(spec.package_manifest_ref), manifest.codex_surface.plugin_payload_manifest_url);
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  if (payload.package_id !== spec.package_id || payload.package_version !== manifest.version
    || !/^sha256:[a-f0-9]{64}$/.test(payload.content_lock?.digest ?? '')
    || !/^[a-f0-9]{40}$/.test(payload.source_commit ?? '')) throw new Error(`Invalid Package candidate: ${spec.package_id}`);
  candidate_fingerprint[spec.package_id] = { package_version: payload.package_version,
    package_content_digest: payload.content_lock.digest, owner_source_commit: payload.source_commit };
}
const output = process.argv[2];
if (!output) throw new Error('Provide an output path for the transient detection result.');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ candidate_fingerprint }, null, 2) + '\n');
