import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { recordList, stringValue } from '../../../kernel/json-record.ts';
import { assertStringValue, uniqueStrings } from './shared.ts';
import type { AgentPackagePresentation } from './types.ts';

const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const HOME_SHORTCUT_ICON_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;
const PACKAGE_ICON_REF_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.(?:svg|png|webp)$/i;

function normalizeLocalizedText(
  value: unknown,
  field: string,
  manifestUrl: string,
) {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package presentation localized text must be a non-empty locale map.', {
      manifest_url: manifestUrl,
      field,
      failure_code: 'agent_package_presentation_invalid',
    });
  }
  const localized = Object.entries(value).map(([locale, text]) => {
    const normalizedText = stringValue(text);
    if (!LOCALE_ID_PATTERN.test(locale) || !normalizedText) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package presentation locale or localized text is invalid.', {
        manifest_url: manifestUrl,
        field,
        locale,
        failure_code: 'agent_package_presentation_invalid',
      });
    }
    return [locale, normalizedText] as const;
  });
  return Object.fromEntries(localized);
}

export function normalizePresentation(
  value: unknown,
  manifestUrl: string,
): AgentPackagePresentation | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.home_shortcuts)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package presentation must declare home_shortcuts.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_presentation_invalid',
    });
  }
  const softwareType = value.software_type;
  if (softwareType !== undefined && (typeof softwareType !== 'string'
    || !['agent', 'application', 'capability'].includes(softwareType))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package software type must be agent, application, or capability.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_presentation_invalid',
    });
  }
  const iconRef = value.icon_ref;
  if (iconRef !== undefined && (typeof iconRef !== 'string' || !PACKAGE_ICON_REF_PATTERN.test(iconRef))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package presentation icon_ref must be a relative SVG, PNG, or WebP asset path.', {
      manifest_url: manifestUrl,
      field: 'presentation.icon_ref',
      failure_code: 'agent_package_presentation_icon_invalid',
    });
  }
  const rawShortcuts = recordList(value.home_shortcuts);
  if (rawShortcuts.length !== value.home_shortcuts.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package presentation shortcuts must be objects.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_presentation_invalid',
    });
  }
  const homeShortcuts = rawShortcuts.map((entry, index) => {
    const shortcutId = assertStringValue(entry.shortcut_id, `presentation.home_shortcuts[${index}].shortcut_id`);
    if (typeof entry.default_visible !== 'boolean' || typeof entry.user_configurable !== 'boolean' || !isRecord(entry.route)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package presentation shortcut flags and route are invalid.', {
        manifest_url: manifestUrl,
        shortcut_id: shortcutId,
        failure_code: 'agent_package_presentation_invalid',
      });
    }
    if (entry.route.route_kind !== 'agent_package_shortcut' || entry.route.executor !== 'codex_cli') {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package presentation route must use the generic Codex CLI shortcut route.', {
        manifest_url: manifestUrl,
        shortcut_id: shortcutId,
        failure_code: 'agent_package_presentation_invalid',
      });
    }
    return {
      shortcut_id: shortcutId,
      ...(entry.icon_id === undefined
        ? {}
        : {
            icon_id: (() => {
              const iconId = stringValue(entry.icon_id);
              if (
                !iconId
                || iconId.length > 128
                || !HOME_SHORTCUT_ICON_ID_PATTERN.test(iconId)
              ) {
                throw new FrameworkContractError(
                  'contract_shape_invalid',
                  'Agent package presentation shortcut icon id is invalid.',
                  {
                    manifest_url: manifestUrl,
                    shortcut_id: shortcutId,
                    field: `presentation.home_shortcuts[${index}].icon_id`,
                    value: entry.icon_id,
                    failure_code: 'agent_package_presentation_invalid',
                  },
                );
              }
              return iconId;
            })(),
          }),
      label_i18n: normalizeLocalizedText(entry.label_i18n, `presentation.home_shortcuts[${index}].label_i18n`, manifestUrl),
      default_visible: entry.default_visible,
      user_configurable: entry.user_configurable,
      route: {
        route_kind: 'agent_package_shortcut' as const,
        executor: 'codex_cli' as const,
        codex_visible_entry: assertStringValue(
          entry.route.codex_visible_entry,
          `presentation.home_shortcuts[${index}].route.codex_visible_entry`,
        ),
      },
    };
  });
  const duplicateShortcutIds = homeShortcuts
    .map((entry) => entry.shortcut_id)
    .filter((shortcutId, index, values) => values.indexOf(shortcutId) !== index);
  if (duplicateShortcutIds.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package presentation shortcut ids must be unique.', {
      manifest_url: manifestUrl,
      duplicate_shortcut_ids: uniqueStrings(duplicateShortcutIds),
      failure_code: 'agent_package_presentation_invalid',
    });
  }
  return {
    ...(softwareType ? { software_type: softwareType as 'agent' | 'application' | 'capability' } : {}),
    ...(iconRef !== undefined ? { icon_ref: iconRef as string } : {}),
    display_name_i18n: normalizeLocalizedText(value.display_name_i18n, 'presentation.display_name_i18n', manifestUrl),
    description_i18n: normalizeLocalizedText(value.description_i18n, 'presentation.description_i18n', manifestUrl),
    session_routing_summary_i18n: normalizeLocalizedText(
      value.session_routing_summary_i18n,
      'presentation.session_routing_summary_i18n',
      manifestUrl,
    ),
    home_shortcuts: homeShortcuts,
  };
}
