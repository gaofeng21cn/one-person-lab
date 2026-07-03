import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type AppStateProfile = 'fast' | 'full';

export function parseAppStateProfile(profile: string | undefined): AppStateProfile {
  if (!profile || profile === 'fast') {
    return 'fast';
  }
  if (profile === 'full') {
    return 'full';
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'app state requires --profile fast or --profile full.',
    {
      profile,
      allowed_profiles: ['fast', 'full'],
    },
    2,
  );
}
