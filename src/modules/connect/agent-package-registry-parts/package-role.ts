import { FrameworkContractError } from '../../../kernel/contract-validation.ts';

import type { AgentPackageLock, AgentPackageRole } from './types.ts';

const PACKAGE_ROLES = new Set<AgentPackageRole>([
  'standard_agent',
  'framework_capability_package',
  'workflow_profile',
]);

export function packageRoleFromInstalledLock(lock: AgentPackageLock): AgentPackageRole {
  if (lock.package_role !== undefined && lock.package_role !== null) {
    if (PACKAGE_ROLES.has(lock.package_role)) return lock.package_role;
    throw new FrameworkContractError('contract_shape_invalid', 'Installed package lock declares an invalid package role.', {
      package_id: lock.package_id,
      lock_ref: lock.lock_ref,
      declared_package_role: lock.package_role,
      allowed_package_roles: [...PACKAGE_ROLES],
      failure_code: 'agent_package_lock_role_invalid',
      repair_action: 'opl packages repair --package-id <package_id>',
    });
  }
  if (lock.capability_provider) return 'framework_capability_package';
  if (lock.agent_id) return 'standard_agent';
  throw new FrameworkContractError('contract_shape_invalid', 'Installed package lock has no reliable package role.', {
    package_id: lock.package_id,
    lock_ref: lock.lock_ref,
    failure_code: 'agent_package_lock_role_missing',
    repair_action: 'opl packages repair --package-id <package_id>',
  });
}
