import {
  assert,
  test,
} from '../helpers.ts';
import {
  buildRuntimeVisualizationProjection,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/runtime-visualization-projection.ts';
import {
  familyRuntimeCommandDomainId,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/stage-production-evidence-route-common.ts';

test('runtime tray app drilldown keeps domain ids as generic visualization labels', () => {
  const projection = buildRuntimeVisualizationProjection({
    attempts: [
      {
        domain_id: 'medautoscience',
        stage_id: 'write',
        stage_attempt_id: 'attempt-domain-label',
        task_id: 'task-domain-label',
        status: 'running',
      },
    ],
    routeRefs: [],
    decisionRefs: [],
    artifactRefs: [],
    packageLifecycle: {},
    memoryRefs: {},
    qualityRefs: {},
    actionRefs: [],
    ownerReceipts: [],
    typedBlockers: {},
    domainProjectionIngestion: {},
    routeTransitionDrilldown: {},
    stageProductionEvidence: {},
    domainDispatchEvidence: {},
    safeActions: [],
  });

  assert.equal(projection.runtime_workbench.task_drilldowns[0].domain_label, 'medautoscience');
  assert.equal(projection.runtime_workbench.task_drilldowns[0].title, 'medautoscience write');
});

test('runtime tray app drilldown resolves stage route domains from registry aliases', () => {
  assert.equal(familyRuntimeCommandDomainId('mas', null), 'medautoscience');
  assert.equal(familyRuntimeCommandDomainId(null, 'redcube-ai'), 'redcube');
  assert.equal(familyRuntimeCommandDomainId('custom-agent', null), null);
});
