import type { HandoffBundleResult } from '../handoff-bundle-types.ts';
import type {
  BoundaryExplanation,
  ResolutionResult,
  ResolveRequestInput,
} from '../types.ts';

export type ProductEntryMode =
  | 'frontdoor'
  | 'ask'
  | 'exec'
  | 'chat'
  | 'session_seed'
  | 'resume'
  | 'sessions'
  | 'logs'
  | 'repair_hermes_gateway';

export type ProductEntryExecutor = 'codex' | 'hermes';

export type ProductEntryCliInput = {
  dryRun: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily?: string;
  requestKind?: string;
  model?: string;
  provider?: string;
  workspacePath?: string;
  skills: string[];
  executor?: ProductEntryExecutor;
};

export type ProductEntryExecInput = {
  dryRun: boolean;
  prompt: string;
  model?: string;
  provider?: string;
  workspacePath?: string;
  json?: boolean;
};

export type PreparedProductEntryAsk = {
  resolveInput: ResolveRequestInput;
  routing: ResolutionResult;
  boundary: BoundaryExplanation;
  handoffPrompt: string;
  args: string[];
  handoffBundle: HandoffBundleResult;
};
