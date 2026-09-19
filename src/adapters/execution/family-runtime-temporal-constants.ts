export const DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS = 3_600_000;
export const DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = 900_000;
export const DEFAULT_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS = 300_000;
// A protocol closeout resume must re-ingest the entire Attempt session before it can emit the
// missing typed closeout. Long Attempts (millions of observed tokens, hundreds of rollout
// records) cannot complete that within two minutes, so the default recovery budget is sized
// for the session it has to read rather than for a short follow-up turn. Attempts that blow
// this budget are exactly the ones whose closeout is missing, which made the safety net
// unreachable for the cases it exists to cover.
export const DEFAULT_CODEX_PROTOCOL_CLOSEOUT_RESUME_TIMEOUT_MS = 900_000;
export const DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS = 30_000;
// Cover the one-hour execution, its full closeout recovery budget, and transport
// overhead so Temporal does not cancel an otherwise valid recovery midway.
export const CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT = '80 minutes';
export const CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT = '5 minutes';
export const SHORT_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT = '10 minutes';
export const SHORT_STAGE_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT = '10 minutes';
export const SHORT_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT = '10 minutes';
export const SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT = '12 minutes';
