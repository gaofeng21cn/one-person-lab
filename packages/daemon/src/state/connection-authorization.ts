import type { CapabilityDescriptor, ConnectProjection } from '@opl/connect';

function publicCapability(capability: CapabilityDescriptor) {
  return { capability_id: capability.capability_id, label: capability.title, risk: capability.risk };
}

export function projectConnectionAuthorization(projection: ConnectProjection) {
  const connections = projection.connections.map(connection => ({
    ...connection,
    capabilities: connection.capabilities.map(publicCapability),
  }));
  const connectionsById = new Map(connections.map(connection => [connection.connection_id, connection]));
  const grants = projection.grants.map(grant => ({
    ...grant,
    connection: connectionsById.get(grant.connection_id),
    capabilities: [publicCapability({
      capability_id: grant.capability_id, title: grant.capability_title, risk: grant.capability_risk,
    })],
  }));

  // Connect records one grant per capability. The user decides the entire request.
  const requests = new Map<string, {
    request_id: string;
    status: 'requested';
    consumer_package_id: string;
    consumer_display_name: string;
    connection_id: string;
    connection: typeof connections[number] | undefined;
    created_at: string;
    capabilities: ReturnType<typeof publicCapability>[];
  }>();
  for (const grant of grants) {
    if (grant.status !== 'requested') continue;
    const current = requests.get(grant.request_id);
    if (current) {
      current.capabilities.push(...grant.capabilities);
    } else {
      requests.set(grant.request_id, {
        request_id: grant.request_id, status: grant.status,
        consumer_package_id: grant.consumer_package_id, consumer_display_name: grant.consumer_display_name,
        connection_id: grant.connection_id, connection: grant.connection, created_at: grant.created_at,
        capabilities: [...grant.capabilities],
      });
    }
  }
  const consumers = new Map(projection.grants.map(g => [g.consumer_package_id, g.consumer_display_name]));
  return {
    surface_kind: 'opl_connection_authorization_projection.v1',
    connections,
    requests: [...requests.values()],
    grants: grants.filter(grant => grant.status !== 'requested'),
    invocations: projection.invocations.slice(-20).reverse().map(invocation => ({
      ...invocation,
      capability_label: invocation.capability_title,
      consumer_display_name: consumers.get(invocation.consumer_package_id) ?? invocation.consumer_package_id,
      connection_display_name: connectionsById.get(invocation.connection_id)?.display_name ?? invocation.connection_id,
    })),
  };
}
