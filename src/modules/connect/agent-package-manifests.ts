import masAgentPackageManifest from '../../../contracts/opl-framework/agent-packages/mas.json' with { type: 'json' };
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { canonicalAgentPackageId } from './agent-package-identity.ts';
import type { ModuleCapabilityDependency } from './system-installation/shared.ts';

type FirstPartyAgentPackageManifest = {
  agent_id: string;
  package_id: string;
  codex_surface: {
    plugin_id: string;
    standalone_distribution: 'self_contained_fat_plugin';
    required_skill_ids: readonly string[];
    bundled_capability_package_ids?: readonly string[];
  };
  capability_dependencies: readonly ModuleCapabilityDependency[];
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function requiredString(value: unknown, field: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new FrameworkContractError('contract_shape_invalid', `Agent package manifest must declare ${field}.`, {
    contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    field,
  });
}

function requireStringList(value: unknown, field: string) {
  const values = stringList(value);
  if (values.length > 0) {
    return values;
  }
  throw new FrameworkContractError('contract_shape_invalid', `Agent package manifest must declare ${field}.`, {
    contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    field,
  });
}

function requireLiteral<T extends string>(value: unknown, expected: T, field: string) {
  if (value === expected) {
    return expected;
  }
  throw new FrameworkContractError('contract_shape_invalid', `Agent package manifest ${field} must be ${expected}.`, {
    contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    field,
    expected,
    actual: value,
  });
}

function normalizeCapabilityDependency(value: unknown): ModuleCapabilityDependency {
  if (!isRecord(value) || value.kind !== 'framework_capability_package') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest capability dependency must be a framework capability package.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies.kind',
    });
  }
  const authorityBoundary = isRecord(value.authority_boundary) ? value.authority_boundary : {};
  if (
    authorityBoundary.can_write_domain_truth !== false
    || authorityBoundary.can_sign_owner_receipt !== false
    || authorityBoundary.can_create_typed_blocker !== false
    || authorityBoundary.can_write_runtime_queue !== false
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest capability dependency authority boundary must be false-only.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies.authority_boundary',
    });
  }
  const syncScopes = stringList(value.sync_scopes);
  if (!syncScopes.includes('workspace') || !syncScopes.includes('quest')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest capability dependency must sync to workspace and quest scopes.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies.sync_scopes',
    });
  }
  return {
    module_id: requiredString(value.module_id, 'capability_dependencies.module_id') as ModuleCapabilityDependency['module_id'],
    package_id: requiredString(value.package_id, 'capability_dependencies.package_id'),
    kind: 'framework_capability_package',
    required_for: requireStringList(value.required_for, 'capability_dependencies.required_for'),
    install_owner: 'one-person-lab',
    install_update_source: 'ghcr_capability_packages_channel',
    codex_distribution: requireLiteral(value.codex_distribution, 'bundled', 'capability_dependencies.codex_distribution'),
    opl_distribution: requireLiteral(value.opl_distribution, 'managed_dependency', 'capability_dependencies.opl_distribution'),
    developer_distribution: requireLiteral(value.developer_distribution, 'source_checkout', 'capability_dependencies.developer_distribution'),
    sync_scopes: ['workspace', 'quest'],
    sync_command_refs: requireStringList(value.sync_command_refs, 'capability_dependencies.sync_command_refs'),
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
  };
}

export function normalizeFirstPartyAgentPackageManifest(payload: unknown): FirstPartyAgentPackageManifest {
  if (!isRecord(payload)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must be a JSON object.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    });
  }
  if (!isRecord(payload.codex_surface)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must declare codex_surface.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'codex_surface',
    });
  }
  if (!Array.isArray(payload.capability_dependencies) || payload.capability_dependencies.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must declare capability_dependencies.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies',
    });
  }
  const codexSurface = payload.codex_surface;
  return {
    agent_id: canonicalAgentPackageId(requiredString(payload.agent_id, 'agent_id'))!,
    package_id: canonicalAgentPackageId(requiredString(payload.package_id, 'package_id'))!,
    codex_surface: {
      plugin_id: requiredString(codexSurface.plugin_id, 'codex_surface.plugin_id'),
      standalone_distribution: requireLiteral(
        codexSurface.standalone_distribution,
        'self_contained_fat_plugin',
        'codex_surface.standalone_distribution',
      ),
      required_skill_ids: requireStringList(codexSurface.required_skill_ids, 'codex_surface.required_skill_ids'),
      bundled_capability_package_ids: stringList(codexSurface.bundled_capability_package_ids),
    },
    capability_dependencies: payload.capability_dependencies.map(normalizeCapabilityDependency),
  };
}

export const MAS_AGENT_PACKAGE_MANIFEST = normalizeFirstPartyAgentPackageManifest(masAgentPackageManifest);

export function getMasCapabilityDependencies() {
  return MAS_AGENT_PACKAGE_MANIFEST.capability_dependencies;
}

export function getMasCodexStandaloneRequiredSkillIds() {
  return MAS_AGENT_PACKAGE_MANIFEST.codex_surface.required_skill_ids;
}
