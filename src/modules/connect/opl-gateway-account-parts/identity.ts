import crypto from 'node:crypto';
import os from 'node:os';

import type { GatewayInstallationState } from './types.ts';

export function normalizeGatewayDeviceSlug(value: string | null | undefined) {
  const normalized = (value?.trim() || os.hostname() || 'device')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/[-._]{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 32);
  return normalized || 'device';
}

export function buildGatewayInstallation(
  deviceLabel?: string,
  installationId = crypto.randomUUID(),
): GatewayInstallationState {
  const deviceSlug = normalizeGatewayDeviceSlug(deviceLabel);
  const shortId = crypto.createHash('sha256').update(installationId).digest('hex').slice(0, 8).toUpperCase();
  return {
    surface_kind: 'opl_gateway_installation.v1',
    installation_id: installationId,
    device_slug: deviceSlug,
    short_id: shortId,
    canonical_key_name: `OPL App · ${deviceSlug} · ${shortId}`,
  };
}
