import { db } from "@workspace/db";
import {
  accessibilityFeaturesTable,
  locationsTable,
  routeNodesTable,
  routeSegmentsTable,
} from "@workspace/db";

const locations = [
  { id: "main-gate", name: "Main Gate", type: "Entrance", latitude: 12.9717, longitude: 77.5941, accessibilityStatus: "accessible", notes: "Primary campus entrance. Demo sample information; verify on site." },
  { id: "cse-block", name: "CSE Block", type: "Academic building", latitude: 12.9727, longitude: 77.5961, accessibilityStatus: "partial", notes: "East entrance has a ramp in this demo map. Demo sample information; verify on site." },
  { id: "computer-lab", name: "Computer Lab", type: "Laboratory", latitude: 12.9730, longitude: 77.5968, accessibilityStatus: "accessible", notes: "Located inside CSE Block. Demo sample information; verify on site." },
  { id: "library", name: "Library", type: "Study space", latitude: 12.9730, longitude: 77.5952, accessibilityStatus: "accessible", notes: "Main entrance is represented as step-free in this demo. Verify on site." },
  { id: "admin-block", name: "Admin Block", type: "Administration", latitude: 12.9722, longitude: 77.5949, accessibilityStatus: "accessible", notes: "Demo sample information; verify on site." },
  { id: "cafeteria", name: "Cafeteria", type: "Dining", latitude: 12.9734, longitude: 77.5940, accessibilityStatus: "partial", notes: "Demo sample information; verify on site." },
  { id: "auditorium", name: "Auditorium", type: "Events", latitude: 12.9713, longitude: 77.5961, accessibilityStatus: "partial", notes: "Demo sample information; verify on site." },
  { id: "accessible-washroom", name: "Accessible Washroom", type: "Facility", latitude: 12.9728, longitude: 77.5950, accessibilityStatus: "accessible", notes: "Access information is sample data and must be checked on site." },
  { id: "parking", name: "Parking", type: "Transport", latitude: 12.9711, longitude: 77.5936, accessibilityStatus: "accessible", notes: "Demo sample information; verify on site." },
] as const;

const features = [
  { id: "features-main-gate", locationId: "main-gate", stepFreeEntrance: true, rampAvailable: true, elevatorAvailable: false, accessibleWashroom: false, notes: "Step-free entry and curb ramp in the demo record; verify on site." },
  { id: "features-cse", locationId: "cse-block", stepFreeEntrance: true, rampAvailable: true, elevatorAvailable: true, accessibleWashroom: true, notes: "Ramp and elevator shown in the sample campus record; verify availability on site." },
  { id: "features-lab", locationId: "computer-lab", stepFreeEntrance: true, rampAvailable: true, elevatorAvailable: true, accessibleWashroom: false, notes: "Step-free internal connection shown in the sample record; verify on site." },
  { id: "features-library", locationId: "library", stepFreeEntrance: true, rampAvailable: true, elevatorAvailable: true, accessibleWashroom: true, notes: "Sample accessibility listing; verify on site." },
  { id: "features-admin", locationId: "admin-block", stepFreeEntrance: true, rampAvailable: true, elevatorAvailable: true, accessibleWashroom: true, notes: "Sample accessibility listing; verify on site." },
  { id: "features-cafeteria", locationId: "cafeteria", stepFreeEntrance: false, rampAvailable: false, elevatorAvailable: false, accessibleWashroom: false, notes: "Sample accessibility listing; verify on site." },
  { id: "features-auditorium", locationId: "auditorium", stepFreeEntrance: true, rampAvailable: true, elevatorAvailable: false, accessibleWashroom: true, notes: "Sample accessibility listing; verify on site." },
  { id: "features-washroom", locationId: "accessible-washroom", stepFreeEntrance: true, rampAvailable: false, elevatorAvailable: false, accessibleWashroom: true, notes: "This location is itself a washroom. Sample record; verify on site." },
  { id: "features-parking", locationId: "parking", stepFreeEntrance: true, rampAvailable: false, elevatorAvailable: false, accessibleWashroom: false, notes: "Sample accessibility listing; verify on site." },
] as const;

const nodes = [
  ...locations.map((location) => ({
    id: location.id,
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    locationId: location.id,
  })),
  { id: "stair-court", name: "Central Stair Court", latitude: 12.9720, longitude: 77.5955, locationId: null },
  { id: "ramp-link", name: "Accessible Ramp Link", latitude: 12.9725, longitude: 77.5957, locationId: null },
  { id: "south-walk", name: "South Walk", latitude: 12.9714, longitude: 77.5951, locationId: null },
  { id: "north-walk", name: "North Walk", latitude: 12.9732, longitude: 77.5957, locationId: null },
] as const;

const segments = [
  { fromNodeId: "main-gate", toNodeId: "admin-block", distanceMeters: 96, stairs: false, stepFree: true, ramp: true, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free campus path" },
  { fromNodeId: "admin-block", toNodeId: "library", distanceMeters: 112, stairs: false, stepFree: true, ramp: false, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free campus path" },
  { fromNodeId: "library", toNodeId: "ramp-link", distanceMeters: 65, stairs: false, stepFree: true, ramp: false, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free campus path" },
  { fromNodeId: "ramp-link", toNodeId: "cse-block", distanceMeters: 88, stairs: false, stepFree: true, ramp: true, elevator: false, wheelchairSuitable: true, steep: false, surface: "Ramp and paved path", notes: "ramp-accessible path to the CSE Block entrance" },
  { fromNodeId: "cse-block", toNodeId: "computer-lab", distanceMeters: 78, stairs: false, stepFree: true, ramp: true, elevator: true, wheelchairSuitable: true, steep: false, surface: "Paved internal path", notes: "step-free internal path through the CSE Block" },
  { fromNodeId: "main-gate", toNodeId: "stair-court", distanceMeters: 110, stairs: false, stepFree: true, ramp: false, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free campus path" },
  { fromNodeId: "stair-court", toNodeId: "cse-block", distanceMeters: 94, stairs: true, stepFree: false, ramp: false, elevator: false, wheelchairSuitable: false, steep: false, surface: "Stairs", notes: "staircase at the central court; no step-free bypass on this segment" },
  { fromNodeId: "main-gate", toNodeId: "south-walk", distanceMeters: 78, stairs: false, stepFree: true, ramp: false, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free south walk" },
  { fromNodeId: "south-walk", toNodeId: "auditorium", distanceMeters: 118, stairs: false, stepFree: true, ramp: true, elevator: false, wheelchairSuitable: true, steep: false, surface: "Ramp and paved path", notes: "ramp-accessible paved path" },
  { fromNodeId: "auditorium", toNodeId: "cse-block", distanceMeters: 172, stairs: false, stepFree: true, ramp: false, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free campus path" },
  { fromNodeId: "admin-block", toNodeId: "cafeteria", distanceMeters: 142, stairs: false, stepFree: true, ramp: true, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved path with a ramp at the cafeteria approach" },
  { fromNodeId: "cafeteria", toNodeId: "north-walk", distanceMeters: 124, stairs: false, stepFree: true, ramp: false, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free campus path" },
  { fromNodeId: "north-walk", toNodeId: "cse-block", distanceMeters: 112, stairs: false, stepFree: true, ramp: true, elevator: false, wheelchairSuitable: true, steep: false, surface: "Ramp and paved path", notes: "ramp-accessible path to the CSE Block entrance" },
  { fromNodeId: "library", toNodeId: "accessible-washroom", distanceMeters: 52, stairs: false, stepFree: true, ramp: false, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free path to the accessible washroom" },
  { fromNodeId: "main-gate", toNodeId: "parking", distanceMeters: 74, stairs: false, stepFree: true, ramp: false, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved step-free path" },
  { fromNodeId: "parking", toNodeId: "admin-block", distanceMeters: 166, stairs: false, stepFree: true, ramp: true, elevator: false, wheelchairSuitable: true, steep: false, surface: "Paved path", notes: "paved path with ramp at the administration approach" },
] as const;

export async function seedCampus(): Promise<void> {
  await db.insert(locationsTable).values([...locations]).onConflictDoNothing();
  await db.insert(accessibilityFeaturesTable).values([...features]).onConflictDoNothing();
  await db.insert(routeNodesTable).values([...nodes]).onConflictDoNothing();
  const existingSegments = await db.select({ id: routeSegmentsTable.id }).from(routeSegmentsTable).limit(1);
  if (existingSegments.length === 0) {
    await db.insert(routeSegmentsTable).values([...segments]);
  }
}