// Navigation selects an owner view; it never grants a consumer identity or action authority.
export function viewKey(view) {
  return view ? `${view.package_id}:${view.view_id}` : '';
}

export function focusedViewInput(view, focusKey, input) {
  return viewKey(view) === focusKey ? structuredClone(input || {}) : {};
}

export function ownerReadbackRequest(view, input, result, views) {
  const readback = result?.readback;
  const declared = views.some(candidate => candidate.package_id === view.package_id && candidate.data_ref === readback?.data_ref);
  return {
    package_id: view.package_id,
    ref: declared ? readback.data_ref : view.data_ref,
    input: structuredClone(declared && readback.input && typeof readback.input === 'object'
      ? readback.input : input),
  };
}


export function resolveViewHandoff(handoff, views) {
  if (!handoff || typeof handoff.input !== 'object' || !handoff.input || Array.isArray(handoff.input)) return null;
  const view = views.find(candidate => candidate.package_id === handoff.package_id && candidate.view_id === handoff.view_id);
  return view ? { view, input: structuredClone(handoff.input) } : null;
}
