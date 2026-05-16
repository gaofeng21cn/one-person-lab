export function productionCloseoutActionRouteRefs(
  actions: Array<{
    route_target_kind: string;
    command_or_surface_ref: string;
  }>,
  targetKind: string,
) {
  return [...new Set(actions
    .filter((action) => action.route_target_kind === targetKind)
    .map((action) => action.command_or_surface_ref))];
}
