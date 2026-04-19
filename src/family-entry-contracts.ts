export type JsonRecord = Record<string, unknown>;

export type DomainEntryCommandContract = JsonRecord & {
  command: string;
  required_fields: string[];
  optional_fields: string[];
};

export type FamilyDomainEntryContractSurface = JsonRecord & {
  entry_adapter: string;
  service_safe_surface_kind: string;
  product_entry_builder_command: string;
  supported_commands: string[];
  command_contracts: DomainEntryCommandContract[];
  supported_entry_modes?: string[];
  product_entry_kind?: string;
};

export type GatewayInteractionContractSurface = JsonRecord & {
  surface_kind: string;
  frontdoor_owner: string;
  user_interaction_mode: string;
  user_commands_required: boolean;
  command_surfaces_for_agent_consumption_only: boolean;
  shared_downstream_entry: string;
  shared_handoff_envelope: string[];
};

export type SharedHandoffBuilderSurface = JsonRecord & {
  command: string;
  entry_mode: string;
  surface_kind?: string;
};

export type SharedHandoffReturnSurface = JsonRecord & {
  surface_kind: string;
  target_domain_id: string;
};

export type FamilySharedHandoffSurface = JsonRecord & {
  direct_entry_builder?: SharedHandoffBuilderSurface;
  opl_handoff_builder?: SharedHandoffBuilderSurface;
  opl_return_surface?: SharedHandoffReturnSurface;
};

export interface BuildDomainEntryCommandContractInput {
  command: string;
  required_fields: string[];
  optional_fields?: string[] | null;
  extra_payload?: JsonRecord;
}

export interface DomainEntryCommandCatalogSurface {
  supported_commands: string[];
  command_contracts: DomainEntryCommandContract[];
}

export interface BuildFamilyDomainEntryContractInput {
  entry_adapter: string;
  service_safe_surface_kind: string;
  product_entry_builder_command: string;
  supported_commands: string[];
  command_contracts: Array<DomainEntryCommandContract | JsonRecord>;
  supported_entry_modes?: string[] | null;
  product_entry_kind?: string | null;
  extra_payload?: JsonRecord;
}

export interface BuildGatewayInteractionContractInput {
  frontdoor_owner: string;
  user_interaction_mode: string;
  user_commands_required: boolean;
  command_surfaces_for_agent_consumption_only: boolean;
  shared_downstream_entry: string;
  shared_handoff_envelope: string[];
  surface_kind?: string | null;
  extra_payload?: JsonRecord;
}

export interface BuildFamilyGatewayInteractionContractInput {
  shared_downstream_entry: string;
  extra_shared_handoff_envelope?: string[] | null;
  frontdoor_owner?: string | null;
  user_interaction_mode?: string | null;
  user_commands_required?: boolean | null;
  command_surfaces_for_agent_consumption_only?: boolean | null;
  surface_kind?: string | null;
  extra_payload?: JsonRecord;
}

export interface BuildSharedHandoffBuilderInput {
  command: string;
  entry_mode: string;
  surface_kind?: string | null;
  extra_payload?: JsonRecord;
}

export interface BuildSharedHandoffReturnSurfaceInput {
  surface_kind: string;
  target_domain_id: string;
  extra_payload?: JsonRecord;
}

export interface BuildSharedHandoffInput {
  direct_entry_builder?: SharedHandoffBuilderSurface | JsonRecord | null;
  opl_handoff_builder?: SharedHandoffBuilderSurface | JsonRecord | null;
  opl_return_surface?: SharedHandoffReturnSurface | JsonRecord | null;
  extra_payload?: JsonRecord;
}

export interface BuildFamilyDirectOplSharedHandoffInput {
  direct_entry_builder_command: string;
  opl_handoff_builder_command: string;
  direct_entry_mode?: string | null;
  opl_handoff_entry_mode?: string | null;
  extra_payload?: JsonRecord;
}

const SHARED_HANDOFF_KEYS = [
  'direct_entry_builder',
  'opl_handoff_builder',
  'opl_return_surface',
] as const;

export const DEFAULT_FAMILY_GATEWAY_SHARED_HANDOFF_ENVELOPE = [
  'target_domain_id',
  'task_intent',
  'entry_mode',
  'workspace_locator',
  'runtime_session_contract',
  'return_surface_contract',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`family entry contract 缺少字符串字段: ${field}`);
  }
  return text;
}

function requireBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`family entry contract 缺少布尔字段: ${field}`);
  }
  return value;
}

function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`family entry contract 缺少对象字段: ${field}`);
  }
  return value;
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`family entry contract 缺少数组字段: ${field}`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

function readOptionalStringList(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readStringList(value, field);
}

function mergeExtraPayload(base: JsonRecord, extraPayload: unknown, field: string) {
  if (extraPayload === undefined || extraPayload === null) {
    return base;
  }
  const payload = requireRecord(extraPayload, field);
  for (const key of Object.keys(payload)) {
    if (key in base) {
      throw new Error(`family entry contract extra_payload 不允许覆盖核心字段: ${field}.${key}`);
    }
  }
  return {
    ...base,
    ...payload,
  };
}

function omitKeys(payload: JsonRecord, keys: string[]) {
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !omitted.has(key)));
}

export function buildDomainEntryCommandContract(
  input: BuildDomainEntryCommandContractInput,
): DomainEntryCommandContract {
  return mergeExtraPayload(
    {
      command: requireString(input.command, 'command'),
      required_fields: readStringList(input.required_fields, 'required_fields'),
      optional_fields: readOptionalStringList(input.optional_fields, 'optional_fields') ?? [],
    },
    input.extra_payload,
    'command_contract',
  ) as DomainEntryCommandContract;
}

export function buildDomainEntryCommandCatalog(
  inputs: BuildDomainEntryCommandContractInput[],
): DomainEntryCommandCatalogSurface {
  const commandContracts = inputs.map((input, index) =>
    buildDomainEntryCommandContract({
      command: requireString(input.command, `command_catalog[${index}].command`),
      required_fields: readStringList(
        input.required_fields,
        `command_catalog[${index}].required_fields`,
      ),
      optional_fields:
        readOptionalStringList(
          input.optional_fields,
          `command_catalog[${index}].optional_fields`,
        ) ?? [],
      extra_payload: input.extra_payload,
    }),
  );

  return {
    supported_commands: commandContracts.map((contract) => contract.command),
    command_contracts: commandContracts,
  };
}

export function validateFamilyDomainEntryContract(
  value: unknown,
  field: string,
): FamilyDomainEntryContractSurface {
  const payload = requireRecord(value, field);
  const supportedCommands = readStringList(payload.supported_commands, `${field}.supported_commands`);
  const rawCommandContracts = payload.command_contracts;
  if (!Array.isArray(rawCommandContracts) || rawCommandContracts.length === 0) {
    throw new Error(`family entry contract 缺少数组字段: ${field}.command_contracts`);
  }
  const commandContracts = rawCommandContracts.map((contract, index) => {
    const normalized = requireRecord(contract, `${field}.command_contracts[${index}]`);
    const command = requireString(normalized.command, `${field}.command_contracts[${index}].command`);
    const requiredFields = readStringList(
      normalized.required_fields,
      `${field}.command_contracts[${index}].required_fields`,
    );
    const optionalFields = readOptionalStringList(
      normalized.optional_fields,
      `${field}.command_contracts[${index}].optional_fields`,
    );
    return buildDomainEntryCommandContract({
      command,
      required_fields: requiredFields,
      optional_fields: optionalFields,
      extra_payload: omitKeys(normalized, ['command', 'required_fields', 'optional_fields']),
    });
  });

  const normalized: FamilyDomainEntryContractSurface = {
    ...payload,
    entry_adapter: requireString(payload.entry_adapter, `${field}.entry_adapter`),
    service_safe_surface_kind: requireString(
      payload.service_safe_surface_kind,
      `${field}.service_safe_surface_kind`,
    ),
    product_entry_builder_command: requireString(
      payload.product_entry_builder_command,
      `${field}.product_entry_builder_command`,
    ),
    supported_commands: supportedCommands,
    command_contracts: commandContracts,
  };
  const supportedEntryModes = readOptionalStringList(
    payload.supported_entry_modes,
    `${field}.supported_entry_modes`,
  );
  if (supportedEntryModes !== undefined) {
    normalized.supported_entry_modes = supportedEntryModes;
  }
  const productEntryKind = optionalString(payload.product_entry_kind);
  if (productEntryKind) {
    normalized.product_entry_kind = productEntryKind;
  }
  return normalized;
}

export function buildFamilyDomainEntryContract(
  input: BuildFamilyDomainEntryContractInput,
): FamilyDomainEntryContractSurface {
  const base: JsonRecord = {
    entry_adapter: requireString(input.entry_adapter, 'entry_adapter'),
    service_safe_surface_kind: requireString(
      input.service_safe_surface_kind,
      'service_safe_surface_kind',
    ),
    product_entry_builder_command: requireString(
      input.product_entry_builder_command,
      'product_entry_builder_command',
    ),
    supported_commands: readStringList(input.supported_commands, 'supported_commands'),
    command_contracts: input.command_contracts.map((contract, index) => {
      const normalized = requireRecord(contract, `command_contracts[${index}]`);
      const command = requireString(normalized.command, `command_contracts[${index}].command`);
      const requiredFields = readStringList(
        normalized.required_fields,
        `command_contracts[${index}].required_fields`,
      );
      const optionalFields = readOptionalStringList(
        normalized.optional_fields,
        `command_contracts[${index}].optional_fields`,
      );
      return buildDomainEntryCommandContract({
        command,
        required_fields: requiredFields,
        optional_fields: optionalFields,
        extra_payload: omitKeys(
          normalized,
          ['command', 'required_fields', 'optional_fields'],
        ),
      });
    }),
  };
  const supportedEntryModes = readOptionalStringList(input.supported_entry_modes, 'supported_entry_modes');
  if (supportedEntryModes !== undefined) {
    base.supported_entry_modes = supportedEntryModes;
  }
  const productEntryKind = optionalString(input.product_entry_kind);
  if (productEntryKind) {
    base.product_entry_kind = productEntryKind;
  }
  return validateFamilyDomainEntryContract(
    mergeExtraPayload(base, input.extra_payload, 'domain_entry_contract'),
    'domain_entry_contract',
  );
}

export function validateGatewayInteractionContract(
  value: unknown,
  field: string,
): GatewayInteractionContractSurface {
  const payload = requireRecord(value, field);
  return {
    ...payload,
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    frontdoor_owner: requireString(payload.frontdoor_owner, `${field}.frontdoor_owner`),
    user_interaction_mode: requireString(
      payload.user_interaction_mode,
      `${field}.user_interaction_mode`,
    ),
    user_commands_required: requireBoolean(
      payload.user_commands_required,
      `${field}.user_commands_required`,
    ),
    command_surfaces_for_agent_consumption_only: requireBoolean(
      payload.command_surfaces_for_agent_consumption_only,
      `${field}.command_surfaces_for_agent_consumption_only`,
    ),
    shared_downstream_entry: requireString(
      payload.shared_downstream_entry,
      `${field}.shared_downstream_entry`,
    ),
    shared_handoff_envelope: readStringList(
      payload.shared_handoff_envelope,
      `${field}.shared_handoff_envelope`,
    ),
  };
}

export function buildGatewayInteractionContract(
  input: BuildGatewayInteractionContractInput,
): GatewayInteractionContractSurface {
  return validateGatewayInteractionContract(
    mergeExtraPayload(
      {
        surface_kind: optionalString(input.surface_kind) ?? 'gateway_interaction_contract',
        frontdoor_owner: requireString(input.frontdoor_owner, 'frontdoor_owner'),
        user_interaction_mode: requireString(input.user_interaction_mode, 'user_interaction_mode'),
        user_commands_required: requireBoolean(
          input.user_commands_required,
          'user_commands_required',
        ),
        command_surfaces_for_agent_consumption_only: requireBoolean(
          input.command_surfaces_for_agent_consumption_only,
          'command_surfaces_for_agent_consumption_only',
        ),
        shared_downstream_entry: requireString(
          input.shared_downstream_entry,
          'shared_downstream_entry',
        ),
        shared_handoff_envelope: readStringList(
          input.shared_handoff_envelope,
          'shared_handoff_envelope',
        ),
      },
      input.extra_payload,
      'gateway_interaction_contract',
    ),
    'gateway_interaction_contract',
  );
}

export function buildFamilyGatewayInteractionContract(
  input: BuildFamilyGatewayInteractionContractInput,
): GatewayInteractionContractSurface {
  const extraEnvelope = readOptionalStringList(
    input.extra_shared_handoff_envelope,
    'extra_shared_handoff_envelope',
  ) ?? [];
  const sharedHandoffEnvelope = Array.from(
    new Set([
      ...DEFAULT_FAMILY_GATEWAY_SHARED_HANDOFF_ENVELOPE,
      ...extraEnvelope,
    ]),
  );
  return buildGatewayInteractionContract({
    frontdoor_owner: optionalString(input.frontdoor_owner) ?? 'opl_gateway_or_domain_gui',
    user_interaction_mode: optionalString(input.user_interaction_mode) ?? 'natural_language_frontdoor',
    user_commands_required: input.user_commands_required ?? false,
    command_surfaces_for_agent_consumption_only:
      input.command_surfaces_for_agent_consumption_only ?? true,
    shared_downstream_entry: requireString(
      input.shared_downstream_entry,
      'shared_downstream_entry',
    ),
    shared_handoff_envelope: sharedHandoffEnvelope,
    surface_kind: optionalString(input.surface_kind),
    extra_payload: input.extra_payload,
  });
}

export function validateSharedHandoffBuilder(
  value: unknown,
  field: string,
): SharedHandoffBuilderSurface {
  const payload = requireRecord(value, field);
  const normalized: SharedHandoffBuilderSurface = {
    ...payload,
    command: requireString(payload.command, `${field}.command`),
    entry_mode: requireString(payload.entry_mode, `${field}.entry_mode`),
  };
  const surfaceKind = optionalString(payload.surface_kind);
  if (surfaceKind) {
    normalized.surface_kind = surfaceKind;
  }
  return normalized;
}

export function buildSharedHandoffBuilder(
  input: BuildSharedHandoffBuilderInput,
): SharedHandoffBuilderSurface {
  return validateSharedHandoffBuilder(
    mergeExtraPayload(
      {
        command: requireString(input.command, 'command'),
        entry_mode: requireString(input.entry_mode, 'entry_mode'),
        ...(optionalString(input.surface_kind)
          ? { surface_kind: optionalString(input.surface_kind) }
          : {}),
      },
      input.extra_payload,
      'shared_handoff_builder',
    ),
    'shared_handoff_builder',
  );
}

export function validateSharedHandoffReturnSurface(
  value: unknown,
  field: string,
): SharedHandoffReturnSurface {
  const payload = requireRecord(value, field);
  return {
    ...payload,
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    target_domain_id: requireString(payload.target_domain_id, `${field}.target_domain_id`),
  };
}

export function buildSharedHandoffReturnSurface(
  input: BuildSharedHandoffReturnSurfaceInput,
): SharedHandoffReturnSurface {
  return validateSharedHandoffReturnSurface(
    mergeExtraPayload(
      {
        surface_kind: requireString(input.surface_kind, 'surface_kind'),
        target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
      },
      input.extra_payload,
      'shared_handoff_return_surface',
    ),
    'shared_handoff_return_surface',
  );
}

export function validateSharedHandoff(
  value: unknown,
  field: string,
): FamilySharedHandoffSurface {
  const payload = requireRecord(value, field);
  const normalized: FamilySharedHandoffSurface = {
    ...payload,
  };
  let hasKnownSurface = false;

  if (payload.direct_entry_builder !== undefined) {
    normalized.direct_entry_builder = validateSharedHandoffBuilder(
      payload.direct_entry_builder,
      `${field}.direct_entry_builder`,
    );
    hasKnownSurface = true;
  }
  if (payload.opl_handoff_builder !== undefined) {
    normalized.opl_handoff_builder = validateSharedHandoffBuilder(
      payload.opl_handoff_builder,
      `${field}.opl_handoff_builder`,
    );
    hasKnownSurface = true;
  }
  if (payload.opl_return_surface !== undefined) {
    normalized.opl_return_surface = validateSharedHandoffReturnSurface(
      payload.opl_return_surface,
      `${field}.opl_return_surface`,
    );
    hasKnownSurface = true;
  }

  if (!hasKnownSurface) {
    throw new Error(`family entry contract shared_handoff 至少需要一个已知 surface: ${field}`);
  }

  return normalized;
}

export function buildSharedHandoff(
  input: BuildSharedHandoffInput,
): FamilySharedHandoffSurface {
  const base: JsonRecord = {};

  for (const key of SHARED_HANDOFF_KEYS) {
    const value = input[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (key === 'opl_return_surface') {
      base[key] = validateSharedHandoffReturnSurface(
        value,
        `shared_handoff.${key}`,
      );
      continue;
    }
    base[key] = validateSharedHandoffBuilder(value, `shared_handoff.${key}`);
  }

  return validateSharedHandoff(
    mergeExtraPayload(base, input.extra_payload, 'shared_handoff'),
    'shared_handoff',
  );
}

export function buildFamilyDirectOplSharedHandoff(
  input: BuildFamilyDirectOplSharedHandoffInput,
): FamilySharedHandoffSurface {
  return buildSharedHandoff({
    direct_entry_builder: buildSharedHandoffBuilder({
      command: requireString(
        input.direct_entry_builder_command,
        'direct_entry_builder_command',
      ),
      entry_mode: optionalString(input.direct_entry_mode) ?? 'direct',
    }),
    opl_handoff_builder: buildSharedHandoffBuilder({
      command: requireString(
        input.opl_handoff_builder_command,
        'opl_handoff_builder_command',
      ),
      entry_mode: optionalString(input.opl_handoff_entry_mode) ?? 'opl-handoff',
    }),
    extra_payload: input.extra_payload,
  });
}
