import { z } from 'zod';

export const SETTINGS_DESTINATIONS = [
  'models',
  'resources',
  'workspace',
  'capabilities',
  'services',
  'preferences',
] as const;

export const DECLARATIVE_VIEW_TYPES = [
  'channel_access',
  'service_status',
  'activity_log',
  'list_detail',
  'approval_diff',
  'remote_companion_access',
] as const;

export const DECLARATIVE_VIEW_SLOTS = [
  'settings.section',
  'runtime.detail',
  'composer.palette',
  'workbench.panel',
] as const;

export const DSH_CLIENT_SLOTS = [
  'main',
  'sidebar.panellist',
  'settings.group.models',
  'settings.group.resources',
  'settings.group.workspace',
  'settings.group.capabilities',
  'settings.group.services',
  'settings.group.preferences',
] as const;

export const RESERVED_APP_SETTINGS_IDS = new Set([
  'overview',
  'models',
  'resources',
  'workspace',
  'capabilities',
  'services',
  'preferences',
  'settings',
  'updates',
  'software-center',
]);

export function isReservedAppSettingsId(id: string): boolean {
  const lower = id.trim().toLowerCase();
  return (
    RESERVED_APP_SETTINGS_IDS.has(lower)
    || lower.startsWith('app.settings.')
    || lower.startsWith('settings.top.')
  );
}

export function isSafeRelativePosixPath(value: string): boolean {
  if (!value || value.includes('\0') || value.includes('\\')) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (value.startsWith('/')) return false;
  if (value === '.' || value === '..') return false;
  const normalized = value.startsWith('./') ? value.slice(2) : value;
  if (!normalized || normalized.startsWith('/')) return false;
  const segments = normalized.split('/');
  return segments.every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

export function isDshEntrySafePath(value: string): boolean {
  if (!isSafeRelativePosixPath(value)) return false;
  const normalized = value.startsWith('./') ? value.slice(2) : value;
  return normalized !== 'vendor' && !normalized.startsWith('vendor/') && !normalized.includes('/vendor/');
}

export const KebabIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase kebab-case identifier')
  .min(1)
  .max(128);

export const ScopedIdSchema = z
  .string()
  .regex(/^(?:[a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9])$/, 'Must be lowercase scoped identifier')
  .min(1)
  .max(128);

export const SemverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    'Must be valid SemVer 2.0.0 string',
  );

export const CODEX_PLUGIN_NAME_REGEX = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const SAFE_RELATIVE_POSIX_PATH_REGEX =
  /^(?![A-Za-z]:)(?:\.\/)?(?:(?!\.\.?(?:\/|$))[^/\\\0]+)(?:\/(?!\.\.?(?:\/|$))[^/\\\0]+)*$/;

export const SAFE_DSH_ENTRY_PATH_REGEX =
  /^(?![A-Za-z]:)(?:\.\/)?(?:(?!\.\.?(?:\/|$)|vendor(?:\/|$))[^/\\\0]+)(?:\/(?!\.\.?(?:\/|$)|vendor(?:\/|$))[^/\\\0]+)*$/;

export const RelativePosixPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(SAFE_RELATIVE_POSIX_PATH_REGEX, 'Must be a safe relative POSIX path within the package root')
  .refine(isSafeRelativePosixPath, 'Must be a safe relative POSIX path within the package root');

export const DshEntryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(SAFE_DSH_ENTRY_PATH_REGEX, 'Must be a safe relative POSIX path without vendor/ or root escape')
  .refine(isDshEntrySafePath, 'Must be a safe relative POSIX path without vendor/ or root escape');

export const SettingsDestinationSchema = z.enum(SETTINGS_DESTINATIONS).meta({
  id: 'SettingsDestination',
});

export const I18nTextSchema = z
  .strictObject({
    'zh-CN': z.string().trim().min(1).max(2000),
    'en-US': z.string().trim().min(1).max(2000),
  })
  .meta({ id: 'I18nText' });

export const CommandEntrypointSchema = z
  .strictObject({
    kind: z.literal('cli'),
    argv: z.array(z.string().min(1)).min(1),
    transport: z.enum(['stdin_json_stdout_json', 'argv_json']).optional(),
  })
  .meta({ id: 'CommandEntrypoint' });

export const ModuleEntrypointSchema = z
  .strictObject({
    kind: z.literal('esm_module'),
    module: RelativePosixPathSchema,
    export: z.string().trim().min(1),
  })
  .meta({ id: 'ModuleEntrypoint' });

export const ModuleOrCommandEntrypointSchema = z.discriminatedUnion('kind', [
  CommandEntrypointSchema,
  ModuleEntrypointSchema,
]);

export const HomeShortcutSchema = z.strictObject({
  id: ScopedIdSchema,
  label: I18nTextSchema,
  default_visible: z.boolean().optional(),
  target: z.strictObject({
    kind: z.enum(['agent', 'mcp_app', 'dsh_panel', 'command']),
    ref: z.string().trim().min(1).max(256),
  }),
});

export const PackageDependencySchema = z.strictObject({
  id: KebabIdSchema,
  version: z.string().trim().min(1).max(64).optional(),
  optional: z.boolean().optional(),
  presence: z.enum(['required', 'optional']).optional(),
  required_capabilities: z.array(ScopedIdSchema).optional(),
});

export const RuntimeDependencySchema = z.strictObject({
  name: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(64).optional(),
  optional: z.boolean().optional(),
});

export const Spec01ConnectionPermissionSchema = z.strictObject({
  provider_type: z.string().trim().min(1).max(128),
  capabilities: z.array(ScopedIdSchema).min(1),
  optional: z.boolean().optional(),
  reason: I18nTextSchema,
});

export const GrantConnectionPermissionSchema = z.strictObject({
  provider_id: z.string().trim().min(1).max(128),
  capability_id: ScopedIdSchema,
  capability_title: z.union([I18nTextSchema, z.string().trim().min(1).max(256)]),
  capability_risk: z.enum(['read', 'local_write', 'external_write']),
  optional: z.boolean().optional(),
  reason: I18nTextSchema.optional(),
});

export const ConnectionPermissionSchema = z.union([
  Spec01ConnectionPermissionSchema,
  GrantConnectionPermissionSchema,
]);

export const DeclarativeActionSchema = z.strictObject({
  id: ScopedIdSchema,
  label: I18nTextSchema,
  action_ref: z.string().trim().min(1).max(256),
  confirm: z.boolean().optional(),
  effect_timing: z.enum(['immediate', 'next_task', 'restart_required']).optional(),
});

export const DeclarativeViewSchema = z.strictObject({
  id: ScopedIdSchema,
  view_type: z.enum(DECLARATIVE_VIEW_TYPES),
  slot: z.enum(DECLARATIVE_VIEW_SLOTS),
  settings_destination: SettingsDestinationSchema.optional(),
  title: I18nTextSchema,
  data_ref: z.string().trim().min(1).max(256),
  empty_state: I18nTextSchema.optional(),
  actions: z.array(DeclarativeActionSchema).optional(),
  sort_order: z.number().int().optional(),
});

export const DeclarativeSettingsFormSchema = z.strictObject({
  id: ScopedIdSchema,
  destination: SettingsDestinationSchema,
  title: I18nTextSchema,
  data_ref: z.string().trim().min(1).max(256),
  submit_action_ref: z.string().trim().min(1).max(256),
  search_keywords: z.array(z.string().trim().min(1).max(64)).optional(),
  sort_order: z.number().int().optional(),
});

export const DeclarativeNavigationItemSchema = z.strictObject({
  id: ScopedIdSchema,
  label: I18nTextSchema,
  view_id: ScopedIdSchema,
  sort_order: z.number().int().optional(),
});

export const OplPackageManifestV2Schema = z
  .strictObject({
    schema_version: z.literal('opl.package.v2'),
    identity: z.strictObject({
      id: KebabIdSchema,
      version: SemverSchema,
      intent: z.enum(['agent', 'app', 'extension', 'channel']),
      name: I18nTextSchema,
      summary: I18nTextSchema,
      description: I18nTextSchema.optional(),
      publisher: z.string().trim().min(1).max(128),
      license: z.string().trim().min(1).max(64).optional(),
      icon: RelativePosixPathSchema.optional(),
      repository: z.url().optional(),
      homepage: z.url().optional(),
      maturity: z.enum(['prototype', 'preview', 'stable']).optional(),
      keywords: z.array(z.string().trim().min(1).max(64)).max(64).optional(),
      routing_summary: I18nTextSchema.optional(),
      default_prompts: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
      home_shortcuts: z.array(HomeShortcutSchema).max(20).optional(),
    }),
    dependencies: z
      .strictObject({
        opl_base: z.string().trim().min(1).max(64).optional(),
        packages: z.array(PackageDependencySchema).optional(),
        runtimes: z.array(RuntimeDependencySchema).optional(),
      })
      .optional(),
    permissions: z
      .strictObject({
        workspace: z
          .strictObject({
            access: z.enum(['none', 'read', 'read_write']),
            reason: I18nTextSchema.optional(),
          })
          .optional(),
        knowledge: z
          .array(
            z.strictObject({
              scope: z.enum(['personal_profile', 'long_term_topic', 'project_local']),
              access: z.enum(['read', 'propose_writeback']),
              required: z.boolean().optional(),
              reason: I18nTextSchema,
            }),
          )
          .optional(),
        connections: z.array(ConnectionPermissionSchema).optional(),
        network: z.enum(['none', 'outbound_api', 'local_loopback', 'remote_tunnel']).optional(),
        execution_mode: z
          .enum(['in_process', 'local_subprocess', 'sandbox_iframe', 'declarative_only'])
          .optional(),
      })
      .optional(),
    provides: z
      .strictObject({
        agent: z
          .strictObject({
            stages_ref: RelativePosixPathSchema.optional(),
            authority_entrypoint: CommandEntrypointSchema.optional(),
          })
          .optional(),
        cli_bin: z
          .array(
            z.strictObject({
              name: KebabIdSchema,
              path: RelativePosixPathSchema,
            }),
          )
          .optional(),
        skills: z
          .array(
            z.strictObject({
              id: ScopedIdSchema,
              path: RelativePosixPathSchema,
              exposure: z.enum(['default', 'opt_in']).optional(),
            }),
          )
          .optional(),
        mcp_servers: z
          .array(
            z.strictObject({
              id: ScopedIdSchema,
              transport: z.enum(['stdio', 'streamable_http']),
              command: z.string().trim().min(1).optional(),
              args: z.array(z.string()).optional(),
              url: z.url().optional(),
              env_refs: z.array(z.string().trim().min(1)).optional(),
            }),
          )
          .optional(),
        connection_providers: z
          .array(
            z.strictObject({
              provider_type: z.string().trim().min(1).max(128),
              entrypoint: ModuleOrCommandEntrypointSchema,
              capabilities: z
                .array(
                  z.strictObject({
                    id: ScopedIdSchema,
                    title: I18nTextSchema,
                    risk: z.enum(['read', 'local_write', 'external_write']),
                  }),
                )
                .min(1),
            }),
          )
          .optional(),
        channels: z
          .array(
            z.strictObject({
              channel_id: ScopedIdSchema,
              entrypoint: ModuleEntrypointSchema,
            }),
          )
          .optional(),
        remote_companion_connectors: z
          .array(
            z.strictObject({
              channel_id: ScopedIdSchema,
              entrypoint: ModuleEntrypointSchema,
            }),
          )
          .optional(),
        executors: z
          .array(
            z.strictObject({
              executor_id: ScopedIdSchema,
              entrypoint: ModuleEntrypointSchema,
              models: z.array(z.string().trim().min(1)).optional(),
            }),
          )
          .optional(),
        cli_extensions: z
          .array(
            z.strictObject({
              namespace: KebabIdSchema,
              entrypoint: ModuleOrCommandEntrypointSchema,
            }),
          )
          .optional(),
        contribution_handler: ModuleOrCommandEntrypointSchema.optional(),
      })
      .optional(),
    ui: z
      .strictObject({
        declarative: z
          .strictObject({
            navigation: z.array(DeclarativeNavigationItemSchema).optional(),
            settings_forms: z.array(DeclarativeSettingsFormSchema).optional(),
            views: z.array(DeclarativeViewSchema).optional(),
          })
          .optional(),
        dsh_client: z
          .strictObject({
            client_entry: DshEntryPathSchema,
            host_entry: DshEntryPathSchema.optional(),
            slots: z.array(z.enum(DSH_CLIENT_SLOTS)).min(1),
            search_keywords: z.array(z.string().trim().min(1).max(64)).optional(),
          })
          .optional(),
        mcp_apps: z
          .array(
            z.strictObject({
              id: ScopedIdSchema,
              title: I18nTextSchema,
              mcp_server_id: ScopedIdSchema,
              resource_uri: z
                .string()
                .regex(/^ui:\/\/[a-z0-9][a-z0-9._-]*\/.+$/, 'Must be a valid ui://<host>/<path> URI'),
              host_capabilities: z
                .array(z.enum(['theme_sync', 'workspace_read', 'connect_package_grant']))
                .optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    distribution: z
      .strictObject({
        oci: z.string().trim().min(1).optional(),
        npm: z.string().trim().min(1).optional(),
        homebrew: z
          .strictObject({
            tap: z.string().trim().min(1),
            formula: z.string().trim().min(1).optional(),
            cask: z.string().trim().min(1).optional(),
          })
          .optional(),
        visibility: z.enum(['public', 'authorized_only']).optional(),
        access_policy_ref: z.string().trim().min(1).optional(),
        credential_provider: z.string().trim().min(1).optional(),
        supplemental_profiles: z
          .array(
            z.strictObject({
              id: ScopedIdSchema,
              label: I18nTextSchema,
              oci: z.string().trim().min(1),
            }),
          )
          .optional(),
      })
      .optional(),
    host_hints: z
      .strictObject({
        codex: z
          .strictObject({
            sync_enabled: z.boolean().optional(),
            plugin_name: z
              .string()
              .trim()
              .min(1)
              .max(128)
              .regex(
                CODEX_PLUGIN_NAME_REGEX,
                'Must be a single-segment safe plugin identifier without path traversal',
              )
              .optional(),
            category: z.string().trim().min(1).max(64).optional(),
            brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
            capabilities: z.array(z.string().trim().min(1).max(128)).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine((manifest, ctx) => {
    const shortcutIds = new Set<string>();
    for (const [idx, shortcut] of (manifest.identity.home_shortcuts ?? []).entries()) {
      if (shortcutIds.has(shortcut.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['identity', 'home_shortcuts', idx, 'id'],
          message: `Duplicate home_shortcut id '${shortcut.id}'.`,
        });
      }
      shortcutIds.add(shortcut.id);
    }

    const depPkgIds = new Set<string>();
    for (const [idx, dep] of (manifest.dependencies?.packages ?? []).entries()) {
      if (depPkgIds.has(dep.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dependencies', 'packages', idx, 'id'],
          message: `Duplicate dependency package id '${dep.id}'.`,
        });
      }
      depPkgIds.add(dep.id);
      if (dep.optional !== undefined && dep.presence !== undefined) {
        const expectedOptional = dep.presence === 'optional';
        if (dep.optional !== expectedOptional) {
          ctx.addIssue({
            code: 'custom',
            path: ['dependencies', 'packages', idx],
            message: `Conflicting optional=${String(dep.optional)} and presence='${dep.presence}'.`,
          });
        }
      }
    }

    const mcpServerIds = new Set<string>();
    for (const [idx, server] of (manifest.provides?.mcp_servers ?? []).entries()) {
      if (mcpServerIds.has(server.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'mcp_servers', idx, 'id'],
          message: `Duplicate mcp_server id '${server.id}'.`,
        });
      }
      mcpServerIds.add(server.id);
      if (server.transport === 'stdio' && !server.command) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'mcp_servers', idx, 'command'],
          message: "MCP server with transport 'stdio' must declare 'command'.",
        });
      }
      if (server.transport === 'streamable_http' && !server.url) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'mcp_servers', idx, 'url'],
          message: "MCP server with transport 'streamable_http' must declare 'url'.",
        });
      }
    }

    const skillIds = new Set<string>();
    for (const [idx, skill] of (manifest.provides?.skills ?? []).entries()) {
      if (skillIds.has(skill.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'skills', idx, 'id'],
          message: `Duplicate skill id '${skill.id}'.`,
        });
      }
      skillIds.add(skill.id);
    }

    const cliBinNames = new Set<string>();
    for (const [idx, bin] of (manifest.provides?.cli_bin ?? []).entries()) {
      if (cliBinNames.has(bin.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'cli_bin', idx, 'name'],
          message: `Duplicate cli_bin name '${bin.name}'.`,
        });
      }
      cliBinNames.add(bin.name);
    }

    const channelIds = new Set<string>();
    for (const [idx, ch] of (manifest.provides?.channels ?? []).entries()) {
      if (channelIds.has(ch.channel_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'channels', idx, 'channel_id'],
          message: `Duplicate channel_id '${ch.channel_id}'.`,
        });
      }
      channelIds.add(ch.channel_id);
    }

    const companionIds = new Set<string>();
    for (const [idx, comp] of (manifest.provides?.remote_companion_connectors ?? []).entries()) {
      if (companionIds.has(comp.channel_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'remote_companion_connectors', idx, 'channel_id'],
          message: `Duplicate remote_companion_connectors channel_id '${comp.channel_id}'.`,
        });
      }
      companionIds.add(comp.channel_id);
    }

    const executorIds = new Set<string>();
    for (const [idx, ex] of (manifest.provides?.executors ?? []).entries()) {
      if (executorIds.has(ex.executor_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'executors', idx, 'executor_id'],
          message: `Duplicate executor_id '${ex.executor_id}'.`,
        });
      }
      executorIds.add(ex.executor_id);
    }

    const cliNamespaces = new Set<string>();
    for (const [idx, ext] of (manifest.provides?.cli_extensions ?? []).entries()) {
      if (cliNamespaces.has(ext.namespace)) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'cli_extensions', idx, 'namespace'],
          message: `Duplicate cli_extension namespace '${ext.namespace}'.`,
        });
      }
      cliNamespaces.add(ext.namespace);
    }

    const providerTypes = new Set<string>();
    for (const [idx, prov] of (manifest.provides?.connection_providers ?? []).entries()) {
      if (providerTypes.has(prov.provider_type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'connection_providers', idx, 'provider_type'],
          message: `Duplicate connection_provider provider_type '${prov.provider_type}'.`,
        });
      }
      providerTypes.add(prov.provider_type);
    }

    if (manifest.distribution?.homebrew) {
      const hb = manifest.distribution.homebrew;
      if (!hb.formula && !hb.cask) {
        ctx.addIssue({
          code: 'custom',
          path: ['distribution', 'homebrew'],
          message: 'distribution.homebrew must specify formula or cask.',
        });
      }
    }

    const declarative = manifest.ui?.declarative;
    if (declarative) {
      const views = declarative.views ?? [];
      const forms = declarative.settings_forms ?? [];
      const nav = declarative.navigation ?? [];
      const viewMap = new Map<string, (typeof views)[number]>();

      for (const [idx, view] of views.entries()) {
        if (viewMap.has(view.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'views', idx, 'id'],
            message: `Duplicate declarative view id '${view.id}'.`,
          });
        }
        viewMap.set(view.id, view);

        if (view.slot === 'settings.section' && !view.settings_destination) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'views', idx, 'settings_destination'],
            message: "Declarative view in slot 'settings.section' must declare settings_destination.",
          });
        }
        if (view.slot !== 'settings.section' && view.settings_destination !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'views', idx, 'settings_destination'],
            message: `Declarative view in slot '${view.slot}' must not declare settings_destination.`,
          });
        }

        const actionIds = new Set<string>();
        for (const [aIdx, action] of (view.actions ?? []).entries()) {
          if (actionIds.has(action.id)) {
            ctx.addIssue({
              code: 'custom',
              path: ['ui', 'declarative', 'views', idx, 'actions', aIdx, 'id'],
              message: `Duplicate action id '${action.id}' in view '${view.id}'.`,
            });
          }
          actionIds.add(action.id);
        }
      }

      const formIds = new Set<string>();
      for (const [idx, form] of forms.entries()) {
        if (formIds.has(form.id) || viewMap.has(form.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'settings_forms', idx, 'id'],
            message: `Duplicate settings_form id '${form.id}'.`,
          });
        }
        formIds.add(form.id);
      }

      const navIds = new Set<string>();
      for (const [idx, item] of nav.entries()) {
        if (navIds.has(item.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'navigation', idx, 'id'],
            message: `Duplicate declarative navigation id '${item.id}'.`,
          });
        }
        navIds.add(item.id);
        if (isReservedAppSettingsId(item.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'navigation', idx, 'id'],
            message: `Declarative navigation id '${item.id}' collides with reserved App top-level settings navigation.`,
          });
        }
        if (isReservedAppSettingsId(item.view_id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'navigation', idx, 'view_id'],
            message: `Declarative navigation view_id '${item.view_id}' targets a reserved App top-level settings page.`,
          });
        }
        const targetView = viewMap.get(item.view_id);
        if (!targetView) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'navigation', idx, 'view_id'],
            message: `Declarative navigation view_id '${item.view_id}' does not exist in ui.declarative.views.`,
          });
        } else if (targetView.slot === 'settings.section') {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'declarative', 'navigation', idx, 'view_id'],
            message: `Declarative navigation cannot reference view '${item.view_id}' in slot 'settings.section'.`,
          });
        }
      }

      if ((views.length > 0 || forms.length > 0) && !manifest.provides?.contribution_handler) {
        ctx.addIssue({
          code: 'custom',
          path: ['provides', 'contribution_handler'],
          message: 'provides.contribution_handler is required when ui.declarative.views or settings_forms are declared.',
        });
      }
    }

    if (manifest.ui?.dsh_client) {
      const seenSlots = new Set<string>();
      for (const [idx, slot] of manifest.ui.dsh_client.slots.entries()) {
        if (seenSlots.has(slot)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'dsh_client', 'slots', idx],
            message: `Duplicate dsh_client slot '${slot}'.`,
          });
        }
        seenSlots.add(slot);
      }
    }

    if (manifest.ui?.mcp_apps) {
      const appIds = new Set<string>();
      for (const [idx, app] of manifest.ui.mcp_apps.entries()) {
        if (appIds.has(app.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'mcp_apps', idx, 'id'],
            message: `Duplicate mcp_app id '${app.id}'.`,
          });
        }
        appIds.add(app.id);
        if (!mcpServerIds.has(app.mcp_server_id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ui', 'mcp_apps', idx, 'mcp_server_id'],
            message: `mcp_server_id '${app.mcp_server_id}' must be declared in provides.mcp_servers.`,
          });
        }
        const caps = new Set<string>();
        for (const [cIdx, cap] of (app.host_capabilities ?? []).entries()) {
          if (caps.has(cap)) {
            ctx.addIssue({
              code: 'custom',
              path: ['ui', 'mcp_apps', idx, 'host_capabilities', cIdx],
              message: `Duplicate host_capability '${cap}' in mcp_app '${app.id}'.`,
            });
          }
          caps.add(cap);
        }
      }
    }
  });

export type OplPackageManifestV2 = z.infer<typeof OplPackageManifestV2Schema>;
export type I18nText = z.infer<typeof I18nTextSchema>;
export type CommandEntrypoint = z.infer<typeof CommandEntrypointSchema>;
export type ModuleEntrypoint = z.infer<typeof ModuleEntrypointSchema>;
export type ModuleOrCommandEntrypoint = z.infer<typeof ModuleOrCommandEntrypointSchema>;
export type SettingsDestination = z.infer<typeof SettingsDestinationSchema>;

export const OplReleaseLockV2Schema = z.strictObject({
  schema_version: z.literal('opl.release.lock.v2'),
  package_id: KebabIdSchema,
  version: SemverSchema,
  algorithm: z.literal('sha256'),
  canonicalization: z.literal('ordered_path_length_file_length_bytes'),
  file_count: z.number().int().min(1),
  paths: z.array(RelativePosixPathSchema).min(1),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  built_at: z.string().min(1),
  git_commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  dependencies: z
    .array(
      z.strictObject({
        id: KebabIdSchema,
        version: z.string().min(1).optional(),
        resolved_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
      }),
    )
    .optional(),
  oci_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
  signatures: z
    .strictObject({
      cosign: z
        .strictObject({
          bundle_ref: z.string().min(1).optional(),
          key_id: z.string().min(1).optional(),
          signature: z.string().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type OplReleaseLockV2 = z.infer<typeof OplReleaseLockV2Schema>;
