import { assert, fs, parseJsonText, path, test } from '../../helpers.ts';

test('public surface index declares app state as the GUI runtime boundary', () => {
  const contracts = parseJsonText(
    fs.readFileSync(
      path.join(process.cwd(), 'contracts', 'opl-framework', 'public-surface-index.json'),
      'utf8',
    ),
  ) as any;
  const appWorkbench = contracts.surfaces.find(
    (entry: { surface_id: string }) => entry.surface_id === 'one_person_lab_app_workbench',
  );

  assert.ok(appWorkbench);
  assert.equal(
    appWorkbench.refs.some(
      (ref: { ref_kind: string; ref: string }) =>
        ref.ref_kind === 'machine_cli' && ref.ref === 'opl app state --profile fast --json',
    ),
    true,
  );
  assert.equal(
    appWorkbench.refs.some(
      (ref: { ref_kind: string; ref: string }) =>
        ref.ref_kind === 'machine_cli' && ref.ref === 'opl app state --profile full --json',
    ),
    true,
  );
  assert.equal(
    appWorkbench.refs.some(
      (ref: { ref_kind: string; ref: string }) =>
        ref.ref_kind === 'machine_cli' && ref.ref === 'opl app action execute --json',
    ),
    true,
  );
  assert.equal(
    appWorkbench.notes.some(
      (note: string) => note.includes('GUI-ready state/action producer only'),
    ),
    true,
  );
  assert.equal(
    appWorkbench.notes.some(
      (note: string) => note.includes('must not be used as normal GUI page state'),
    ),
    true,
  );
});
