import {
  GatewayContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
} from './contract-validation.ts';
import type { DomainsRegistry } from './types.ts';

export function validateDomainsRegistry(
  filePath: string,
  value: unknown,
): DomainsRegistry {
  if (!isRecord(value)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'domains.json must contain an object root.',
      { file: filePath },
    );
  }

  const version = expectString(value.version, 'version', filePath);
  const domains = value.domains;

  if (!Array.isArray(domains)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'domains.json must contain a domains array.',
      { file: filePath, field: 'domains' },
    );
  }

  return {
    version,
    domains: domains.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Each domain entry must be an object.',
          { file: filePath, index },
        );
      }

      const independentDomainAgent = entry.independent_domain_agent;
      const singleAppSkill = entry.single_app_skill;
      const runtimeDependencyBoundary = entry.runtime_dependency_boundary;
      const legacyBoundaryTerms = entry.legacy_boundary_terms;

      if (!isRecord(independentDomainAgent)) {
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Domain field "independent_domain_agent" must be an object.',
          { file: filePath, field: 'independent_domain_agent' },
        );
      }
      if (!isRecord(singleAppSkill)) {
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Domain field "single_app_skill" must be an object.',
          { file: filePath, field: 'single_app_skill' },
        );
      }
      if (!isRecord(runtimeDependencyBoundary)) {
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Domain field "runtime_dependency_boundary" must be an object.',
          { file: filePath, field: 'runtime_dependency_boundary' },
        );
      }
      if (!isRecord(legacyBoundaryTerms)) {
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Domain field "legacy_boundary_terms" must be an object.',
          { file: filePath, field: 'legacy_boundary_terms' },
        );
      }

      const backendCompanions = runtimeDependencyBoundary.backend_companions;
      if (!Array.isArray(backendCompanions)) {
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Domain field "runtime_dependency_boundary.backend_companions" must be an array.',
          {
            file: filePath,
            field: 'runtime_dependency_boundary.backend_companions',
          },
        );
      }

      return {
        domain_id: expectString(entry.domain_id, 'domain_id', filePath),
        label: expectString(entry.label, 'label', filePath),
        project: expectString(entry.project, 'project', filePath),
        independent_domain_agent: {
          agent_id: expectString(
            independentDomainAgent.agent_id,
            'independent_domain_agent.agent_id',
            filePath,
          ),
          status: expectString(
            independentDomainAgent.status,
            'independent_domain_agent.status',
            filePath,
          ),
          authority_scope: expectString(
            independentDomainAgent.authority_scope,
            'independent_domain_agent.authority_scope',
            filePath,
          ),
          opl_top_level_domain_agent: expectBoolean(
            independentDomainAgent.opl_top_level_domain_agent,
            'independent_domain_agent.opl_top_level_domain_agent',
            filePath,
          ),
        },
        single_app_skill: {
          skill_id: expectString(
            singleAppSkill.skill_id,
            'single_app_skill.skill_id',
            filePath,
          ),
          plugin_name: expectString(
            singleAppSkill.plugin_name,
            'single_app_skill.plugin_name',
            filePath,
          ),
          activation_kind: expectString(
            singleAppSkill.activation_kind,
            'single_app_skill.activation_kind',
            filePath,
          ),
          entry_command: expectString(
            singleAppSkill.entry_command,
            'single_app_skill.entry_command',
            filePath,
          ),
          manifest_command: expectString(
            singleAppSkill.manifest_command,
            'single_app_skill.manifest_command',
            filePath,
          ),
        },
        domain_truth_owner: expectStringArray(
          entry.domain_truth_owner,
          'domain_truth_owner',
          filePath,
        ),
        opl_projection_role: expectStringArray(
          entry.opl_projection_role,
          'opl_projection_role',
          filePath,
        ),
        runtime_dependency_boundary: {
          domain_runtime_owner: expectString(
            runtimeDependencyBoundary.domain_runtime_owner,
            'runtime_dependency_boundary.domain_runtime_owner',
            filePath,
          ),
          opl_dependency: expectString(
            runtimeDependencyBoundary.opl_dependency,
            'runtime_dependency_boundary.opl_dependency',
            filePath,
          ),
          opl_truth_write_policy: expectString(
            runtimeDependencyBoundary.opl_truth_write_policy,
            'runtime_dependency_boundary.opl_truth_write_policy',
            filePath,
          ),
          backend_companions: backendCompanions.map(
            (companion, companionIndex) => {
              if (!isRecord(companion)) {
                throw new GatewayContractError(
                  'contract_shape_invalid',
                  'Each backend companion entry must be an object.',
                  {
                    file: filePath,
                    field: 'runtime_dependency_boundary.backend_companions',
                    index,
                    companionIndex,
                  },
                );
              }

              return {
                project: expectString(
                  companion.project,
                  'backend_companion.project',
                  filePath,
                ),
                role: expectString(companion.role, 'backend_companion.role', filePath),
                controlled_by: expectString(
                  companion.controlled_by,
                  'backend_companion.controlled_by',
                  filePath,
                ),
                opl_top_level_domain_agent: expectBoolean(
                  companion.opl_top_level_domain_agent,
                  'backend_companion.opl_top_level_domain_agent',
                  filePath,
                ),
              };
            },
          ),
        },
        standalone_allowed: expectBoolean(
          entry.standalone_allowed,
          'standalone_allowed',
          filePath,
        ),
        owned_workstreams: expectStringArray(
          entry.owned_workstreams,
          'owned_workstreams',
          filePath,
        ),
        non_opl_families: expectStringArray(
          entry.non_opl_families,
          'non_opl_families',
          filePath,
        ),
        legacy_boundary_terms: {
          role: expectString(
            legacyBoundaryTerms.role,
            'legacy_boundary_terms.role',
            filePath,
          ),
          gateway_surface: expectString(
            legacyBoundaryTerms.gateway_surface,
            'legacy_boundary_terms.gateway_surface',
            filePath,
          ),
          harness_surface: expectString(
            legacyBoundaryTerms.harness_surface,
            'legacy_boundary_terms.harness_surface',
            filePath,
          ),
        },
      };
    }),
  };
}
