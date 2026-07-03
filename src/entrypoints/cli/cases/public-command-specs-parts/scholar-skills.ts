import {
  buildScholarSkillModuleInspect,
  buildScholarSkillsCatalog,
  buildScholarSkillsDoctor,
  buildScholarSkillsInvocationEnvelope,
  buildScholarSkillsInterfaces,
  buildScholarSkillsMaterializeSurface,
  buildScholarSkillsPrepareEnvelope,
  buildScholarSkillsReceiptCandidate,
  buildScholarSkillsRuntimePrepareReadback,
  buildScholarSkillsRuntimeRunContextReadback,
  buildScholarSkillsRunContextEnvelope,
  buildScholarSkillsValidation,
} from '../../../../modules/pack/scholar-skills.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import {
  assertNoArgs,
  buildUsageError,
  readPayloadFileText,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

function parseInspectArgs(args: string[], spec: CommandSpec) {
  let moduleId: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--module' || token === '--id') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('scholar-skills inspect requires a module id.', spec, {
          option: token,
          required: ['--module'],
        });
      }
      moduleId = value;
      continue;
    }
    throw buildUsageError(`Unknown scholar-skills inspect option: ${token}.`, spec, {
      option: token,
    });
  }
  if (!moduleId) {
    throw buildUsageError('scholar-skills inspect requires --module.', spec, {
      required: ['--module'],
    });
  }
  return { moduleId };
}

function expectOptionValue(
  args: string[],
  index: number,
  option: string,
  commandLabel: string,
  spec: CommandSpec,
) {
  const value = args[index + 1];
  if (!value) {
    throw buildUsageError(`${commandLabel} requires a value for ${option}.`, spec, {
      option,
    });
  }
  return value;
}

function parsePrepareArgs(
  args: string[],
  spec: CommandSpec,
  options: {
    allowApply?: boolean;
    allowRequirementProfileId?: boolean;
    commandLabel?: string;
  } = {},
) {
  const commandLabel = options.commandLabel ?? 'scholar-skills prepare';
  const parsed: {
    moduleId?: string;
    profile?: string;
    platform?: string;
    requirementProfile?: string;
    requirementProfileId?: string;
    paperRoot?: string;
    apply?: boolean;
  } = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--apply') {
      if (!options.allowApply) {
        throw buildUsageError(`Unknown ${commandLabel} option: ${token}.`, spec, {
          option: token,
        });
      }
      parsed.apply = true;
      continue;
    }
    if (token === '--module' || token === '--id') {
      parsed.moduleId = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--profile') {
      parsed.profile = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--platform') {
      parsed.platform = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--requirement-profile') {
      parsed.requirementProfile = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--requirement-profile-id') {
      if (!options.allowRequirementProfileId) {
        throw buildUsageError(`Unknown ${commandLabel} option: ${token}.`, spec, {
          option: token,
        });
      }
      parsed.requirementProfileId = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--paper-root') {
      parsed.paperRoot = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown ${commandLabel} option: ${token}.`, spec, {
      option: token,
    });
  }
  if (!parsed.moduleId || !parsed.profile || !parsed.platform || !parsed.requirementProfile || !parsed.paperRoot) {
    throw buildUsageError(
      `${commandLabel} requires --module, --profile, --platform, --requirement-profile, and --paper-root.`,
      spec,
      { required: ['--module', '--profile', '--platform', '--requirement-profile', '--paper-root'] },
    );
  }
  return {
    moduleId: parsed.moduleId,
    profile: parsed.profile,
    platform: parsed.platform,
    requirementProfile: parsed.requirementProfile,
    requirementProfileId: parsed.requirementProfileId,
    paperRoot: parsed.paperRoot,
    apply: parsed.apply,
  };
}

function parseRunContextArgs(
  args: string[],
  spec: CommandSpec,
  options: { requirePlatformAndPaperRoot?: boolean; commandLabel?: string } = {},
) {
  let moduleId: string | undefined;
  let profile: string | undefined;
  let platform: string | undefined;
  let paperRoot: string | undefined;
  const commandLabel = options.commandLabel ?? 'scholar-skills run-context';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--module' || token === '--id') {
      moduleId = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--profile') {
      profile = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--platform') {
      platform = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--paper-root') {
      paperRoot = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown ${commandLabel} option: ${token}.`, spec, {
      option: token,
    });
  }
  if (!moduleId || !profile) {
    throw buildUsageError(`${commandLabel} requires --module and --profile.`, spec, {
      required: ['--module', '--profile'],
    });
  }
  if (options.requirePlatformAndPaperRoot && (!platform || !paperRoot)) {
    throw buildUsageError(`${commandLabel} requires --module, --profile, --platform, and --paper-root.`, spec, {
      required: ['--module', '--profile', '--platform', '--paper-root'],
    });
  }
  return { moduleId, profile, platform, paperRoot };
}

function parseInvocationArgs(args: string[], spec: CommandSpec, commandLabel: string) {
  let moduleId: string | undefined;
  let inputRef: string | undefined;
  let artifactRoot: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--module' || token === '--id') {
      moduleId = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--input-ref') {
      inputRef = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--artifact-root') {
      artifactRoot = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown ${commandLabel} option: ${token}.`, spec, {
      option: token,
    });
  }
  if (!moduleId || !inputRef || !artifactRoot) {
    throw buildUsageError(`${commandLabel} requires --module, --input-ref, and --artifact-root.`, spec, {
      required: ['--module', '--input-ref', '--artifact-root'],
    });
  }
  return { moduleId, inputRef, artifactRoot };
}

function parseMaterializeArgs(args: string[], spec: CommandSpec) {
  let moduleId: string | undefined;
  let inputRef: string | undefined;
  let artifactRoot: string | undefined;
  let outputRoot: string | undefined;
  let payloadJson: string | undefined;
  let payloadFile: string | undefined;
  let emitCandidateArtifacts = false;
  const commandLabel = 'scholar-skills materialize';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--module' || token === '--id') {
      moduleId = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--input-ref') {
      inputRef = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--artifact-root') {
      artifactRoot = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--output-root') {
      outputRoot = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--payload-json') {
      payloadJson = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--payload-file') {
      payloadFile = expectOptionValue(args, index, token, commandLabel, spec);
      index += 1;
      continue;
    }
    if (token === '--emit-candidate-artifacts') {
      emitCandidateArtifacts = true;
      continue;
    }
    throw buildUsageError(`Unknown ${commandLabel} option: ${token}.`, spec, {
      option: token,
    });
  }
  if (!moduleId || !inputRef || !artifactRoot || !outputRoot) {
    throw buildUsageError(`${commandLabel} requires --module, --input-ref, --artifact-root, and --output-root.`, spec, {
      required: ['--module', '--input-ref', '--artifact-root', '--output-root'],
    });
  }
  if (payloadJson && payloadFile) {
    throw buildUsageError(`${commandLabel} accepts either --payload-json or --payload-file, not both.`, spec, {
      options: ['--payload-json', '--payload-file'],
    });
  }
  if ((payloadJson || payloadFile) && !emitCandidateArtifacts) {
    throw buildUsageError(`${commandLabel} requires --emit-candidate-artifacts when payload input is provided.`, spec, {
      required: ['--emit-candidate-artifacts'],
    });
  }
  if (emitCandidateArtifacts && !payloadJson && !payloadFile) {
    throw buildUsageError(`${commandLabel} requires --payload-json or --payload-file with --emit-candidate-artifacts.`, spec, {
      required_any: ['--payload-json', '--payload-file'],
    });
  }
  let payload: unknown;
  if (payloadJson || payloadFile) {
    const payloadText = payloadJson ?? readPayloadFileText(payloadFile ?? '', spec);
    try {
      payload = JSON.parse(payloadText);
    } catch (error) {
      throw buildUsageError(`${commandLabel} payload must be valid JSON.`, spec, {
        parse_error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    moduleId,
    inputRef,
    artifactRoot,
    outputRoot,
    payload,
    emitCandidateArtifacts,
  };
}

export function buildScholarSkillsCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'scholar-skills list': {
      usage: 'opl scholar-skills list',
      summary: 'List MAS Scholar Skills capability modules and their refs-only authority boundary.',
      examples: ['opl scholar-skills list --json'],
      group: 'scholar-skills',
      handler: (args) => {
        assertNoArgs(args.filter((entry) => entry !== '--json'), specs['scholar-skills list']);
        return buildScholarSkillsCatalog(getContracts());
      },
    },
    'scholar-skills inspect': {
      usage: 'opl scholar-skills inspect --module <module_id>',
      summary: 'Inspect one MAS Scholar Skills capability module descriptor.',
      examples: [
        'opl scholar-skills inspect --module mas-scholar-skills.display --json',
        'opl scholar-skills inspect --id mas-scholar-skills.display --json',
      ],
      group: 'scholar-skills',
      handler: (args) => {
        const parsed = parseInspectArgs(args, specs['scholar-skills inspect']);
        return buildScholarSkillModuleInspect(getContracts(), parsed.moduleId);
      },
    },
    'scholar-skills prepare': {
      usage: 'opl scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path>',
      summary: 'Build a refs-only dependency prepare envelope without installing dependencies or writing runtime state.',
      examples: [
        'opl scholar-skills prepare --module mas-scholar-skills.display --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --paper-root paper --json',
      ],
      group: 'scholar-skills',
      handler: (args) => buildScholarSkillsPrepareEnvelope(
        getContracts(),
        parsePrepareArgs(args, specs['scholar-skills prepare']),
      ),
    },
    'scholar-skills runtime-prepare': {
      usage: 'opl scholar-skills runtime-prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --paper-root <path> [--apply]',
      summary: 'Invoke the OPL runtime environment substrate for one ScholarSkills module and return bounded dependency receipts.',
      examples: [
        'opl scholar-skills runtime-prepare --module mas-scholar-skills.display --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --paper-root paper --apply --json',
      ],
      group: 'scholar-skills',
      handler: (args) => buildScholarSkillsRuntimePrepareReadback(
        getContracts(),
        parsePrepareArgs(args, specs['scholar-skills runtime-prepare'], {
          allowApply: true,
          allowRequirementProfileId: true,
          commandLabel: 'scholar-skills runtime-prepare',
        }),
      ),
    },
    'scholar-skills run-context': {
      usage: 'opl scholar-skills run-context --module <module_id> --profile <profile>',
      summary: 'Build a refs-only run-context envelope that cannot claim runtime readiness.',
      examples: [
        'opl scholar-skills run-context --module mas-scholar-skills.display --profile display --json',
      ],
      group: 'scholar-skills',
      handler: (args) => buildScholarSkillsRunContextEnvelope(
        getContracts(),
        parseRunContextArgs(args, specs['scholar-skills run-context']),
      ),
    },
    'scholar-skills runtime-run-context': {
      usage: 'opl scholar-skills runtime-run-context --module <module_id> --profile <profile> --platform <platform> --paper-root <path>',
      summary: 'Read the OPL prepared run-context for one ScholarSkills module and fail closed on missing or mismatched refs.',
      examples: [
        'opl scholar-skills runtime-run-context --module mas-scholar-skills.display --profile display --platform macos-arm64 --paper-root paper --json',
      ],
      group: 'scholar-skills',
      handler: (args) => {
        const parsed = parseRunContextArgs(args, specs['scholar-skills runtime-run-context'], {
          requirePlatformAndPaperRoot: true,
          commandLabel: 'scholar-skills runtime-run-context',
        });
        return buildScholarSkillsRuntimeRunContextReadback(getContracts(), {
          moduleId: parsed.moduleId,
          profile: parsed.profile,
          platform: parsed.platform ?? '',
          paperRoot: parsed.paperRoot ?? '',
        });
      },
    },
    'scholar-skills invoke': {
      usage: 'opl scholar-skills invoke --module <module_id> --input-ref <ref> --artifact-root <ref>',
      summary: 'Build a refs-only invocation envelope with expected artifact refs and an unsigned receipt candidate.',
      examples: [
        'opl scholar-skills invoke --module mas-scholar-skills.display --input-ref mas:current_owner_delta/display-intent --artifact-root artifact-root:display-pack-candidates --json',
      ],
      group: 'scholar-skills',
      handler: (args) => buildScholarSkillsInvocationEnvelope(
        getContracts(),
        parseInvocationArgs(args, specs['scholar-skills invoke'], 'scholar-skills invoke'),
      ),
    },
    'scholar-skills receipt': {
      usage: 'opl scholar-skills receipt --module <module_id> --input-ref <ref> --artifact-root <ref>',
      summary: 'Build an unsigned ScholarSkills execution receipt candidate without owner authority.',
      examples: [
        'opl scholar-skills receipt --module mas-scholar-skills.display --input-ref mas:current_owner_delta/display-intent --artifact-root artifact-root:display-pack-candidates --json',
      ],
      group: 'scholar-skills',
      handler: (args) => buildScholarSkillsReceiptCandidate(
        getContracts(),
        parseInvocationArgs(args, specs['scholar-skills receipt'], 'scholar-skills receipt'),
      ),
    },
    'scholar-skills materialize': {
      usage: 'opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> [--emit-candidate-artifacts (--payload-json <json>|--payload-file <path>)]',
      summary: 'Materialize a deterministic ScholarSkills candidate package under an explicit output root, with opt-in non-authoritative candidate artifact bodies.',
      examples: [
        'opl scholar-skills materialize --module mas-scholar-skills.display --input-ref mas:current_owner_delta/display-intent --artifact-root artifact-root:display-pack-candidates --output-root /tmp/scholarskills-candidate --json',
        'opl scholar-skills materialize --module mas-scholar-skills.display --input-ref mas:current_owner_delta/display-intent --artifact-root artifact-root:display-pack-candidates --output-root /tmp/scholarskills-candidate --emit-candidate-artifacts --payload-file payload.json --json',
      ],
      group: 'scholar-skills',
      handler: (args) => buildScholarSkillsMaterializeSurface(
        getContracts(),
        parseMaterializeArgs(args, specs['scholar-skills materialize']),
      ),
    },
    'scholar-skills interfaces': {
      usage: 'opl scholar-skills interfaces',
      summary: 'Read the ScholarSkills CLI, contract, and runtime-environment bridge interfaces.',
      examples: ['opl scholar-skills interfaces --json'],
      group: 'scholar-skills',
      handler: (args) => {
        assertNoArgs(args.filter((entry) => entry !== '--json'), specs['scholar-skills interfaces']);
        return buildScholarSkillsInterfaces(getContracts());
      },
    },
    'scholar-skills validate': {
      usage: 'opl scholar-skills validate',
      summary: 'Validate ScholarSkills module count, authority false flags, and write boundary.',
      examples: ['opl scholar-skills validate --json'],
      group: 'scholar-skills',
      handler: (args) => {
        assertNoArgs(args.filter((entry) => entry !== '--json'), specs['scholar-skills validate']);
        return buildScholarSkillsValidation(getContracts());
      },
    },
    'scholar-skills doctor': {
      usage: 'opl scholar-skills doctor',
      summary: 'Doctor the ScholarSkills capability module substrate without claiming runtime or domain readiness.',
      examples: ['opl scholar-skills doctor --json'],
      group: 'scholar-skills',
      handler: (args) => {
        assertNoArgs(args.filter((entry) => entry !== '--json'), specs['scholar-skills doctor']);
        return buildScholarSkillsDoctor(getContracts());
      },
    },
  };

  return specs;
}
