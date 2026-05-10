import {
  buildHermesCliPreview,
  inspectHermesRuntime,
  runHermesCommand,
  type HermesCommandResult,
} from './hermes.ts';

const DEFAULT_CRON_JOB_NAME = 'opl-family-runtime-tick';
const DEFAULT_WEBHOOK_PROMPT = 'opl-family-runtime-webhook';
const DEFAULT_TICK_CADENCE = 'every 1m';
const DEFAULT_TICK_PROMPT = 'Run the OPL family runtime tick and write receipts to the OPL local inbox.';

function bridgeCommandPreview() {
  return ['opl', 'family-runtime', 'tick', '--source', 'hermes-cron', '--hydrate'];
}

function cronCreateArgs(workdir?: string) {
  const args = [
    'cron',
    'create',
    DEFAULT_TICK_CADENCE,
    DEFAULT_TICK_PROMPT,
    '--name',
    DEFAULT_CRON_JOB_NAME,
    '--deliver',
    'local',
    '--script',
    bridgeCommandPreview().join(' '),
  ];
  if (workdir) {
    args.push('--workdir', workdir);
  }
  return args;
}

function webhookSubscribeArgs() {
  return [
    'webhook',
    'subscribe',
    DEFAULT_WEBHOOK_PROMPT,
    '--prompt',
    DEFAULT_WEBHOOK_PROMPT,
    '--events',
    '*',
    '--deliver',
    'local',
    '--deliver-only',
  ];
}

function commandPreviews() {
  return {
    cron_create: buildHermesCliPreview(cronCreateArgs()),
    webhook_subscribe: buildHermesCliPreview(webhookSubscribeArgs()),
  };
}

export function hermesDisabled() {
  return process.env.OPL_DISABLE_HERMES_ONLINE === '1';
}

export function inspectHermesBridge() {
  if (hermesDisabled()) {
    return {
      disabled: true,
      gateway_ready: false,
      cron_registered: false,
      webhook_registered: false,
      cron_raw_output: '',
      webhook_raw_output: '',
      issues: ['OPL_DISABLE_HERMES_ONLINE=1 disables online family runtime and marks readiness degraded.'],
      command_previews: commandPreviews(),
    };
  }

  const hermes = inspectHermesRuntime();
  const issues = [...hermes.issues];
  let cronResult: HermesCommandResult | null = null;
  let webhookResult: HermesCommandResult | null = null;
  try {
    cronResult = hermes.binary ? runHermesCommand(['cron', 'list']) : null;
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  try {
    webhookResult = hermes.binary ? runHermesCommand(['webhook', 'list']) : null;
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  const cronRaw = [cronResult?.stdout ?? '', cronResult?.stderr ?? ''].join('\n').trim();
  const webhookRaw = [webhookResult?.stdout ?? '', webhookResult?.stderr ?? ''].join('\n').trim();
  const cronRegistered = Boolean(cronResult && cronResult.exitCode === 0 && cronRaw.includes(DEFAULT_CRON_JOB_NAME));
  const webhookRegistered = Boolean(
    webhookResult && webhookResult.exitCode === 0 && webhookRaw.includes(DEFAULT_WEBHOOK_PROMPT),
  );

  if (!cronRegistered) {
    issues.push(`Hermes cron job ${DEFAULT_CRON_JOB_NAME} is not registered.`);
  }
  if (!webhookRegistered) {
    issues.push(`Hermes webhook subscription ${DEFAULT_WEBHOOK_PROMPT} is not registered.`);
  }

  return {
    disabled: false,
    gateway_ready: hermes.gateway_service.loaded,
    cron_registered: cronRegistered,
    webhook_registered: webhookRegistered,
    cron_raw_output: cronRaw,
    webhook_raw_output: webhookRaw,
    issues,
    command_previews: commandPreviews(),
  };
}

export function ensureHermesBridge(mode: 'install' | 'repair') {
  if (hermesDisabled()) {
    return {
      mode,
      status: 'degraded_disabled',
      actions: [],
      bridge: inspectHermesBridge(),
    };
  }

  const actions = [];
  const gatewayInstall = runHermesCommand(['gateway', 'install']);
  actions.push({
    action_id: 'hermes_gateway_install',
    status: gatewayInstall.exitCode === 0 ? 'completed' : 'failed',
    command_preview: buildHermesCliPreview(['gateway', 'install']),
    stdout: gatewayInstall.stdout,
    stderr: gatewayInstall.stderr,
  });

  let bridge = inspectHermesBridge();
  if (!bridge.cron_registered) {
    const args = cronCreateArgs(process.cwd());
    const result = runHermesCommand(args);
    actions.push({
      action_id: 'hermes_cron_create',
      status: result.exitCode === 0 && !/failed to create/i.test(result.stdout) ? 'completed' : 'failed',
      command_preview: buildHermesCliPreview(args),
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  if (!bridge.webhook_registered) {
    const args = webhookSubscribeArgs();
    const result = runHermesCommand(args);
    actions.push({
      action_id: 'hermes_webhook_subscribe',
      status: result.exitCode === 0 && !/webhook platform is not enabled/i.test(result.stdout) ? 'completed' : 'failed',
      command_preview: buildHermesCliPreview(args),
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  bridge = inspectHermesBridge();
  const ready = bridge.gateway_ready && bridge.cron_registered && bridge.webhook_registered;
  return {
    mode,
    status: ready ? 'ready' : 'attention_needed',
    actions,
    bridge,
  };
}
