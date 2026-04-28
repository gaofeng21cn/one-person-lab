type VersionedPayload = {
  version: string;
};

type UnknownRecord = Record<string, unknown>;

type FrontDeskEnvironmentProjection = {
  overall_status: unknown;
  core_engines: unknown;
  native_helpers: unknown;
  module_summary: unknown;
  gui_shell: unknown;
  managed_paths: unknown;
  notes: unknown;
};

type FrontDeskModulesProjection = {
  modules_root: unknown;
  summary: unknown;
  modules: unknown;
  notes: unknown;
};

type FrontDeskInitializeProjection = {
  overall_state: unknown;
  setup_flow: unknown;
  module_summary: unknown;
  checklist: unknown;
  core_engines: unknown;
  native_helpers: unknown;
  domain_modules: FrontDeskModulesProjection;
  recommended_skills: unknown;
  gui_shell: unknown;
  settings: UnknownRecord;
  workspace_root: UnknownRecord;
  system: {
    update_channel: unknown;
    gui_shell: unknown;
    actions: UnknownRecord[];
  };
  recommended_next_action: unknown;
  endpoints: unknown;
  notes: unknown;
};

type FrontDeskEngineActionProjection = UnknownRecord & {
  frontdesk_environment: FrontDeskEnvironmentProjection;
};

function buildPublicSystemFromFrontDeskEnvironment(environment: FrontDeskEnvironmentProjection) {
  return {
    surface_id: 'opl_system',
    overall_status: environment.overall_status,
    core_engines: environment.core_engines,
    native_helpers: environment.native_helpers,
    module_summary: environment.module_summary,
    gui_shell: environment.gui_shell,
    managed_paths: environment.managed_paths,
    notes: environment.notes,
  };
}

function buildPublicSystemPayload(payload: VersionedPayload & { frontdesk_environment: FrontDeskEnvironmentProjection }) {
  return {
    version: payload.version,
    system: buildPublicSystemFromFrontDeskEnvironment(payload.frontdesk_environment),
  };
}

function buildPublicSystemInitializePayload(
  payload: VersionedPayload & { frontdesk_initialize: FrontDeskInitializeProjection },
) {
  const domainModules = payload.frontdesk_initialize.domain_modules;
  return {
    version: payload.version,
    system_initialize: {
      surface_id: 'opl_system_initialize',
      overall_state: payload.frontdesk_initialize.overall_state,
      setup_flow: payload.frontdesk_initialize.setup_flow,
      module_summary: payload.frontdesk_initialize.module_summary,
      checklist: payload.frontdesk_initialize.checklist,
      core_engines: payload.frontdesk_initialize.core_engines,
      native_helpers: payload.frontdesk_initialize.native_helpers,
      domain_modules: {
        surface_id: 'opl_modules',
        modules_root: domainModules.modules_root,
        summary: domainModules.summary,
        modules: domainModules.modules,
        notes: domainModules.notes,
      },
      recommended_skills: payload.frontdesk_initialize.recommended_skills,
      gui_shell: payload.frontdesk_initialize.gui_shell,
      settings: {
        ...payload.frontdesk_initialize.settings,
      },
      workspace_root: {
        ...payload.frontdesk_initialize.workspace_root,
      },
      system: {
        update_channel: payload.frontdesk_initialize.system.update_channel,
        gui_shell: payload.frontdesk_initialize.system.gui_shell,
        actions: payload.frontdesk_initialize.system.actions.map((entry) => ({
          ...entry,
        })),
      },
      recommended_next_action: payload.frontdesk_initialize.recommended_next_action,
      endpoints: payload.frontdesk_initialize.endpoints,
      notes: payload.frontdesk_initialize.notes,
    },
  };
}

function buildPublicTurnkeyInstallPayload(payload: VersionedPayload & { frontdesk_turnkey_install: UnknownRecord }) {
  return {
    version: payload.version,
    install: {
      ...payload.frontdesk_turnkey_install,
    },
  };
}

function buildPublicModulesPayload(payload: VersionedPayload & { frontdesk_modules: FrontDeskModulesProjection }) {
  return {
    version: payload.version,
    modules: {
      surface_id: 'opl_modules',
      modules_root: payload.frontdesk_modules.modules_root,
      summary: payload.frontdesk_modules.summary,
      items: payload.frontdesk_modules.modules,
      notes: payload.frontdesk_modules.notes,
    },
  };
}

function buildPublicModuleActionPayload(payload: VersionedPayload & { frontdesk_module_action: UnknownRecord }) {
  return {
    version: payload.version,
    module_action: {
      surface_id: 'opl_module_action',
      ...payload.frontdesk_module_action,
    },
  };
}

function buildPublicEngineActionPayload(
  payload: VersionedPayload & { frontdesk_engine_action: FrontDeskEngineActionProjection },
) {
  const { frontdesk_environment: environment, ...action } = payload.frontdesk_engine_action;

  return {
    version: payload.version,
    engine_action: {
      surface_id: 'opl_engine_action',
      ...action,
      system: buildPublicSystemFromFrontDeskEnvironment(environment),
    },
  };
}

function buildPublicSystemActionPayload(payload: VersionedPayload & { frontdesk_system_action: UnknownRecord }) {
  return {
    version: payload.version,
    system_action: {
      surface_id: 'opl_system_action',
      ...payload.frontdesk_system_action,
    },
  };
}

export {
  buildPublicEngineActionPayload,
  buildPublicModuleActionPayload,
  buildPublicModulesPayload,
  buildPublicSystemActionPayload,
  buildPublicSystemInitializePayload,
  buildPublicSystemPayload,
  buildPublicTurnkeyInstallPayload,
};
