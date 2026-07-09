import fs from 'node:fs';
import path from 'node:path';

import {
  buildRepoGeneratedInterfaceBundle,
} from '../../pack/index.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  resolveCodexHome,
  resolveMaterializedPluginRootForName,
} from './paths.ts';
import type { InspectFamilySkillPack, SkillPackSpec } from './registry.ts';

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function inspectGeneratedSkillSurface(spec: SkillPackSpec, repoRoot: string) {
  if (spec.source_kind !== 'opl_standard_codex_carrier') {
    return {
      ready: false,
      status: null,
    };
  }
  try {
    const generated = buildRepoGeneratedInterfaceBundle(repoRoot, 'skill');
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

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveMaterializedPluginRoot(inspected: InspectFamilySkillPack, home?: string) {
  return resolveMaterializedPluginRootForName(inspected.plugin_name, home);
}

function writeMaterializedPluginMarketplace(inspected: InspectFamilySkillPack, pluginRoot: string) {
  const marketplacePath = path.join(path.dirname(path.dirname(pluginRoot)), '.agents', 'plugins', 'marketplace.json');
  writeJsonFile(marketplacePath, {
    name: `${inspected.plugin_name}-local`,
    interface: {
      displayName: 'OPL Standard Agent Plugins',
    },
    plugins: [
      {
        name: inspected.plugin_name,
        source: {
          source: 'local',
          path: `./plugins/${inspected.plugin_name}`,
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

function syncMaterializedPluginCache(
  inspected: InspectFamilySkillPack,
  pluginRoot: string,
  home: string,
  version: string,
) {
  const cacheRoot = path.join(
    resolveCodexHome(home),
    'plugins',
    'cache',
    `${inspected.plugin_name}-local`,
    inspected.plugin_name,
    version,
  );
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(cacheRoot), { recursive: true });
  fs.cpSync(pluginRoot, cacheRoot, { recursive: true });
  return cacheRoot;
}

function readActionContractDescriptors(repoRoot: string) {
  try {
    const generated = buildRepoGeneratedInterfaceBundle(repoRoot, 'skill');
    const skillBlock = isRecord(generated.bundle.skill) ? generated.bundle.skill : null;
    return recordList(skillBlock?.descriptors);
  } catch {
    return [];
  }
}

function buildOplMaterializedPluginProvenance(
  inspected: InspectFamilySkillPack,
  descriptors: Array<Record<string, unknown>>,
) {
  return {
    surface_kind: 'opl_standard_primary_skill_carrier_projection',
    version: 'primary-skill-carrier-projection.v1',
    source: 'opl_standard_agent_primary_skill_codex_plugin',
    materializer: 'opl_standard_codex_plugin_materializer',
    carrier_role: 'codex_plugin_install_transport',
    carrier_materialization: 'materialized_full_skill_copy',
    canonical_primary_skill_source_path: inspected.skill_entry_path,
    codex_plugin_skill_path: path.join('skills', inspected.plugin_name, 'SKILL.md'),
    codex_install_requires_real_skill_md: true,
    plugin_skill_may_be_stub_or_pointer: false,
    descriptor_count: descriptors.length,
    authority_boundary: {
      plugin_transport_is_membership_axis: false,
      plugin_transport_is_status_axis: false,
      carrier_surface_can_claim_domain_ready: false,
      carrier_surface_can_write_domain_truth: false,
      carrier_surface_can_sign_owner_receipt: false,
      carrier_surface_can_create_typed_blocker: false,
    },
  };
}

export function writeOplMaterializedPluginCarrier(inspected: InspectFamilySkillPack, home?: string) {
  if (inspected.source_kind !== 'opl_standard_codex_carrier' || !inspected.ready_to_sync) {
    return null;
  }

  const resolvedHome = home ? path.resolve(home) : (process.env.HOME ?? null);
  if (!resolvedHome) {
    return null;
  }

  const descriptors = readActionContractDescriptors(inspected.repo_root);
  const codexSkillDir = path.join(resolveCodexHome(resolvedHome), 'skills', inspected.canonical_plugin_name);
  const codexPluginNameSkillDir = path.join(resolveCodexHome(resolvedHome), 'skills', inspected.plugin_name);
  fs.rmSync(codexSkillDir, { recursive: true, force: true });
  fs.rmSync(codexPluginNameSkillDir, { recursive: true, force: true });

  const pluginRoot = resolveMaterializedPluginRoot(inspected, resolvedHome);
  const pluginManifestPath = path.join(inspected.plugin_source_path, '.codex-plugin', 'plugin.json');
  const pluginManifest = JSON.parse(fs.readFileSync(pluginManifestPath, 'utf8')) as { version?: string };
  const pluginVersion = typeof pluginManifest.version === 'string' ? pluginManifest.version : '0.1.0';
  fs.rmSync(pluginRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
  fs.cpSync(inspected.plugin_source_path, pluginRoot, { recursive: true });
  const carrierProvenancePath = path.join(pluginRoot, 'opl-carrier.json');
  writeJsonFile(
    carrierProvenancePath,
    buildOplMaterializedPluginProvenance(inspected, descriptors),
  );
  const marketplacePath = writeMaterializedPluginMarketplace(inspected, pluginRoot);
  const codexPluginCachePath = syncMaterializedPluginCache(
    inspected,
    pluginRoot,
    resolvedHome,
    pluginVersion,
  );

  return {
    plugin_root: pluginRoot,
    plugin_manifest_path: path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    marketplace_path: marketplacePath,
    skill_entry_path: path.join(pluginRoot, 'skills', inspected.plugin_name, 'SKILL.md'),
    carrier_provenance_path: carrierProvenancePath,
    codex_plugin_cache_path: codexPluginCachePath,
    removed_standalone_skill_root: codexSkillDir,
    descriptor_count: descriptors.length,
    source: 'opl_standard_agent_primary_skill_codex_plugin',
    primary_skill_source_path: inspected.skill_entry_path,
  };
}
