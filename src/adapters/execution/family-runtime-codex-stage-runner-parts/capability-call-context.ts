import fs from 'node:fs';
import path from 'node:path';

import type { CodexExecEvent } from '../codex-exec-events.js';

/**
 * A stage may declare that a capability call happened, and a domain may then require the
 * runtime to say *which* call it is talking about. The declaration is not something the
 * model can supply for itself: an artifact whose producer is the agent proves nothing, and
 * the domain contracts that depend on it say so explicitly. So the runtime observes the
 * call the provider actually made — its real arguments and its real result — and writes the
 * observation down where the stage can read it.
 *
 * The shape is fixed by the domain (`CurrentCallContext`), but only four of its five
 * members are generic. `action_execution_ref`, `call_ref`, `call_input_ref` and
 * `call_output_ref` describe a call, which any runtime can observe. `corpus_binding_ref`
 * names a domain binding — a locked corpus, in this case — that the runtime has no concept
 * of. It is published by the capability that owns it, and this module references it
 * without interpreting it. When no binding was published the member is omitted rather than
 * filled with a placeholder: a fabricated binding is worse than an absent one, because the
 * stage is required to refuse when the binding is missing but would accept a wrong one.
 */

export type ObservedCapabilityCall = {
  callId: string;
  server: string | null;
  tool: string;
  argumentsJson: string | null;
  resultJson: string | null;
  status: string;
};

export type CapabilityCallContextWrite = {
  call: ObservedCapabilityCall;
  attemptRef: string;
  workspaceRoot: string;
  corpusBindingDir: string | null;
};

const CALL_CONTEXT_DIRECTORY = '.opl/call-context';

export function observedCapabilityCall(event: CodexExecEvent): ObservedCapabilityCall | null {
  if (event.type !== 'capability_call') {
    return null;
  }
  // A failed call retrieved nothing, so there is no output to cite and no context to
  // publish. The stage is expected to take its terminal diagnostic branch instead.
  if (event.status !== 'completed') {
    return null;
  }
  return {
    callId: event.callId,
    server: event.server,
    tool: event.tool,
    argumentsJson: event.argumentsJson,
    resultJson: event.resultJson,
    status: event.status,
  };
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 96) || 'call';
}

function writeJsonFile(filePath: string, value: unknown): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return `file://${filePath}`;
}

/**
 * Publish the corpus binding the capability left behind, if it left one. The runtime does
 * not read it, does not validate it and does not summarize it; it only names the file, so
 * that the reference in the call context resolves to the capability's own bytes.
 */
function resolveCorpusBindingRef(directory: string | null): string | null {
  if (!directory) {
    return null;
  }
  const candidate = path.join(directory, 'corpus-binding.json');
  try {
    if (!fs.statSync(candidate).isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  return `file://${candidate}`;
}

export function writeCapabilityCallContext(input: CapabilityCallContextWrite): {
  contextRef: string;
  contextPath: string;
  corpusBindingRef: string | null;
} {
  const directory = path.join(input.workspaceRoot, CALL_CONTEXT_DIRECTORY);
  const stem = safeSegment(input.call.callId);

  const inputRef = writeJsonFile(
    path.join(directory, `call-input-${stem}.json`),
    input.call.argumentsJson === null ? null : JSON.parse(input.call.argumentsJson),
  );
  const outputRef = writeJsonFile(
    path.join(directory, `call-output-${stem}.json`),
    input.call.resultJson === null ? null : JSON.parse(input.call.resultJson),
  );
  const corpusBindingRef = resolveCorpusBindingRef(input.corpusBindingDir);

  const context: Record<string, string> = {
    action_execution_ref: input.attemptRef,
    call_ref: input.call.callId,
    call_input_ref: inputRef,
    call_output_ref: outputRef,
  };
  if (corpusBindingRef) {
    context.corpus_binding_ref = corpusBindingRef;
  }

  const contextPath = path.join(directory, 'current-call-context.json');
  const contextRef = writeJsonFile(contextPath, context);
  return { contextRef, contextPath, corpusBindingRef };
}

/**
 * The stage reads the call context from a fixed place, so the prompt names that place
 * rather than describing the artifact. It is written only when a capability call actually
 * completed: an absent file is the honest signal that no call was observed, and it must not
 * be confused with a call that returned nothing.
 */
export function callContextPromptLines(workspaceRoot: string): string[] {
  const contextPath = path.join(workspaceRoot, CALL_CONTEXT_DIRECTORY, 'current-call-context.json');
  return [
    `If this stage depends on a capability call, the runtime observed that call and wrote ${contextPath}.`,
    'That file names the exact call: its input reference and its output reference resolve to the arguments the call was made with and the result it returned.',
    'When the capability published a corpus binding, the file also carries corpus_binding_ref pointing at the binding bytes. Cite that reference; do not describe the corpus from memory and do not synthesize a binding of your own.',
    'If the file is absent, no capability call completed, so no call context exists to cite.',
  ];
}
