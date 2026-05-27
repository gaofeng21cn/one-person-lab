import { bootstrapLocalCodexDefaults, readBundledCodexDefaultProfile } from '../../local-codex-defaults.ts';
import { buildOplFrameworkSemanticHygieneAudit } from '../../framework-semantic-hygiene.ts';
import { buildOplEnvironment } from '../../system-installation/environment.ts';
import { buildOplInitialize } from '../../system-installation/initialize.ts';
import { runOplSystemAction } from '../../system-installation/system-actions.ts';
import type { FrameworkContracts } from '../../types.ts';
import {
  buildPublicSystemActionPayload,
  buildPublicSystemInitializePayload,
  buildPublicSystemPayload,
} from '../modules/public-payloads.ts';
import {
  assertNoArgs,
  buildUsageError,
  parseDeveloperSupervisorArgs,
  parseSystemConfigureCodexArgs,
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

export function buildPublicSystemCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const buildSystemActionSpec = (
    command: string,
    summary: string,
    action: 'reconcile_modules' | 'startup_maintenance',
  ) => buildNoArgSpec(
    {
      usage: `opl system ${command}`,
      summary,
      examples: [`opl system ${command}`],
      group: 'system',
    },
    async () => buildPublicSystemActionPayload(await runOplSystemAction(getContracts(), action)),
  );

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
      'opl system developer-supervisor [--enabled <auto|on|off>] [--mode <external_observe|developer_apply_safe>] [--auto-enable-github-login <login>|--github-login <login>]',
    summary: 'Read or update the local OPL family developer supervisor config.',
    examples: [
      'opl system developer-supervisor',
      'opl system developer-supervisor --enabled on --mode developer_apply_safe --github-login gaofeng21cn',
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
    summary: 'Write the local Codex provider config from the OPL default endpoint, current initial model profile, and an API key read from stdin.',
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
        overwrite_existing: true,
      });
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
          },
        },
      };
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
    'system initialize': buildNoArgSpec(
      {
        usage: 'opl system initialize',
        summary: 'Show the first-run initialization surface for system, modules, and workspace root.',
        examples: ['opl system initialize'],
        group: 'system',
      },
      async () => buildPublicSystemInitializePayload(await buildOplInitialize(getContracts())),
    ),
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
    'system configure-codex': systemConfigureCodexSpec,
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
    'system reconcile-modules': buildSystemActionSpec(
      'reconcile-modules',
      'Install missing modules and update clean domain modules to the latest git upstream.',
      'reconcile_modules',
    ),
    'system startup-maintenance': buildSystemActionSpec(
      'startup-maintenance',
      'Run App startup maintenance for clean managed modules, plugin cache freshness, and reload guidance.',
      'startup_maintenance',
    ),
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
