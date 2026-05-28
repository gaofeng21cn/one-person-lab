import {
  listAgentLabRiskTierAutoPromotionReceipts,
  recordAgentLabRiskTierAutoPromotionReceipts,
  verifyAgentLabRiskTierAutoPromotionReceipt,
  type AgentLabRiskTierAutoPromotionReceiptInput,
} from '../../agent-lab-risk-tier-promotion-ledger.ts';
import {
  buildAgentLabCompletePayload,
  buildAgentLabCostEstimatePayload,
  buildAgentLabEfficiencyPayload,
  buildAgentLabEvolvePayload,
  buildAgentLabExportPayload,
  buildAgentLabLonglinePayload,
  buildAgentLabMechanismPayload,
  buildAgentLabOptimizePayload,
  buildAgentLabRunEfficiencyPayload,
  buildAgentLabRunPayload,
  buildAgentLabSamplePayload,
  buildAgentLabStageExecutorPolicyPayload,
  buildAgentLabWorkbenchPayload,
} from '../modules/agent-lab-public-payloads.ts';
import { assertNoArgs, buildUsageError } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function parseRiskTierPromotionPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): AgentLabRiskTierAutoPromotionReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError('agent-lab risk-tier-promotion record payload must be valid JSON.', spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError('agent-lab risk-tier-promotion record payload must be a JSON object.', spec);
  }
  return {
    target_repo_id: optionalString(parsed.target_repo_id ?? parsed.target_repo),
    mechanism_candidate_ref: optionalString(parsed.mechanism_candidate_ref),
    risk_tier: optionalString(parsed.risk_tier),
    failure_delta_refs: stringList(parsed.failure_delta_refs ?? parsed.failure_delta_ref),
    independent_ai_review_receipt_ref:
      optionalString(parsed.independent_ai_review_receipt_ref),
    independent_ai_review_receipt: parsed.independent_ai_review_receipt,
    promotion_receipt_refs:
      stringList(parsed.promotion_receipt_refs ?? parsed.promotion_receipt_ref),
    rollback_target_refs:
      stringList(parsed.rollback_target_refs ?? parsed.rollback_target_ref),
    canary_observation_refs:
      stringList(parsed.canary_observation_refs ?? parsed.canary_observation_ref),
    no_forbidden_write_refs:
      stringList(parsed.no_forbidden_write_refs ?? parsed.no_forbidden_write_ref),
    verification_refs: stringList(parsed.verification_refs ?? parsed.verification_ref),
    receipt_ref: optionalString(parsed.receipt_ref),
  };
}

function parseRiskTierPromotionRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: AgentLabRiskTierAutoPromotionReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('agent-lab risk-tier-promotion record requires --payload.', spec, {
          required: ['--payload'],
        });
      }
      payload = parseRiskTierPromotionPayload(value, spec);
      continue;
    }
    throw buildUsageError(`Unknown option for agent-lab risk-tier-promotion record: ${token}.`, spec, {
      option: token,
    });
  }
  if (!payload) {
    throw buildUsageError('agent-lab risk-tier-promotion record requires --payload.', spec, {
      required: ['--payload'],
    });
  }
  return payload;
}

function parseRiskTierPromotionVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(`Unknown option for agent-lab risk-tier-promotion verify: ${token}.`, spec, {
        option: token,
      });
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError('agent-lab risk-tier-promotion verify requires --receipt-ref value.', spec, {
        option: '--receipt-ref',
      });
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
}

export function buildPublicAgentLabCommandSpecs(): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'agent-lab sample': {
      usage: 'opl agent-lab sample',
      summary: 'Show the minimal Agent Lab framework sample read-model surface and authority boundary.',
      examples: ['opl agent-lab sample', 'opl agent-lab sample --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab sample']);
        return buildAgentLabSamplePayload();
      },
    },
    'agent-lab longline': {
      usage: 'opl agent-lab longline',
      summary: 'Show the central Agent Lab longline suite for MAS/MAG/RCA soak and recovery test consolidation.',
      examples: ['opl agent-lab longline', 'opl agent-lab longline --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab longline']);
        return buildAgentLabLonglinePayload();
      },
    },
    'agent-lab complete': {
      usage: 'opl agent-lab complete',
      summary: 'Show the complete Agent Lab control plane for eval adapters, observability, and optimizer loops.',
      examples: ['opl agent-lab complete', 'opl agent-lab complete --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab complete']);
        return buildAgentLabCompletePayload();
      },
    },
    'agent-lab workbench': {
      usage: 'opl agent-lab workbench',
      summary: 'Show the App/workbench-ready Agent Lab read model across eval, observability, optimizer, and learning refs.',
      examples: ['opl agent-lab workbench --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab workbench']);
        return buildAgentLabWorkbenchPayload();
      },
    },
    'agent-lab mechanism': {
      usage: 'opl agent-lab mechanism',
      summary: 'Show the refs-only first-class mechanism object and editable mechanism surfaces.',
      examples: ['opl agent-lab mechanism --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab mechanism']);
        return buildAgentLabMechanismPayload();
      },
    },
    'agent-lab risk-tier-promotion record': {
      usage: 'opl agent-lab risk-tier-promotion record --payload <json>',
      summary:
        'Record first-class Agent Lab risk-tier auto-promotion evidence after independent AI review.',
      examples: [
        'opl agent-lab risk-tier-promotion record --payload \'{"target_repo_id":"med-autoscience","mechanism_candidate_ref":"mechanism-candidate:agent-lab/example","risk_tier":"medium_risk","failure_delta_refs":["failure-delta:ref"],"independent_ai_review_receipt_ref":"independent-ai-review-receipt:ref","independent_ai_review_receipt":{"receipt_ref":"independent-ai-review-receipt:ref","receipt_source":"real_independent_ai_review","assessment_mode":"real_independent_ai_review","reviewer_ref":"reviewer:codex-independent-agent","reviewer_agent_ref":"agent-ref:opl-agent-lab/independent-ai-reviewer","reviewed_mechanism_candidate_ref":"mechanism-candidate:agent-lab/example","execution_attempt_ref":"stage-attempt-ref:executor","review_attempt_ref":"stage-attempt-ref:reviewer","request_ref":"review-request-ref:example","response_ref":"review-response-ref:example","evidence_refs":["failure-delta:ref"],"no_shared_context":true,"review_context_inherits_executor_context":false,"forbidden_write_scan_ref":"no-forbidden-write-ref:ref","verdict":"approved_for_risk_tiered_auto_promotion","risk_tier":"medium_risk"},"promotion_receipt_refs":["mechanism-promotion-receipt:ref"],"rollback_target_refs":["rollback-target-ref:ref"],"canary_observation_refs":["canary-observation-ref:ref"],"no_forbidden_write_refs":["no-forbidden-write-ref:ref"],"verification_refs":["test-result-ref:ref"]}\'',
      ],
      group: 'framework',
      handler: (args) => ({
        agent_lab_risk_tier_promotion_ledger_record:
          recordAgentLabRiskTierAutoPromotionReceipts([
            parseRiskTierPromotionRecordArgs(
              args,
              specs['agent-lab risk-tier-promotion record'],
            ),
          ]),
      }),
    },
    'agent-lab risk-tier-promotion verify': {
      usage: 'opl agent-lab risk-tier-promotion verify [--receipt-ref <ref>]',
      summary:
        'Verify a recorded Agent Lab risk-tier auto-promotion receipt without writing domain truth.',
      examples: [
        'opl agent-lab risk-tier-promotion verify --receipt-ref agent-lab-risk-tier-auto-promotion-ref:med-autoscience/medium_risk/example',
      ],
      group: 'framework',
      handler: (args) => ({
        agent_lab_risk_tier_promotion_ledger_verify:
          verifyAgentLabRiskTierAutoPromotionReceipt(
            parseRiskTierPromotionVerifyArgs(
              args,
              specs['agent-lab risk-tier-promotion verify'],
            ),
          ),
      }),
    },
    'agent-lab risk-tier-promotion list': {
      usage: 'opl agent-lab risk-tier-promotion list',
      summary:
        'List first-class Agent Lab risk-tier auto-promotion receipts recorded in local OPL state.',
      examples: ['opl agent-lab risk-tier-promotion list --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab risk-tier-promotion list']);
        const receipts = listAgentLabRiskTierAutoPromotionReceipts();
        return {
          agent_lab_risk_tier_promotion_ledger: {
            surface_kind: 'opl_agent_lab_risk_tier_promotion_ledger_projection',
            receipt_count: receipts.length,
            recorded_receipt_ref_count:
              receipts.filter((receipt) => receipt.receipt_status === 'recorded').length,
            verified_receipt_ref_count:
              receipts.filter((receipt) => receipt.receipt_status === 'verified').length,
            receipts,
          },
        };
      },
    },
    'agent-lab stage-executor-policy': {
      usage: 'opl agent-lab stage-executor-policy',
      summary: 'Show refs-only stage executor policy candidates, trial gates, and non-default binding blockers.',
      examples: ['opl agent-lab stage-executor-policy --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab stage-executor-policy']);
        return buildAgentLabStageExecutorPolicyPayload();
      },
    },
    'agent-lab efficiency': {
      usage: 'opl agent-lab efficiency',
      summary: 'Show generic refs-only Agent Lab efficiency non-regression readiness.',
      examples: ['opl agent-lab efficiency --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab efficiency']);
        return buildAgentLabEfficiencyPayload();
      },
    },
    'agent-lab cost-estimate': {
      usage: 'opl agent-lab cost-estimate --preset <rca-ppt-40>',
      summary:
        'Emit a refs-only Agent Lab token and cost estimate for a known task shape without claiming billing truth.',
      examples: ['opl agent-lab cost-estimate --preset rca-ppt-40 --json'],
      group: 'framework',
      handler: (args) => buildAgentLabCostEstimatePayload(args, specs['agent-lab cost-estimate']),
    },
    'agent-lab export': {
      usage: 'opl agent-lab export --target <inspect-ai|openinference|langfuse|phoenix|json>',
      summary: 'Emit a refs-only Agent Lab export envelope for optional external connectors without uploading data.',
      examples: [
        'opl agent-lab export --target inspect-ai --json',
        'opl agent-lab export --target openinference --json',
      ],
      group: 'framework',
      handler: (args) => buildAgentLabExportPayload(args, specs['agent-lab export']),
    },
    'agent-lab optimize': {
      usage: 'opl agent-lab optimize --suite <suite.json>',
      summary: 'Run an external suite and emit gated optimizer candidate and RL transition refs without training or promotion.',
      examples: ['opl agent-lab optimize --suite ./agent-lab-suite.json --json'],
      group: 'framework',
      handler: (args) => buildAgentLabOptimizePayload(args, specs['agent-lab optimize']),
    },
    'agent-lab evolve': {
      usage: 'opl agent-lab evolve --suite <suite.json>',
      summary: 'Run an external suite and emit a refs-only mechanism evolution segment without domain writes or promotion.',
      examples: ['opl agent-lab evolve --suite ./agent-lab-suite.json --json'],
      group: 'framework',
      handler: (args) => buildAgentLabEvolvePayload(args, specs['agent-lab evolve']),
    },
    'agent-lab run': {
      usage: 'opl agent-lab run --suite <suite.json>',
      summary: 'Run an external OPL-compatible Agent Lab suite JSON through the native refs-only control plane.',
      examples: ['opl agent-lab run --suite ./agent-lab-suite.json --json'],
      group: 'framework',
      handler: (args) => buildAgentLabRunPayload(args, specs['agent-lab run']),
    },
    'agent-lab run/efficiency': {
      usage: 'opl agent-lab run/efficiency --suite <suite.json>',
      summary: 'Run an external suite and project generic efficiency non-regression readiness from refs only.',
      examples: ['opl agent-lab run/efficiency --suite ./agent-lab-suite.json --json'],
      group: 'framework',
      handler: (args) => buildAgentLabRunEfficiencyPayload(args, specs['agent-lab run/efficiency']),
    },
  };

  return specs;
}
