import { randomUUID, createHmac } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  accessibilityFeaturesTable,
  accessibilityReportsTable,
  db,
  locationsTable,
  routeNodesTable,
  routeSegmentsTable,
  usersTable,
} from "@workspace/db";
import {
  CreateReportBody,
  CreateReportResponse,
  FindRoutesBody,
  FindRoutesResponse,
  GetDashboardResponse,
  GetLocationParams,
  GetLocationResponse,
  GetLocationsResponse,
  GetReportsResponse,
  InterpretNeedsBody,
  InterpretNeedsResponse,
  LoginBody,
  LoginResponse,
  RegisterBody,
  RegisterResponse,
  UpdateReportStatusBody,
  UpdateReportStatusParams,
  UpdateReportStatusResponse,
} from "@workspace/api-zod";
import {
  analyzeAccessibilityReport,
  interpretAccessibilityNeeds,
  writeRouteInstructions,
  type AccessPreferences,
} from "../lib/accesspath-ai";
import {
  demoRouteInstructions,
  findCandidatePaths,
  type CampusNode,
  type CampusSegment,
} from "../lib/campus-routing";

const router: IRouter = Router();

async function listLocations() {
  const rows = await db
    .select({ location: locationsTable, features: accessibilityFeaturesTable })
    .from(locationsTable)
    .leftJoin(
      accessibilityFeaturesTable,
      eq(locationsTable.id, accessibilityFeaturesTable.locationId),
    )
    .orderBy(locationsTable.name);
  return rows.map(({ location, features }) => ({
    id: location.id,
    name: location.name,
    type: location.type,
    latitude: location.latitude,
    longitude: location.longitude,
    accessibilityStatus: location.accessibilityStatus,
    stepFreeEntrance: features?.stepFreeEntrance ?? false,
    rampAvailable: features?.rampAvailable ?? false,
    elevatorAvailable: features?.elevatorAvailable ?? false,
    accessibleWashroom: features?.accessibleWashroom ?? false,
    notes: features?.notes || location.notes,
  }));
}

function reportResponse(
  report: typeof accessibilityReportsTable.$inferSelect,
  locationName: string,
) {
  return {
    id: report.id,
    locationId: report.locationId,
    locationName,
    barrierType: report.barrierType,
    description: report.description,
    urgency: report.urgency,
    accessibilityImpact: report.accessibilityImpact,
    category: report.category,
    severity: report.severity,
    affectedUsers: report.affectedUsers,
    summary: report.summary,
    recommendedAction: report.recommendedAction,
    aiMode: report.aiMode,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
  };
}

async function fetchReports() {
  const rows = await db
    .select({ report: accessibilityReportsTable, locationName: locationsTable.name })
    .from(accessibilityReportsTable)
    .innerJoin(locationsTable, eq(accessibilityReportsTable.locationId, locationsTable.id))
    .orderBy(desc(accessibilityReportsTable.createdAt));
  return rows.map(({ report, locationName }) => reportResponse(report, locationName));
}

function accessScore(
  pathSegments: CampusSegment[],
  preferences: AccessPreferences,
): number {
  const hasStairs = pathSegments.some((segment) => segment.stairs);
  const stepFree = pathSegments.every((segment) => segment.stepFree);
  const wheelchairSuitable = pathSegments.every((segment) => segment.wheelchairSuitable);
  const steep = pathSegments.some((segment) => segment.steep);
  let score = 100;
  if (hasStairs) score -= preferences.avoidStairs ? 55 : 35;
  if (!stepFree) score -= preferences.preferStepFree ? 35 : 20;
  if (!wheelchairSuitable) score -= preferences.wheelchairAccess ? 50 : 20;
  if (steep) score -= preferences.avoidSteepPaths ? 30 : 15;
  return Math.max(0, Math.min(100, score));
}

router.get("/locations", async (req, res): Promise<void> => {
  const locations = await listLocations();
  res.json(GetLocationsResponse.parse(locations));
});

router.get("/locations/:id", async (req, res): Promise<void> => {
  const params = GetLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid location id." });
    return;
  }
  const [location] = (await listLocations()).filter((item) => item.id === params.data.id);
  if (!location) {
    res.status(404).json({ error: "Location not found." });
    return;
  }
  res.json(GetLocationResponse.parse(location));
});

router.post("/ai/interpret-needs", async (req, res): Promise<void> => {
  const body = InterpretNeedsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = await interpretAccessibilityNeeds(body.data.description);
  res.json(InterpretNeedsResponse.parse(result));
});

router.post("/routes", async (req, res): Promise<void> => {
  const body = FindRoutesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { startLocationId, destinationLocationId, preferences } = body.data;
  const locations = await listLocations();
  const start = locations.find((item) => item.id === startLocationId);
  const destination = locations.find((item) => item.id === destinationLocationId);
  if (!start || !destination) {
    res.status(400).json({ error: "Choose two locations from the campus map." });
    return;
  }

  const [nodes, rawSegments] = await Promise.all([
    db.select().from(routeNodesTable),
    db.select().from(routeSegmentsTable),
  ]);
  const startNode = nodes.find((node) => node.locationId === start.id);
  const destinationNode = nodes.find((node) => node.locationId === destination.id);
  if (!startNode || !destinationNode) {
    res.status(400).json({ error: "A route node is missing for one of those locations." });
    return;
  }
  const routeNodes: CampusNode[] = nodes.map((node) => ({
    id: node.id,
    name: node.name,
    latitude: node.latitude,
    longitude: node.longitude,
    locationId: node.locationId,
  }));
  const segments: CampusSegment[] = rawSegments.map((segment) => ({
    ...segment,
    id: Number(segment.id),
  }));
  const paths = findCandidatePaths(
    startNode.id,
    destinationNode.id,
    routeNodes,
    segments,
    preferences,
  );
  if (!paths.length) {
    res.status(400).json({
      error: "No route meets every selected access requirement. Try relaxing a preference or report a missing campus path.",
    });
    return;
  }

  const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));
  const accessPriority = (path: (typeof paths)[number]): number =>
    path.segmentIds.reduce((total, id) => {
      const segment = segmentMap.get(id);
      if (!segment) return total;
      return (
        total +
        (segment.stepFree ? 40 : 0) +
        (segment.wheelchairSuitable ? 40 : 0) +
        (segment.ramp ? 15 : 0) +
        (segment.elevator ? 5 : 0) -
        (segment.stairs ? 100 : 0) -
        (segment.steep ? 60 : 0)
      );
    }, 0);
  const accessibilityFirstPath = [...paths].sort(
    (left, right) =>
      accessPriority(right) - accessPriority(left) || left.cost - right.cost,
  )[0];
  const remainingPaths = paths.filter((path) => path !== accessibilityFirstPath);
  const shortestPath = [...remainingPaths].sort(
    (left, right) => left.distanceMeters - right.distanceMeters,
  )[0];
  const alternativePaths = remainingPaths
    .filter((path) => path !== shortestPath)
    .sort((left, right) => left.cost - right.cost);
  const orderedPaths = [
    ...(accessibilityFirstPath ? [accessibilityFirstPath] : []),
    ...(shortestPath ? [shortestPath] : []),
    ...alternativePaths,
  ];
  const options: z.infer<typeof FindRoutesResponse>["routes"] = orderedPaths.map((path, index) => {
    const pathNodes = path.nodeIds
      .map((id) => nodeMap.get(id))
      .filter((node): node is CampusNode => Boolean(node));
    const pathSegments = path.segmentIds
      .map((id) => segmentMap.get(id))
      .filter((segment): segment is CampusSegment => Boolean(segment));
    const hasStairs = pathSegments.some((segment) => segment.stairs);
    const stepFree = pathSegments.every((segment) => segment.stepFree);
    const wheelchairSuitable = pathSegments.every((segment) => segment.wheelchairSuitable);
    const rampAvailable = pathSegments.some((segment) => segment.ramp);
    const elevatorAvailable = pathSegments.some((segment) => segment.elevator);
    const explanation = [
      hasStairs ? "Includes stairs" : "No stairs in the mapped route",
      stepFree ? "Step-free path segments" : "One or more segments are not step-free",
      ...(rampAvailable ? ["Ramp available on this route"] : []),
      ...(wheelchairSuitable ? ["Mapped segments are wheelchair suitable"] : []),
      ...(preferences.needAccessibleWashroom &&
      pathNodes.some((node) => node.id === "accessible-washroom")
        ? ["Passes the accessible washroom location"]
        : []),
    ];
    const points = pathNodes.map((node) => ({
      id: node.id,
      name: node.name,
      latitude: node.latitude,
      longitude: node.longitude,
    }));
    const segmentFacts = pathSegments.map(
      (segment) => segment.notes || segment.surface.toLowerCase(),
    );
    const instructions =
      index === 0
        ? null
        : {
            instructions: demoRouteInstructions(
              points.map((point) => point.name),
              segmentFacts,
              preferences.avoidStairs,
            ),
            mode: "demo" as const,
          };
    return {
      id: `route-${index + 1}`,
      label:
        index === 0
          ? stepFree
            ? "Step-free / accessibility-first route"
            : "Accessibility-first route"
          : index === 1
            ? hasStairs
              ? "Shortest route · includes stairs"
              : "Shortest route"
            : hasStairs
              ? "Alternative route · includes stairs"
              : "Alternative route",
      points,
      distanceMeters: path.distanceMeters,
      walkingMinutes: Math.max(1, Math.round(path.distanceMeters / 70)),
      accessibilityScore: accessScore(pathSegments, preferences),
      hasStairs,
      stepFree,
      wheelchairSuitable,
      rampAvailable,
      elevatorAvailable,
      explanation,
      navigationInstructions: instructions?.instructions ?? "",
      instructionMode: instructions?.mode ?? "demo",
    };
  });

  const firstSegments = orderedPaths[0].segmentIds
    .map((id) => segmentMap.get(id))
    .filter((segment): segment is CampusSegment => Boolean(segment));
  const firstPoints = options[0].points;
  const instructions = await writeRouteInstructions({
    pointNames: firstPoints.map((point) => point.name),
    segmentFacts: firstSegments.map(
      (segment) => segment.notes || segment.surface.toLowerCase(),
    ),
    avoidStairs: preferences.avoidStairs,
  });
  options[0].navigationInstructions = instructions.instructions;
  options[0].instructionMode = instructions.mode;

  const recommended = options[0];
  const shortest = options[1];
  const reason = shortest
    ? `The accessibility-first route favors mapped step-free, wheelchair-suitable, ramp, and elevator features. The shortest alternative is ${shortest.distanceMeters} m.`
    : recommended.explanation.join(". ") + ".";
  res.json(
    FindRoutesResponse.parse({
      start,
      destination,
      recommendedRouteId: recommended.id,
      routes: options,
      reason,
      preferences,
    }),
  );
});

router.get("/reports", async (_req, res): Promise<void> => {
  const reports = await fetchReports();
  res.json(GetReportsResponse.parse(reports));
});

router.post("/reports", async (req, res): Promise<void> => {
  const body = CreateReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, body.data.locationId));
  if (!location) {
    res.status(400).json({ error: "Choose a campus location." });
    return;
  }

  const { analysis, mode } = await analyzeAccessibilityReport({
    ...body.data,
    locationName: location.name,
  });
  const id = randomUUID();
  const [report] = await db
    .insert(accessibilityReportsTable)
    .values({
      id,
      locationId: location.id,
      barrierType: body.data.barrierType,
      description: body.data.description,
      urgency: body.data.urgency,
      accessibilityImpact: body.data.accessibilityImpact ?? null,
      category: analysis.category,
      severity: analysis.severity,
      affectedUsers: analysis.affectedUsers,
      summary: analysis.summary,
      recommendedAction: analysis.recommendedAction,
      aiMode: mode,
      status: "Reported",
    })
    .returning();
  res.status(201).json(
    CreateReportResponse.parse(reportResponse(report, location.name)),
  );
});

router.patch("/reports/:id/status", async (req, res): Promise<void> => {
  const params = UpdateReportStatusParams.safeParse(req.params);
  const body = UpdateReportStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid report status update." });
    return;
  }
  const [updated] = await db
    .update(accessibilityReportsTable)
    .set({ status: body.data.status })
    .where(eq(accessibilityReportsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  const [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, updated.locationId));
  res.json(
    UpdateReportStatusResponse.parse(
      reportResponse(updated, location?.name ?? "Campus location"),
    ),
  );
});

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [reports, locations] = await Promise.all([
    fetchReports(),
    listLocations(),
  ]);
  const openReports = reports.filter((report) => report.status !== "Resolved");
  res.json(
    GetDashboardResponse.parse({
      totalReports: reports.length,
      reported: reports.filter((report) => report.status === "Reported").length,
      underReview: reports.filter((report) => report.status === "Under Review").length,
      resolved: reports.filter((report) => report.status === "Resolved").length,
      criticalOpen: openReports.filter((report) => report.severity === "Critical").length,
      accessibleLocations: locations.filter(
        (location) => location.accessibilityStatus === "accessible",
      ).length,
      recentReports: reports.slice(0, 5),
    }),
  );
});

function signToken(user: { id: string; name: string; email: string }): string {
  const secret =
    process.env.JWT_SECRET ??
    process.env.SESSION_SECRET ??
    "accesspath-demo-only-development-secret";
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: user.id,
    name: user.name,
    email: user.email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  })}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const body = RegisterBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const email = body.data.email.trim().toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }
  const user = {
    id: randomUUID(),
    name: body.data.name.trim(),
    email,
    passwordHash: await bcrypt.hash(body.data.password, 12),
  };
  await db.insert(usersTable).values(user);
  const result = {
    token: signToken({ id: user.id, name: user.name, email: user.email }),
    user: { id: user.id, name: user.name, email: user.email },
  };
  res.status(201).json(RegisterResponse.parse(result));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const email = body.data.email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  const result = {
    token: signToken({ id: user.id, name: user.name, email: user.email }),
    user: { id: user.id, name: user.name, email: user.email },
  };
  res.json(LoginResponse.parse(result));
});

export default router;