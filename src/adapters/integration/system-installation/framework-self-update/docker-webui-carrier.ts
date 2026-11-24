import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../../../kernel/json-file.ts';
import { normalizeOptionalString } from '../shared.ts';

const PAYLOAD_SEED_STRATEGIES = ['payload_manifest', 'payload_preheated'];

function isOplFrameworkRuntimeRoot(root: string) {
  return fs.existsSync(path.join(root, 'package.json'))
    && fs.existsSync(path.join(root, 'bin', 'opl'))
    && (
      fs.existsSync(path.join(root, 'src', 'entrypoints', 'cli.ts'))
      || fs.existsSync(path.join(root, 'src', 'cli.ts'))
      || fs.existsSync(path.join(root, 'dist', 'entrypoints', 'cli.js'))
    );
}

export function resolveDockerWebuiFrameworkCarrier() {
  const imageManifestPath = normalizeOptionalString(process.env.OPL_IMAGE_MANIFEST_PATH);
  const seedDirRaw = normalizeOptionalString(process.env.OPL_IMAGE_SEED_DIR);
  if (!imageManifestPath || !seedDirRaw) return null;

  try {
    const seedDir = path.resolve(seedDirRaw);
    const imageManifest = readJsonPayloadFile(path.resolve(imageManifestPath));
    if (!isRecord(imageManifest)
      || imageManifest.schema !== 'dev.onepersonlab.opl-webui-image-manifest.v1'
      || imageManifest.image_role !== 'opl_webui_runtime_image'
      || imageManifest.image_profile !== 'webui-full'
      || !PAYLOAD_SEED_STRATEGIES.includes(String(imageManifest.seed_strategy))) {
      return null;
    }

    const seedMetadataPath = path.join(seedDir, 'metadata.json');
    const seedMetadata = readJsonPayloadFile(seedMetadataPath);
    if (!isRecord(seedMetadata)
      || seedMetadata.schema !== 'dev.onepersonlab.opl-webui-image-seed.v1'
      || seedMetadata.image_profile !== 'webui-full'
      || seedMetadata.applies_to !== 'docker-webui-runtime-image'
      || !PAYLOAD_SEED_STRATEGIES.includes(String(seedMetadata.strategy))
      || !Array.isArray(seedMetadata.components)) {
      return null;
    }

    const frameworkComponent = seedMetadata.components.find(
      (component) => isRecord(component) && component.id === 'opl_framework',
    );
    if (!isRecord(frameworkComponent)) return null;
    const payloadPath = typeof frameworkComponent.payload_path === 'string'
      ? normalizeOptionalString(frameworkComponent.payload_path)
      : null;
    if (!payloadPath) return null;
    const frameworkRoot = path.resolve(seedDir, payloadPath);
    const relativeFrameworkRoot = path.relative(seedDir, frameworkRoot);
    if (relativeFrameworkRoot === '..'
      || relativeFrameworkRoot.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeFrameworkRoot)
      || !isOplFrameworkRuntimeRoot(frameworkRoot)) {
      return null;
    }

    const sourceFingerprint = typeof frameworkComponent.source_fingerprint === 'string'
      ? normalizeOptionalString(frameworkComponent.source_fingerprint)
      : null;
    const sourceHeadMatch = sourceFingerprint?.match(/^git:([0-9a-f]{40})(?::[0-9a-f]{40})?$/);
    return {
      frameworkRoot,
      seedMetadataPath,
      sourceHeadSha: sourceHeadMatch?.[1] ?? null,
    };
  } catch {
    return null;
  }
}
