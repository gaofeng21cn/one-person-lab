export type ParsedProfileSelectionArgs = {
  intent: string;
  intent_signals: string[];
  reference_source_refs: string[];
  reference_design_pattern_packet_refs: string[];
};

export const PROFILE_REFERENCE_SOURCE_OPTIONS = [
  '--reference-source',
  '--reference-source-ref',
  '--reference-design-source',
  '--source-ref',
  '--paper',
  '--paper-ref',
] as const;

export const PROFILE_PATTERN_PACKET_OPTIONS = [
  '--reference-design-pattern-packet',
  '--reference-design-pattern-packet-ref',
  '--pattern-packet',
  '--pattern-packet-ref',
] as const;

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function canonicalIntentSignals(values: string[]): string[] {
  return uniqueStrings(values.map((value) => value.toLowerCase()));
}

function takeOptionText(args: string[], index: number, option: string) {
  const values: string[] = [];
  let cursor = index + 1;
  while (cursor < args.length && !args[cursor].startsWith('--')) {
    values.push(args[cursor]);
    cursor += 1;
  }
  if (values.length === 0) {
    throw new Error(`opl profiles select requires a value for ${option}.`);
  }
  return { value: values.join(' ').trim(), nextIndex: cursor - 1 };
}

function pushCsvRefs(target: string[], value: string) {
  target.push(...value.split(',').map((entry) => entry.trim()).filter(Boolean));
}

export function parseProfileSelectionArgs(args: string[]): ParsedProfileSelectionArgs {
  const intentParts: string[] = [];
  const intentSignals: string[] = [];
  const referenceSourceRefs: string[] = [];
  const patternPacketRefs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--intent') {
      const parsed = takeOptionText(args, index, arg);
      intentParts.push(parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    if (arg.startsWith('--intent=')) {
      intentParts.push(arg.slice('--intent='.length).trim());
      continue;
    }
    if (arg === '--intent-signal') {
      const parsed = takeOptionText(args, index, arg);
      pushCsvRefs(intentSignals, parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    if (arg.startsWith('--intent-signal=')) {
      pushCsvRefs(intentSignals, arg.slice('--intent-signal='.length));
      continue;
    }
    if ((PROFILE_REFERENCE_SOURCE_OPTIONS as readonly string[]).includes(arg)) {
      const parsed = takeOptionText(args, index, arg);
      pushCsvRefs(referenceSourceRefs, parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    if (PROFILE_REFERENCE_SOURCE_OPTIONS.some((option) => arg.startsWith(`${option}=`))) {
      pushCsvRefs(referenceSourceRefs, arg.slice(arg.indexOf('=') + 1));
      continue;
    }
    if ((PROFILE_PATTERN_PACKET_OPTIONS as readonly string[]).includes(arg)) {
      const parsed = takeOptionText(args, index, arg);
      pushCsvRefs(patternPacketRefs, parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    if (PROFILE_PATTERN_PACKET_OPTIONS.some((option) => arg.startsWith(`${option}=`))) {
      pushCsvRefs(patternPacketRefs, arg.slice(arg.indexOf('=') + 1));
      continue;
    }
    intentParts.push(arg);
  }

  return {
    intent: intentParts.join(' ').trim(),
    intent_signals: canonicalIntentSignals(intentSignals),
    reference_source_refs: uniqueStrings(referenceSourceRefs),
    reference_design_pattern_packet_refs: uniqueStrings(patternPacketRefs),
  };
}

export function matchedProfileTriggerSignals(
  intent: string,
  intentSignals: string[],
  triggerSignals: string[],
): string[] {
  const normalized = intent.toLowerCase();
  const explicitSignals = new Set(intentSignals);
  return triggerSignals.filter((signal) => {
    const canonicalSignal = signal.toLowerCase();
    return normalized.includes(canonicalSignal) || explicitSignals.has(canonicalSignal);
  });
}
