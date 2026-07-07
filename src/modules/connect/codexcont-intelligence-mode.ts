import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;
type ModeAction = 'status' | 'enable' | 'disable' | 'repair' | 'uninstall';
const PAYLOAD_PREFLIGHT_ACTIONS = new Set<ModeAction>(['status', 'enable', 'repair']);

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function candidateScripts() {
  const configured = normalizeOptionalString(process.env.OPL_FLOW_INTELLIGENCE_SCRIPT);
  const repoRoot = normalizeOptionalString(process.env.OPL_FLOW_REPO_ROOT);
  const candidates = [
    configured,
    repoRoot ? path.join(repoRoot, 'scripts', 'intelligence_enhancement.py') : null,
    path.join(os.homedir(), 'plugins', 'opl-flow', 'scripts', 'intelligence_enhancement.py'),
    path.resolve(process.cwd(), '..', 'opl-flow', 'scripts', 'intelligence_enhancement.py'),
  ];
  return candidates.filter((candidate): candidate is string => candidate !== null);
}

function candidateInstallers() {
  const configured = normalizeOptionalString(process.env.OPL_FLOW_INSTALLER_SCRIPT);
  const repoRoot = normalizeOptionalString(process.env.OPL_FLOW_REPO_ROOT);
  const candidates = [
    configured,
    repoRoot ? path.join(repoRoot, 'scripts', 'install_local_plugin.py') : null,
    path.resolve(process.cwd(), '..', 'opl-flow', 'scripts', 'install_local_plugin.py'),
  ];
  return candidates.filter((candidate): candidate is string => candidate !== null);
}

function resolveOplFlowScript() {
  return candidateScripts().find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function resolveOplFlowInstaller() {
  return candidateInstallers().find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function ensureOplFlowPluginPayload(action: ModeAction) {
  if (!PAYLOAD_PREFLIGHT_ACTIONS.has(action)) return;

  const installerPath = resolveOplFlowInstaller();
  if (!installerPath) return;

  const command = normalizeOptionalString(process.env.OPL_FLOW_PYTHON) ?? 'python3';
  const result = spawnSync(command, [installerPath, '--no-profile'], {
    encoding: 'utf8',
    timeout: 240_000,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Flow plugin payload preflight failed.', {
      command: [command, installerPath, '--no-profile'],
      exit_code: result.status,
      stdout: result.stdout?.trim() ?? '',
      stderr: result.stderr?.trim() ?? '',
      authority_boundary: {
        owner: 'opl_flow',
        profile_mutation_allowed: false,
        one_person_lab_role: 'delegates_payload_preflight_to_opl_flow_only',
      },
    });
  }
}

function runOplFlowScript(scriptPath: string, action: ModeAction, payload: JsonRecord, dryRun: boolean) {
  const command = normalizeOptionalString(process.env.OPL_FLOW_PYTHON) ?? 'python3';
  const args = [scriptPath, action];
  if (dryRun) args.push('--dry-run');
  if (Object.keys(payload).length > 0) args.push('--payload', JSON.stringify(payload));
  const confirmation = normalizeOptionalString(payload.confirmation);
  if (action === 'uninstall' && confirmation) args.push('--confirmation', confirmation);

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 240_000,
    env: process.env,
  });
  const stdout = result.stdout?.trim() ?? '';
  if (result.status !== 0) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Flow intelligence enhancement action failed.', {
      command: [command, scriptPath, action],
      exit_code: result.status,
      stdout,
      stderr: result.stderr?.trim() ?? '',
    });
  }
  const parsed = parseJsonText(stdout);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Flow intelligence enhancement action returned invalid JSON.', {
      command: [command, scriptPath, action],
      stdout,
    });
  }
  return parsed as JsonRecord;
}

export async function runOplFlowIntelligenceEnhancementAction(
  action: ModeAction,
  payload: JsonRecord,
  dryRun: boolean,
) {
  ensureOplFlowPluginPayload(action);
  const scriptPath = resolveOplFlowScript();
  if (!scriptPath) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Flow intelligence enhancement script is not installed.', {
      expected: candidateScripts(),
      install_command: 'git clone https://github.com/gaofeng21cn/opl-flow.git && cd opl-flow && python3 scripts/install_local_plugin.py',
      authority_boundary: {
        owner: 'opl_flow',
        one_person_lab_role: 'delegates_to_opl_flow_only',
      },
    });
  }
  return runOplFlowScript(scriptPath, action, payload, dryRun);
}
