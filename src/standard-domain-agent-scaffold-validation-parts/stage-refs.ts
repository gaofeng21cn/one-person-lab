import { isPlainRecord, readOptionalString, readRecordArray, refValues } from './shared.ts';
import { readStageAgentRefStatus } from './pack-files.ts';

function refIncludesRepoPack(refs: unknown, prefix: string) {
  return refValues(refs).some((value) => value.startsWith(prefix));
}

export function validateStageRefs(repoDir: string, stageControlPlane: unknown, enforceToolAffordanceBoundary: boolean) {
  const stages = isPlainRecord(stageControlPlane) ? readRecordArray(stageControlPlane.stages) : [];
  const stageStatuses = stages.map((stage) => {
    const stageId = readOptionalString(stage.stage_id) ?? 'unknown_stage';
    const checks = [
      {
        field: 'prompt_refs',
        status: refIncludesRepoPack(stage.prompt_refs, 'agent/prompts/') ? 'ok' : 'missing_agent_prompt_ref',
      },
      {
        field: 'skills',
        status: refValues(stage.skills).length > 0 ? 'ok' : 'missing_skill_ref',
      },
      {
        field: 'tool_refs',
        status: refIncludesRepoPack(stage.tool_refs, 'agent/tools/') ? 'ok' : 'missing_agent_tool_ref',
      },
      {
        field: 'knowledge_refs',
        status: refIncludesRepoPack(stage.knowledge_refs, 'agent/knowledge/') ? 'ok' : 'missing_agent_knowledge_ref',
      },
      {
        field: 'evaluation',
        status: refIncludesRepoPack(stage.evaluation, 'agent/quality_gates/') ? 'ok' : 'missing_agent_quality_gate_ref',
      },
    ];
    const referencedAgentFiles = [
      ...refValues(stage.prompt_refs),
      ...refValues(stage.skills),
      ...refValues(stage.tool_refs),
      ...refValues(stage.knowledge_refs),
      ...refValues(stage.evaluation),
      ...refValues(stage.source_refs),
    ].filter((value) => value.startsWith('agent/'));
    const fileStatuses = [...new Set(referencedAgentFiles)]
      .map((item) => readStageAgentRefStatus(repoDir, item));
    const checkFindings = checks
      .filter((check) => check.status !== 'ok')
      .map((check) => `stage_missing_${check.field}:${stageId}:${check.status}`);
    const toolCheckFindings = checkFindings.filter((item) =>
      item.startsWith(`stage_missing_tool_refs:${stageId}:`)
    );
    const nonToolCheckFindings = checkFindings.filter((item) =>
      !item.startsWith(`stage_missing_tool_refs:${stageId}:`)
    );
    const fileFindings = fileStatuses
      .filter((item) => item.status !== 'ok')
      .map((item) => `stage_invalid_agent_ref:${stageId}:${item.path}:${item.status}`);
    return {
      stage_id: stageId,
      checks,
      referenced_agent_files: referencedAgentFiles,
      file_status: fileStatuses,
      blockers: [
        ...nonToolCheckFindings,
        ...(enforceToolAffordanceBoundary ? toolCheckFindings : []),
        ...fileFindings,
      ],
      advisory_findings: enforceToolAffordanceBoundary ? [] : toolCheckFindings,
    };
  });
  return {
    stage_count: stages.length,
    stage_statuses: stageStatuses,
    blockers: [
      stages.length > 0 ? null : 'missing_stage_control_plane_stages',
      ...stageStatuses.flatMap((stage) => stage.blockers),
    ].filter((entry): entry is string => Boolean(entry)),
    advisory_findings: stageStatuses.flatMap((stage) => stage.advisory_findings),
  };
}
