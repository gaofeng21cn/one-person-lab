import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { recordList, stringValue } from '../../../kernel/json-record.ts';
import { uniqueStrings } from './shared.ts';
import type {
  AgentPackageAppContributions,
  AgentPackageAppContributionUiSlot,
  AgentPackageAppContributionViewType,
  AgentPackageSettingsDestination,
} from './types.ts';

const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const APP_CONTRIBUTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const APP_CONTRIBUTION_REF_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?$/;
const APP_CONTRIBUTION_VIEW_TYPES = new Set<AgentPackageAppContributionViewType>([
  'list_detail',
  'timeline',
  'approval_diff',
  'task_board',
  'artifact_view',
  'activity_log',
  'service_status',
  'channel_access',
  'remote_companion_access',
  'settings_form',
]);
const APP_CONTRIBUTION_SETTINGS_DESTINATIONS = new Set<AgentPackageSettingsDestination>([
  'models',
  'resources',
  'workspace',
  'capabilities',
  'services',
  'preferences',
]);
const APP_CONTRIBUTION_BADGE_TONES = new Set([
  'neutral',
  'info',
  'success',
  'warning',
  'critical',
] as const);
const APP_CONTRIBUTION_UI_SLOTS = new Set<AgentPackageAppContributionUiSlot>([
  'composer.palette',
  'runtime.detail',
  'settings.section',
]);
const APP_CONTRIBUTION_UI_KINDS = new Set(['view', 'command_group'] as const);
const APP_CONTRIBUTION_UI_TRUST_TIERS = new Set([
  'declarative',
  'trusted_first_party_renderer',
] as const);
const APP_CONTRIBUTION_UI_SCOPES = new Set(['root', 'work_item'] as const);
const APP_CONTRIBUTION_MAX_ITEMS = 100;

function appContributionInvalid(
  message: string,
  manifestUrl: string,
  details: Record<string, unknown> = {},
): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    manifest_url: manifestUrl,
    ...details,
    failure_code: 'agent_package_app_contributions_invalid',
  });
}

function assertContributionKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
  manifestUrl: string,
) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    appContributionInvalid('App contribution contains unsupported fields.', manifestUrl, {
      field,
      unsupported_fields: unexpected,
    });
  }
}

function normalizeContributionId(value: unknown, field: string, manifestUrl: string) {
  const normalized = stringValue(value);
  if (
    !normalized
    || normalized.length > 128
    || !APP_CONTRIBUTION_ID_PATTERN.test(normalized)
  ) {
    appContributionInvalid('App contribution id is invalid.', manifestUrl, {
      field,
      value,
    });
  }
  return normalized;
}

function normalizeContributionRef(value: unknown, field: string, manifestUrl: string) {
  const normalized = stringValue(value);
  if (
    !normalized
    || normalized.length > 257
    || !APP_CONTRIBUTION_REF_PATTERN.test(normalized)
  ) {
    appContributionInvalid('App contribution ref must be a stable data or action identity.', manifestUrl, {
      field,
      value,
    });
  }
  return normalized;
}

function normalizeContributionLocalizedText(
  value: unknown,
  field: string,
  manifestUrl: string,
) {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    appContributionInvalid('App contribution localized text must be a non-empty locale map.', manifestUrl, {
      field,
    });
  }
  const entries = Object.entries(value).map(([locale, text]) => {
    const normalizedText = stringValue(text);
    if (
      !LOCALE_ID_PATTERN.test(locale)
      || !normalizedText
      || normalizedText.length > 2000
    ) {
      appContributionInvalid('App contribution localized text is invalid.', manifestUrl, {
        field,
        locale,
      });
    }
    return [locale, normalizedText] as const;
  });
  return Object.fromEntries(entries);
}

function contributionRecords(
  value: unknown,
  field: string,
  manifestUrl: string,
) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > APP_CONTRIBUTION_MAX_ITEMS) {
    appContributionInvalid('App contribution collection must be a bounded array.', manifestUrl, {
      field,
    });
  }
  const entries = recordList(value);
  if (entries.length !== value.length) {
    appContributionInvalid('App contribution collection entries must be objects.', manifestUrl, {
      field,
    });
  }
  return entries;
}

function contributionIdList(
  value: unknown,
  field: string,
  manifestUrl: string,
) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > APP_CONTRIBUTION_MAX_ITEMS) {
    appContributionInvalid('App contribution id list must be a bounded array.', manifestUrl, {
      field,
    });
  }
  const ids = value.map((entry, index) =>
    normalizeContributionId(entry, `${field}[${index}]`, manifestUrl));
  if (new Set(ids).size !== ids.length) {
    appContributionInvalid('App contribution id list must be unique.', manifestUrl, {
      field,
    });
  }
  return ids;
}

function assertUniqueContributionIds(
  ids: string[],
  field: string,
  manifestUrl: string,
) {
  if (new Set(ids).size !== ids.length) {
    appContributionInvalid('App contribution ids must be unique within their collection.', manifestUrl, {
      field,
    });
  }
}

export function normalizeAppContributions(
  value: unknown,
  manifestUrl: string,
): AgentPackageAppContributions | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    appContributionInvalid('app_contributions must be an object.', manifestUrl);
  }
  assertContributionKeys(
    value,
    ['schema_version', 'navigation', 'views', 'commands', 'badges', 'ui'],
    'app_contributions',
    manifestUrl,
  );
  if (value.schema_version !== 'opl-app-contributions.v1') {
    appContributionInvalid(
      'app_contributions must use schema_version opl-app-contributions.v1.',
      manifestUrl,
      { schema_version: value.schema_version },
    );
  }

  const navigation = contributionRecords(
    value.navigation,
    'app_contributions.navigation',
    manifestUrl,
  ).map((entry, index) => {
    const field = `app_contributions.navigation[${index}]`;
    assertContributionKeys(
      entry,
      ['navigation_id', 'label_i18n', 'view_id', 'icon_id', 'sort_order'],
      field,
      manifestUrl,
    );
    if (
      entry.sort_order !== undefined
      && (
        !Number.isInteger(entry.sort_order)
        || Number(entry.sort_order) < -10000
        || Number(entry.sort_order) > 10000
      )
    ) {
      appContributionInvalid('App navigation sort_order must be a bounded integer.', manifestUrl, {
        field: `${field}.sort_order`,
      });
    }
    return {
      navigation_id: normalizeContributionId(entry.navigation_id, `${field}.navigation_id`, manifestUrl),
      label_i18n: normalizeContributionLocalizedText(entry.label_i18n, `${field}.label_i18n`, manifestUrl),
      view_id: normalizeContributionId(entry.view_id, `${field}.view_id`, manifestUrl),
      ...(entry.icon_id === undefined
        ? {}
        : { icon_id: normalizeContributionId(entry.icon_id, `${field}.icon_id`, manifestUrl) }),
      ...(entry.sort_order === undefined ? {} : { sort_order: Number(entry.sort_order) }),
    };
  });

  const views = contributionRecords(
    value.views,
    'app_contributions.views',
    manifestUrl,
  ).map((entry, index) => {
    const field = `app_contributions.views[${index}]`;
    assertContributionKeys(
      entry,
      [
        'view_id',
        'view_type',
        'settings_destination',
        'title_i18n',
        'data_ref',
        'command_ids',
        'badge_ids',
        'empty_state_i18n',
      ],
      field,
      manifestUrl,
    );
    const viewType = stringValue(entry.view_type);
    if (!viewType || !APP_CONTRIBUTION_VIEW_TYPES.has(viewType as AgentPackageAppContributionViewType)) {
      appContributionInvalid('App contribution view_type is unsupported.', manifestUrl, {
        field: `${field}.view_type`,
        view_type: entry.view_type,
      });
    }
    const rawSettingsDestination = entry.settings_destination;
    const settingsDestination = rawSettingsDestination === undefined
      ? undefined
      : stringValue(rawSettingsDestination);
    if (
      rawSettingsDestination !== undefined
      && (
        !settingsDestination
        || !APP_CONTRIBUTION_SETTINGS_DESTINATIONS.has(settingsDestination as AgentPackageSettingsDestination)
      )
    ) {
      appContributionInvalid('App contribution settings_destination is unsupported.', manifestUrl, {
        field: `${field}.settings_destination`,
        settings_destination: entry.settings_destination,
      });
    }
    if (viewType === 'settings_form' && settingsDestination === undefined) {
      appContributionInvalid('App contribution settings_form view requires settings_destination.', manifestUrl, {
        field: `${field}.settings_destination`,
      });
    }
    if (viewType !== 'settings_form' && settingsDestination !== undefined) {
      appContributionInvalid('App contribution settings_destination is only valid on settings_form views.', manifestUrl, {
        field: `${field}.settings_destination`,
      });
    }
    return {
      view_id: normalizeContributionId(entry.view_id, `${field}.view_id`, manifestUrl),
      view_type: viewType as AgentPackageAppContributionViewType,
      ...(settingsDestination === undefined
        ? {}
        : { settings_destination: settingsDestination as AgentPackageSettingsDestination }),
      title_i18n: normalizeContributionLocalizedText(entry.title_i18n, `${field}.title_i18n`, manifestUrl),
      data_ref: normalizeContributionRef(entry.data_ref, `${field}.data_ref`, manifestUrl),
      command_ids: contributionIdList(entry.command_ids, `${field}.command_ids`, manifestUrl),
      badge_ids: contributionIdList(entry.badge_ids, `${field}.badge_ids`, manifestUrl),
      ...(entry.empty_state_i18n === undefined
        ? {}
        : {
            empty_state_i18n: normalizeContributionLocalizedText(
              entry.empty_state_i18n,
              `${field}.empty_state_i18n`,
              manifestUrl,
            ),
          }),
    };
  });

  const commands = contributionRecords(
    value.commands,
    'app_contributions.commands',
    manifestUrl,
  ).map((entry, index) => {
    const field = `app_contributions.commands[${index}]`;
    assertContributionKeys(
      entry,
      ['command_id', 'label_i18n', 'action_ref', 'confirmation_required'],
      field,
      manifestUrl,
    );
    if (
      entry.confirmation_required !== undefined
      && typeof entry.confirmation_required !== 'boolean'
    ) {
      appContributionInvalid('App command confirmation_required must be a boolean.', manifestUrl, {
        field: `${field}.confirmation_required`,
      });
    }
    return {
      command_id: normalizeContributionId(entry.command_id, `${field}.command_id`, manifestUrl),
      label_i18n: normalizeContributionLocalizedText(entry.label_i18n, `${field}.label_i18n`, manifestUrl),
      action_ref: normalizeContributionRef(entry.action_ref, `${field}.action_ref`, manifestUrl),
      confirmation_required: entry.confirmation_required === true,
    };
  });

  const badges = contributionRecords(
    value.badges,
    'app_contributions.badges',
    manifestUrl,
  ).map((entry, index) => {
    const field = `app_contributions.badges[${index}]`;
    assertContributionKeys(
      entry,
      ['badge_id', 'label_i18n', 'data_ref', 'tone'],
      field,
      manifestUrl,
    );
    const tone = entry.tone === undefined ? null : stringValue(entry.tone);
    if (
      tone !== null
      && !APP_CONTRIBUTION_BADGE_TONES.has(
        tone as typeof APP_CONTRIBUTION_BADGE_TONES extends Set<infer T> ? T : never,
      )
    ) {
      appContributionInvalid('App contribution badge tone is unsupported.', manifestUrl, {
        field: `${field}.tone`,
        tone: entry.tone,
      });
    }
    return {
      badge_id: normalizeContributionId(entry.badge_id, `${field}.badge_id`, manifestUrl),
      label_i18n: normalizeContributionLocalizedText(entry.label_i18n, `${field}.label_i18n`, manifestUrl),
      data_ref: normalizeContributionRef(entry.data_ref, `${field}.data_ref`, manifestUrl),
      ...(tone === null
        ? {}
        : { tone: tone as 'neutral' | 'info' | 'success' | 'warning' | 'critical' }),
    };
  });

  const ui = contributionRecords(
    value.ui,
    'app_contributions.ui',
    manifestUrl,
  ).map((entry, index) => {
    const field = `app_contributions.ui[${index}]`;
    assertContributionKeys(
      entry,
      [
        'contribution_id',
        'slot',
        'contribution_kind',
        'trust_tier',
        'scope',
        'sort_order',
        'view_id',
        'command_ids',
      ],
      field,
      manifestUrl,
    );
    const slot = stringValue(entry.slot);
    const contributionKind = stringValue(entry.contribution_kind);
    const trustTier = stringValue(entry.trust_tier);
    const scope = stringValue(entry.scope);
    if (!slot || !APP_CONTRIBUTION_UI_SLOTS.has(slot as AgentPackageAppContributionUiSlot)) {
      appContributionInvalid('App UI contribution slot is unsupported.', manifestUrl, {
        field: `${field}.slot`,
        slot: entry.slot,
      });
    }
    if (!contributionKind || !APP_CONTRIBUTION_UI_KINDS.has(contributionKind as 'view' | 'command_group')) {
      appContributionInvalid('App UI contribution kind is unsupported.', manifestUrl, {
        field: `${field}.contribution_kind`,
        contribution_kind: entry.contribution_kind,
      });
    }
    if (!trustTier || !APP_CONTRIBUTION_UI_TRUST_TIERS.has(
      trustTier as 'declarative' | 'trusted_first_party_renderer',
    )) {
      appContributionInvalid('App UI contribution trust tier is unsupported.', manifestUrl, {
        field: `${field}.trust_tier`,
        trust_tier: entry.trust_tier,
      });
    }
    if (!scope || !APP_CONTRIBUTION_UI_SCOPES.has(scope as 'root' | 'work_item')) {
      appContributionInvalid('App UI contribution scope is unsupported.', manifestUrl, {
        field: `${field}.scope`,
        scope: entry.scope,
      });
    }
    const viewId = entry.view_id === undefined
      ? null
      : normalizeContributionId(entry.view_id, `${field}.view_id`, manifestUrl);
    const commandIds = contributionIdList(entry.command_ids, `${field}.command_ids`, manifestUrl);
    if (
      (contributionKind === 'view' && (viewId === null || commandIds.length > 0))
      || (contributionKind === 'command_group' && (viewId !== null || commandIds.length === 0))
    ) {
      appContributionInvalid(
        'App UI view placements require only view_id; command_group placements require only command_ids.',
        manifestUrl,
        { field },
      );
    }
    if (
      entry.sort_order !== undefined
      && (
        !Number.isInteger(entry.sort_order)
        || Number(entry.sort_order) < -10000
        || Number(entry.sort_order) > 10000
      )
    ) {
      appContributionInvalid('App UI contribution sort_order must be a bounded integer.', manifestUrl, {
        field: `${field}.sort_order`,
      });
    }
    return {
      contribution_id: normalizeContributionId(
        entry.contribution_id,
        `${field}.contribution_id`,
        manifestUrl,
      ),
      slot: slot as AgentPackageAppContributionUiSlot,
      contribution_kind: contributionKind as 'view' | 'command_group',
      trust_tier: trustTier as 'declarative' | 'trusted_first_party_renderer',
      scope: scope as 'root' | 'work_item',
      sort_order: entry.sort_order === undefined ? 0 : Number(entry.sort_order),
      ...(viewId === null ? {} : { view_id: viewId }),
      ...(commandIds.length === 0 ? {} : { command_ids: commandIds }),
    };
  });

  assertUniqueContributionIds(
    navigation.map((entry) => entry.navigation_id),
    'app_contributions.navigation.navigation_id',
    manifestUrl,
  );
  assertUniqueContributionIds(
    views.map((entry) => entry.view_id),
    'app_contributions.views.view_id',
    manifestUrl,
  );
  assertUniqueContributionIds(
    commands.map((entry) => entry.command_id),
    'app_contributions.commands.command_id',
    manifestUrl,
  );
  assertUniqueContributionIds(
    badges.map((entry) => entry.badge_id),
    'app_contributions.badges.badge_id',
    manifestUrl,
  );
  assertUniqueContributionIds(
    ui.map((entry) => entry.contribution_id),
    'app_contributions.ui.contribution_id',
    manifestUrl,
  );

  const viewIds = new Set(views.map((entry) => entry.view_id));
  const commandIds = new Set(commands.map((entry) => entry.command_id));
  const badgeIds = new Set(badges.map((entry) => entry.badge_id));
  const missingNavigationViewIds = navigation
    .map((entry) => entry.view_id)
    .filter((viewId) => !viewIds.has(viewId));
  const missingCommandIds = views
    .flatMap((entry) => entry.command_ids)
    .filter((commandId) => !commandIds.has(commandId));
  const missingBadgeIds = views
    .flatMap((entry) => entry.badge_ids)
    .filter((badgeId) => !badgeIds.has(badgeId));
  const missingUiViewIds = ui
    .map((entry) => entry.view_id)
    .filter((viewId): viewId is string => typeof viewId === 'string')
    .filter((viewId) => !viewIds.has(viewId));
  const missingUiCommandIds = ui
    .flatMap((entry) => entry.command_ids ?? [])
    .filter((commandId) => !commandIds.has(commandId));
  if (
    missingNavigationViewIds.length > 0
    || missingCommandIds.length > 0
    || missingBadgeIds.length > 0
    || missingUiViewIds.length > 0
    || missingUiCommandIds.length > 0
  ) {
    appContributionInvalid('App contribution references must resolve inside the contribution.', manifestUrl, {
      missing_view_ids: uniqueStrings(missingNavigationViewIds),
      missing_command_ids: uniqueStrings(missingCommandIds),
      missing_badge_ids: uniqueStrings(missingBadgeIds),
      missing_ui_view_ids: uniqueStrings(missingUiViewIds),
      missing_ui_command_ids: uniqueStrings(missingUiCommandIds),
    });
  }
  if (navigation.length + views.length + commands.length + badges.length + ui.length === 0) {
    appContributionInvalid('app_contributions must expose at least one contribution.', manifestUrl);
  }

  return {
    schema_version: 'opl-app-contributions.v1',
    navigation,
    views,
    commands,
    badges,
    ...(ui.length === 0 ? {} : { ui }),
  };
}
