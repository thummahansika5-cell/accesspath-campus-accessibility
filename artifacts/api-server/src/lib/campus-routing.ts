import type { AccessPreferences } from "./accesspath-ai";

export interface CampusNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  locationId: string | null;
}

export interface CampusSegment {
  id: number;
  fromNodeId: string;
  toNodeId: string;
  distanceMeters: number;
  stairs: boolean;
  stepFree: boolean;
  ramp: boolean;
  elevator: boolean;
  wheelchairSuitable: boolean;
  steep: boolean;
  surface: string;
  notes: string;
}

interface CandidatePath {
  nodeIds: string[];
  segmentIds: number[];
  cost: number;
  distanceMeters: number;
}

function segmentCost(segment: CampusSegment, preferences: AccessPreferences): number {
  if (preferences.avoidStairs && segment.stairs) return Number.POSITIVE_INFINITY;
  if (preferences.wheelchairAccess && !segment.wheelchairSuitable) return Number.POSITIVE_INFINITY;
  if (preferences.avoidSteepPaths && segment.steep) return Number.POSITIVE_INFINITY;

  const distanceFactor =
    preferences.distancePriority === "high"
      ? 1.35
      : preferences.distancePriority === "low"
        ? 0.78
        : 1;
  let cost = segment.distanceMeters * distanceFactor;
  if (preferences.preferStepFree && !segment.stepFree) cost += 300;
  if (preferences.preferElevators && !segment.elevator && segment.stairs) cost += 160;
  if (preferences.wheelchairAccess && !segment.stepFree && !segment.ramp && !segment.elevator) {
    cost += 300;
  }
  if (preferences.needAccessibleWashroom && segment.toNodeId === "accessible-washroom") {
    cost -= 20;
  }
  return cost;
}

export function findCandidatePaths(
  startNodeId: string,
  destinationNodeId: string,
  nodes: CampusNode[],
  segments: CampusSegment[],
  preferences: AccessPreferences,
  limit = 3,
): CandidatePath[] {
  const adjacency = new Map<string, Array<{ segment: CampusSegment; otherNodeId: string }>>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const segment of segments) {
    adjacency.get(segment.fromNodeId)?.push({ segment, otherNodeId: segment.toNodeId });
    adjacency.get(segment.toNodeId)?.push({ segment, otherNodeId: segment.fromNodeId });
  }

  const open: CandidatePath[] = [
    { nodeIds: [startNodeId], segmentIds: [], cost: 0, distanceMeters: 0 },
  ];
  const complete: CandidatePath[] = [];
  let expanded = 0;
  while (open.length > 0 && complete.length < limit && expanded < 20_000) {
    open.sort((left, right) => left.cost - right.cost);
    const current = open.shift();
    if (!current) break;
    const currentNodeId = current.nodeIds[current.nodeIds.length - 1];
    if (currentNodeId === destinationNodeId) {
      complete.push(current);
      continue;
    }
    expanded += 1;
    for (const edge of adjacency.get(currentNodeId) ?? []) {
      if (current.nodeIds.includes(edge.otherNodeId)) continue;
      const cost = segmentCost(edge.segment, preferences);
      if (!Number.isFinite(cost)) continue;
      open.push({
        nodeIds: [...current.nodeIds, edge.otherNodeId],
        segmentIds: [...current.segmentIds, edge.segment.id],
        cost: current.cost + cost,
        distanceMeters: current.distanceMeters + edge.segment.distanceMeters,
      });
    }
  }
  return complete;
}

export function demoRouteInstructions(pointNames: string[], facts: string[], avoidStairs: boolean): string {
  const steps = pointNames.slice(1).map((name, index) => {
    const fact = facts[index];
    return fact
      ? `Continue to ${name} using the ${fact}.`
      : `Continue to ${name} along the mapped campus path.`;
  });
  return [
    `Start at ${pointNames[0]}.`,
    ...steps,
    avoidStairs
      ? "This route avoids stair segments in the campus route data."
      : "Follow the mapped campus route and check the on-site access information before you travel.",
    "Campus locations and access details are demo data; verify conditions on site.",
  ].join(" ");
}