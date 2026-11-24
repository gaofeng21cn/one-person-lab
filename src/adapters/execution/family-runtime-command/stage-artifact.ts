import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { parseCliOptions } from './shared.ts';

function requireValue(token: string, value: string | undefined) {
  if (!value) {
    throw new FrameworkContractError('cli_usage_error', `Option ${token} requires a value.`, {
      option: token,
    });
  }
  return value;
}

export function parseStageArtifactArgs(rest: string[]): FamilyRuntimeCommandInput | undefined {
  const action = rest[0];
  if (!action || !['open', 'commit', 'status', 'explain', 'rebuild', 'promote', 'gc', 'restore', 'validate', 'conformance', 'workbench'].includes(action)) {
    return undefined;
  }
  const input: Record<string, unknown> = {
    action,
  };
  const requiredOutputs: string[] = [];
  const ownerReceiptRefs: string[] = [];
  const qualityDebtRefs: string[] = [];
  const typedBlockerRefs: string[] = [];
  const decisionReceiptRefs: string[] = [];
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--domain') {
      input.domain_id = requireValue(token, value);
      return true;
    } else if (token === '--program') {
      input.program_id = requireValue(token, value);
      return true;
    } else if (token === '--topic') {
      input.topic_id = requireValue(token, value);
      return true;
    } else if (token === '--deliverable') {
      input.deliverable_id = requireValue(token, value);
      return true;
    } else if (token === '--stage') {
      input.stage_id = requireValue(token, value);
      return true;
    } else if (token === '--stage-order') {
      input.stage_order = Number.parseInt(requireValue(token, value), 10);
      return true;
    } else if (token === '--attempt') {
      input.attempt_id = requireValue(token, value);
      return true;
    } else if (token === '--terminal-status') {
      input.terminal_status = requireValue(token, value);
      return true;
    } else if (token === '--required-output') {
      requiredOutputs.push(requireValue(token, value));
      return true;
    } else if (token === '--owner-receipt-ref') {
      ownerReceiptRefs.push(requireValue(token, value));
      return true;
    } else if (token === '--quality-debt-ref') {
      qualityDebtRefs.push(requireValue(token, value));
      return true;
    } else if (token === '--typed-blocker-ref') {
      typedBlockerRefs.push(requireValue(token, value));
      return true;
    } else if (token === '--decision-receipt-ref') {
      decisionReceiptRefs.push(requireValue(token, value));
      return true;
    } else if (token === '--artifact-ref') {
      input.artifact_ref = requireValue(token, value);
      return true;
    } else if (token === '--restore-ref') {
      input.restore_ref = requireValue(token, value);
      return true;
    } else if (token === '--apply') {
      input.dry_run = false;
      return false;
    } else if (token === '--dry-run') {
      input.dry_run = true;
      return false;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown stage-artifact option: ${token}.`, {
        option: token,
        usage: 'opl stage-artifact status|explain|rebuild|promote|gc|restore|validate|conformance|workbench --domain <domain> --program <id> --topic <id> --deliverable <id>',
      });
    }
  });
  for (const field of ['domain_id', 'program_id', 'topic_id', 'deliverable_id']) {
    if (!input[field]) {
      throw new FrameworkContractError('cli_usage_error', `stage-artifact ${action} requires --${field.replace('_id', '')}.`, {
        required: ['--domain', '--program', '--topic', '--deliverable'],
      });
    }
  }
  if (action === 'promote') {
    for (const field of ['stage_id', 'attempt_id', 'artifact_ref']) {
      if (!input[field]) {
        throw new FrameworkContractError('cli_usage_error', `stage-artifact promote requires ${field}.`, {
          required: ['--stage', '--attempt', '--artifact-ref'],
        });
      }
    }
  }
  if (action === 'restore') {
    for (const field of ['stage_id', 'attempt_id', 'restore_ref']) {
      if (!input[field]) {
        throw new FrameworkContractError('cli_usage_error', `stage-artifact restore requires ${field}.`, {
          required: ['--stage', '--attempt', '--restore-ref'],
        });
      }
    }
  }
  if (action === 'open') {
    for (const field of ['stage_id', 'attempt_id']) {
      if (!input[field]) {
        throw new FrameworkContractError('cli_usage_error', `stage-artifact open requires ${field}.`, {
          required: ['--stage', '--attempt'],
        });
      }
    }
  }
  if (action === 'commit') {
    for (const field of ['stage_id', 'attempt_id', 'terminal_status']) {
      if (!input[field]) {
        throw new FrameworkContractError('cli_usage_error', `stage-artifact commit requires ${field}.`, {
          required: ['--stage', '--attempt', '--terminal-status'],
        });
      }
    }
    input.required_outputs = requiredOutputs;
    input.owner_receipt_refs = ownerReceiptRefs;
    input.quality_debt_refs = qualityDebtRefs;
    input.typed_blocker_refs = typedBlockerRefs;
    input.decision_receipt_refs = decisionReceiptRefs;
  }
  if (action !== 'commit') {
    if (requiredOutputs.length || ownerReceiptRefs.length || qualityDebtRefs.length || typedBlockerRefs.length || decisionReceiptRefs.length) {
      throw new FrameworkContractError('cli_usage_error', 'Manifest refs are only accepted by stage-artifact commit.', {
        action,
        manifest_options: [
          '--required-output',
          '--owner-receipt-ref',
          '--quality-debt-ref',
          '--typed-blocker-ref',
          '--decision-receipt-ref',
        ],
      });
    }
  }
  if (action !== 'promote' && input.artifact_ref) {
    throw new FrameworkContractError('cli_usage_error', 'Artifact refs are only accepted by stage-artifact promote.', {
      action,
    });
  }
  if (action !== 'restore' && input.restore_ref) {
    throw new FrameworkContractError('cli_usage_error', 'Restore refs are only accepted by stage-artifact restore.', {
      action,
    });
  }
  return {
    mode: 'stage_artifact',
    input: input as Extract<FamilyRuntimeCommandInput, { mode: 'stage_artifact' }>['input'],
  };
}
