import { isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../kernel/json-record.ts';

export const APP_UI_CONTRIBUTION_SLOTS = [
  'composer.palette',
  'runtime.detail',
  'settings.section',
] as const;

type AppUiContributionSlot = typeof APP_UI_CONTRIBUTION_SLOTS[number];

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function enabledInstalledPackage(status: JsonRecord) {
  return status.app_enabled !== false
    && isRecord(status.presence)
    && status.presence.installed === true
    && (!isRecord(status.capability_exposure) || status.capability_exposure.status !== 'disabled');
}

export function buildAppUiContributionsProjection(
  packageStatusById: Record<string, JsonRecord>,
  options: Readonly<{ actionRoute?: string }> = {},
) {
  const actionRoute = options.actionRoute ?? 'opl app action execute --json';
  const entries = Object.entries(packageStatusById).flatMap(([packageId, status]) => {
    if (!enabledInstalledPackage(status) || !isRecord(status.app_contributions)) return [];
    const descriptor = status.app_contributions;
    const views = new Map(recordArray(descriptor.views).map((view) => [view.view_id, view]));
    const commands = new Map(recordArray(descriptor.commands).map((command) => [command.command_id, command]));
    const badges = new Map(recordArray(descriptor.badges).map((badge) => [badge.badge_id, badge]));

    return recordArray(descriptor.ui).flatMap((placement) => {
      const contributionId = typeof placement.contribution_id === 'string'
        ? placement.contribution_id
        : null;
      const slot = typeof placement.slot === 'string'
        && APP_UI_CONTRIBUTION_SLOTS.includes(placement.slot as AppUiContributionSlot)
        ? placement.slot as AppUiContributionSlot
        : null;
      if (!contributionId || !slot) return [];

      const view = typeof placement.view_id === 'string'
        ? views.get(placement.view_id) ?? null
        : null;
      const commandIds = Array.isArray(placement.command_ids)
        ? placement.command_ids.filter((entry): entry is string => typeof entry === 'string')
        : view && Array.isArray(view.command_ids)
          ? view.command_ids.filter((entry): entry is string => typeof entry === 'string')
          : [];
      const resolvedCommands = commandIds
        .map((commandId) => commands.get(commandId))
        .filter(isRecord);
      const resolvedBadges = view && Array.isArray(view.badge_ids)
        ? view.badge_ids.map((badgeId) => badges.get(badgeId)).filter(isRecord)
        : [];

      return [{
        contribution_key: `${packageId}:${contributionId}`,
        contribution_id: contributionId,
        package_id: packageId,
        slot,
        contribution_kind: placement.contribution_kind,
        trust_tier: placement.trust_tier,
        scope: placement.scope,
        sort_order: typeof placement.sort_order === 'number' ? placement.sort_order : 0,
        descriptor_schema_version: descriptor.schema_version,
        view,
        commands: resolvedCommands,
        badges: resolvedBadges,
        action_boundary: actionRoute,
      } satisfies JsonRecord];
    });
  }).sort((left, right) =>
    Number(left.sort_order) - Number(right.sort_order)
    || String(left.package_id).localeCompare(String(right.package_id))
    || String(left.contribution_id).localeCompare(String(right.contribution_id)));

  const slots = Object.fromEntries(APP_UI_CONTRIBUTION_SLOTS.map((slot) => [
    slot,
    entries.filter((entry) => entry.slot === slot),
  ]));

  return {
    surface_kind: 'opl_app_ui_contributions_projection.v1',
    contribution_count: entries.length,
    source_ref: 'app_state.agent_packages.status_index.packages[*].app_contributions.ui',
    slots,
    entries,
    composition_policy: {
      order: 'sort_order_then_package_id_then_contribution_id',
      identity: 'package_id_colon_contribution_id',
      unknown_kind: 'render_local_fallback_without_disabling_other_contributions',
      removal: 'remove_immediately_when_package_is_disabled_uninstalled_or_disabled_in_app',
    },
    authority_boundary: {
      package_truth_owner: 'installed_package_descriptor_via_framework',
      gui_role: 'declarative_projection_renderer_only',
      arbitrary_code_allowed: false,
      arbitrary_html_allowed: false,
      arbitrary_url_allowed: false,
      direct_domain_mutation_allowed: false,
      action_route: actionRoute,
    },
  };
}
