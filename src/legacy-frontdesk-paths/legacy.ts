import { normalizeBasePath } from './shared.ts';

export type FrontDeskCompatEndpoints = {
  manifest: string;
  frontdesk_entry_guide: string;
  frontdesk_readiness: string;
  frontdesk_settings: string;
  frontdesk_environment: string;
  frontdesk_initialize: string;
  frontdesk_modules: string;
  frontdesk_engine_action: string;
  frontdesk_module_action: string;
  frontdesk_system_action: string;
  hosted_bundle: string;
  hosted_package: string;
  frontdesk_domain_wiring: string;
};

export function buildFrontDeskCompatEndpoints(basePath = ''): FrontDeskCompatEndpoints {
  const prefix = normalizeBasePath(basePath);
  const apiBase = `${prefix}/api`;
  const oplBase = `${apiBase}/opl`;

  return {
    manifest: `${apiBase}/frontdesk/manifest`,
    frontdesk_entry_guide: `${apiBase}/frontdesk/entry-guide`,
    frontdesk_readiness: `${apiBase}/frontdesk/readiness`,
    frontdesk_settings: `${oplBase}/system/settings`,
    frontdesk_environment: `${oplBase}/system`,
    frontdesk_initialize: `${oplBase}/system/initialize`,
    frontdesk_modules: `${oplBase}/modules`,
    frontdesk_engine_action: `${oplBase}/engines/actions`,
    frontdesk_module_action: `${oplBase}/modules/actions`,
    frontdesk_system_action: `${oplBase}/system/actions`,
    hosted_bundle: `${oplBase}/web/bundle`,
    hosted_package: `${oplBase}/web/package`,
    frontdesk_domain_wiring: `${apiBase}/frontdesk/domain-wiring`,
  };
}
