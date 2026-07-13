import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  createGatewayKey,
  getGatewayKey,
  listGatewayKeys,
  updateGatewayKeyStatus,
} from './client.ts';
import type { GatewayAccountState, GatewayInstallationState, GatewayManagedKey } from './types.ts';

function keyError(code: string, message: string) {
  return new FrameworkContractError('launcher_failed', message, { reason_code: code });
}

export async function reconcileGatewayManagedKey(input: {
  accessToken: string;
  accountUserId: string;
  installation: GatewayInstallationState;
  accountState: GatewayAccountState | null;
  groupId?: string | null;
}) {
  const { accessToken, accountUserId, installation, accountState } = input;
  if (accountState?.key_id) {
    const byId = await getGatewayKey(accessToken, accountState.key_id);
    if (byId) {
      if (byId.name !== installation.canonical_key_name) {
        throw keyError('managed_key_identity_drift', 'The OPL App managed key was renamed in OPL Gateway.');
      }
      if (byId.status === 'active' || byId.status === 'enabled') return { key: byId, mutation: 'none' as const };
      const updated = await updateGatewayKeyStatus(accessToken, byId, 'active')
        ?? await getGatewayKey(accessToken, byId.id)
        ?? byId;
      return { key: updated, mutation: 'reactivated' as const };
    }
  }

  const exactMatches = (await listGatewayKeys(accessToken, installation.canonical_key_name))
    .filter((key) => key.name === installation.canonical_key_name);
  if (exactMatches.length > 1) {
    throw keyError('managed_key_conflict', 'More than one exact OPL App managed key exists for this installation.');
  }
  if (exactMatches.length === 1) {
    const key = exactMatches[0];
    if (key.status === 'active' || key.status === 'enabled') return { key, mutation: 'none' as const };
    const updated = await updateGatewayKeyStatus(accessToken, key, 'active')
      ?? await getGatewayKey(accessToken, key.id)
      ?? key;
    return { key: updated, mutation: 'reactivated' as const };
  }

  const key = await createGatewayKey(accessToken, {
    name: installation.canonical_key_name,
    group_id: input.groupId,
    idempotency_key: `opl-app-key-create:${accountUserId}:${installation.installation_id}`,
  });
  if (!key) throw keyError('managed_key_missing', 'OPL Gateway did not return the newly created managed key.');
  return { key, mutation: 'created' as const };
}

export async function disableGatewayManagedKey(input: {
  accessToken: string;
  expectedName: string;
  keyId: string;
}) {
  const key = await getGatewayKey(input.accessToken, input.keyId);
  if (!key) return { terminal: 'missing' as const };
  if (key.name !== input.expectedName) {
    throw keyError('managed_key_identity_drift', 'The OPL App managed key identity no longer matches.');
  }
  await updateGatewayKeyStatus(input.accessToken, key, 'inactive');
  const readback = await getGatewayKey(input.accessToken, input.keyId);
  if (readback && !['inactive', 'disabled'].includes(readback.status)) {
    throw keyError('disconnect_pending', 'The OPL App managed key could not be disabled.');
  }
  return { terminal: 'disabled' as const };
}

export type { GatewayManagedKey };
