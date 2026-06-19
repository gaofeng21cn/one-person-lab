import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import {
  buildGeneratedInterfaceBundle,
  selectGeneratedInterfaceBundleFormat,
} from './domain-pack-compiler/generated-interface-read-model.ts';
import { normalizeFamilyActionCatalog } from './family-action-catalog-contract.ts';
import { normalizeFamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
import { buildFunctionalPrivatizationAudit } from './functional-privatization-audit.ts';
import { syncOplCompanionSkills, type OplCompanionSkillApplyMode, type OplSuperpowersProfile } from './install-companions.ts';
import { developerModePrefersLocalCheckouts } from './developer-mode-source-policy.ts';
import { registerOplFamilyCodexPlugins } from './system-installation/codex-plugin-registry.ts';
import type { OplModuleId } from './system-installation/shared.ts';
import {
  resolveDefaultFamilyWorkspaceRoot as resolveDefaultFamilyWorkspaceRootImpl,
  resolveFamilyWorkspaceRootFromRepoRoot as resolveFamilyWorkspaceRootFromRepoRootImpl,
} from './family-workspace-root.ts';
import {
  FAMILY_SKILL_PACK_SPECS,
  normalizeDomainSelection,
  type InspectFamilySkillPack,
  type SkillPackSpec,
  type SyncFamilySkillPack,
} from './opl-skills-parts/registry.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';

export const resolveDefaultFamilyWorkspaceRoot = resolveDefaultFamilyWorkspaceRootImpl;
export const resolveFamilyWorkspaceRootFromRepoRoot = resolveFamilyWorkspaceRootFromRepoRootImpl;

type ReadFamilySkillPacksOptions = {
  domains?: string[];
};

type SyncFamilySkillPacksOptions = ReadFamilySkillPacksOptions & {
  home?: string;
  companionMode?: OplCompanionSkillApplyMode;
  superpowersProfile?: OplSuperpowersProfile;
};

const FOUNDRY_AGENT_SERIES_CONTRACT_REF = 'contracts/opl-framework/foundry-agent-series-contract.json';
const FOUNDRY_AGENT_SERIES_CONTRACT_URL = new URL(
  '../contracts/opl-framework/foundry-agent-series-contract.json',
  import.meta.url,
);
let cachedFoundryAgentSeriesContract: Record<string, unknown> | null = null;

function isDirectory(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function resolveManagedModulesRoot() {
  const explicitRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  return path.join(resolveOplStatePaths().state_dir, 'modules');
}

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveCodexHome(home: string) {
  return normalizeOptionalString(process.env.CODEX_HOME) ?? path.join(home, '.codex');
}

function resolveOplStateDirForHome(home?: string) {
  const explicitStateDir = normalizeOptionalString(process.env.OPL_STATE_DIR);
  if (explicitStateDir) {
    return path.resolve(explicitStateDir);
  }
  if (home) {
    return path.join(path.resolve(home), 'Library', 'Application Support', 'OPL', 'state');
  }
  return resolveOplStatePaths().state_dir;
}

function resolveGeneratedPluginRootForName(canonicalPluginName: string, home?: string) {
  return path.join(
    resolveOplStateDirForHome(home),
    'generated-codex-plugins',
    `${canonicalPluginName}-local`,
    'plugins',
    canonicalPluginName,
  );
}

function resolveRepoRoot(spec: SkillPackSpec) {
  const envKey = `OPL_${spec.domain_id.toUpperCase()}_REPO_ROOT`;
  const envValue = normalizeOptionalString(process.env[envKey]);
  if (envValue) {
    return path.resolve(envValue);
  }

  const siblingRepoRoot = path.join(resolveDefaultFamilyWorkspaceRoot(), spec.project);
  const gitCheckoutSourceMode = normalizeOptionalString(process.env.OPL_MODULE_SOURCE_MODE) === 'git_checkout'
    || developerModePrefersLocalCheckouts();
  if (gitCheckoutSourceMode && isDirectory(siblingRepoRoot)) {
    return siblingRepoRoot;
  }

  const managedRepoRoot = path.join(resolveManagedModulesRoot(), spec.project);
  if (isDirectory(managedRepoRoot)) {
    return managedRepoRoot;
  }

  const modulePathValue = normalizeOptionalString(process.env[`OPL_MODULE_PATH_${spec.module_id}`]);
  if (modulePathValue) {
    return path.resolve(modulePathValue);
  }

  if (isDirectory(siblingRepoRoot)) {
    return siblingRepoRoot;
  }

  return managedRepoRoot;
}

function buildPluginManifestPath(spec: SkillPackSpec, repoRoot: string) {
  if (spec.source_kind === 'opl_generated_plugin_surface') {
    return path.join(
      resolveGeneratedPluginRootForName(spec.canonical_plugin_name),
      '.codex-plugin',
      'plugin.json',
    );
  }

  return resolveFirstExistingPath([
    path.join(repoRoot, '.codex-plugin', 'plugin.json'),
    path.join(repoRoot, 'plugins', spec.canonical_plugin_name, '.codex-plugin', 'plugin.json'),
    path.join(repoRoot, 'plugins', spec.plugin_name, '.codex-plugin', 'plugin.json'),
  ]);
}

function buildSkillEntryPath(spec: SkillPackSpec, repoRoot: string) {
  if (spec.source_kind === 'opl_generated_plugin_surface') {
    return path.join(
      resolveGeneratedPluginRootForName(spec.canonical_plugin_name),
      'skills',
      spec.canonical_plugin_name,
      'SKILL.md',
    );
  }

  return resolveFirstExistingPath([
    path.join(repoRoot, 'plugins', spec.canonical_plugin_name, 'skills', spec.canonical_plugin_name, 'SKILL.md'),
    path.join(repoRoot, 'plugins', spec.plugin_name, 'skills', spec.plugin_name, 'SKILL.md'),
  ]);
}

function buildInstallerPath(spec: SkillPackSpec, repoRoot: string) {
  if (spec.installer_relative_paths.length === 0) {
    return '';
  }
  return resolveFirstExistingPath(spec.installer_relative_paths.map((relativePath) => path.join(repoRoot, relativePath)));
}

function resolveFirstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function buildPluginSourcePath(pluginManifestPath: string) {
  return path.dirname(path.dirname(pluginManifestPath));
}

function buildInstallerCommandPreview(
  spec: SkillPackSpec,
  repoRoot: string,
  _home?: string,
) {
  if (spec.source_kind === 'opl_generated_plugin_surface') {
    return ['opl', 'agents', 'interfaces', '--repo-dir', repoRoot, '--format', 'skill'];
  }

  return ['opl', 'connect', 'sync-skills', '--domain', spec.domain_id];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFoundryAgentSeriesContract() {
  if (!cachedFoundryAgentSeriesContract) {
    const contract = JSON.parse(
      fs.readFileSync(FOUNDRY_AGENT_SERIES_CONTRACT_URL, 'utf8'),
    ) as unknown;
    if (!isRecord(contract)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Foundry Agent series contract must contain an object root.',
        { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF },
      );
    }
    cachedFoundryAgentSeriesContract = contract;
  }
  return cachedFoundryAgentSeriesContract;
}

function readObjectField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing object field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value;
}

function readStringField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing string field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value.trim();
}

function readStringListField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (!Array.isArray(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing string list field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        `Foundry Agent series contract is missing string field: ${field}[${index}].`,
        { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field: `${field}[${index}]` },
      );
    }
    return entry.trim();
  });
}

function readBooleanField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing boolean field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value;
}

function buildFoundryAgentSeriesProjection(spec: SkillPackSpec) {
  const contract = readFoundryAgentSeriesContract();
  const commandSurface = readObjectField(contract, 'agent_cli_command_surface_policy');
  const skillMcp = readObjectField(contract, 'skill_mcp_surface_policy');
  const retirement = readObjectField(contract, 'legacy_implementation_bucket_retirement_policy');
  const versionPolicy = readObjectField(contract, 'contract_version_policy');
  const policyRelease = readObjectField(contract, 'shared_policy_release');
  const foundryAgentId = spec.canonical_plugin_name === 'opl-meta-agent' ? 'oma' : spec.canonical_plugin_name;
  const brandCli = spec.canonical_plugin_name === 'opl-meta-agent' ? 'oma' : spec.canonical_plugin_name;
  const generatedSurfaceOnly = spec.source_kind === 'opl_generated_plugin_surface';
  const directCli = spec.canonical_plugin_name === 'opl-meta-agent'
    ? 'opl agents interfaces --repo-dir <opl-meta-agent-repo>'
    : spec.canonical_plugin_name === 'opl-bookforge'
      ? 'opl agents interfaces --repo-dir <opl-bookforge-repo>'
    : spec.canonical_plugin_name === 'mas'
      ? 'medautosci'
      : spec.canonical_plugin_name === 'mag'
        ? 'medautogrant'
        : 'redcube';
  const codexExecutableCli = spec.canonical_plugin_name === 'opl-meta-agent'
    ? `opl foundry agents inspect ${foundryAgentId}`
    : spec.canonical_plugin_name === 'opl-bookforge'
      ? `opl foundry agents inspect ${foundryAgentId}`
    : spec.canonical_plugin_name === 'mas'
      ? 'medautosci'
      : spec.canonical_plugin_name === 'mag'
        ? '<med-autogrant-repo>/scripts/run-python-clean.sh -m med_autogrant.cli'
        : 'npm run --prefix <redcube-ai-repo> redcube --';
  const workAlias = spec.canonical_plugin_name === 'mas'
    ? 'study'
    : spec.canonical_plugin_name === 'mag'
      ? 'grant'
      : spec.canonical_plugin_name === 'rca'
        ? 'deck'
        : spec.canonical_plugin_name === 'opl-bookforge'
          ? 'book'
          : 'agent';
  const ordinaryOperations = readStringListField(commandSurface, 'ordinary_operations');
  const ordinarySpine = readStringListField(commandSurface, 'ordinary_public_command_surface_spine');
  const directCliFoundryCommandSurface = generatedSurfaceOnly
    ? `opl foundry agents inspect ${foundryAgentId}`
    : `${directCli} foundry`;
  const compatibilityFoundryCommandSurface = generatedSurfaceOnly
    ? directCli
    : `${directCli} foundry`;
  const directCliFoundryOperations = generatedSurfaceOnly
    ? ordinaryOperations.map((operation) => `opl agents foundry ${operation}`)
    : ordinaryOperations.map((operation) => `${directCli} foundry ${operation}`);
  const compatibilityFoundryOperations = generatedSurfaceOnly
    ? [directCli]
    : ordinaryOperations.map((operation) => `${directCli} foundry ${operation}`);

  return {
    foundry_agent_series: {
      series_id: 'opl_foundry_agent_series.v1',
      series_label: readStringField(commandSurface, 'agent_cli_series_label'),
      foundry_agent_id: foundryAgentId,
      domain_id: spec.domain_id,
      canonical_command_surface: readStringField(commandSurface, 'canonical_opl_command_surface'),
      product_model: readStringField(contract, 'product_model'),
      series_contract_ref: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
      domain_contract_ref: readStringField(versionPolicy, 'domain_contract_ref'),
      policy_release_ref: readStringField(policyRelease, 'policy_release_contract_ref'),
      brand_cli: brandCli,
      direct_domain_cli: directCli,
      direct_cli: directCli,
      codex_executable_cli: codexExecutableCli,
      direct_cli_foundry_command_surface: directCliFoundryCommandSurface,
      codex_executable_foundry_command_surface: generatedSurfaceOnly
        ? directCliFoundryCommandSurface
        : `${codexExecutableCli} foundry`,
      compatibility_foundry_command_surface: compatibilityFoundryCommandSurface,
      generated_surface_only: generatedSurfaceOnly,
      ordinary_golden_path:
        `${workAlias} -> stage -> domain owner receipt or typed blocker -> handoff`,
    },
    command_surface_spine: {
      surface_kind: 'opl_foundry_agent_skill_command_surface_spine_projection',
      ordinary_public_command_surface_spine: ordinarySpine,
      ordinary_operations: ordinaryOperations,
      direct_cli_foundry_operations: directCliFoundryOperations,
      compatibility_foundry_operations: compatibilityFoundryOperations,
      work_alias: workAlias,
      work_alias_command_pattern: generatedSurfaceOnly
        ? `opl foundry agents inspect ${foundryAgentId}`
        : `${directCli} ${workAlias} ...`,
      required_public_surface_derivatives: readStringListField(commandSurface, 'required_public_surface_derivatives'),
      skill_sync_command_surface: readStringField(skillMcp, 'canonical_skill_sync_command_surface'),
      skill_inspect_command_surface: readStringField(skillMcp, 'canonical_skill_connect_command_surface'),
      foundry_agent_inspect_command_surface: `opl foundry agents inspect ${foundryAgentId}`,
      agent_cli_must_use_series_spine: readBooleanField(commandSurface, 'agent_cli_must_use_series_spine'),
      agent_cli_must_not_replicate_top_level_modules: readBooleanField(
        commandSurface,
        'agent_cli_must_not_replicate_top_level_modules',
      ),
    },
    mcp_projection: {
      surface_kind: 'opl_foundry_agent_mcp_delegate_projection',
      descriptor_ref: readStringField(skillMcp, 'canonical_mcp_projection_ref'),
      mcp_descriptor_must_delegate_to_series_spine: readBooleanField(
        skillMcp,
        'mcp_descriptor_must_delegate_to_series_spine',
      ),
      series_delegate_tool_refs: [
        generatedSurfaceOnly ? 'opl agents foundry interfaces' : `${directCli} foundry interfaces`,
        generatedSurfaceOnly ? 'opl agents foundry status' : `${directCli} foundry status`,
        `opl foundry agents inspect ${foundryAgentId}`,
      ],
      legacy_standalone_mcp_servers_retired: readBooleanField(
        skillMcp,
        'legacy_standalone_mcp_servers_retired',
      ),
      plugin_registry_is_canonical_transport: true,
    },
    legacy_implementation_bucket_policy: {
      surface_kind: 'opl_foundry_agent_legacy_bucket_policy_projection',
      ordinary_public_command_surface_allowed: readBooleanField(retirement, 'ordinary_public_command_surface_allowed'),
      replacement_command_surface: readStringField(retirement, 'replacement_command_surface'),
      retired_bucket_prefixes: readStringListField(retirement, 'retired_bucket_prefixes'),
      allowed_retained_read_surfaces: readStringListField(retirement, 'allowed_retained_read_surfaces'),
    },
  };
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readRepoJson(repoRoot: string, relativePath: string) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function buildRepoGeneratedSkillBundle(repoRoot: string) {
  const domainDescriptor = readRepoJson(repoRoot, path.join('contracts', 'domain_descriptor.json'));
  const actionCatalog = normalizeFamilyActionCatalog(
    readRepoJson(repoRoot, path.join('contracts', 'action_catalog.json')),
  );
  const stageControlPlane = normalizeFamilyStageControlPlane(
    readRepoJson(repoRoot, path.join('contracts', 'stage_control_plane.json')),
  );
  const functionalAuditRaw = readRepoJson(repoRoot, path.join('contracts', 'functional_privatization_audit.json'));
  const generatedSurfaceHandoff = readRepoJson(repoRoot, path.join('contracts', 'generated_surface_handoff.json'));
  const functionalAudit = buildFunctionalPrivatizationAudit({
    target_domain_id:
      actionCatalog?.target_domain_id
      ?? stageControlPlane?.target_domain_id
      ?? (isRecord(domainDescriptor) ? normalizeOptionalString(String(domainDescriptor.domain_id ?? '')) : null)
      ?? path.basename(repoRoot),
    functional_privatization_audit: isRecord(functionalAuditRaw) ? functionalAuditRaw : undefined,
  });
  const blockerReasons = [
    actionCatalog ? null : 'missing_contract:contracts/action_catalog.json',
    stageControlPlane ? null : 'missing_or_invalid_contract:contracts/stage_control_plane.json',
    functionalAudit.summary.opl_owned_replacement_count > 0
      || functionalAudit.summary.temporary_migration_bridge_count > 0
      || functionalAudit.summary.retire_tombstone_count > 0
      || functionalAudit.summary.active_private_generic_residue_count > 0
      || functionalAudit.summary.blocker_count > 0
      ? 'functional_privatization_audit_has_generic_residue_or_blocker'
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const status = blockerReasons.length === 0 ? 'ready' : 'blocked';
  const targetDomainId =
    actionCatalog?.target_domain_id
    ?? stageControlPlane?.target_domain_id
    ?? (isRecord(domainDescriptor) ? normalizeOptionalString(String(domainDescriptor.domain_id ?? '')) : null)
    ?? path.basename(repoRoot);
  const descriptor = {
    project_id: targetDomainId,
    project: isRecord(domainDescriptor)
      ? normalizeOptionalString(String(domainDescriptor.domain_label ?? '')) ?? targetDomainId
      : targetDomainId,
    target_domain_id: targetDomainId,
    agent_id: isRecord(domainDescriptor)
      ? normalizeOptionalString(String(domainDescriptor.domain_id ?? '')) ?? targetDomainId
      : targetDomainId,
    family_action_catalog: {
      status: actionCatalog ? 'resolved' : 'missing',
      raw_descriptor: actionCatalog,
    },
    family_stage_control_plane: {
      status: stageControlPlane ? 'resolved' : 'missing',
      raw_descriptor: stageControlPlane,
    },
    generated_surface_handoff_contract: generatedSurfaceHandoff,
    functional_privatization_audit: {
      status: functionalAudit.status,
      summary: functionalAudit.summary,
      modules: functionalAudit.modules,
    },
  };
  const bundle = selectGeneratedInterfaceBundleFormat(
    buildGeneratedInterfaceBundle(descriptor, status, 'skill') as Record<string, unknown>,
    'skill',
  );
  return {
    bundle,
    status,
    blocker_reasons: blockerReasons,
  };
}

function inspectGeneratedSkillSurface(spec: SkillPackSpec, repoRoot: string) {
  if (spec.source_kind !== 'opl_generated_plugin_surface') {
    return {
      ready: false,
      status: null,
    };
  }
  try {
    const generated = buildRepoGeneratedSkillBundle(repoRoot);
    const skillBlock = isRecord(generated.bundle.skill) ? generated.bundle.skill : null;
    return {
      ready:
        generated.status === 'ready'
        && generated.bundle.status === 'ready'
        && skillBlock?.status === 'ready'
        && recordList(skillBlock.descriptors).length > 0,
      status: typeof skillBlock?.status === 'string' ? skillBlock.status : generated.status,
    };
  } catch {
    return {
      ready: false,
      status: 'blocked_invalid_generated_skill_contracts',
    };
  }
}

function normalizeFrontmatterScalar(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/^['"]|['"]$/g, '').trim();
}

function readSkillFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = match?.[1] ?? '';
  const body = match ? content.slice(match[0].length) : content;
  const name = normalizeFrontmatterScalar(frontmatter.match(/^name:\s*(.+)$/m)?.[1]);
  const description = normalizeFrontmatterScalar(frontmatter.match(/^description:\s*(.+)$/m)?.[1]);

  return { name, description, body };
}

function validateSkillEntry(spec: SkillPackSpec, skillEntryPath: string, skillEntryFound: boolean) {
  const errors: string[] = [];

  if (!skillEntryFound) {
    return { valid: false, errors };
  }

  let content = '';
  try {
    content = fs.readFileSync(skillEntryPath, 'utf8');
  } catch (error) {
    return {
      valid: false,
      errors: [`failed_to_read_skill_entry:${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const { name, description, body } = readSkillFrontmatter(content);
  if (name !== spec.canonical_plugin_name) {
    errors.push(`skill_name_mismatch:${name || '<missing>'}`);
  }
  if (!description) {
    errors.push('missing_skill_description');
  }
  if (/\btest skill\b/i.test(description)) {
    errors.push('legacy_test_skill_description');
  }
  if (body.trim() === `# ${spec.canonical_plugin_name}`) {
    errors.push('legacy_test_skill_body');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function syncCodexSkillMirror(inspected: InspectFamilySkillPack, home?: string) {
  if (!inspected.skill_entry_found || !inspected.skill_entry_valid) {
    return null;
  }

  const resolvedHome = home ? path.resolve(home) : (process.env.HOME ?? null);
  if (!resolvedHome) {
    return null;
  }

  const codexSkillDir = path.join(resolveCodexHome(resolvedHome), 'skills', inspected.canonical_plugin_name);

  if (['mas', 'mag', 'rca'].includes(inspected.canonical_plugin_name)) {
    fs.rmSync(codexSkillDir, { recursive: true, force: true });
    return null;
  }

  fs.rmSync(codexSkillDir, { recursive: true, force: true });
  fs.cpSync(path.dirname(inspected.skill_entry_path), codexSkillDir, { recursive: true });

  return {
    skill_root: codexSkillDir,
    skill_entry_path: path.join(codexSkillDir, 'SKILL.md'),
  };
}

type GeneratedCodexPluginSpec = {
  skillDescription: string;
  heading: string;
  intro: string;
  authorityBoundary: string[];
  generatedSkillSections?: Array<{
    title: string;
    body: string[];
  }>;
  displayName: string;
  shortDescription: string;
  defaultPrompt: string;
  pluginDescription: string;
  homepage: string;
  repository: string;
  keywords: string[];
  category: string;
  longDescription: string;
  capabilities: string[];
  defaultPrompts: string[];
  brandColor: string;
  icon: {
    ariaLabel: string;
    background: string;
    paths: string[];
  };
};

function generatedCodexPluginSpec(inspected: InspectFamilySkillPack): GeneratedCodexPluginSpec {
  if (inspected.canonical_plugin_name === 'opl-bookforge') {
    return {
      skillDescription: 'Use when Codex should operate OPL BookForge for book storyline architecture, manuscript materialization, figures, tables, style control, export handoff, and owner-gated publication decisions.',
      heading: 'OPL BookForge',
      intro: 'Use this skill for OPL BookForge book-authoring workflows. This surface is generated by OPL Framework from the BookForge domain pack and packaged as an OPL-owned Codex plugin.',
      authorityBoundary: [
        'OPL owns the generated Skill and Codex plugin surfaces.',
        'OPL BookForge owns book-domain truth, manuscript quality rules, style policy, figure/table planning, export/publication verdict boundaries, artifact authority, memory body, and owner receipts.',
        'Do not treat generated interface readiness as book delivery ready, production ready, publication approved, or owner accepted.',
      ],
      generatedSkillSections: [
        {
          title: 'Reader And Style Contract Gate',
          body: [
            '- Before body drafting or chapter expansion, establish a reader-style contract: primary readers, secondary readers, excluded readers, reading situation, prior knowledge, reader anxieties, natural-expression rules, forbidden voice patterns, and owner-review status.',
            '- Keep reader priority explicit: primary readers define the writing target; secondary readers only add compatible accessibility constraints unless the owner explicitly promotes them to co-primary readers. Do not let secondary readers silently create separate chapter obligations, explanatory detours, lower-density exposition, difficulty downgrades, or voice targets.',
            '- Record author/source stance for major cases before body drafting. If the author team designed, executed, or participated in a case, draft from an approved practice-involved design/reflection stance instead of neutral third-party public-source observation, while keeping unsupported outcomes as typed evidence gaps.',
            '- If the owner did not specify the audience or voice and BookForge cannot infer them with high confidence from source refs, ask the owner or return a typed blocker; do not silently choose a generic educated-reader style.',
            '- Materialization must cite the reader-style contract in the production pipeline, chapter QC, and style consistency report so naturalness is checked against the intended readers, not a generic prose ideal.',
          ],
        },
        {
          title: 'Book Materialization Rules',
          body: [
            '- Keep book prose Markdown-first: per-chapter Markdown files or equivalent author-facing Markdown refs own manuscript body for book-length work.',
            '- Use scripts only as thin assemblers, metrics checkers, validators, exporters, and report writers. Do not make Python/TypeScript/shell/JSON string literals the manuscript source of truth for substantial prose.',
            '- Draft book-length work chapter-by-chapter: chapter brief -> chapter Markdown draft -> chapter-level QC -> merged manuscript -> whole-book pass. The merged `book.md` is an assembly/export ref, not the only creative writing surface unless the owner explicitly chooses a one-file workflow.',
            '- Before drafting visible chapter prose, create a reader-entry plan in the chapter brief or drafting notes: opening scene/question, reader tension, concrete example/case, main claim, section movement, table/figure role, and closing transition. Keep that plan out of the manuscript body.',
            '- Make first visible chapter drafts reader-facing by default: chapter task, core question, thesis, target budget, source refs, asset status, QC notes, and blockers belong in briefs/manifests/reports, not in manuscript prose.',
            '- Chapter openings and major section transitions should start from a concrete scene, reader tension, practical question, or consequence before introducing concepts, unless the reader-style contract explicitly calls for a technical structure.',
            '- Do not rely on a routine late reader-facing rewrite to make chapters natural; if a first draft reads like a memo or instruction manual, treat it as a drafting-gate failure and update the chapter-production pattern before continuing.',
            '- For book-length nonfiction, maintain owner-inspectable book memory: working memory for the active chapter context, episodic memory for prior chapter reviews and owner decisions, and semantic memory for durable thesis, source canon, glossary, style assets, and evidence rules.',
            '- Use chapter task cards as the chapter-runtime surface: reader promise, chapter job, thesis movement, source refs, target extent, figure/table obligations, active memory refs, style constraints, QC state, and blockers. Do not add a BookForge-private scheduler, queue, session store, or attempt ledger.',
            '- Back-propagate accepted chapter QC repairs into the chapter task card, style engine, glossary, evidence map, or semantic memory when the finding is reusable; do not only patch local prose when the defect is systemic.',
            '- Keep transparent prompt bundle refs for storyline shaping, chapter drafting, review, repair, style checks, publication proofing, and export handoff so owner review can inspect the instructions and source slices behind major passes.',
            '- Convert owner/source target extent into chapter budgets and an active production queue before body drafting; a short all-chapter coverage pass is only seed material unless chapter gates are met.',
            '- Treat chapter target budgets as production gates: below-target chapters stay `seed_in_progress` or `draft_in_progress`, not drafted/done, and below-target whole-book assemblies must be named previews.',
            '- After each chapter reaches text-ready or `chapter_draft_ready`, refresh an owner-review PDF that starts at the beginning of the book and stops at the first below-target required unit; keep text-ready-but-missing-figure chapters blocked from full readiness.',
            '- Use the BookForge PDF export helper or an equivalent BookForge-owned backend adapter for PDF generation, backed by real publication/typesetting systems such as Pandoc with XeLaTeX/LuaLaTeX, Quarto book rendering, or Typst; do not hand-roll book PDF layout with ad-hoc raster text drawing as the normal path.',
            '- For pre-numbered Chinese manuscripts or cumulative review PDFs, disable backend automatic section/caption numbering or otherwise prevent doubled labels such as `第七章 第五章` or `图 7.1: 图 5-1`.',
            '- Distinguish `review_pdf`, `publication_proof`, and `final_export`. Publication proof requires an explicit publication design profile, resource-path-backed asset resolution for relative figures, Markdown image-ref checks, figure-asset-manifest readiness checks, a real typesetting backend receipt, rendered-page refs, and rendered-page inspection for hierarchy, captions, figures, tables, callouts, page numbers, overflow, and visual rhythm. For Chinese nonfiction e-book proof output, use the bundled BookForge `bookforge-zh-publication-proof` profile or an owner-approved equivalent; unstyled Pandoc/default backend output is review-output quality, not publication-proof quality. Helper-generated machine-baseline rendered-page inspection can prove nonblank pages and asset plumbing, but it does not replace human publication-design review or owner final-export acceptance. Final export additionally requires owner/export acceptance receipts.',
            '- When an invalid compact/sample draft was created for a book-length target, retire it and rebuild from chapter packages instead of expanding the compact file in place.',
            '- Preserve owner/source-declared target extent. Compact/sample drafts require explicit owner approval or a typed extent blocker that quantifies missing pages, words, chapters, figures, tables, or cases.',
            '- Final manuscript figures that require new artwork should be `imagegen`-generated bitmap assets saved to project-local paths with prompt/spec, helper receipt/provenance, and review criteria, tracked through a figure asset manifest. Prefer the BookForge native imagegen asset helper or an equivalent BookForge-owned backend adapter that launches a child Codex executor with native imagegen enabled, copies the bitmap into the project, and synchronizes receipt state back into the figure asset manifest by figure id. Chat-preview-only, missing, or unexposed generated file paths are image-asset blockers.',
            '- Do not make direct OpenAI Base URL/API-key provider calls the default BookForge figure route. API fallback is an explicit operator/owner route for large batches or unavailable built-in imagegen.',
          ],
        },
      ],
      displayName: 'OPL BookForge',
      shortDescription: 'Book Foundry Agent for storyline-to-manuscript delivery.',
      defaultPrompt: 'Use $opl-bookforge to shape a book storyline, materialize chapters, plan figures and tables, run style/layout checks, or prepare owner-gated export handoff.',
      pluginDescription: 'OPL-generated Codex plugin shell for OPL BookForge.',
      homepage: 'https://github.com/gaofeng21cn/opl-bookforge',
      repository: 'https://github.com/gaofeng21cn/opl-bookforge',
      keywords: [
        'opl',
        'bookforge',
        'book-writing',
        'codex',
        'foundry-agent',
      ],
      category: 'Productivity',
      longDescription: 'Adds an OPL-generated Codex plugin entry for OPL BookForge while preserving BookForge as a standard declarative domain pack with OPL-owned generated surfaces and owner-gated publication readiness.',
      capabilities: [
        'Interactive',
        'Write',
      ],
      defaultPrompts: [
        'Shape this source corpus into a book storyline with reader promise, argument arc, chapter thesis chain, and style contract.',
        'Turn this approved storyline into a manuscript package with chapter drafts, figure and table plans, style checks, layout QC, and export handoff.',
        'Audit this manuscript for voice drift, generated-sounding phrasing, weak transitions, missing figures or tables, and export-blocking layout issues.',
      ],
      brandColor: '#8B3A2B',
      icon: {
        ariaLabel: 'OPL BookForge icon',
        background: '#8B3A2B',
        paths: [
          '<path d="M14 17H29C33 17 36 20 36 24V47C36 43 33 41 29 41H14Z" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linejoin="round"/>',
          '<path d="M50 17H35C31 17 28 20 28 24V47C28 43 31 41 35 41H50Z" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linejoin="round"/>',
          '<path d="M20 25H28M20 32H28M36 25H44M36 32H44" stroke="#FFD08A" stroke-width="4" stroke-linecap="round"/>',
        ],
      },
    };
  }

  return {
    skillDescription: 'Use when Codex should operate OPL Meta Agent to design, test, improve, or take over testing for OPL-compatible Foundry Agents.',
    heading: 'OPL Meta Agent',
    intro: 'Use this skill for OPL Meta Agent foundry workflows. This surface is generated by OPL Framework from the OMA contract pack and packaged as an OPL-owned Codex plugin.',
    authorityBoundary: [
      'OPL owns the generated Skill and Codex plugin surfaces.',
      'OPL Meta Agent owns agent-building semantics and refs-only work-order materialization.',
      'Do not treat generated interface readiness as target domain ready, production ready, artifact ready, or quality verdict.',
    ],
    generatedSkillSections: [
      {
        title: 'New Agent Delivery Gate',
        body: [
          'When using OPL Meta Agent to create a new OPL-compatible target agent, do not stop at repository scaffold, contract validation, or generated interface readiness. A complete baseline handoff must include:',
          '',
          '1. target repo scaffold validation and generated interface projection;',
          '2. Agent Lab baseline, takeover, or external suite evidence;',
          '3. structured independent AI reviewer evaluation with non-empty critique, suggestions, direct evidence refs, and provenance;',
          '4. `improve-from-external-agent-lab-suite` or an equivalent OMA self-evolution pass consuming the Agent Lab result and reviewer evidence;',
          '5. one of: delivery receipt, no-patch coordination receipt/work order, executable developer patch work order, or typed blocker.',
          '',
          'If Agent Lab or reviewer evidence identifies a repairable gap, route it through the owner-gated improvement loop before claiming the target agent baseline is delivered. If no source patch is required, record the no-patch coordination evidence and re-evaluation refs. Scaffold/interface readiness alone is not an acceptable completion claim for new-agent creation.',
        ],
      },
    ],
    displayName: 'OPL Meta Agent',
    shortDescription: 'Foundry Agent for OPL-compatible knowledge-work agents',
    defaultPrompt: `Use $${inspected.canonical_plugin_name} to build, test, or improve an OPL-compatible Foundry Agent.`,
    pluginDescription: 'OPL-generated Codex plugin shell for OPL Meta Agent.',
    homepage: 'https://github.com/gaofeng21cn/opl-meta-agent',
    repository: 'https://github.com/gaofeng21cn/opl-meta-agent',
    keywords: [
      'opl',
      'meta-agent',
      'codex',
      'foundry-agent',
    ],
    category: 'Productivity',
    longDescription: 'Adds an OPL-generated Codex plugin entry for OPL Meta Agent while preserving OMA as a standard declarative domain pack with OPL-owned generated surfaces.',
    capabilities: [
      'Interactive',
      'Write',
    ],
    defaultPrompts: [
      'Build an OPL-compatible agent from this natural-language request.',
      'Take over testing for this existing OPL-compatible agent repo.',
      'Improve this target agent from an Agent Lab suite result.',
    ],
    brandColor: '#3F6FB5',
    icon: {
      ariaLabel: 'OPL Meta Agent icon',
      background: '#214F9A',
      paths: [
        '<path d="M11 44V20L21 34L31 20V44" fill="none" stroke="#FFFFFF" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>',
        '<path d="M36 44L46 20L56 44" fill="none" stroke="#FFFFFF" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>',
        '<path d="M40 35H52" stroke="#8AD6FF" stroke-width="5.5" stroke-linecap="round"/>',
      ],
    },
  };
}

function buildOplGeneratedSkillMarkdown(
  inspected: InspectFamilySkillPack,
  descriptors: Array<Record<string, unknown>>,
) {
  const pluginSpec = generatedCodexPluginSpec(inspected);
  const workflowLines = descriptors.map((descriptor) => [
    `- \`${String(descriptor.action_id ?? descriptor.command_contract_id ?? 'unknown_action')}\`: ${String(descriptor.summary ?? '').trim()}`,
    `  Command contract: \`${String(descriptor.command_contract_id ?? 'unknown_contract')}\``,
  ].join('\n')).join('\n');

  return [
    '---',
    `name: ${inspected.canonical_plugin_name}`,
    `description: ${pluginSpec.skillDescription}`,
    '---',
    '',
    `# ${pluginSpec.heading}`,
    '',
    pluginSpec.intro,
    '',
    '## Generated Action Contracts',
    '',
    workflowLines || '- No generated action contracts were exposed.',
    '',
    '## Authority Boundary',
    '',
    ...pluginSpec.authorityBoundary.map((line) => `- ${line}`),
    '',
    ...(pluginSpec.generatedSkillSections ?? []).flatMap((section) => [
      `## ${section.title}`,
      '',
      ...section.body,
      '',
    ]),
  ].join('\n');
}

function buildOplGeneratedSkillAgentMetadata(inspected: InspectFamilySkillPack) {
  const pluginSpec = generatedCodexPluginSpec(inspected);
  return [
    'interface:',
    `  display_name: "${pluginSpec.displayName}"`,
    `  short_description: "${pluginSpec.shortDescription}"`,
    `  default_prompt: "${pluginSpec.defaultPrompt}"`,
    '',
  ].join('\n');
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeOplGeneratedPluginIcon(pluginRoot: string, inspected: InspectFamilySkillPack) {
  const pluginSpec = generatedCodexPluginSpec(inspected);
  const iconPath = path.join(pluginRoot, 'assets', 'icon.svg');
  const iconSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${pluginSpec.icon.ariaLabel}">`,
    `<rect width="64" height="64" rx="14" fill="${pluginSpec.icon.background}"/>`,
    ...pluginSpec.icon.paths,
    '</svg>',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(iconPath), { recursive: true });
  fs.writeFileSync(iconPath, iconSvg, 'utf8');
  return './assets/icon.svg';
}

function resolveGeneratedPluginRoot(inspected: InspectFamilySkillPack, home?: string) {
  return resolveGeneratedPluginRootForName(inspected.canonical_plugin_name, home);
}

function writeGeneratedPluginMarketplace(inspected: InspectFamilySkillPack, pluginRoot: string) {
  const marketplacePath = path.join(path.dirname(path.dirname(pluginRoot)), '.agents', 'plugins', 'marketplace.json');
  writeJsonFile(marketplacePath, {
    name: `${inspected.canonical_plugin_name}-local`,
    interface: {
      displayName: 'OPL Generated Family Plugins',
    },
    plugins: [
      {
        name: inspected.canonical_plugin_name,
        source: {
          source: 'local',
          path: `./plugins/${inspected.canonical_plugin_name}`,
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
        },
        category: 'Productivity',
      },
    ],
  });
  return marketplacePath;
}

function syncGeneratedPluginCache(
  inspected: InspectFamilySkillPack,
  pluginRoot: string,
  home: string,
  version: string,
) {
  const cacheRoot = path.join(
    resolveCodexHome(home),
    'plugins',
    'cache',
    `${inspected.canonical_plugin_name}-local`,
    inspected.canonical_plugin_name,
    version,
  );
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(cacheRoot), { recursive: true });
  fs.cpSync(pluginRoot, cacheRoot, { recursive: true });
  return cacheRoot;
}

function writeOplGeneratedPluginSurface(inspected: InspectFamilySkillPack, home?: string) {
  if (inspected.source_kind !== 'opl_generated_plugin_surface' || !inspected.generated_skill_surface_ready) {
    return null;
  }

  const resolvedHome = home ? path.resolve(home) : (process.env.HOME ?? null);
  if (!resolvedHome) {
    return null;
  }

  const generated = buildRepoGeneratedSkillBundle(inspected.repo_root);
  const pluginSpec = generatedCodexPluginSpec(inspected);
  const skillBlock = isRecord(generated.bundle.skill) ? generated.bundle.skill : null;
  const descriptors = recordList(skillBlock?.descriptors);
  const codexSkillDir = path.join(resolveCodexHome(resolvedHome), 'skills', inspected.canonical_plugin_name);
  fs.rmSync(codexSkillDir, { recursive: true, force: true });

  const pluginRoot = resolveGeneratedPluginRoot(inspected, resolvedHome);
  const pluginVersion = '0.1.0';
  fs.rmSync(pluginRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(pluginRoot, 'skills', inspected.canonical_plugin_name, 'agents'), { recursive: true });
  const pluginIconPath = writeOplGeneratedPluginIcon(pluginRoot, inspected);
  writeJsonFile(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), {
    name: inspected.canonical_plugin_name,
    version: pluginVersion,
    description: pluginSpec.pluginDescription,
    author: {
      name: 'Gao Feng',
      url: 'https://github.com/gaofeng21cn',
    },
    homepage: pluginSpec.homepage,
    repository: pluginSpec.repository,
    license: 'Apache-2.0',
    keywords: pluginSpec.keywords,
    skills: './skills/',
    interface: {
      displayName: pluginSpec.displayName,
      shortDescription: pluginSpec.shortDescription,
      longDescription: pluginSpec.longDescription,
      developerName: 'Gao Feng',
      category: pluginSpec.category,
      capabilities: pluginSpec.capabilities,
      websiteURL: pluginSpec.homepage,
      composerIcon: pluginIconPath,
      logo: pluginIconPath,
      defaultPrompt: pluginSpec.defaultPrompts,
      brandColor: pluginSpec.brandColor,
    },
  });
  fs.writeFileSync(
    path.join(pluginRoot, 'skills', inspected.canonical_plugin_name, 'SKILL.md'),
    buildOplGeneratedSkillMarkdown(inspected, descriptors),
    'utf8',
  );
  fs.writeFileSync(
    path.join(pluginRoot, 'skills', inspected.canonical_plugin_name, 'agents', 'openai.yaml'),
    buildOplGeneratedSkillAgentMetadata(inspected),
    'utf8',
  );
  const marketplacePath = writeGeneratedPluginMarketplace(inspected, pluginRoot);
  const codexPluginCachePath = syncGeneratedPluginCache(
    inspected,
    pluginRoot,
    resolvedHome,
    pluginVersion,
  );

  return {
    plugin_root: pluginRoot,
    plugin_manifest_path: path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    marketplace_path: marketplacePath,
    skill_entry_path: path.join(pluginRoot, 'skills', inspected.canonical_plugin_name, 'SKILL.md'),
    codex_plugin_cache_path: codexPluginCachePath,
    removed_standalone_skill_root: codexSkillDir,
    descriptor_count: descriptors.length,
    source: 'opl_generated_agent_interface_bundle_codex_plugin',
  };
}

function inspectFamilySkillPack(spec: SkillPackSpec): InspectFamilySkillPack {
  return inspectFamilySkillPackAtRepoRoot(spec, resolveRepoRoot(spec));
}

function inspectFamilySkillPackAtRepoRoot(
  spec: SkillPackSpec,
  repoRoot: string,
): InspectFamilySkillPack {
  const repoFound = fs.existsSync(repoRoot) && fs.statSync(repoRoot).isDirectory();
  const pluginManifestPath = buildPluginManifestPath(spec, repoRoot);
  const pluginSourcePath = buildPluginSourcePath(pluginManifestPath);
  const skillEntryPath = buildSkillEntryPath(spec, repoRoot);
  const installerPath = buildInstallerPath(spec, repoRoot);
  const pluginManifestFound = fs.existsSync(pluginManifestPath) && fs.statSync(pluginManifestPath).isFile();
  const skillEntryFound = fs.existsSync(skillEntryPath) && fs.statSync(skillEntryPath).isFile();
  const skillEntryValidation = validateSkillEntry(spec, skillEntryPath, skillEntryFound);
  const installerFound = fs.existsSync(installerPath) && fs.statSync(installerPath).isFile();
  const generatedSkillSurface = inspectGeneratedSkillSurface(spec, repoRoot);
  const repoPluginReady =
    repoFound && pluginManifestFound && skillEntryFound && skillEntryValidation.valid;
  const seriesProjection = buildFoundryAgentSeriesProjection(spec);

  return {
    domain_id: spec.domain_id,
    project: spec.project,
    label: spec.label,
    plugin_name: spec.plugin_name,
    canonical_plugin_name: spec.canonical_plugin_name,
    ...seriesProjection,
    plugin_source_path: pluginSourcePath,
    repo_root: repoRoot,
    repo_found: repoFound,
    plugin_manifest_path: pluginManifestPath,
    plugin_manifest_found: pluginManifestFound,
    skill_entry_path: skillEntryPath,
    skill_entry_found: skillEntryFound,
    skill_entry_valid: skillEntryValidation.valid,
    skill_entry_errors: skillEntryValidation.errors,
    installer_path: installerPath,
    installer_found: installerFound,
    source_kind: spec.source_kind,
    generated_skill_surface_ready: generatedSkillSurface.ready,
    generated_skill_surface_status: generatedSkillSurface.status,
    ready_to_sync: repoPluginReady || (repoFound && generatedSkillSurface.ready),
    installer_kind: spec.installer_kind,
    command_preview: buildInstallerCommandPreview(spec, repoRoot),
  };
}

function runInstaller(
  inspected: InspectFamilySkillPack,
  home?: string,
): SyncFamilySkillPack {
  if (!inspected.ready_to_sync) {
    return {
      ...inspected,
      sync_status: 'skipped',
      installer_result: null,
      registry_repo_root: null,
      stdout: '',
      stderr: '',
    };
  }

  if (inspected.source_kind === 'opl_generated_plugin_surface') {
    const codexPluginSurface = writeOplGeneratedPluginSurface(inspected, home);
    return {
      ...inspected,
      sync_status: 'synced',
      installer_result: {
        generated_surface: 'opl_generated_codex_plugin_descriptor',
        generated_codex_plugin: codexPluginSurface,
      },
      registry_repo_root: codexPluginSurface ? path.dirname(path.dirname(codexPluginSurface.plugin_root)) : null,
      stdout: '',
      stderr: '',
    };
  }

  const codexSkillMirror = syncCodexSkillMirror(inspected, home);
  const repoLocalMarketplacePath = path.join(inspected.repo_root, '.agents', 'plugins', 'marketplace.json');

  return {
    ...inspected,
    sync_status: 'synced',
    installer_result: {
      source: 'tracked_codex_plugin_source',
      plugin_source_path: inspected.plugin_source_path,
      plugin_manifest_path: inspected.plugin_manifest_path,
      skill_entry_path: inspected.skill_entry_path,
      repo_local_marketplace_path: repoLocalMarketplacePath,
      repo_local_marketplace_written: false,
      ...(inspected.installer_found ? { legacy_installer_path: inspected.installer_path } : {}),
      ...(codexSkillMirror ? { codex_skill_mirror: codexSkillMirror } : {}),
    },
    registry_repo_root: inspected.repo_root,
    stdout: '',
    stderr: '',
  };
}

export function syncFamilySkillPackFromRepoRoot(
  domainId: SkillPackSpec['domain_id'],
  repoRoot: string,
  options: Partial<{
    home: string;
    registerPlugin?: boolean;
  }> = {},
) {
  const spec = FAMILY_SKILL_PACK_SPECS.find((entry) => entry.domain_id === domainId);
  if (!spec) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Unknown skill pack domain: ${domainId}.`,
      {
        domain_id: domainId,
        allowed_domains: FAMILY_SKILL_PACK_SPECS.map((entry) => entry.domain_id),
      },
    );
  }

  const result = runInstaller(
    inspectFamilySkillPackAtRepoRoot(spec, path.resolve(repoRoot)),
    normalizeOptionalString(options.home) ?? undefined,
  );
  if (options.registerPlugin !== false && result.sync_status === 'synced' && result.registry_repo_root) {
    const codexPluginRegistry = registerOplFamilyCodexPlugins(
      [domainId],
      new Map([[domainId, result.registry_repo_root]]),
      normalizeOptionalString(options.home) ?? undefined,
    );
    return {
      ...result,
      installer_result: {
        ...(result.installer_result ?? {}),
        codex_plugin_registry: codexPluginRegistry,
      },
    };
  }

  return result;
}

export function readFamilySkillPacks(options: ReadFamilySkillPacksOptions = {}) {
  const selectedDomains = normalizeDomainSelection(options.domains);
  const packs = FAMILY_SKILL_PACK_SPECS
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => inspectFamilySkillPack(spec));

  return {
    version: 'g2',
    skill_catalog: {
      surface_id: 'opl_skill_catalog',
      workspace_root: resolveDefaultFamilyWorkspaceRoot(),
      packs,
      summary: {
        total: packs.length,
        ready_to_sync: packs.filter((entry) => entry.ready_to_sync).length,
        repo_found: packs.filter((entry) => entry.repo_found).length,
      },
    },
  };
}

export function syncFamilySkillPacks(options: SyncFamilySkillPacksOptions = {}) {
  const selectedDomains = normalizeDomainSelection(options.domains);
  const resolvedHome = normalizeOptionalString(options.home) ?? null;
  const inspectedPacks = FAMILY_SKILL_PACK_SPECS
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => inspectFamilySkillPack(spec));
  const packs = inspectedPacks.map((inspected) => runInstaller(inspected, resolvedHome ?? undefined));
  const syncedFamilyPluginPacks = packs.filter((pack): pack is SyncFamilySkillPack & { domain_id: OplModuleId } => (
    pack.sync_status === 'synced'
    && ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge'].includes(pack.domain_id)
    && Boolean(pack.registry_repo_root)
  ));
  const codex_plugin_registry = registerOplFamilyCodexPlugins(
    syncedFamilyPluginPacks.map((pack) => pack.domain_id),
    new Map(syncedFamilyPluginPacks.map((pack) => [pack.domain_id, pack.registry_repo_root ?? pack.repo_root])),
    resolvedHome ?? undefined,
  );
  const companion_skills = syncOplCompanionSkills(resolvedHome ?? undefined, {
    mode: options.companionMode ?? 'observe',
    superpowersProfile: options.superpowersProfile ?? 'keep',
  });

  return {
    version: 'g2',
    skill_sync: {
      surface_id: 'opl_skill_sync',
      workspace_root: resolveDefaultFamilyWorkspaceRoot(),
      home: resolvedHome ?? process.env.HOME ?? null,
      packs,
      codex_plugin_registry,
      companion_skills,
      summary: {
        total: packs.length,
        synced: packs.filter((entry) => entry.sync_status === 'synced').length,
        skipped: packs.filter((entry) => entry.sync_status === 'skipped').length,
      },
    },
  };
}
