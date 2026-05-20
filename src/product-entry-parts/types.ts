import type { HandoffBundleResult } from '../handoff-bundle-types.ts';
import type {
  BoundaryExplanation,
  DomainAgentSelectionInput,
  ResolutionResult,
} from '../types.ts';

export type ProductEntryMode =
  | 'product_entry'
  | 'ask'
  | 'exec'
  | 'chat'
  | 'session_seed'
  | 'resume'
  | 'sessions'
  | 'logs';

export type ProductEntryCliInput = {
  dryRun: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily?: string;
  requestKind?: string;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  workspacePath?: string;
  skills: string[];
};

export type ProductEntryExecInput = {
  dryRun: boolean;
  prompt: string;
  executorKind?: string;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  workspacePath?: string;
  json?: boolean;
};

export type PreparedProductEntryAsk = {
  selectionInput: DomainAgentSelectionInput;
  stageSelection: ResolutionResult;
  boundary: BoundaryExplanation;
  handoffPrompt: string;
  args: string[];
  handoffBundle: HandoffBundleResult;
};
