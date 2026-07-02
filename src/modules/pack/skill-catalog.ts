type JsonRecord = Record<string, unknown>;

interface BuildSkillDescriptorInput {
  skill_id: string;
  title: string;
  owner: string;
  distribution_mode: string;
  surface_kind: string;
  description: string;
  command?: string | null;
  readiness: string;
  tags?: string[];
  domain_projection?: JsonRecord | null;
}

interface BuildSkillCatalogInput {
  summary: string;
  skills: ReturnType<typeof buildSkillDescriptor>[];
  supported_commands: string[];
  command_contracts: JsonRecord[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`skill catalog 缺少字符串字段: ${field}`);
  }
  return text;
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

export function buildSkillDescriptor(input: BuildSkillDescriptorInput) {
  return {
    surface_kind: 'skill_descriptor',
    skill_id: requireString(input.skill_id, 'skill_id'),
    title: requireString(input.title, 'title'),
    owner: requireString(input.owner, 'owner'),
    distribution_mode: requireString(input.distribution_mode, 'distribution_mode'),
    target_surface_kind: requireString(input.surface_kind, 'surface_kind'),
    description: requireString(input.description, 'description'),
    ...(optionalString(input.command) ? { command: optionalString(input.command)! } : {}),
    readiness: requireString(input.readiness, 'readiness'),
    tags: readStringList(input.tags, 'tags'),
    ...(isRecord(input.domain_projection) ? { domain_projection: { ...input.domain_projection } } : {}),
  };
}

export function buildSkillCatalog(input: BuildSkillCatalogInput) {
  if (!Array.isArray(input.skills) || input.skills.length === 0) {
    throw new Error('skill catalog 需要至少一个 skill descriptor。');
  }
  if (!Array.isArray(input.command_contracts)) {
    throw new Error('skill catalog command_contracts 必须是数组。');
  }
  return {
    surface_kind: 'skill_catalog',
    summary: requireString(input.summary, 'summary'),
    skills: input.skills.map((skill) => buildSkillDescriptor(skill)),
    supported_commands: readStringList(input.supported_commands, 'supported_commands'),
    command_contracts: input.command_contracts.map((contract, index) => {
      if (!isRecord(contract)) {
        throw new Error(`skill catalog command_contracts[${index}] 必须是对象。`);
      }
      return { ...contract };
    }),
  };
}
