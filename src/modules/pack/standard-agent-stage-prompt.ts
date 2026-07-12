import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { optionalString, parseJsonText } from '../../kernel/json-file.ts';

export const STANDARD_AGENT_STAGE_MANIFEST_REF = 'agent/stages/manifest.json';
export const STANDARD_AGENT_STAGE_PROMPT_LAYER = 'domain_stage_main_prompt';
const STANDARD_STAGE_MANIFEST_SURFACE_KIND = 'opl_standard_agent_declarative_stage_manifest';
const STANDARD_STAGE_MANIFEST_VERSION = 'opl-standard-agent-declarative-stage-manifest.v1';
const MAX_STAGE_PROMPT_BYTES = 256 * 1024;

export type StandardAgentStagePromptResolution = {
  status: 'hydrated' | 'manifest_unavailable' | 'stage_not_declared';
  stage_id: string;
  source_manifest_ref: string | null;
  source_ref: string | null;
  layer: typeof STANDARD_AGENT_STAGE_PROMPT_LAYER | null;
  sha256: string | null;
  size_bytes: number;
  content: string | null;
};

function invalid(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function canonicalRepoFile(repoDir: string, ref: string, field: string) {
  if (
    path.posix.isAbsolute(ref)
    || ref.includes('\\')
    || path.posix.normalize(ref) !== ref
    || ref === '..'
    || ref.startsWith('../')
  ) {
    invalid(`${field} must be a canonical repo-relative path.`, { repo_dir: repoDir, ref });
  }
  const repoRoot = path.resolve(repoDir);
  const resolved = path.resolve(repoRoot, ref);
  if (!resolved.startsWith(`${repoRoot}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    invalid(`${field} does not resolve to a file inside the standard Agent root.`, { repo_dir: repoDir, ref });
  }
  const repoRealPath = fs.realpathSync(repoRoot);
  if (!fs.realpathSync(resolved).startsWith(`${repoRealPath}${path.sep}`)) {
    invalid(`${field} escapes the standard Agent root through a symbolic link.`, { repo_dir: repoDir, ref });
  }
  return resolved;
}

export function readStandardAgentStagePromptFile(repoDir: string, promptRef: string) {
  const resolved = canonicalRepoFile(repoDir, promptRef, 'stage.prompt_ref');
  const content = fs.readFileSync(resolved, 'utf8');
  const sizeBytes = Buffer.byteLength(content, 'utf8');
  if (sizeBytes === 0 || sizeBytes > MAX_STAGE_PROMPT_BYTES) {
    invalid('stage.prompt_ref must contain a non-empty bounded prompt body.', {
      repo_dir: repoDir,
      prompt_ref: promptRef,
      size_bytes: sizeBytes,
      max_size_bytes: MAX_STAGE_PROMPT_BYTES,
    });
  }
  return {
    ref: promptRef,
    layer: STANDARD_AGENT_STAGE_PROMPT_LAYER as typeof STANDARD_AGENT_STAGE_PROMPT_LAYER,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    size_bytes: sizeBytes,
    content,
  };
}

export function resolveStandardAgentStagePrompt(
  repoDir: string | null | undefined,
  stageId: string,
): StandardAgentStagePromptResolution {
  if (!repoDir) {
    return {
      status: 'manifest_unavailable',
      stage_id: stageId,
      source_manifest_ref: null,
      source_ref: null,
      layer: null,
      sha256: null,
      size_bytes: 0,
      content: null,
    };
  }
  const manifestPath = path.join(path.resolve(repoDir), STANDARD_AGENT_STAGE_MANIFEST_REF);
  if (!fs.existsSync(manifestPath)) {
    return {
      status: 'manifest_unavailable',
      stage_id: stageId,
      source_manifest_ref: null,
      source_ref: null,
      layer: null,
      sha256: null,
      size_bytes: 0,
      content: null,
    };
  }
  canonicalRepoFile(repoDir, STANDARD_AGENT_STAGE_MANIFEST_REF, 'stage_manifest_ref');
  let manifest: unknown;
  try {
    manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    invalid('Standard Agent stage manifest is not valid JSON.', {
      repo_dir: repoDir,
      relative_path: STANDARD_AGENT_STAGE_MANIFEST_REF,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(manifest) || !Array.isArray(manifest.stages)) {
    invalid('Standard Agent stage manifest must declare a stages array.', {
      repo_dir: repoDir,
      relative_path: STANDARD_AGENT_STAGE_MANIFEST_REF,
    });
  }
  if (
    optionalString(manifest.surface_kind) !== STANDARD_STAGE_MANIFEST_SURFACE_KIND
    || optionalString(manifest.version) !== STANDARD_STAGE_MANIFEST_VERSION
  ) {
    invalid('Effective Stage prompt hydration requires the canonical Standard Agent manifest kind and version.', {
      repo_dir: repoDir,
      relative_path: STANDARD_AGENT_STAGE_MANIFEST_REF,
      expected_surface_kind: STANDARD_STAGE_MANIFEST_SURFACE_KIND,
      expected_version: STANDARD_STAGE_MANIFEST_VERSION,
    });
  }
  const stage = manifest.stages.find((entry) => isRecord(entry) && optionalString(entry.stage_id) === stageId);
  if (!isRecord(stage)) {
    return {
      status: 'stage_not_declared',
      stage_id: stageId,
      source_manifest_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
      source_ref: null,
      layer: null,
      sha256: null,
      size_bytes: 0,
      content: null,
    };
  }
  const promptRef = optionalString(stage.prompt_ref);
  if (!promptRef) {
    invalid('Declared Standard Agent stage is missing prompt_ref.', {
      repo_dir: repoDir,
      stage_id: stageId,
    });
  }
  const prompt = readStandardAgentStagePromptFile(repoDir, promptRef);
  return {
    status: 'hydrated',
    stage_id: stageId,
    source_manifest_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
    source_ref: prompt.ref,
    layer: prompt.layer,
    sha256: prompt.sha256,
    size_bytes: prompt.size_bytes,
    content: prompt.content,
  };
}
