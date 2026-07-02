type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) as JsonRecord | undefined;
}

export function canonicalCloseoutPacketFromDomainHandlerOutput(output: Record<string, unknown>) {
  const explicitPacket = firstRecord(output.closeout_packet);
  if (explicitPacket?.surface_kind === 'domain_stage_closeout_packet') {
    return explicitPacket;
  }
  return null;
}
