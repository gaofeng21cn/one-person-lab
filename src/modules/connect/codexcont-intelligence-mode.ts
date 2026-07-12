import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { resolveCodexBinary } from '../runway/index.ts';

type JsonRecord = Record<string, unknown>;
type ModeAction = 'status' | 'enable' | 'disable' | 'repair' | 'uninstall';

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
  const modulesRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT)
    ?? path.join(resolveOplStatePaths().state_dir, 'modules');
  const candidates = [
    configured,
    repoRoot ? path.join(repoRoot, 'scripts', 'install_local_plugin.py') : null,
    path.join(modulesRoot, 'opl-flow', 'scripts', 'install_local_plugin.py'),
  ];
  return candidates.filter((candidate): candidate is string => candidate !== null);
}

function resolveOplFlowScript() {
  return candidateScripts().find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function resolveOplFlowInstaller() {
  return candidateInstallers().find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

export function requireOplFlowPluginInstaller() {
  const installerPath = resolveOplFlowInstaller();
  if (!installerPath) {
    throw new FrameworkContractError(
      'surface_not_found',
      'Mandatory OPL Flow plugin installer was not found.',
      {
        expected: candidateInstallers(),
        authority_boundary: {
          owner: 'opl_flow',
          one_person_lab_role: 'requires_installed_opl_flow_plugin',
        },
      },
    );
  }
  return installerPath;
}

export function installOplFlowPluginIfAvailable(installerPath = requireOplFlowPluginInstaller()) {
  const command = normalizeOptionalString(process.env.OPL_FLOW_PYTHON) ?? 'python3';
  const codexBinary = resolveCodexBinary();
  const args = [installerPath, ...(codexBinary ? ['--codex-bin', codexBinary.path] : [])];
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 240_000,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Flow plugin payload preflight failed.', {
      command: [command, ...args],
      exit_code: result.status,
      stdout: result.stdout?.trim() ?? '',
      stderr: result.stderr?.trim() ?? '',
      authority_boundary: {
        owner: 'opl_flow',
        profile_mutation_allowed: false,
        profile_sync_policy: 'install_missing_or_emit_semantic_merge_packet',
        one_person_lab_role: 'delegates_plugin_and_profile_sync_to_opl_flow_only',
      },
    });
  }
  const payload = parseJsonText(result.stdout?.trim() ?? '');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Flow installer returned invalid JSON.', {
      command: [command, ...args],
      stdout: result.stdout?.trim() ?? '',
    });
  }
  return {
    status: 'installed' as const,
    installer_path: installerPath,
    result: payload as JsonRecord,
  };
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
