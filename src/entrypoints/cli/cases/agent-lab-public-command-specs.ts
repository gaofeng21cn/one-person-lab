import {
  listAgentLabRiskTierAutoPromotionReceipts,
  recordAgentLabRiskTierAutoPromotionReceipts,
  verifyAgentLabRiskTierAutoPromotionReceipt,
  type AgentLabRiskTierAutoPromotionReceiptInput,
} from '../../../modules/foundry-lab/agent-lab-risk-tier-promotion-ledger.ts';
import {
  buildAgentLabCompletePayload,
  buildAgentLabCostEstimatePayload,
  buildAgentLabEfficiencyPayload,
  buildAgentLabEvaluationWorkOrderPayload,
  buildAgentLabEvolvePayload,
  buildAgentLabExportPayload,
  buildAgentLabLonglinePayload,
  buildAgentLabMechanismPayload,
  buildAgentLabOptimizePayload,
  buildAgentLabRunEfficiencyPayload,
  buildAgentLabRunPayload,
  buildAgentLabRhoPayload,
  buildAgentLabRhoRunPayload,
  buildAgentLabSamplePayload,
  buildAgentLabStageExecutorPolicyPayload,
  buildAgentLabWorkbenchPayload,
  buildAgentLabWorkflowTemplatePayload,
  buildAgentLabWorkflowTemplateRunPayload,
} from '../modules/agent-lab-public-payloads.ts';
import {
  readJsonObject,
  readOptionalString,
  readStringList,
} from '../modules/json-boundary.ts';
import { assertNoArgs, buildUsageError, parseCommandOptions } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseRiskTierPromotionPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): AgentLabRiskTierAutoPromotionReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage: 'agent-lab risk-tier-promotion record payload must be valid JSON.',
    objectErrorMessage: 'agent-lab risk-tier-promotion record payload must be a JSON object.',
  });
  return {
    target_repo_id: readOptionalString(parsed.target_repo_id ?? parsed.target_repo),
    mechanism_candidate_ref: readOptionalString(parsed.mechanism_candidate_ref),
    risk_tier: readOptionalString(parsed.risk_tier),
    failure_delta_refs: readStringList(parsed.failure_delta_refs ?? parsed.failure_delta_ref),
    independent_ai_review_receipt_ref:
      readOptionalString(parsed.independent_ai_review_receipt_ref),
    independent_ai_review_receipt: parsed.independent_ai_review_receipt,
    promotion_receipt_refs:
      readStringList(parsed.promotion_receipt_refs ?? parsed.promotion_receipt_ref),
    rollback_target_refs:
      readStringList(parsed.rollback_target_refs ?? parsed.rollback_target_ref),
    canary_observation_refs:
      readStringList(parsed.canary_observation_refs ?? parsed.canary_observation_ref),
    no_forbidden_write_refs:
      readStringList(parsed.no_forbidden_write_refs ?? parsed.no_forbidden_write_ref),
    verification_refs: readStringList(parsed.verification_refs ?? parsed.verification_ref),
    receipt_ref: readOptionalString(parsed.receipt_ref),
  };
}

function parseRiskTierPromotionRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const payload = parseCommandOptions(args, spec, {
    payload: { type: 'string' },
  }).payload as string | undefined;
  if (!payload) {
    throw buildUsageError('agent-lab risk-tier-promotion record requires --payload.', spec, {
      required: ['--payload'],
    });
  }
  return parseRiskTierPromotionPayload(payload, spec);
}

function parseRiskTierPromotionVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const receiptRef = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  })['receipt-ref'] as string | undefined;
  return { receipt_ref: receiptRef ?? null };
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
      summary: 'Run the manifest-backed Agent Lab longline engine against the generic framework fixture.',
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
    'agent-lab workflow-template': {
      usage: 'opl agent-lab workflow-template',
      summary: 'Show the Foundry Lab dynamic workflow template catalog for suite topology and work-order refs.',
      examples: ['opl agent-lab workflow-template --json'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, specs['agent-lab workflow-template']);
        return buildAgentLabWorkflowTemplatePayload();
      },
    },
    'agent-lab workflow-template run': {
      usage: 'opl agent-lab workflow-template run --template <id> --project <dir> [--output <dir>]',
      summary:
        'Materialize deterministic Agent Lab workflow run artifacts for a dynamic workflow template without dispatching subagents.',
      examples: [
        'opl agent-lab workflow-template run --template fan_out_and_synthesize --project ./target-agent --output ./workflow-run --json',
      ],
      group: 'framework',
      handler: (args) => buildAgentLabWorkflowTemplateRunPayload(
        args,
        specs['agent-lab workflow-template run'],
      ),
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
      usage: 'opl agent-lab cost-estimate --profile <domain-owned-profile.json>',
      summary:
        'Estimate a domain-owned workload profile without embedding domain task assumptions or claiming billing truth.',
      examples: ['opl agent-lab cost-estimate --profile ./contracts/agent_lab_cost_profile.json --json'],
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
    'agent-lab rho': {
      usage: 'opl agent-lab rho --project <dir>',
      summary:
        'Emit a deterministic no-apply RHO backend plan with trajectory, diagnosis, candidate, diff, work-order draft, and promotion evidence refs.',
      examples: ['opl agent-lab rho --project ./target-agent --json'],
      group: 'framework',
      handler: (args) => buildAgentLabRhoPayload(args, specs['agent-lab rho']),
    },
    'agent-lab rho run': {
      usage: 'opl agent-lab rho run --project <dir> [--sessions <dir>] [--output <dir>] [--max-trajectories <n>]',
      summary:
        'Run the OPL native RHO no-apply backend over Codex session trajectories and materialize harness artifacts plus a work-order draft.',
      examples: [
        'opl agent-lab rho run --project ./target-agent --sessions ~/.codex/sessions --output ./rho-run --max-trajectories 8 --json',
      ],
      group: 'framework',
      handler: (args) => buildAgentLabRhoRunPayload(args, specs['agent-lab rho run']),
    },
    'agent-lab evolve': {
      usage: 'opl agent-lab evolve --suite <suite.json>',
      summary: 'Run an external suite and emit a refs-only mechanism evolution segment without domain writes or promotion.',
      examples: ['opl agent-lab evolve --suite ./agent-lab-suite.json --json'],
      group: 'framework',
      handler: (args) => buildAgentLabEvolvePayload(args, specs['agent-lab evolve']),
    },
    'agent-lab evaluation-work-order execute': {
      usage:
        'opl agent-lab evaluation-work-order execute --work-order <work-order.json> [--observations <observation-packet.json>] --output <dir>',
      summary:
        'Consume a declarative Foundry Lab evaluation work order and fail closed until real evaluation observations are supplied.',
      examples: [
        'opl agent-lab evaluation-work-order execute --work-order ./foundry-lab-work-order.json --output ./foundry-lab-output --json',
      ],
      group: 'framework',
      handler: (args) => buildAgentLabEvaluationWorkOrderPayload(
        args,
        specs['agent-lab evaluation-work-order execute'],
      ),
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
