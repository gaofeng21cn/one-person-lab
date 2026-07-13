#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

function parseOptions(argv) {
  const options = { releaseManifest: '', outputDir: '' };
  parseRequiredValueOptions(argv, {
    '--release-manifest': (value) => { options.releaseManifest = path.resolve(value); },
    '--output-dir': (value) => { options.outputDir = path.resolve(value); },
  });
  if (!options.releaseManifest || !options.outputDir) {
    throw new Error('Usage: generate-release-supply-chain.mjs --release-manifest <path> --output-dir <dir>');
  }
  return options;
}

function checksum(value) {
  const normalized = String(value ?? '').replace(/^sha256:/, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(normalized)) throw new Error(`Invalid SHA-256 checksum: ${value}`);
  return normalized;
}

function spdxId(value) {
  return `SPDXRef-${value.replace(/[^A-Za-z0-9.-]/g, '-')}`;
}

function sourcePackage(input) {
  return {
    name: input.component_id,
    SPDXID: spdxId(input.component_id),
    versionInfo: input.version,
    downloadLocation: input.artifact_ref,
    filesAnalyzed: false,
    checksums: [{ algorithm: 'SHA256', checksumValue: checksum(input.content_digest) }],
    supplier: 'Organization: One Person Lab',
    primaryPackagePurpose: input.purpose,
    externalRefs: [{
      referenceCategory: 'OTHER',
      referenceType: 'opl-source-commit',
      referenceLocator: input.source_commit,
    }],
  };
}

function buildStatements(manifest) {
  const releaseSet = manifest.release_set;
  if (releaseSet?.surface_kind !== 'opl_release_set.v2'
    || releaseSet?.bom_status !== 'complete'
    || !/^sha256:[0-9a-f]{64}$/.test(releaseSet?.bom_digest ?? '')) {
    throw new Error('Supply-chain statements require a complete Release Set v2 BOM');
  }
  const base = releaseSet.components.base;
  const app = releaseSet.components.app;
  const packages = releaseSet.components.packages.members;
  const components = [{
    component_id: base.component_id,
    version: base.version,
    source_commit: base.source_commit,
    artifact_ref: base.artifact_ref,
    content_digest: manifest.packages.framework_core.source_archive.sha256,
    purpose: 'APPLICATION',
  }, {
    component_id: app.component_id,
    version: app.version,
    source_commit: app.source_commit,
    artifact_ref: app.artifact_ref,
    content_digest: app.artifact_digest,
    purpose: 'APPLICATION',
  }, ...Object.keys(packages).sort().map((packageId) => ({
    component_id: packageId,
    version: packages[packageId].version,
    source_commit: packages[packageId].source_commit,
    artifact_ref: packages[packageId].artifact_ref,
    content_digest: manifest.packages.package_artifacts[packageId].source_archive.sha256,
    purpose: 'LIBRARY',
  }))];
  for (const component of components) {
    if (!/^[0-9a-f]{40}$/.test(component.source_commit ?? '')) {
      throw new Error(`${component.component_id}: invalid source commit`);
    }
  }
  const packagesSpdx = components.map(sourcePackage);
  const namespaceDigest = releaseSet.bom_digest.replace(/^sha256:/, '');
  const created = new Date().toISOString();
  const sbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `OPL Release Set ${releaseSet.generation}`,
    documentNamespace: `https://one-person-lab.dev/spdx/release-set/${releaseSet.generation}/${namespaceDigest}`,
    creationInfo: {
      created,
      creators: ['Tool: one-person-lab/scripts/generate-release-supply-chain.mjs'],
    },
    documentDescribes: packagesSpdx.map((entry) => entry.SPDXID),
    packages: packagesSpdx,
    relationships: packagesSpdx.map((entry) => ({
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: entry.SPDXID,
    })),
  };
  const resolvedDependencies = components.map((component) => ({
    uri: component.artifact_ref,
    digest: {
      gitCommit: component.source_commit,
      sha256: checksum(component.content_digest).toLowerCase(),
    },
  }));
  const provenance = {
    buildDefinition: {
      buildType: 'https://one-person-lab.dev/build-types/release-set/v2',
      externalParameters: {
        release_set_generation: releaseSet.generation,
        component_ids: releaseSet.component_ids,
        owner_cohort_lock: releaseSet.owner_cohort_lock ?? null,
      },
      internalParameters: {
        repository: process.env.GITHUB_REPOSITORY ?? null,
        workflow: process.env.GITHUB_WORKFLOW_REF ?? null,
      },
      resolvedDependencies,
    },
    runDetails: {
      builder: {
        id: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
          ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions`
          : 'https://one-person-lab.dev/builders/local',
      },
      metadata: {
        invocationId: process.env.GITHUB_RUN_ID
          ? `${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
          : `local/${process.pid}`,
        startedOn: created,
      },
    },
  };
  return { sbom, provenance };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const statements = buildStatements(readJsonFile(options.releaseManifest));
  fs.mkdirSync(options.outputDir, { recursive: true });
  const sbomPath = path.join(options.outputDir, 'opl-release-set.spdx.json');
  const provenancePath = path.join(options.outputDir, 'opl-release-provenance.json');
  fs.writeFileSync(sbomPath, `${JSON.stringify(statements.sbom, null, 2)}\n`, 'utf8');
  fs.writeFileSync(provenancePath, `${JSON.stringify(statements.provenance, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'generated', sbom: sbomPath, provenance: provenancePath }));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
