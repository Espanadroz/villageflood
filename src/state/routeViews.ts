import { rankRoutes, routeStatus, type RouteDef, type RouteStatus } from '../core/routes';
import type { VehicleClass } from '../core/types';
import type { DestinationRow, Snapshot } from '../data/types';
import { derive } from './derive';

export interface RouteView { route: RouteDef; status: RouteStatus; destination: DestinationRow | undefined; blockedNames: string[]; unknownNames: string[] }

export function routeViews(s: Snapshot, now: number, vehicle: VehicleClass, destinationId: string | null): RouteView[] {
  const { segmentStates } = derive(s, now);
  const name = (id: string) => s.segments.find((x) => x.id === id)?.name ?? id;
  const items = s.routes
    .filter((r) => destinationId === null || r.destinationId === destinationId)
    .map((route) => {
      const status = routeStatus(route, segmentStates, vehicle);
      return { route, status, destination: s.destinations.find((d) => d.id === route.destinationId),
        blockedNames: status.blockedSegmentIds.map(name), unknownNames: status.unknownSegmentIds.map(name) };
    });
  return rankRoutes(items);
}

export const recommended = (views: RouteView[]): RouteView | null => views.find((v) => v.status.state === 'ok') ?? null;
