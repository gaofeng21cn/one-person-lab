import {
  buildAgentLabCompletePayload,
  buildAgentLabCostEstimatePayload,
  buildAgentLabEvolvePayload,
  buildAgentLabExportPayload,
  buildAgentLabLonglinePayload,
  buildAgentLabMechanismPayload,
  buildAgentLabOptimizePayload,
  buildAgentLabRunPayload,
  buildAgentLabSamplePayload,
  buildAgentLabWorkbenchPayload,
} from '../modules/agent-lab-public-payloads.ts';
import { assertNoArgs } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

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
  };

  return specs;
}
