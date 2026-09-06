import type { FrameworkContracts } from '../../kernel/types.ts';
import type { FoundryProviderManifest } from '../../authority/evolution/index.ts';
import type {
  CordisPackStageBindingService,
} from '../../authority/packages/index.ts';
import type { FamilyStageContextObservation } from '../../authority/stages/index.ts';
import type {
  AgentExecutionReceipt,
  AgentExecutionRequest,
} from './agent-executor.ts';
import type { CodexStageRunnerInput } from './family-runtime-codex-stage-runner-parts/input-prompt.ts';
import type { WorkspaceSkillProjectionRefresher } from '../../authority/workspace/index.ts';

export type AgentExecutorService = {
  execute(input: AgentExecutionRequest): Promise<AgentExecutionReceipt>;
};

export type AgentExecutorRequestComposition = {
  executor: AgentExecutorService;
  dispose(): void | Promise<void>;
};

export type AgentExecutorRequestCompositionFactory = () =>
  AgentExecutorRequestComposition | Promise<AgentExecutorRequestComposition>;

export type StageRouteComposition = {
  stageContext: {
    observe(
      contracts: FrameworkContracts,
      input: { domainId: string; stageId: string; actionId?: string },
    ): FamilyStageContextObservation;
  };
  stageBinding: CordisPackStageBindingService;
  dispose(): void | Promise<void>;
};

export type StageRouteCompositionFactory = () =>
  StageRouteComposition | Promise<StageRouteComposition>;

export type RunwayAttemptComposition = {
  executor: {
    execute(input: CodexStageRunnerInput): Promise<object>;
  };
  snapshot: {
    snapshot_id: string;
    snapshot_digest: string;
    binding: {
      executor_route?: unknown;
    };
  };
  dispose(): void | Promise<void>;
};

export type RunwayAttemptCompositionFactory = (input: {
  attemptRef: string;
}) => RunwayAttemptComposition | Promise<RunwayAttemptComposition>;

export type FoundryDevComposition = {
  services: {
    refreshWorkspaceSkills: WorkspaceSkillProjectionRefresher;
    foundryProviderManifest: {
      read(checkoutRoot: string, manifestRef?: string): FoundryProviderManifest;
    };
  };
  dispose(): void | Promise<void>;
};

export type FoundryDevCompositionFactory = () =>
  FoundryDevComposition | Promise<FoundryDevComposition>;
