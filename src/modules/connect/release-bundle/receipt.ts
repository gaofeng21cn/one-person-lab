import type {
  ReleaseBundleOperationReceipt,
} from './types.ts';

export function releaseBundleOperationReceipt(
  input: Omit<ReleaseBundleOperationReceipt, 'surface_kind' | 'schema_ref' | 'recorded_at'>,
): ReleaseBundleOperationReceipt {
  return {
    surface_kind: 'opl_release_bundle_operation_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-operation-receipt.schema.json',
    recorded_at: new Date().toISOString(),
    ...input,
  };
}
