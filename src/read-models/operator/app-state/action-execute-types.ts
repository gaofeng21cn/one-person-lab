import type { runFamilyRuntime } from '../../../adapters/execution/index.ts';
import type { CordisConnectDescriptorDiscoveryService } from '../../../adapters/integration/index.ts';

export type AutomationProviderHostActions = Readonly<{
  inspect(input: Readonly<{
    provider_id?: string;
    automation_kind?: 'computer_use' | 'browser_automation';
    runExternalChecks?: boolean;
  }>): Promise<Readonly<Record<string, unknown>>>;
  execute(input: Readonly<{
    provider_id?: string;
    automation_kind?: 'computer_use' | 'browser_automation';
    action_id: string;
    dry_run?: boolean;
  }>): Promise<Readonly<Record<string, unknown>>>;
}>;

export type AppActionExecuteServices = {
  descriptorDiscovery: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
  familyRuntime: typeof runFamilyRuntime;
  automationProviderHost?: AutomationProviderHostActions | null;
};
