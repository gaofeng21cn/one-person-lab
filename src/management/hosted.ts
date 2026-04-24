import {
  buildFrontDeskApiBaseUrl,
  buildFrontDeskEntryUrl,
  normalizeBasePath,
} from '../frontdesk-paths.ts';
import { buildFrontDeskShellMcpWiring } from '../frontdesk-shell-identity.ts';
import { buildOplApiCatalog } from '../opl-api-paths.ts';
import type { GatewayContracts } from '../types.ts';

import type { HostedPilotBundleOptions } from './types.ts';
import {
  normalizeBaseUrlHost,
  normalizeWorkspacePath,
} from './shared.ts';

export function buildHostedRuntimeReadiness() {
  return {
    surface_kind: 'opl_hosted_runtime_readiness',
    status: 'pilot_ready_not_managed',
    shell_integration_target: 'external_gui_overlay',
    managed_hosted_runtime_landed: false,
    local_web_api_landed: true,
    hosted_friendly_contract_landed: true,
    web_bundle_landed: true,
    self_hostable_web_package_landed: true,
    desktop_shell_landed: false,
    service_safe_local_packaging_landed: true,
    hosted_shell_mcp_wiring_landed: true,
    workspace_binding_tooling_landed: true,
    session_attribution_tooling_landed: true,
    blocking_gaps: [
      'managed hosted runtime ownership 仍未 landed。',
      'multi-tenant hosted platform orchestration 仍未 landed。',
    ],
    recommended_next_actions: [
      '把 managed hosted runtime 的 service orchestration、tenant boundary 与 policy surface 单独冻结。',
      '保持 Hermes 作为外部 runtime substrate，不在 OPL 仓内虚构托管完成度。',
      '把 OPL 品牌 GUI 壳接到这些 API truth 上，当前主线在 opl-aion-shell 内基于 AionUI codebase 推进；OPL 主仓不在仓内继续长自研 GUI。',
    ],
  };
}


export function buildHostedPilotBundle(
  contracts: GatewayContracts,
  options: HostedPilotBundleOptions = {},
) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const workspacePath = normalizeWorkspacePath(options.workspacePath);
  const sessionsLimit = options.sessionsLimit ?? 5;
  const normalizedBasePath = normalizeBasePath(options.basePath);
  const baseUrl = `http://${normalizeBaseUrlHost(host)}:${port}`;
  const oplApi = buildOplApiCatalog(normalizedBasePath);
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const hostedShellMcpWiring = buildFrontDeskShellMcpWiring();

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    web_bundle: {
      surface_id: 'opl_web_bundle',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      bundle_status: 'landed',
      hosted_runtime_status: 'not_landed',
      base_path: normalizedBasePath,
      hosted_runtime_readiness: hostedRuntimeReadiness,
      hosted_shell_mcp_wiring: hostedShellMcpWiring,
      entry_url: buildFrontDeskEntryUrl(baseUrl, normalizedBasePath),
      api_base_url: buildFrontDeskApiBaseUrl(baseUrl, normalizedBasePath),
      opl_api: oplApi,
      defaults: {
        workspace_path: workspacePath,
        sessions_limit: sessionsLimit,
      },
      notes: [
        'This bundle packages the current OPL web entry with base-path-aware product API wiring.',
        'It now feeds external GUI overlays, but it is still not a managed hosted runtime or multi-tenant platform deployment.',
      ],
    },
  };
}

