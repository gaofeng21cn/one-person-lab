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

export function resolveStandardAgentRepoFile(repoDir: string, ref: string, field: string) {
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
  const resolved = resolveStandardAgentRepoFile(repoDir, promptRef, 'stage.prompt_ref');
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

function markdownHeadingSlug(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function markdownHeadings(content: string) {
  const lines = content.split(/\r?\n/);
  const headings: Array<{ line: number; level: number; slug: string }> = [];
  let fence: { marker: '`' | '~'; length: number } | null = null;
  for (let line = 0; line < lines.length; line += 1) {
    const source = lines[line] ?? '';
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(source);
    if (fenceMatch) {
      const run = fenceMatch[1]!;
      const marker = run[0] as '`' | '~';
      if (!fence) {
        fence = { marker, length: run.length };
      } else if (fence.marker === marker && run.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(source);
    if (!heading) continue;
    headings.push({
      line,
      level: heading[1]!.length,
      slug: markdownHeadingSlug(heading[2]!),
    });
  }
  return { lines, headings };
}

function qualityRolePromptSection(content: string, promptRef: string, repoDir: string, fragment: string) {
  let decodedFragment: string;
  try {
    decodedFragment = decodeURIComponent(fragment).replace(/^#/, '').trim().toLowerCase();
  } catch {
    invalid('quality role prompt fragment is not valid URL encoding.', {
      repo_dir: repoDir,
      prompt_ref: promptRef,
      fragment,
    });
  }
  if (!decodedFragment) {
    invalid('quality role prompt fragment must be non-empty.', { repo_dir: repoDir, prompt_ref: promptRef });
  }
  const { lines, headings } = markdownHeadings(content);
  const matches = headings.filter((heading) => heading.slug === decodedFragment);
  if (matches.length !== 1) {
    invalid(
      matches.length === 0
        ? 'quality role prompt fragment does not resolve to a Markdown section.'
        : 'quality role prompt fragment resolves to multiple Markdown sections.',
      {
        repo_dir: repoDir,
        prompt_ref: promptRef,
        fragment: decodedFragment,
        matching_section_count: matches.length,
      },
    );
  }
  const selected = matches[0]!;
  const next = headings.find((heading) =>
    heading.line > selected.line && heading.level <= selected.level
  );
  return lines.slice(selected.line, next?.line ?? lines.length).join('\n').trim();
}

export function readStandardAgentQualityRolePromptFile(repoDir: string, promptRef: string) {
  const fragmentIndex = promptRef.indexOf('#');
  const fileRef = fragmentIndex === -1 ? promptRef : promptRef.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? null : promptRef.slice(fragmentIndex + 1);
  const prompt = readStandardAgentStagePromptFile(repoDir, fileRef);
  const content = fragment === null
    ? prompt.content
    : qualityRolePromptSection(prompt.content, promptRef, repoDir, fragment);
  return {
    ...prompt,
    ref: promptRef,
    layer: 'domain_stage_quality_role_prompt' as const,
    source_file_ref: fileRef,
    source_file_sha256: prompt.sha256,
    source_file_size_bytes: prompt.size_bytes,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    size_bytes: Buffer.byteLength(content, 'utf8'),
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
  resolveStandardAgentRepoFile(repoDir, STANDARD_AGENT_STAGE_MANIFEST_REF, 'stage_manifest_ref');
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
