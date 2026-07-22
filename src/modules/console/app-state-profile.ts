import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type AppStateProfile = 'fast' | 'full';
export type AppStateCommandProfile = 'runtime' | AppStateProfile;

export function parseAppStateProfile(profile: string | undefined): AppStateCommandProfile {
  if (!profile || profile === 'fast') {
    return 'fast';
  }
  if (profile === 'runtime') {
    return 'runtime';
  }
  if (profile === 'full') {
    return 'full';
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'app state requires --profile runtime, --profile fast, or --profile full.',
    {
      profile,
      allowed_profiles: ['runtime', 'fast', 'full'],
    },
    2,
  );
}

export function parseAppStateArgs(args: string[]): { profile: AppStateCommandProfile } {
  let profile: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--profile') {
      throw new FrameworkContractError('cli_usage_error', `Unknown app state option: ${token}.`, {
        option: token,
        usage: 'opl app state [--profile runtime|fast|full]',
      });
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', 'Missing value for --profile.', {
        option: '--profile',
      });
    }
    profile = value;
    index += 1;
  }

  return { profile: parseAppStateProfile(profile) };
}
