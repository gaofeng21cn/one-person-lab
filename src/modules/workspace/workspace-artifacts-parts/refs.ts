import {
  OPL_GENERATED_PROJECTIONS_ROOT,
  OPL_GENERATED_REPORTS_ROOT,
} from '../workspace-topology.ts';

export const WORKSPACE_MAP_REF = 'workspace_map.json';
export const WORKSPACE_HEALTH_REF = 'workspace_health.json';
export const WORKSPACE_INSPECTION_REF = 'workspace_inspection.json';
export const WORKSPACE_RESOURCE_INVENTORY_REF = 'workspace_resource_inventory.json';
export const WORKSPACE_REPORT_REF = 'workspace_report.json';
export const GENERATED_WORKSPACE_MAP_REF = `${OPL_GENERATED_PROJECTIONS_ROOT}/${WORKSPACE_MAP_REF}`;
export const GENERATED_WORKSPACE_HEALTH_REF = `${OPL_GENERATED_PROJECTIONS_ROOT}/${WORKSPACE_HEALTH_REF}`;
export const GENERATED_WORKSPACE_INSPECTION_REF = `${OPL_GENERATED_PROJECTIONS_ROOT}/${WORKSPACE_INSPECTION_REF}`;
export const GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF = `${OPL_GENERATED_PROJECTIONS_ROOT}/${WORKSPACE_RESOURCE_INVENTORY_REF}`;
export const GENERATED_WORKSPACE_REPORT_REF = `${OPL_GENERATED_REPORTS_ROOT}/${WORKSPACE_REPORT_REF}`;
export const PROJECT_CONFIG_BASENAME = 'project.yaml';
export const PROJECT_INDEX_BASENAME = 'project_index.json';
export const SHARED_RESOURCE_MANIFEST_BASENAME = 'opl_resource_manifest.json';
export const STAGE_OUTPUTS_MANIFEST_BASENAME = 'opl_stage_outputs_manifest.json';
export const STAGE_OUTPUTS_INDEX_BASENAME = 'stage_outputs_index.json';
export const CURRENT_STAGE_POINTER_BASENAME = 'current_stage.json';
export const STAGE_OUTPUT_REQUIRED_DIRECTORIES = [
  'inputs',
  'outputs',
  'review',
  'receipts',
  'handoff',
] as const;
export const STAGE_OUTPUT_REQUIRED_FILES = [
  'stage_manifest.json',
] as const;
export const STAGE_LIFECYCLE_STATUSES = [
  'open',
  'active',
  'completed',
  'blocked',
  'superseded',
  'archived',
] as const;

export const WORKSPACE_PROJECT_LIFECYCLE_STATUSES = [
  'active',
  'paused',
  'archived',
  'superseded',
  'locked',
] as const;

export function stageOutputsIndexRef(stageOutputsRootRef: string) {
  return `${stageOutputsRootRef}/${STAGE_OUTPUTS_INDEX_BASENAME}`;
}

export function currentStagePointerRef(stageOutputsRootRef: string) {
  return `${stageOutputsRootRef}/${CURRENT_STAGE_POINTER_BASENAME}`;
}

export function sharedResourceManifestRef(resourcePath: string) {
  return `${resourcePath}/${SHARED_RESOURCE_MANIFEST_BASENAME}`;
}

export function stageOutputsManifestRef(stageOutputsRootRef: string) {
  return `${stageOutputsRootRef}/${STAGE_OUTPUTS_MANIFEST_BASENAME}`;
}
