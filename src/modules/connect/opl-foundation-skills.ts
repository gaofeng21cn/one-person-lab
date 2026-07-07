import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

type FoundationSkillScope = 'project' | 'workspace' | 'quest';
type FoundationSkillExposureScope =
  | 'source_only'
  | 'project_local'
  | 'workspace_local'
  | 'quest_local'
  | 'domain_profile'
  | 'developer_codex'
  | 'global_user';

export type FoundationSkillsSyncInput = {
  skill: string;
  scope: string;
  targetRoot?: string;
};

type FoundationSkillCard = {
  skill_id: string;
  name: string;
  description: string;
  exposure_scope: FoundationSkillExposureScope | null;
  activation_gate: string | null;
  default_global_user: boolean;
  allowed_sync_scopes: FoundationSkillScope[];
  source_path: string;
  content_sha256: string;
  has_kernel: boolean;
};

type FoundationSkillExposureEntry = {
  skill_id: string;
  exposure_scope: FoundationSkillExposureScope;
  activation_gate: string;
  default_global_user: boolean;
  kernel: boolean;
  authority_boundary: string[];
};

type FoundationSkillNoRegressionRedirect = {
  retired_skill_id: string;
  covered_by_skill_id: string;
  coverage_kind: string;
  exposure_scope: FoundationSkillExposureScope;
  default_global_user: boolean;
  capability_preserved: boolean;
  reason: string;
};

const FOUNDATION_PLUGIN_ROOT = new URL('../../../plugins/opl-foundation-skills', import.meta.url);
const FOUNDATION_EXPOSURE_REF = 'plugins/opl-foundation-skills/exposure.json';

function foundationPluginRoot() {
  return path.resolve(FOUNDATION_PLUGIN_ROOT.pathname);
}

function foundationSkillsRoot() {
  return path.join(foundationPluginRoot(), 'skills');
}

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function assertSafeSkillId(skill: string) {
  const skillId = normalizeOptionalString(skill);
  if (!skillId || skillId.includes('/') || skillId.includes('\\') || skillId === '.' || skillId === '..') {
    throw new FrameworkContractError('cli_usage_error', 'Foundation skill sync requires --skill <skill-id>.', {
      skill,
    });
  }
  return skillId;
}

function readTextIfPresent(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function firstYamlString(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/g, '');
}

function extractFrontmatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? '';
}

function digestDirectory(root: string) {
  const hash = crypto.createHash('sha256');
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      hash.update(relative);
      hash.update('\0');
      hash.update(fs.readFileSync(absolute));
      hash.update('\0');
    }
  };
  walk(root);
  return hash.digest('hex');
}

function parseExposureScope(value: unknown, skillId: string): FoundationSkillExposureScope {
  if (
    value === 'source_only'
    || value === 'project_local'
    || value === 'workspace_local'
    || value === 'quest_local'
    || value === 'domain_profile'
    || value === 'developer_codex'
    || value === 'global_user'
  ) {
    return value;
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Foundation skill exposure manifest contains an invalid exposure scope.', {
    file: FOUNDATION_EXPOSURE_REF,
    skill_id: skillId,
    exposure_scope: value,
  });
}

function readExposureManifest() {
  const manifestPath = path.join(foundationPluginRoot(), 'exposure.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const parsed = parseJsonText(readTextIfPresent(manifestPath));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Foundation skills exposure manifest must be an object.', {
      file: FOUNDATION_EXPOSURE_REF,
    });
  }
  const skills = (parsed as { skills?: unknown }).skills;
  if (!Array.isArray(skills)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Foundation skills exposure manifest must contain skills[].', {
      file: FOUNDATION_EXPOSURE_REF,
    });
  }
  const entries = new Map<string, FoundationSkillExposureEntry>();
  for (const [index, entry] of skills.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Foundation skills exposure manifest contains an invalid skill id.', {
        file: FOUNDATION_EXPOSURE_REF,
        index,
      });
    }
    const record = entry as Record<string, unknown>;
    const skillId = assertSafeSkillId(String(record.skill_id ?? record.id ?? ''));
    if (entries.has(skillId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Foundation skills exposure manifest contains duplicate skill ids.', {
        file: FOUNDATION_EXPOSURE_REF,
        skill_id: skillId,
      });
    }
    const activationGate = normalizeOptionalString(String(record.activation_gate ?? ''));
    if (!activationGate) {
      throw new FrameworkContractError('contract_shape_invalid', 'Foundation skill exposure manifest entry is missing activation_gate.', {
        file: FOUNDATION_EXPOSURE_REF,
        skill_id: skillId,
      });
    }
    entries.set(skillId, {
      skill_id: skillId,
      exposure_scope: parseExposureScope(record.exposure_scope, skillId),
      activation_gate: activationGate,
      default_global_user: record.default_global_user === true,
      kernel: record.kernel === true,
      authority_boundary: Array.isArray(record.authority_boundary)
        ? record.authority_boundary.filter((value): value is string => typeof value === 'string')
        : [],
    });
  }
  const redirects = (parsed as { no_regression_redirects?: unknown }).no_regression_redirects;
  const noRegressionRedirects: FoundationSkillNoRegressionRedirect[] = [];
  if (redirects !== undefined) {
    if (!Array.isArray(redirects)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Foundation skills exposure manifest no_regression_redirects must be an array.', {
        file: FOUNDATION_EXPOSURE_REF,
      });
    }
    for (const [index, redirect] of redirects.entries()) {
      if (!redirect || typeof redirect !== 'object' || Array.isArray(redirect)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Foundation skills exposure manifest contains an invalid no-regression redirect.', {
          file: FOUNDATION_EXPOSURE_REF,
          index,
        });
      }
      const record = redirect as Record<string, unknown>;
      const retiredSkillId = assertSafeSkillId(String(record.retired_skill_id ?? ''));
      const coveredBySkillId = assertSafeSkillId(String(record.covered_by_skill_id ?? ''));
      const coverageKind = normalizeOptionalString(String(record.coverage_kind ?? ''));
      const reason = normalizeOptionalString(String(record.reason ?? ''));
      if (!coverageKind || !reason) {
        throw new FrameworkContractError('contract_shape_invalid', 'Foundation skills no-regression redirect requires coverage_kind and reason.', {
          file: FOUNDATION_EXPOSURE_REF,
          retired_skill_id: retiredSkillId,
        });
      }
      noRegressionRedirects.push({
        retired_skill_id: retiredSkillId,
        covered_by_skill_id: coveredBySkillId,
        coverage_kind: coverageKind,
        exposure_scope: parseExposureScope(record.exposure_scope, retiredSkillId),
        default_global_user: record.default_global_user === true,
        capability_preserved: record.capability_preserved === true,
        reason,
      });
    }
  }
  return {
    entries,
    no_regression_redirects: noRegressionRedirects,
  };
}

function allowedSyncScopesForExposure(exposureScope: FoundationSkillExposureScope | null): FoundationSkillScope[] {
  if (exposureScope === 'project_local' || exposureScope === 'developer_codex') {
    return ['project'];
  }
  if (exposureScope === 'workspace_local') {
    return ['workspace', 'quest'];
  }
  if (exposureScope === 'quest_local') {
    return ['quest'];
  }
  return [];
}

function sourceSkillIds() {
  const skillsRoot = foundationSkillsRoot();
  if (!fs.existsSync(skillsRoot)) {
    throw new FrameworkContractError('contract_file_missing', 'OPL Foundation Skills source directory is missing.', {
      skills_root: skillsRoot,
    });
  }
  const exposureEntries = readExposureManifest();
  const skillIds = exposureEntries
    ? [...exposureEntries.entries.keys()]
    : fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  return {
    manifest_status: exposureEntries ? 'exposure_manifest' : 'derived_from_source_skills',
    manifest_ref: exposureEntries ? FOUNDATION_EXPOSURE_REF : null,
    skill_ids: skillIds.sort((a, b) => a.localeCompare(b)),
    exposure_entries: exposureEntries?.entries ?? null,
    no_regression_redirects: exposureEntries?.no_regression_redirects ?? [],
  };
}

function readSkillCard(skillId: string, exposureEntry?: FoundationSkillExposureEntry): FoundationSkillCard {
  const safeSkillId = assertSafeSkillId(skillId);
  const skillRoot = path.join(foundationSkillsRoot(), safeSkillId);
  const skillPath = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new FrameworkContractError('codex_command_failed', 'Foundation skill was not found.', {
      skill_id: safeSkillId,
      available_skill_ids: sourceSkillIds().skill_ids,
    });
  }
  const markdown = readTextIfPresent(skillPath);
  const frontmatter = extractFrontmatter(markdown);
  return {
    skill_id: safeSkillId,
    name: firstYamlString(frontmatter, 'name') || safeSkillId,
    description: firstYamlString(frontmatter, 'description'),
    exposure_scope: exposureEntry?.exposure_scope ?? null,
    activation_gate: exposureEntry?.activation_gate ?? null,
    default_global_user: exposureEntry?.default_global_user ?? false,
    allowed_sync_scopes: allowedSyncScopesForExposure(exposureEntry?.exposure_scope ?? null),
    source_path: skillRoot,
    content_sha256: digestDirectory(skillRoot),
    has_kernel: fs.existsSync(path.join(skillRoot, 'kernel.py')),
  };
}

function authorityBoundary() {
  return {
    read_only_inspect: true,
    single_skill_sync_only: true,
    global_user_scope_allowed: false,
    codex_scope_allowed: false,
    can_write_codex_global_config: false,
    can_write_opl_marketplace: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function parseScope(scope: string): FoundationSkillScope {
  if (scope === 'project' || scope === 'workspace' || scope === 'quest') {
    return scope;
  }
  throw new FrameworkContractError('cli_usage_error', 'Foundation skill sync requires --scope project|workspace|quest.', {
    scope,
    forbidden_scopes: ['global', 'global_user', 'codex'],
  });
}

function requireTargetRoot(targetRoot: string | undefined) {
  const normalized = normalizeOptionalString(targetRoot);
  if (!normalized) {
    throw new FrameworkContractError('cli_usage_error', 'Foundation skill sync requires --target-root <path>.', {
      required: ['--target-root'],
    });
  }
  return path.resolve(normalized);
}

function assertSkillAllowedForScope(skill: FoundationSkillCard, scope: FoundationSkillScope) {
  if (skill.default_global_user || skill.exposure_scope === 'global_user') {
    throw new FrameworkContractError('cli_usage_error', 'Foundation skills cannot sync through global user scope.', {
      skill_id: skill.skill_id,
      exposure_scope: skill.exposure_scope,
    });
  }
  if (!skill.allowed_sync_scopes.includes(scope)) {
    throw new FrameworkContractError('cli_usage_error', 'Foundation skill exposure scope does not allow the requested sync scope.', {
      skill_id: skill.skill_id,
      exposure_scope: skill.exposure_scope,
      requested_scope: scope,
      allowed_sync_scopes: skill.allowed_sync_scopes,
    });
  }
}

export function runOplConnectFoundationSkillsInspect() {
  const source = sourceSkillIds();
  const skills = source.skill_ids.map((skillId) => readSkillCard(skillId, source.exposure_entries?.get(skillId)));
  return {
    version: 'g2',
    opl_connect_foundation_skills: {
      surface_kind: 'opl_connect_foundation_skills_inspect',
      status: 'completed',
      plugin_root: foundationPluginRoot(),
      manifest_status: source.manifest_status,
      manifest_ref: source.manifest_ref,
      skill_count: skills.length,
      skills,
      no_regression_redirects: source.no_regression_redirects,
      sync_command_ref: 'opl connect foundation-skills sync --skill <skill-id> --scope project|workspace|quest --target-root <path> --json',
      authority_boundary: authorityBoundary(),
    },
  };
}

export function runOplConnectFoundationSkillsSync(input: FoundationSkillsSyncInput) {
  const skillId = assertSafeSkillId(input.skill);
  const scope = parseScope(input.scope);
  const targetRoot = requireTargetRoot(input.targetRoot);
  const exposureEntries = readExposureManifest();
  const skill = readSkillCard(skillId, exposureEntries?.entries.get(skillId));
  assertSkillAllowedForScope(skill, scope);
  const targetSkillRoot = path.join(targetRoot, '.codex', 'skills', skillId);

  fs.rmSync(targetSkillRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetSkillRoot), { recursive: true });
  fs.cpSync(skill.source_path, targetSkillRoot, { recursive: true });
  fs.rmSync(path.join(targetSkillRoot, '.git'), { recursive: true, force: true });

  const receipt = {
    receipt_kind: 'opl_connect_foundation_skill_sync_readback',
    source_plugin: 'opl-foundation-skills',
    source_skill_root: skill.source_path,
    skill_id: skillId,
    skill_content_sha256: skill.content_sha256,
    target_scope: scope,
    exposure_scope: skill.exposure_scope,
    activation_gate: skill.activation_gate,
    target_root: targetRoot,
    target_skill_root: targetSkillRoot,
    sync_policy: 'explicit_single_foundation_skill_only',
    authority_boundary: authorityBoundary(),
  };
  const receiptPath = path.join(targetSkillRoot, '.opl-foundation-skill-sync-readback.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  return {
    version: 'g2',
    opl_connect_foundation_skills: {
      surface_kind: 'opl_connect_foundation_skill_sync',
      status: 'synced',
      skill,
      target_scope: scope,
      target_root: targetRoot,
      target_skill_root: targetSkillRoot,
      readback_path: receiptPath,
      copied_roots: fs.readdirSync(targetSkillRoot).sort(),
      no_authority: true,
      authority_boundary: authorityBoundary(),
    },
  };
}
