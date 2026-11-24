import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { validateJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import {
  resolveInstalledPackageRuntimeModule,
  type InstalledPackageRuntimeDiscoveryOptions,
  type InstalledPackageRuntimeModuleContext,
} from '../agent-package-registry-parts/installed-runtime-module.ts';

export type ReferenceVerificationProviderId = string;
export type ProviderId = ReferenceVerificationProviderId;

export type ReferenceProviderDefinition = {
  provider_id: ProviderId;
  adapter_id: string;
  receipt_provider_name: string;
  aliases: string[];
  endpoint: {
    default_base_url: string;
    base_url?: string;
    allowed_origins: string[];
  };
  verification_scope: Record<string, unknown>;
};

export const REFERENCE_PROVIDER_MODULE_KIND = 'opl_connect_reference_provider_adapter';
export const REFERENCE_PROVIDER_ADAPTER_ABI = 'opl-connect-reference-provider-adapter.v1';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stableString(value: unknown): string | null {
  return asString(value);
}

export function resolveReferenceRuntime(options: InstalledPackageRuntimeDiscoveryOptions = {}) {
  return resolveInstalledPackageRuntimeModule({
    moduleKind: REFERENCE_PROVIDER_MODULE_KIND,
    adapterAbi: REFERENCE_PROVIDER_ADAPTER_ABI,
    ...options,
  });
}

function configuredEndpoint(providerId: ProviderId, rawEndpoint: unknown): ReferenceProviderDefinition['endpoint'] {
  const endpoint = asRecord(rawEndpoint);
  const defaultBaseUrl = asString(endpoint.default_base_url);
  const rawAllowedOrigins = Array.isArray(endpoint.allowed_origins) ? endpoint.allowed_origins : [];
  const allowedOrigins: string[] = [];
  try {
    for (const rawOrigin of rawAllowedOrigins) {
      const origin = stableString(rawOrigin);
      if (!origin) throw new Error('allowed origin must be a non-empty string');
      const parsed = new URL(origin);
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) {
        throw new Error('allowed origin must be an absolute HTTP origin');
      }
      allowedOrigins.push(parsed.origin);
    }
  } catch (error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider profile declares invalid allowed origins.',
      {
        provider_id: providerId,
        reason_code: 'reference_provider_endpoint_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!defaultBaseUrl || allowedOrigins.length === 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider profile declares an invalid endpoint.',
      { provider_id: providerId, reason_code: 'reference_provider_endpoint_invalid' },
    );
  }
  let defaultOrigin: string;
  try {
    const parsed = new URL(defaultBaseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('default base URL must use HTTP or HTTPS');
    defaultOrigin = parsed.origin;
  } catch (error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider profile declares an invalid default endpoint URL.',
      {
        provider_id: providerId,
        default_base_url: defaultBaseUrl,
        reason_code: 'reference_provider_endpoint_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!allowedOrigins.includes(defaultOrigin)) allowedOrigins.push(defaultOrigin);
  const environmentOverride = asString(endpoint.environment_override);
  if (environmentOverride && !/^OPL_CONNECT_[A-Z0-9_]+_BASE$/.test(environmentOverride)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider endpoint environment override is outside the allowed namespace.',
      {
        provider_id: providerId,
        environment_override: environmentOverride,
        reason_code: 'reference_provider_endpoint_environment_override_invalid',
      },
    );
  }
  const baseUrl = environmentOverride ? asString(process.env[environmentOverride]) : null;
  if (!baseUrl) {
    return { default_base_url: defaultBaseUrl, allowed_origins: allowedOrigins };
  }
  let overrideOrigin: string;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('base URL must use HTTP or HTTPS');
    overrideOrigin = parsed.origin;
  } catch (error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider endpoint override is not a valid absolute URL.',
      {
        provider_id: providerId,
        environment_override: environmentOverride,
        base_url: baseUrl,
        reason_code: 'reference_provider_endpoint_override_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  return {
    default_base_url: defaultBaseUrl,
    base_url: baseUrl.replace(/\/+$/, ''),
    allowed_origins: [...new Set([...allowedOrigins, overrideOrigin])],
  };
}

export function referenceProviderRegistry(
  runtime: InstalledPackageRuntimeModuleContext = resolveReferenceRuntime(),
): ReferenceProviderDefinition[] {
  const profile = runtime.readJson(runtime.binding.profile_ref);
  if (!Array.isArray(profile.providers) || profile.providers.length === 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider profile must declare providers.',
      { profile_ref: runtime.binding.profile_ref, reason_code: 'reference_provider_profile_empty' },
    );
  }
  const providers = profile.providers.map((rawProvider) => {
    const entry = asRecord(rawProvider);
    const providerId = stableString(entry.provider_id);
    const adapterId = stableString(entry.adapter_id);
    const receiptProviderName = stableString(entry.receipt_provider_name);
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
      : [];
    if (!providerId || !adapterId || !receiptProviderName) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'Reference provider profile declares an invalid provider entry.',
        {
          provider_id: providerId,
          adapter_id: adapterId,
          reason_code: 'reference_provider_profile_entry_invalid',
        },
      );
    }
    const profileSchema = runtime.readJson(runtime.binding.profile_schema_ref);
    const providerIdSchema = asRecord(
      asRecord(
        asRecord(asRecord(profileSchema.$defs).provider).properties,
      ).provider_id,
    );
    const providerIdValidation = validateJsonSchemaPayload({
      schemaId: `${runtime.binding.profile_schema_ref}#provider_id@${runtime.contentDigest}`,
      schema: providerIdSchema,
      sourceRef: runtime.binding.profile_schema_ref,
    }, providerId);
    if (Object.keys(providerIdSchema).length === 0 || !providerIdValidation.ok) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'Reference provider profile declares an unsafe provider id.',
        {
          provider_id: providerId,
          profile_schema_ref: runtime.binding.profile_schema_ref,
          ...(!providerIdValidation.ok ? { schema_errors: providerIdValidation.errors } : {}),
          reason_code: 'reference_provider_profile_provider_id_invalid',
        },
      );
    }
    return {
      provider_id: providerId,
      adapter_id: adapterId,
      receipt_provider_name: receiptProviderName,
      aliases,
      endpoint: configuredEndpoint(providerId, entry.endpoint),
      verification_scope: asRecord(entry.verification_scope),
    };
  });
  const providerIds = providers.map((provider) => provider.provider_id);
  if (new Set(providerIds).size !== providerIds.length) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider profile declares duplicate provider ids.',
      { provider_ids: providerIds, reason_code: 'reference_provider_profile_duplicate_provider' },
    );
  }
  return providers;
}

export function providerDefinition(
  providerId: ProviderId,
  runtime: InstalledPackageRuntimeModuleContext = resolveReferenceRuntime(),
) {
  const provider = referenceProviderRegistry(runtime).find((entry) => entry.provider_id === providerId);
  if (!provider) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider profile does not export the requested provider.',
      { provider_id: providerId, reason_code: 'reference_provider_not_exported' },
    );
  }
  return provider;
}

export function referenceVerificationProviderIds(
  options: InstalledPackageRuntimeDiscoveryOptions = {},
): ReferenceVerificationProviderId[] {
  return referenceProviderRegistry(resolveReferenceRuntime(options)).map((provider) => provider.provider_id);
}

export function normalizeReferenceVerificationProviders(
  providers: string[],
  options: InstalledPackageRuntimeDiscoveryOptions = {},
  runtime?: InstalledPackageRuntimeModuleContext,
): ReferenceVerificationProviderId[] {
  const registry = referenceProviderRegistry(runtime ?? resolveReferenceRuntime(options));
  const aliases = new Map<string, ProviderId>(
    registry.flatMap((provider) => [
      [provider.provider_id, provider.provider_id] as const,
      ...provider.aliases.map((alias) => [alias.toLowerCase(), provider.provider_id] as const),
    ]),
  );
  const entries = providers.flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim().toLowerCase())
    .map((entry) => aliases.get(entry) ?? entry)
    .filter(Boolean);
  const defaults = registry.map((provider) => provider.provider_id);
  if (providers.length > 0 && entries.length === 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference verification providers must contain at least one non-empty provider.',
      { supported: defaults },
    );
  }
  const unique = [...new Set(entries.length > 0 ? entries : defaults)];
  const allowed = new Set<string>(defaults);
  const unsupported = unique.filter((entry) => !allowed.has(entry));
  if (unsupported.length > 0) {
    throw new FrameworkContractError('codex_command_failed', 'Unsupported OPL Connect reference verification provider.', {
      unsupported,
      supported: defaults,
    });
  }
  return unique as ReferenceVerificationProviderId[];
}
