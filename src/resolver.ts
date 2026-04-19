import { findDomainOrThrow, findWorkstreamOrThrow } from './contracts.ts';
import type {
  BoundaryExplanation,
  GatewayContracts,
  ResolveRequestInput,
  ResolutionResult,
} from './types.ts';

type CandidateKind = 'grant_ops' | 'thesis_ops' | 'review_ops';

const RESEARCH_KEYWORDS = [
  'research',
  'manuscript',
  'submission',
  'journal',
  'study',
  'dataset',
  'data governance',
];

const PRESENTATION_KEYWORDS = [
  'presentation',
  'slide',
  'deck',
  'slides',
  'lecture',
  'committee',
  'speaker notes',
  'ppt',
];

const GRANT_KEYWORDS = ['grant', 'proposal'];
const THESIS_KEYWORDS = ['thesis', 'chapter', 'defense preparation'];
const REVIEW_KEYWORDS = ['peer review', 'reviewer', 'rebuttal', 'revision route'];

function normalizedText(input: ResolveRequestInput): string {
  return [
    input.intent,
    input.target,
    input.goal,
    input.preferredFamily ?? '',
    input.requestKind ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectCandidateWorkstream(text: string): CandidateKind | null {
  if (hasKeyword(text, GRANT_KEYWORDS)) {
    return 'grant_ops';
  }

  if (hasKeyword(text, THESIS_KEYWORDS) && !hasKeyword(text, ['slide deck', 'deck', 'slides', 'ppt'])) {
    return 'thesis_ops';
  }

  if (hasKeyword(text, REVIEW_KEYWORDS)) {
    return 'review_ops';
  }

  return null;
}

function requestKind(input: ResolveRequestInput): string {
  return input.requestKind ?? 'discover';
}

export function resolveRequestSurface(
  input: ResolveRequestInput,
  contracts: GatewayContracts,
): ResolutionResult {
  const text = normalizedText(input);
  const preferredFamily = input.preferredFamily?.toLowerCase() ?? null;
  const research = hasKeyword(text, RESEARCH_KEYWORDS);
  const presentation =
    preferredFamily === 'ppt_deck' || hasKeyword(text, PRESENTATION_KEYWORDS);
  const xiaohongshu = preferredFamily === 'xiaohongshu' || text.includes('xiaohongshu');
  const candidateWorkstream = detectCandidateWorkstream(text);

  if (preferredFamily === 'ppt_deck') {
    const workstream = findWorkstreamOrThrow(contracts, 'presentation_ops');
    return {
      status: 'routed',
      request_kind: requestKind(input),
      workstream_id: workstream.workstream_id,
      domain_id: workstream.domain_id,
      entry_surface: 'domain_gateway',
      recommended_family: 'ppt_deck',
      confidence: 'high',
      reason:
        'ppt_deck is a direct top-level family map to Presentation Foundry and must stay inside the RedCube gateway.',
      routing_evidence: [
        'preferred_family=ppt_deck',
        'ppt_deck direct map to presentation_ops',
        'domain gateway entry only',
      ],
    };
  }

  if (xiaohongshu && !presentation) {
    const specialCase = contracts.routingVocabulary.special_cases.find(
      (entry) => entry.family === 'xiaohongshu',
    );

    return {
      status: 'domain_boundary',
      request_kind: requestKind(input),
      domain_id: specialCase?.domain_id ?? 'redcube',
      workstream_id: null,
      recommended_family: 'xiaohongshu',
      reason:
        'xiaohongshu stays at the RedCube family boundary and is not automatically equal to Presentation Foundry without explicit presentation-delivery semantics.',
      routing_evidence: [
        'preferred_family=xiaohongshu',
        'redcube family boundary',
        'presentation_ops auto-mapping withheld',
      ],
    };
  }

  if (candidateWorkstream) {
    if (candidateWorkstream === 'grant_ops') {
      const workstream = findWorkstreamOrThrow(contracts, 'grant_ops');
      return {
        status: 'routed',
        request_kind: requestKind(input),
        workstream_id: workstream.workstream_id,
        domain_id: workstream.domain_id,
        entry_surface: 'domain_gateway',
        recommended_family: null,
        confidence: 'high',
        reason:
          'The requested output is a formal grant-authoring delivery owned by Grant Ops inside the MedAutoGrant gateway.',
        routing_evidence: [
          'grant delivery semantics',
          'grant_ops registered ownership',
          'domain gateway entry only',
        ],
      };
    }

    return {
      status: 'unknown_domain',
      request_kind: requestKind(input),
      candidate_workstream_id: candidateWorkstream,
      reason:
        `${candidateWorkstream} semantics are recognizable, but that workstream remains under definition and has no admitted domain gateway yet.`,
      routing_evidence: [
        `candidate_workstream=${candidateWorkstream}`,
        'under_definition workstream',
        'no registered domain owner',
      ],
    };
  }

  if (research && presentation) {
    return {
      status: 'ambiguous_task',
      request_kind: requestKind(input),
      candidate_workstreams: ['research_ops', 'presentation_ops'],
      candidate_domains: ['medautoscience', 'redcube'],
      reason:
        'The request mixes research-submission and presentation-delivery semantics without a single primary deliverable.',
      routing_evidence: [
        'research delivery semantics',
        'presentation delivery semantics',
        'missing primary deliverable',
      ],
      required_clarification: [
        'Is the primary goal a formal research deliverable or a presentation deliverable?',
        'If visual delivery is primary, should the family be ppt_deck or another RedCube family?',
      ],
    };
  }

  if (research) {
    const workstream = findWorkstreamOrThrow(contracts, 'research_ops');
    return {
      status: 'routed',
      request_kind: requestKind(input),
      workstream_id: workstream.workstream_id,
      domain_id: workstream.domain_id,
      entry_surface: 'domain_gateway',
      recommended_family: null,
      confidence: 'high',
      reason:
        'The requested output is a formal research delivery owned by Research Foundry inside the MedAutoScience gateway.',
      routing_evidence: [
        'research delivery semantics',
        'research_ops registered ownership',
        'domain gateway entry only',
      ],
    };
  }

  if (presentation) {
    const workstream = findWorkstreamOrThrow(contracts, 'presentation_ops');
    return {
      status: 'routed',
      request_kind: requestKind(input),
      workstream_id: workstream.workstream_id,
      domain_id: workstream.domain_id,
      entry_surface: 'domain_gateway',
      recommended_family: preferredFamily ?? 'ppt_deck',
      confidence: preferredFamily ? 'high' : 'medium',
      reason:
        'The requested output is a visual deliverable owned by Presentation Foundry inside the RedCube gateway.',
      routing_evidence: [
        'presentation delivery semantics',
        'presentation_ops registered ownership',
        'visual deliverable boundary',
      ],
    };
  }

  if (xiaohongshu) {
    return {
      status: 'domain_boundary',
      request_kind: requestKind(input),
      domain_id: 'redcube',
      workstream_id: null,
      recommended_family: 'xiaohongshu',
      reason:
        'xiaohongshu stays discoverable through RedCube AI, but it does not automatically become Presentation Foundry.',
      routing_evidence: [
        'xiaohongshu family signal',
        'redcube ownership',
        'presentation_ops auto-mapping withheld',
      ],
    };
  }

  return {
    status: 'ambiguous_task',
    request_kind: requestKind(input),
    candidate_workstreams: [],
    candidate_domains: [],
    reason:
      'The request does not contain enough top-level routing evidence to resolve a workstream or domain safely.',
    routing_evidence: ['insufficient routing evidence'],
    required_clarification: [
      'What is the primary deliverable you want OPL to route?',
      'Should OPL prefer a research deliverable, a presentation deliverable, or another explicit family boundary?',
    ],
  };
}

export function explainDomainBoundary(
  input: ResolveRequestInput,
  contracts: GatewayContracts,
): BoundaryExplanation {
  const resolution = resolveRequestSurface(input, contracts);
  const summary = input.goal;

  switch (resolution.status) {
    case 'routed':
      if (resolution.workstream_id === 'grant_ops') {
        return {
          request_summary: summary,
          boundary_status: resolution.status,
          boundary_evidence: resolution.routing_evidence,
          resolved_domain: 'medautogrant',
          resolved_workstream_id: 'grant_ops',
          reason:
            'The primary output is a formal grant-authoring delivery, so the request belongs to the MedAutoGrant gateway.',
          rejected_domains: [
            {
              domain_id: 'medautoscience',
              reason:
                'Research evidence can support a grant, but the requested deliverable is a grant-authoring output.',
            },
            {
              domain_id: 'redcube',
              reason:
                'Presentation artifacts can support the proposal later, while the current deliverable is still grant authoring.',
            },
          ],
        };
      }

      if (resolution.workstream_id === 'research_ops') {
        return {
          request_summary: summary,
          boundary_status: resolution.status,
          boundary_evidence: resolution.routing_evidence,
          resolved_domain: 'medautoscience',
          resolved_workstream_id: 'research_ops',
          reason:
            'The primary output is a formal research delivery, so the request belongs to the MedAutoScience gateway rather than the visual-deliverable lane.',
          rejected_domains: [
            {
              domain_id: 'redcube',
              reason:
                'RedCube may visualize research outputs later, but the requested deliverable here is not a visual presentation artifact.',
            },
          ],
        };
      }

      return {
        request_summary: summary,
        boundary_status: resolution.status,
        boundary_evidence: resolution.routing_evidence,
        resolved_domain: 'redcube',
        resolved_workstream_id: 'presentation_ops',
        reason:
          'The requested output is a visual deliverable, so the request belongs to RedCube AI rather than the Research Foundry execution lane.',
        rejected_domains: [
          {
            domain_id: 'medautoscience',
            reason:
              'Research evidence may feed the task, but the requested output is a visual deliverable rather than a research runtime deliverable.',
          },
        ],
      };

    case 'domain_boundary':
      return {
        request_summary: summary,
        boundary_status: resolution.status,
        boundary_evidence: resolution.routing_evidence,
        resolved_domain: resolution.domain_id,
        resolved_workstream_id: null,
        reason:
          'xiaohongshu is a RedCube-owned family boundary, but it is not automatically equal Presentation Foundry until the request explicitly becomes a presentation deliverable.',
        rejected_domains: [
          {
            domain_id: 'medautoscience',
            reason:
              'The request is not asking for a formal research delivery owned by MedAutoScience.',
          },
        ],
      };

    case 'unknown_domain':
      return {
        request_summary: summary,
        boundary_status: resolution.status,
        boundary_evidence: resolution.routing_evidence,
        resolved_domain: null,
        resolved_workstream_id: null,
        candidate_workstream_id: resolution.candidate_workstream_id,
        reason:
          `${resolution.candidate_workstream_id} remains under definition, so OPL may describe the boundary but cannot hand the request to an admitted domain yet.`,
        rejected_domains: [
          {
            domain_id: 'medautoscience',
            reason:
              'The current request does not match the frozen Research Foundry boundary.',
          },
          {
            domain_id: 'redcube',
            reason:
              'The current request does not match the frozen Presentation Foundry boundary.',
          },
        ],
      };

    case 'ambiguous_task':
      return {
        request_summary: summary,
        boundary_status: resolution.status,
        boundary_evidence: resolution.routing_evidence,
        resolved_domain: null,
        resolved_workstream_id: null,
        candidate_workstreams: resolution.candidate_workstreams,
        candidate_domains: resolution.candidate_domains,
        reason:
          'The request combines multiple top-level semantics, so OPL must stop before inventing a single domain owner.',
        required_clarification: resolution.required_clarification,
        rejected_domains: [
          {
            domain_id: 'medautoscience',
            reason:
              'Research semantics are present, but not as a single unambiguous primary deliverable.',
          },
          {
            domain_id: 'redcube',
            reason:
              'Presentation semantics are present, but not as a single unambiguous primary deliverable.',
          },
        ],
      };
  }
}

export function describeWorkstreamBoundary(
  contracts: GatewayContracts,
  workstreamId: string,
) {
  return findWorkstreamOrThrow(contracts, workstreamId);
}

export function describeDomainBoundary(
  contracts: GatewayContracts,
  domainId: string,
) {
  return findDomainOrThrow(contracts, domainId);
}
