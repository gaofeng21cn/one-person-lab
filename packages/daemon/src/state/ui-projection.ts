import type { InstalledPackageRecord, OplPackageManifestV2 } from '@opl/pack';

type InstalledUi = Pick<InstalledPackageRecord, 'package_id' | 'enabled' | 'manifest'>;
type Declarations = NonNullable<NonNullable<OplPackageManifestV2['ui']>['declarative']>;
type View = NonNullable<Declarations['views']>[number];
type Form = NonNullable<Declarations['settings_forms']>[number];

function projectSettingsForm(form: Form) {
  return {
    id: form.id,
    slot: 'settings.section' as const,
    view_type: 'settings_form' as const,
    settings_destination: form.destination,
    title: form.title,
    data_ref: form.data_ref,
    sort_order: form.sort_order,
    actions: [{
      id: form.submit_action_ref,
      action_ref: form.submit_action_ref,
      label: { 'en-US': 'Save', 'zh-CN': '保存' },
    }],
  };
}

function projectEntry(packageId: string, view: View | ReturnType<typeof projectSettingsForm>) {
  return {
    contribution_id: view.id,
    contribution_key: `${packageId}:${view.id}`,
    package_id: packageId,
    slot: view.slot,
    scope: view.slot === 'runtime.detail' ? 'work_item' : 'root',
    contribution_kind: 'view',
    trust_tier: 'declarative',
    sort_order: view.sort_order ?? 0,
    view: {
      view_id: view.id,
      view_type: view.view_type,
      title_i18n: view.title,
      data_ref: view.data_ref,
      ...(view.settings_destination ? { settings_destination: view.settings_destination } : {}),
      ...('empty_state' in view && view.empty_state ? { empty_state_i18n: view.empty_state } : {}),
    },
    commands: (view.actions ?? []).map(action => ({
      command_id: action.id,
      action_ref: action.action_ref,
      label_i18n: action.label,
      confirmation_required: 'confirm' in action && action.confirm === true,
    })),
    action_boundary: 'app.action.execute',
  };
}

export function projectUiContributions(packages: readonly InstalledUi[]) {
  const entries = packages.flatMap(pkg => {
    const declarations = pkg.manifest.ui?.declarative;
    if (!pkg.enabled || !declarations) return [];
    const views = [...(declarations.views ?? []), ...(declarations.settings_forms ?? []).map(projectSettingsForm)];
    // Workbench panels remain discoverable in the manifest for their dedicated workspace.
    return views.filter(view => view.slot !== 'workbench.panel').map(view => projectEntry(pkg.package_id, view));
  }).sort((left, right) => left.sort_order - right.sort_order
    || left.package_id.localeCompare(right.package_id)
    || left.contribution_id.localeCompare(right.contribution_id));

  return {
    surface_kind: 'opl_app_ui_contributions_projection.v1',
    contribution_count: entries.length,
    entries,
    slots: {
      'composer.palette': entries.filter(entry => entry.slot === 'composer.palette'),
      'runtime.detail': entries.filter(entry => entry.slot === 'runtime.detail'),
      'settings.section': entries.filter(entry => entry.slot === 'settings.section'),
    },
  };
}
