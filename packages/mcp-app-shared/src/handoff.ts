import type {
  ResolvedViewHandoff,
  ViewHandoffDescriptor,
  ViewRefLike,
} from './types.ts';

function resolveViewId(view: { readonly view_id?: string; readonly id?: string } | null | undefined): string {
  return view?.view_id ?? view?.id ?? '';
}

// Navigation selects an owner view; it never grants a consumer identity or action authority.
export function viewKey(view: ViewRefLike | null | undefined): string {
  if (!view) return '';
  return `${view.package_id}:${resolveViewId(view)}`;
}

export function focusedViewInput(
  view: ViewRefLike | null | undefined,
  focusKey: string,
  input: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
  return viewKey(view) === focusKey ? structuredClone(input || {}) : {};
}

export function ownerReadbackRequest(
  view: ViewRefLike,
  input: Readonly<Record<string, unknown>>,
  result: { readonly readback?: { readonly data_ref?: string; readonly input?: unknown } } | null | undefined,
  views: readonly ViewRefLike[],
): {
  readonly package_id: string;
  readonly ref: string;
  readonly input: Record<string, unknown>;
} {
  const readback = result?.readback;
  const declared = Boolean(
    readback?.data_ref
    && views.some(
      (candidate) =>
        candidate.package_id === view.package_id
        && candidate.data_ref === readback.data_ref,
    ),
  );
  return {
    package_id: view.package_id,
    ref: declared && readback?.data_ref ? readback.data_ref : (view.data_ref ?? ''),
    input: structuredClone(
      declared && readback?.input && typeof readback.input === 'object' && !Array.isArray(readback.input)
        ? (readback.input as Record<string, unknown>)
        : input,
    ),
  };
}

export function resolveViewHandoff<TView extends ViewRefLike>(
  handoff: ViewHandoffDescriptor | null | undefined,
  views: readonly TView[],
): ResolvedViewHandoff<TView> | null {
  if (
    !handoff
    || typeof handoff.input !== 'object'
    || !handoff.input
    || Array.isArray(handoff.input)
  ) {
    return null;
  }
  const targetViewId = resolveViewId(handoff);
  const view = views.find(
    (candidate) =>
      candidate.package_id === handoff.package_id
      && resolveViewId(candidate) === targetViewId,
  );
  return view
    ? {
        view,
        input: structuredClone(handoff.input as Record<string, unknown>),
      }
    : null;
}
