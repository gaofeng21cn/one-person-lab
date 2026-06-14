import { stringList, uniqueStringList } from './values.ts';

const GUARDED_APPLY_STAGE_ID = 'paper_autonomy/guarded-apply';
const GUARDED_APPLY_DESIRED_DELTA =
  'domain_owner_receipt_quality_gate_or_typed_blocker_required';
const GUARDED_APPLY_ACCEPTED_ANSWER_SHAPES = [
  'domain_owner_receipt_ref',
  'quality_gate_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'route_back_evidence_ref',
];

export function acceptedReturnShapes(...values: unknown[]) {
  const shapes = uniqueStringList(values.flatMap(stringList));
  return shapes.length > 0 ? shapes : ['typed_blocker_ref'];
}

export function guardedApplyAcceptedAnswerShapes(input: {
  stageId: string | null;
  desiredDelta: string | null;
  shapes: string[];
}) {
  if (
    input.stageId !== GUARDED_APPLY_STAGE_ID
    || input.desiredDelta !== GUARDED_APPLY_DESIRED_DELTA
  ) {
    return input.shapes;
  }
  return uniqueStringList([
    ...input.shapes,
    ...GUARDED_APPLY_ACCEPTED_ANSWER_SHAPES,
  ]);
}
