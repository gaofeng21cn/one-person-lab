import path from 'node:path';

import { runCli } from '../helpers.ts';

export function bindRealManifest(input: {
  project: string;
  workspacePath: string;
  manifestCommand: string;
  stateRoot: string;
  contractsRoot: string;
}) {
  runCli([
    'workspace',
    'bind',
    '--project',
    input.project,
    '--path',
    input.workspacePath,
    '--manifest-command',
    input.manifestCommand,
  ], {
    OPL_CONTRACTS_DIR: input.contractsRoot,
    OPL_STATE_DIR: input.stateRoot,
  });
}

export function shellArg(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildGeneratedProductEntryManifestCommand(input: {
  frameworkRoot: string;
  repoDir: string;
  workspaceRoot: string;
}) {
  const projector = [
    "let source = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => { source += chunk; });",
    "process.stdin.on('end', () => {",
    '  const payload = JSON.parse(source);',
    '  const generated = payload.generated_agent_interfaces;',
    '  const productEntry = generated?.product_entry;',
    "  if (generated?.status !== 'ready' || productEntry?.status !== 'ready' || !productEntry.family_stage_control_plane) {",
    "    throw new Error('OPL-generated product-entry projection is not ready.');",
    '  }',
    `  const workspaceRoot = ${JSON.stringify(input.workspaceRoot)};`,
    '  process.stdout.write(JSON.stringify({',
    "    surface_kind: 'opl_generated_product_entry_manifest_projection',",
    '    product_entry_manifest: {',
    "      surface_kind: 'product_entry_manifest',",
    '      manifest_version: 1,',
    "      manifest_kind: 'opl_generated_product_entry_manifest',",
    '      target_domain_id: generated.target_domain_id,',
    '      formal_entry: {',
    "        default: 'OPL_GENERATED',",
    '        supported_protocols: [],',
    "        internal_surface: 'opl_generated_interfaces',",
    '      },',
    '      workspace_locator: {',
    "        workspace_surface_kind: 'opl_generated_standard_agent_repo',",
    '        workspace_root: workspaceRoot,',
    '      },',
    '      product_entry_shell: {},',
    '      shared_handoff: {',
    '        opl_return_surface: {',
    "          surface_kind: 'opl_generated_product_entry',",
    '          target_domain_id: generated.target_domain_id,',
    '        },',
    '      },',
    '      family_stage_control_plane_ref: {',
    "        ref_kind: 'generated_surface',",
    "        ref: 'opl-generated:family_stage_control_plane',",
    "        source_ref: 'agent/stages/manifest.json',",
    "        label: 'OPL-generated family stage control plane',",
    '      },',
    '    },',
    "  }) + '\\n');",
    '});',
  ].join('\n');
  return [
    'set -o pipefail;',
    shellArg(path.join(input.frameworkRoot, 'bin', 'opl')),
    'agents interfaces --repo-dir',
    shellArg(input.repoDir),
    '--format product-entry --json',
    '|',
    shellArg(process.execPath),
    '-e',
    shellArg(projector),
  ].join(' ');
}
