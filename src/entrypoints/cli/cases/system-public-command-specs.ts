import fs from 'node:fs';
import path from 'node:path';

import { bootstrapLocalCodexDefaults, readBundledCodexDefaultProfile } from '../../../kernel/local-codex-defaults.ts';
import { buildOplFrameworkSemanticHygieneAudit } from '../../../modules/foundry-lab/framework-semantic-hygiene.ts';
import { syncOplCompanionSkills } from '../../../modules/connect/install-companions.ts';
import { syncFamilySkillPacks } from '../../../modules/connect/opl-skills.ts';
import {
  runOplAgentPackageInstall,
  runOplAgentPackageStatus,
} from '../../../modules/connect/agent-package-registry.ts';
import { buildOplSystemDependencyDoctor } from '../../../modules/connect/system-installation/dependency-doctor.ts';
import { buildOplDockerWebuiDoctor } from '../../../modules/connect/system-installation/docker-webui-doctor.ts';
import { buildOplEnvironment } from '../../../modules/connect/system-installation/environment.ts';
import { buildOplInitialize } from '../../../modules/connect/system-installation/initialize.ts';
import { runCodexConfigHygiene } from '../../../modules/connect/system-installation/codex-config-hygiene.ts';
import { runOplSystemAction } from '../../../modules/connect/system-installation/system-actions.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import {
  buildPublicSystemActionPayload,
  buildPublicSystemInitializePayload,
  buildPublicSystemPayload,
} from '../modules/public-payloads.ts';
import {
  assertNoArgs,
  buildUsageError,
  parseDeveloperSupervisorArgs,
  parseSystemDependencyArgs,
  parseSystemConfigureCodexArgs,
  parseSystemSeedApplyArgs,
  parseSystemStartupMaintenanceArgs,
  parseRegisteredCommandOptions,
  parseUpdateChannelArgs,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

async function readStdinText() {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function resolvePackagedFullSkillsRoot() {
  const explicit = process.env.OPL_PACKAGED_SKILLS_ROOT?.trim();
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const candidates = [
    explicit || null,
    runtimeHome ? path.join(runtimeHome, 'skills') : null,
  ];
  return candidates.find((candidate) => (
    Boolean(candidate)
    && fs.existsSync(path.join(candidate!, 'officecli', 'SKILL.md'))
  )) ?? null;
}

function syncPackagedFullCompanionSkillsIfAvailable() {
  const packagedSkillsRoot = resolvePackagedFullSkillsRoot();
  if (!packagedSkillsRoot) {
    return null;
  }

  const previousDisableRemoteInstall = process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL;
  process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL = '1';
  try {
    return syncOplCompanionSkills(undefined, {
      mode: 'managed',
    });
  } finally {
    if (previousDisableRemoteInstall === undefined) {
      delete process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL;
    } else {
      process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL = previousDisableRemoteInstall;
    }
  }
}

const FULL_RUNTIME_FAMILY_MODULE_ENV = [
  { domain: 'medautoscience', env: 'OPL_MODULE_PATH_MEDAUTOSCIENCE' },
  { domain: 'medautogrant', env: 'OPL_MODULE_PATH_MEDAUTOGRANT' },
  { domain: 'redcube', env: 'OPL_MODULE_PATH_REDCUBE' },
  { domain: 'oplmetaagent', env: 'OPL_MODULE_PATH_OPLMETAAGENT' },
] as const;

const FULL_RUNTIME_AGENT_PACKAGE_MANIFESTS = [
  { packageId: 'mas', env: 'OPL_MODULE_PATH_MEDAUTOSCIENCE', manifest: 'mas.json' },
  { packageId: 'mag', env: 'OPL_MODULE_PATH_MEDAUTOGRANT', manifest: 'mag.json' },
  { packageId: 'rca', env: 'OPL_MODULE_PATH_REDCUBE', manifest: 'rca.json' },
  { packageId: 'oma', env: 'OPL_MODULE_PATH_OPLMETAAGENT', manifest: 'oma.json' },
  { packageId: 'obf', env: 'OPL_MODULE_PATH_OPLBOOKFORGE', manifest: 'obf.json' },
] as const;

function syncFullRuntimeFamilyCodexPluginsIfAvailable() {
  const domains = FULL_RUNTIME_FAMILY_MODULE_ENV
    .filter((entry) => process.env[entry.env]?.trim())
    .map((entry) => entry.domain);

  if (domains.length === 0) {
    return null;
  }

  return syncFamilySkillPacks({
    domains,
    companionMode: 'observe',
  });
}

async function syncFullRuntimeAgentPackageLocksIfAvailable() {
  const targets = FULL_RUNTIME_AGENT_PACKAGE_MANIFESTS.filter((entry) => process.env[entry.env]?.trim());
  if (targets.length === 0) {
    return null;
  }

  const installed = new Set(
    runOplAgentPackageStatus().opl_agent_package_status.installed_packages.map((entry) => entry.package_id),
  );
  const items = [];
  for (const target of targets) {
    if (installed.has(target.packageId)) {
      items.push({ package_id: target.packageId, status: 'already_installed' });
      continue;
    }
    const runtimeSourceRoot = path.resolve(process.env[target.env]!.trim());
    const result = await runOplAgentPackageInstall({
      manifestUrl: new URL(`../../../../contracts/opl-framework/packages/${target.manifest}`, import.meta.url).href,
      trustTier: 'first_party',
      sourceKind: 'bundled_full_runtime_modules',
      agentRoot: runtimeSourceRoot,
    });
    items.push({
      package_id: target.packageId,
      status: result.opl_agent_package_install.status,
      package_lock_ref: result.opl_agent_package_install.package_lock.lock_ref,
    });
    installed.add(target.packageId);
  }

  return {
    surface_id: 'opl_full_runtime_agent_package_lock_sync',
    status: 'completed',
    summary: {
      total: items.length,
      installed: items.filter((item) => item.status === 'installed').length,
      already_installed: items.filter((item) => item.status === 'already_installed').length,
    },
    items,
  };
}

function buildNoArgSpec(
  base: Omit<CommandSpec, 'handler'>,
  handler: () => unknown | Promise<unknown>,
): CommandSpec {
  const spec: CommandSpec = {
    ...base,
    handler: (args) => {
      assertNoArgs(args, spec);
      return handler();
    },
  };
  return spec;
}

function writeJsonLine(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function buildPublicSystemCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const systemStartupMaintenanceSpec: CommandSpec = {
    usage: 'opl system startup-maintenance [--scope <all|runtime_substrate>]',
    summary: 'Run App startup maintenance for clean managed modules, image seed state, plugin cache freshness, and reload guidance.',
    examples: [
      'opl system startup-maintenance',
      'opl system startup-maintenance --scope runtime_substrate',
    ],
    group: 'system',
    handler: async (args) => {
      const parsed = parseSystemStartupMaintenanceArgs(args, systemStartupMaintenanceSpec);
      return buildPublicSystemActionPayload(
        await runOplSystemAction(getContracts(), 'startup_maintenance', {
          startupMaintenanceScope: parsed.scope,
        }),
      );
    },
  };

  const systemUpdateChannelSpec: CommandSpec = {
    usage: 'opl system update-channel [--channel <stable|preview>]',
    summary: 'Read or update the local OPL release channel.',
    examples: ['opl system update-channel', 'opl system update-channel --channel preview'],
    group: 'system',
    handler: async (args) => {
      const parsed = parseUpdateChannelArgs(args, systemUpdateChannelSpec);
      return buildPublicSystemActionPayload(
        await runOplSystemAction(getContracts(), 'update_channel', parsed),
      );
    },
  };

  const systemDeveloperSupervisorSpec: CommandSpec = {
    usage:
      'opl system developer-supervisor [--enabled <auto|on|off>] [--mode <external_observe|developer_apply_safe>] [--auto-enable-github-login <login>|--github-login <login>] [--module <module-id> --module-source <auto|managed|developer>]',
    summary:
      'Read or update Developer Mode and its developer_profile/capabilities projection for source channel, workspace trust, GitHub authority, agent automation, and runtime mutation scope.',
    examples: [
      'opl system developer-supervisor',
      'opl system developer-supervisor --enabled on --mode developer_apply_safe --github-login gaofeng21cn',
      'opl system developer-supervisor --module medautoscience --module-source developer',
    ],
    group: 'system',
    handler: async (args) => {
      const parsed = parseDeveloperSupervisorArgs(args, systemDeveloperSupervisorSpec);
      return buildPublicSystemActionPayload(
        await runOplSystemAction(getContracts(), 'developer_supervisor', parsed),
      );
    },
  };

  const systemConfigureCodexSpec: CommandSpec = {
    usage: 'opl system configure-codex --api-key-stdin',
    summary: 'Write the local Codex provider config from the OPL default endpoint, App-owned install fallback, and an API key read from stdin.',
    examples: ['printf "%s" "$OPL_CODEX_API_KEY" | opl system configure-codex --api-key-stdin'],
    group: 'system',
    handler: async (args) => {
      parseSystemConfigureCodexArgs(args, systemConfigureCodexSpec);
      const apiKey = (await readStdinText()).trim();
      if (!apiKey) {
        throw buildUsageError('system configure-codex received an empty API key on stdin.', systemConfigureCodexSpec, {
          required: ['api_key_stdin'],
        });
      }

      const defaultProfile = readBundledCodexDefaultProfile();
      const bootstrap = bootstrapLocalCodexDefaults({
        provider_api_key: apiKey,
      });
      const familySkillSync = syncFullRuntimeFamilyCodexPluginsIfAvailable();
      const companionSkillSync = syncPackagedFullCompanionSkillsIfAvailable();
      const agentPackageSync = await syncFullRuntimeAgentPackageLocksIfAvailable();
      return {
        version: 'g2',
        codex_config: {
          surface_id: 'opl_codex_config',
          status: bootstrap.status,
          config_path: bootstrap.config_path,
          default_profile: defaultProfile,
          bootstrap: {
            config_path: bootstrap.config_path,
            model_provider: defaultProfile.model_provider,
            model: bootstrap.model,
            reasoning_effort: bootstrap.reasoning_effort,
            provider_base_url: bootstrap.provider_base_url,
            api_key_present: bootstrap.api_key_present,
            management_receipt: bootstrap.management_receipt,
            management_receipt_path: 'management_receipt_path' in bootstrap
              ? bootstrap.management_receipt_path
              : null,
          },
          ...(familySkillSync ? { skill_sync: familySkillSync.skill_sync } : {}),
          ...(companionSkillSync ? { companion_skill_sync: companionSkillSync } : {}),
          ...(agentPackageSync ? { agent_package_sync: agentPackageSync } : {}),
        },
      };
    },
  };

  const systemCodexConfigHygieneSpec: CommandSpec = {
    usage: 'opl system codex-config-hygiene [--dry-run | --rollback-receipt <path>]',
    summary: 'Reconcile stale temporary Codex marketplaces and global MAS Scholar discovery with a rollback receipt.',
    examples: [
      'opl system codex-config-hygiene --dry-run --json',
      'opl system codex-config-hygiene --json',
    ],
    group: 'system',
    handler: (args) => {
      const parsed = parseRegisteredCommandOptions(
        'system codex-config-hygiene',
        args,
        systemCodexConfigHygieneSpec,
      );
      const rollbackReceipt = typeof parsed['rollback-receipt'] === 'string'
        ? parsed['rollback-receipt']
        : null;
      if (parsed['dry-run'] === true && rollbackReceipt) {
        throw buildUsageError(
          'system codex-config-hygiene accepts --dry-run or --rollback-receipt, not both.',
          systemCodexConfigHygieneSpec,
          { conflicting: ['--dry-run', '--rollback-receipt'] },
        );
      }
      return runCodexConfigHygiene({
        dryRun: parsed['dry-run'] === true,
        rollbackReceipt,
      });
    },
  };

  const systemDependencyDoctorSpec: CommandSpec = {
    usage: 'opl system dependency-doctor --profile <profile-id>',
    summary:
      'Inspect OPL-owned local dependency readiness for an explicitly selected agent or package profile.',
    examples: [
      'opl system dependency-doctor --profile bookforge-publication-proof --json',
    ],
    group: 'system',
    handler: (args) => {
      const parsed = parseSystemDependencyArgs(args, systemDependencyDoctorSpec);
      return buildOplSystemDependencyDoctor({ profile: parsed.profile });
    },
  };

  const systemDependencyMaintenanceSpec: CommandSpec = {
    usage: 'opl system dependency-maintenance --profile <profile-id> [--apply]',
    summary:
      'Plan or explicitly apply OPL-owned local dependency maintenance for domain helper profiles.',
    examples: [
      'opl system dependency-maintenance --profile bookforge-publication-proof --json',
      'opl system dependency-maintenance --profile bookforge-publication-proof --apply --json',
    ],
    group: 'system',
    handler: async (args) => {
      const parsed = parseSystemDependencyArgs(args, systemDependencyMaintenanceSpec);
      return buildPublicSystemActionPayload(
        await runOplSystemAction(getContracts(), 'dependency_maintenance', {
          dependencyProfile: parsed.profile,
          apply: parsed.apply,
        }),
      );
    },
  };

  const systemInitializeSpec: CommandSpec = {
    usage: 'opl system initialize [--events] [--json]',
    summary: 'Show the first-run initialization surface for system, modules, and workspace root.',
    examples: ['opl system initialize --json', 'opl system initialize --events --json'],
    group: 'system',
    handler: async (args) => {
      if (args.length === 0) {
        return buildPublicSystemInitializePayload(await buildOplInitialize(getContracts()));
      }
      if (args.length === 1 && args[0] === '--events') {
        let lastSequence = 0;
        const payload = buildPublicSystemInitializePayload(await buildOplInitialize(getContracts(), {
          onEvent: (event) => {
            lastSequence = event.sequence;
            writeJsonLine({
              version: 'g2',
              event,
            });
          },
        }));
        writeJsonLine({
          version: 'g2',
          event: {
            surface_id: 'opl_system_initialize_event',
            event_type: 'complete',
            phase: 'summary',
            label: 'Initialize payload ready',
            sequence: lastSequence + 1,
            observed_at: new Date().toISOString(),
            payload,
          },
        });
        return { __handled: true as const };
      }
      throw buildUsageError(`Unknown system initialize option: ${args[0]}.`, systemInitializeSpec, {
        option: args[0],
      });
    },
  };

  return {
    system: buildNoArgSpec(
      {
        usage: 'opl system',
        summary: 'Show the user-facing OPL system surface: Codex default readiness, optional engines, GUI install state, and managed paths.',
        examples: ['opl system'],
        group: 'system',
      },
      async () => buildPublicSystemPayload(await buildOplEnvironment(getContracts())),
    ),
    'system initialize': systemInitializeSpec,
    'system semantic-hygiene': buildNoArgSpec(
      {
        usage: 'opl system semantic-hygiene',
        summary: 'Show the machine-readable OPL framework semantic hygiene audit gates.',
        examples: ['opl system semantic-hygiene --json'],
        group: 'system',
      },
      () => ({
        version: 'g2',
        semantic_hygiene: buildOplFrameworkSemanticHygieneAudit(getContracts()),
      }),
    ),
    'system dependency-doctor': systemDependencyDoctorSpec,
    'system dependency-maintenance': systemDependencyMaintenanceSpec,
    'system configure-codex': systemConfigureCodexSpec,
    'system codex-config-hygiene': systemCodexConfigHygieneSpec,
    'system repair': buildNoArgSpec(
      {
        usage: 'opl system repair',
        summary: 'Run the system-level repair action for the current OPL install.',
        examples: ['opl system repair'],
        group: 'system',
      },
      async () => buildPublicSystemActionPayload(await runOplSystemAction(getContracts(), 'repair')),
    ),
    'system update': buildNoArgSpec(
      {
        usage: 'opl system update',
        summary: 'Update OPL engines and domain modules that report an available update.',
        examples: ['opl system update'],
        group: 'system',
      },
      async () => buildPublicSystemActionPayload(await runOplSystemAction(getContracts(), 'update')),
    ),
    'system startup-maintenance': systemStartupMaintenanceSpec,
    'system docker-webui doctor': buildNoArgSpec(
      {
        usage: 'opl system docker-webui doctor',
        summary:
          'Read Docker/WebUI data, seed install manifest, startup-maintenance guidance, and browser URL observations without applying repairs.',
        examples: ['opl system docker-webui doctor --json'],
        group: 'system',
      },
      () => buildOplDockerWebuiDoctor(),
    ),
    'system seed-apply': {
      usage: 'opl system seed-apply [--from <seed-dir>] [--data-dir <data-dir>] [--projects-dir <projects-dir>]',
      summary: 'Record Docker/WebUI image seed, data volume, projects directory, and component receipt boundaries.',
      examples: [
        'opl system seed-apply --json',
        'opl system seed-apply --from /opt/opl/seed --data-dir /data --projects-dir /projects --json',
      ],
      group: 'system',
      handler: async (args) => {
        const parsed = parseSystemSeedApplyArgs(args, {
          usage: 'opl system seed-apply [--from <seed-dir>] [--data-dir <data-dir>] [--projects-dir <projects-dir>]',
          examples: [
            'opl system seed-apply --json',
            'opl system seed-apply --from /opt/opl/seed --data-dir /data --projects-dir /projects --json',
          ],
        });
        return buildPublicSystemActionPayload(
          await runOplSystemAction(getContracts(), 'seed_apply', {
            seedDir: parsed.seedDir,
            dataDir: parsed.dataDir,
            projectsDir: parsed.projectsDir,
          }),
        );
      },
    },
    'system repair-native-helpers': buildNoArgSpec(
      {
        usage: 'opl system repair-native-helpers',
        summary: 'Build or refresh OPL native helper binaries used for local doctor, watch, and indexing checks.',
        examples: ['opl system repair-native-helpers'],
        group: 'system',
      },
      async () => buildPublicSystemActionPayload(await runOplSystemAction(getContracts(), 'repair_native_helpers')),
    ),
    'system update-channel': systemUpdateChannelSpec,
    'system developer-supervisor': systemDeveloperSupervisorSpec,
  };
}
