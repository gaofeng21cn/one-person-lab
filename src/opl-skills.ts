import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { FrameworkContractError } from './contracts.ts';
import {
  buildGeneratedInterfaceBundle,
  selectGeneratedInterfaceBundleFormat,
} from './domain-pack-compiler/generated-interface-read-model.ts';
import { normalizeFamilyActionCatalog } from './family-action-catalog-contract.ts';
import { normalizeFamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
import { buildFunctionalPrivatizationAudit } from './functional-privatization-audit.ts';
import { syncOplCompanionSkills, type OplCompanionSkillApplyMode, type OplSuperpowersProfile } from './install-companions.ts';
import { registerOplFamilyCodexPlugins } from './system-installation/codex-plugin-registry.ts';
import type { OplModuleId } from './system-installation/shared.ts';
import {
  resolveDefaultFamilyWorkspaceRoot as resolveDefaultFamilyWorkspaceRootImpl,
  resolveFamilyWorkspaceRootFromRepoRoot as resolveFamilyWorkspaceRootFromRepoRootImpl,
} from './family-workspace-root.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';

export const resolveDefaultFamilyWorkspaceRoot = resolveDefaultFamilyWorkspaceRootImpl;
export const resolveFamilyWorkspaceRootFromRepoRoot = resolveFamilyWorkspaceRootFromRepoRootImpl;

type SkillPackInstallerKind = 'bash' | 'node';
type SkillPackSourceKind = 'repo_plugin_installer' | 'opl_generated_plugin_surface';

type SkillPackSpec = {
  domain_id: 'medautoscience' | 'medautogrant' | 'redcube' | 'oplmetaagent';
  module_id: 'MEDAUTOSCIENCE' | 'MEDAUTOGRANT' | 'REDCUBE' | 'OPLMETAAGENT';
  project: string;
  label: string;
  plugin_name: string;
  canonical_plugin_name: 'mas' | 'mag' | 'rca' | 'opl-meta-agent';
  source_kind: SkillPackSourceKind;
  installer_kind: SkillPackInstallerKind;
  installer_relative_paths: string[];
};

type InspectFamilySkillPack = {
  domain_id: string;
  project: string;
  label: string;
  plugin_name: string;
  canonical_plugin_name: string;
  repo_root: string;
  repo_found: boolean;
  plugin_manifest_path: string;
  plugin_manifest_found: boolean;
  skill_entry_path: string;
  skill_entry_found: boolean;
  skill_entry_valid: boolean;
  skill_entry_errors: string[];
  installer_path: string;
  installer_found: boolean;
  source_kind: SkillPackSourceKind;
  generated_skill_surface_ready: boolean;
  generated_skill_surface_status: string | null;
  ready_to_sync: boolean;
  installer_kind: SkillPackInstallerKind;
  command_preview: string[];
};

type SyncFamilySkillPack = InspectFamilySkillPack & {
  sync_status: 'synced' | 'skipped';
  installer_result: Record<string, unknown> | null;
  registry_repo_root: string | null;
  stdout: string;
  stderr: string;
};

type ReadFamilySkillPacksOptions = {
  domains?: string[];
};

type SyncFamilySkillPacksOptions = ReadFamilySkillPacksOptions & {
  home?: string;
  companionMode?: OplCompanionSkillApplyMode;
  superpowersProfile?: OplSuperpowersProfile;
};

const FAMILY_SKILL_PACK_SPECS: SkillPackSpec[] = [
  {
    domain_id: 'medautoscience',
    module_id: 'MEDAUTOSCIENCE',
    project: 'med-autoscience',
    label: 'Med Auto Science',
    plugin_name: 'med-autoscience',
    canonical_plugin_name: 'mas',
    source_kind: 'repo_plugin_installer',
    installer_kind: 'bash',
    installer_relative_paths: [path.join('scripts', 'install-codex-plugin.sh')],
  },
  {
    domain_id: 'medautogrant',
    module_id: 'MEDAUTOGRANT',
    project: 'med-autogrant',
    label: 'Med Auto Grant',
    plugin_name: 'med-autogrant',
    canonical_plugin_name: 'mag',
    source_kind: 'repo_plugin_installer',
    installer_kind: 'bash',
    installer_relative_paths: [path.join('scripts', 'install-codex-plugin.sh')],
  },
  {
    domain_id: 'redcube',
    module_id: 'REDCUBE',
    project: 'redcube-ai',
    label: 'RedCube AI',
    plugin_name: 'redcube-ai',
    canonical_plugin_name: 'rca',
    source_kind: 'repo_plugin_installer',
    installer_kind: 'node',
    installer_relative_paths: [
      path.join('scripts', 'install-codex-plugin.ts'),
      path.join('scripts', 'install-codex-plugin.mjs'),
    ],
  },
  {
    domain_id: 'oplmetaagent',
    module_id: 'OPLMETAAGENT',
    project: 'opl-meta-agent',
    label: 'OPL Meta Agent',
    plugin_name: 'opl-meta-agent',
    canonical_plugin_name: 'opl-meta-agent',
    source_kind: 'opl_generated_plugin_surface',
    installer_kind: 'node',
    installer_relative_paths: [],
  },
];

const DOMAIN_ALIAS_MAP = new Map<string, SkillPackSpec['domain_id']>([
  ['mas', 'medautoscience'],
  ['medautoscience', 'medautoscience'],
  ['med-autoscience', 'medautoscience'],
  ['med_auto_science', 'medautoscience'],
  ['mag', 'medautogrant'],
  ['medautogrant', 'medautogrant'],
  ['med-autogrant', 'medautogrant'],
  ['med_auto_grant', 'medautogrant'],
  ['rca', 'redcube'],
  ['redcube', 'redcube'],
  ['redcube-ai', 'redcube'],
  ['redcube_ai', 'redcube'],
  ['oplmetaagent', 'oplmetaagent'],
  ['opl-meta-agent', 'oplmetaagent'],
  ['opl_meta_agent', 'oplmetaagent'],
  ['meta-agent', 'oplmetaagent'],
  ['meta_agent', 'oplmetaagent'],
]);

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

function normalizeDomainSelection(domains: string[] | undefined) {
  if (!domains || domains.length === 0) {
    return null;
  }

  const normalized = new Set<SkillPackSpec['domain_id']>();
  for (const domain of domains) {
    const key = domain.trim().toLowerCase();
    const resolved = DOMAIN_ALIAS_MAP.get(key);
    if (!resolved) {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Unknown skill pack domain: ${domain}.`,
        {
          domain,
          allowed_domains: [...new Set(DOMAIN_ALIAS_MAP.keys())].sort(),
        },
      );
    }
    normalized.add(resolved);
  }

  return normalized;
}

function resolveRepoRoot(spec: SkillPackSpec) {
  const envKey = `OPL_${spec.domain_id.toUpperCase()}_REPO_ROOT`;
  const envValue = normalizeOptionalString(process.env[envKey]);
  if (envValue) {
    return path.resolve(envValue);
  }

  const managedRepoRoot = path.join(resolveManagedModulesRoot(), spec.project);
  if (isDirectory(managedRepoRoot)) {
    return managedRepoRoot;
  }

  const modulePathValue = normalizeOptionalString(process.env[`OPL_MODULE_PATH_${spec.module_id}`]);
  if (modulePathValue) {
    return path.resolve(modulePathValue);
  }

  const siblingRepoRoot = path.join(resolveDefaultFamilyWorkspaceRoot(), spec.project);
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

function buildInstallerCommandPreview(
  spec: SkillPackSpec,
  repoRoot: string,
  home?: string,
) {
  const installerPath = buildInstallerPath(spec, repoRoot);
  const sharedArgs = ['--repo-root', repoRoot];
  if (home) {
    sharedArgs.push('--home', home);
  }

  if (spec.source_kind === 'opl_generated_plugin_surface') {
    return ['opl', 'agents', 'interfaces', '--repo-dir', repoRoot, '--format', 'skill'];
  }

  if (spec.installer_kind === 'bash') {
    return ['bash', installerPath, ...sharedArgs, '--skip-tools'];
  }

  return installerPath.endsWith('.ts')
    ? ['node', '--experimental-strip-types', installerPath, ...sharedArgs]
    : ['node', installerPath, ...sharedArgs];
}

function maybeParseJsonRecord(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function buildOplGeneratedSkillMarkdown(
  inspected: InspectFamilySkillPack,
  descriptors: Array<Record<string, unknown>>,
) {
  const workflowLines = descriptors.map((descriptor) => [
    `- \`${String(descriptor.action_id ?? descriptor.command_contract_id ?? 'unknown_action')}\`: ${String(descriptor.summary ?? '').trim()}`,
    `  Command contract: \`${String(descriptor.command_contract_id ?? 'unknown_contract')}\``,
  ].join('\n')).join('\n');

  return [
    '---',
    `name: ${inspected.canonical_plugin_name}`,
    'description: Use when Codex should operate OPL Meta Agent to design, test, improve, or take over testing for OPL-compatible Foundry Agents.',
    '---',
    '',
    '# OPL Meta Agent',
    '',
    'Use this skill for OPL Meta Agent foundry workflows. This surface is generated by OPL Framework from the OMA contract pack and packaged as an OPL-owned Codex plugin.',
    '',
    '## Generated Action Contracts',
    '',
    workflowLines || '- No generated action contracts were exposed.',
    '',
    '## Authority Boundary',
    '',
    '- OPL owns the generated Skill and Codex plugin surfaces.',
    '- OPL Meta Agent owns agent-building semantics and refs-only work-order materialization.',
    '- Do not treat generated interface readiness as target domain ready, production ready, artifact ready, or quality verdict.',
    '',
  ].join('\n');
}

function buildOplGeneratedSkillAgentMetadata(inspected: InspectFamilySkillPack) {
  return [
    'interface:',
    '  display_name: "OPL Meta Agent"',
    '  short_description: "Foundry Agent for OPL-compatible knowledge-work agents"',
    `  default_prompt: "Use $${inspected.canonical_plugin_name} to build, test, or improve an OPL-compatible Foundry Agent."`,
    '',
  ].join('\n');
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  const skillBlock = isRecord(generated.bundle.skill) ? generated.bundle.skill : null;
  const descriptors = recordList(skillBlock?.descriptors);
  const codexSkillDir = path.join(resolveCodexHome(resolvedHome), 'skills', inspected.canonical_plugin_name);
  fs.rmSync(codexSkillDir, { recursive: true, force: true });

  const pluginRoot = resolveGeneratedPluginRoot(inspected, resolvedHome);
  const pluginVersion = '0.1.0';
  fs.rmSync(pluginRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(pluginRoot, 'skills', inspected.canonical_plugin_name, 'agents'), { recursive: true });
  writeJsonFile(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), {
    name: inspected.canonical_plugin_name,
    version: pluginVersion,
    description: 'OPL-generated Codex plugin shell for OPL Meta Agent.',
    author: {
      name: 'Gao Feng',
      url: 'https://github.com/gaofeng21cn',
    },
    homepage: 'https://github.com/gaofeng21cn/opl-meta-agent',
    repository: 'https://github.com/gaofeng21cn/opl-meta-agent',
    license: 'Apache-2.0',
    keywords: [
      'opl',
      'meta-agent',
      'codex',
      'foundry-agent',
    ],
    skills: './skills/',
    interface: {
      displayName: 'OPL Meta Agent',
      shortDescription: 'Foundry Agent for OPL-compatible agents.',
      longDescription: 'Adds an OPL-generated Codex plugin entry for OPL Meta Agent while preserving OMA as a standard declarative domain pack with OPL-owned generated surfaces.',
      developerName: 'Gao Feng',
      category: 'Productivity',
      capabilities: [
        'Interactive',
        'Write',
      ],
      websiteURL: 'https://github.com/gaofeng21cn/opl-meta-agent',
      defaultPrompt: [
        'Build an OPL-compatible agent from this natural-language request.',
        'Take over testing for this existing OPL-compatible agent repo.',
        'Improve this target agent from an Agent Lab suite result.',
      ],
      brandColor: '#3F6FB5',
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
  const skillEntryPath = buildSkillEntryPath(spec, repoRoot);
  const installerPath = buildInstallerPath(spec, repoRoot);
  const pluginManifestFound = fs.existsSync(pluginManifestPath) && fs.statSync(pluginManifestPath).isFile();
  const skillEntryFound = fs.existsSync(skillEntryPath) && fs.statSync(skillEntryPath).isFile();
  const skillEntryValidation = validateSkillEntry(spec, skillEntryPath, skillEntryFound);
  const installerFound = fs.existsSync(installerPath) && fs.statSync(installerPath).isFile();
  const generatedSkillSurface = inspectGeneratedSkillSurface(spec, repoRoot);
  const repoPluginReady =
    repoFound && pluginManifestFound && skillEntryFound && skillEntryValidation.valid && installerFound;

  return {
    domain_id: spec.domain_id,
    project: spec.project,
    label: spec.label,
    plugin_name: spec.plugin_name,
    canonical_plugin_name: spec.canonical_plugin_name,
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

  const commandPreview = buildInstallerCommandPreview(
    FAMILY_SKILL_PACK_SPECS.find((item) => item.domain_id === inspected.domain_id)!,
    inspected.repo_root,
    home,
  );
  const [command, ...args] = commandPreview;
  const result = spawnSync(command, args, {
    cwd: inspected.repo_root,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw new FrameworkContractError(
      'build_command_failed',
      `Failed to launch skill pack installer for ${inspected.domain_id}.`,
      {
        domain_id: inspected.domain_id,
        repo_root: inspected.repo_root,
        command: commandPreview,
        cause: result.error.message,
      },
    );
  }

  if ((result.status ?? 1) !== 0) {
    throw new FrameworkContractError(
      'build_command_failed',
      `Skill pack installer failed for ${inspected.domain_id}.`,
      {
        domain_id: inspected.domain_id,
        repo_root: inspected.repo_root,
        command: commandPreview,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      },
    );
  }

  const installerResult = maybeParseJsonRecord(result.stdout ?? '');
  const codexSkillMirror = syncCodexSkillMirror(inspected, home);

  return {
    ...inspected,
    sync_status: 'synced',
    installer_result: {
      ...(installerResult ?? {}),
      ...(codexSkillMirror ? { codex_skill_mirror: codexSkillMirror } : {}),
    },
    registry_repo_root: inspected.repo_root,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
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
    && ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent'].includes(pack.domain_id)
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
