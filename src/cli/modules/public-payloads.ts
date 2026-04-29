type VersionedPayload = {
  version: string;
};

type UnknownRecord = Record<string, unknown>;

type OplEnvironmentProjection = {
  overall_status: unknown;
  core_engines: unknown;
  native_helpers: unknown;
  module_summary: unknown;
  gui_shell: unknown;
  managed_paths: unknown;
  notes: unknown;
};

type OplModulesProjection = {
  modules_root: unknown;
  summary: unknown;
  modules: unknown;
  notes: unknown;
};

type OplInitializeProjection = {
  overall_state: unknown;
  setup_flow: unknown;
  module_summary: unknown;
  checklist: unknown;
  core_engines: unknown;
  native_helpers: unknown;
  domain_modules: OplModulesProjection;
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

type OplEngineActionProjection = UnknownRecord & {
  system_environment: OplEnvironmentProjection;
};

function buildPublicSystemFromOplEnvironment(environment: OplEnvironmentProjection) {
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

function buildPublicSystemPayload(payload: VersionedPayload & { system_environment: OplEnvironmentProjection }) {
  return {
    version: payload.version,
    system: buildPublicSystemFromOplEnvironment(payload.system_environment),
  };
}

function buildPublicSystemInitializePayload(
  payload: VersionedPayload & { system_initialize: OplInitializeProjection },
) {
  const domainModules = payload.system_initialize.domain_modules;
  return {
    version: payload.version,
    system_initialize: {
      surface_id: 'opl_system_initialize',
      overall_state: payload.system_initialize.overall_state,
      setup_flow: payload.system_initialize.setup_flow,
      module_summary: payload.system_initialize.module_summary,
      checklist: payload.system_initialize.checklist,
      core_engines: payload.system_initialize.core_engines,
      native_helpers: payload.system_initialize.native_helpers,
      domain_modules: {
        surface_id: 'opl_modules',
        modules_root: domainModules.modules_root,
        summary: domainModules.summary,
        modules: domainModules.modules,
        notes: domainModules.notes,
      },
      recommended_skills: payload.system_initialize.recommended_skills,
      gui_shell: payload.system_initialize.gui_shell,
      settings: {
        ...payload.system_initialize.settings,
      },
      workspace_root: {
        ...payload.system_initialize.workspace_root,
      },
      system: {
        update_channel: payload.system_initialize.system.update_channel,
        gui_shell: payload.system_initialize.system.gui_shell,
        actions: payload.system_initialize.system.actions.map((entry) => ({
          ...entry,
        })),
      },
      recommended_next_action: payload.system_initialize.recommended_next_action,
      endpoints: payload.system_initialize.endpoints,
      notes: payload.system_initialize.notes,
    },
  };
}

function buildPublicTurnkeyInstallPayload(payload: VersionedPayload & { opl_install: UnknownRecord }) {
  return {
    version: payload.version,
    install: {
      ...payload.opl_install,
    },
  };
}

function buildPublicModulesPayload(payload: VersionedPayload & { modules: OplModulesProjection }) {
  return {
    version: payload.version,
    modules: {
      surface_id: 'opl_modules',
      modules_root: payload.modules.modules_root,
      summary: payload.modules.summary,
      items: payload.modules.modules,
      notes: payload.modules.notes,
    },
  };
}

function buildPublicModuleActionPayload(payload: VersionedPayload & { module_action: UnknownRecord }) {
  return {
    version: payload.version,
    module_action: {
      surface_id: 'opl_module_action',
      ...payload.module_action,
    },
  };
}

function buildPublicEngineActionPayload(
  payload: VersionedPayload & { engine_action: OplEngineActionProjection },
) {
  const { system_environment: environment, ...action } = payload.engine_action;

  return {
    version: payload.version,
    engine_action: {
      surface_id: 'opl_engine_action',
      ...action,
      system: buildPublicSystemFromOplEnvironment(environment),
    },
  };
}

function buildPublicSystemActionPayload(payload: VersionedPayload & { system_action: UnknownRecord }) {
  return {
    version: payload.version,
    system_action: {
      surface_id: 'opl_system_action',
      ...payload.system_action,
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
