import { z } from "zod";

const preferencesSchema = z.object({
  avoidStairs: z.boolean(),
  preferStepFree: z.boolean(),
  wheelchairAccess: z.boolean(),
  preferElevators: z.boolean(),
  needAccessibleWashroom: z.boolean(),
  avoidSteepPaths: z.boolean(),
  distancePriority: z.enum(["low", "balanced", "high"]),
});

export type AccessPreferences = z.infer<typeof preferencesSchema>;

const reportAnalysisSchema = z.object({
  category: z.string().min(2).max(100),
  severity: z.enum(["Low", "Medium", "High", "Critical"]),
  affectedUsers: z.array(z.string().min(2).max(100)).max(8),
  summary: z.string().min(5).max(500),
  recommendedAction: z.string().min(5).max(500),
});

export type ReportAnalysis = z.infer<typeof reportAnalysisSchema>;
export type AiMode = "live" | "demo";

async function askOpenAI(system: string, user: string): Promise<unknown | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function demoPreferences(description: string): AccessPreferences {
  const text = description.toLowerCase();
  const avoidStairs =
    /\b(no stairs|cannot use stairs|can't use stairs|avoid stairs|without stairs|step[- ]free|wheelchair|mobility aid)\b/.test(
      text,
    );
  const wheelchairAccess = /\bwheelchair|wheel chair\b/.test(text);
  const longRouteOkay =
    /\b(longer|farther|further|extra distance|don't mind walking|do not mind walking|distance is okay)\b/.test(
      text,
    );
  return {
    avoidStairs,
    preferStepFree: avoidStairs || /\bstep[- ]free\b/.test(text),
    wheelchairAccess,
    preferElevators: /\belevator|lift\b/.test(text),
    needAccessibleWashroom: /\b(accessible|wheelchair|adapted)\s+(washroom|toilet|restroom)\b/.test(
      text,
    ),
    avoidSteepPaths: /\bsteep|incline|slope\b/.test(text),
    distancePriority: longRouteOkay ? "low" : "balanced",
  };
}

function preferenceSummary(preferences: AccessPreferences): string[] {
  const items: string[] = [];
  if (preferences.avoidStairs) items.push("Avoid stairs");
  if (preferences.preferStepFree) items.push("Prefer step-free paths");
  if (preferences.wheelchairAccess) items.push("Wheelchair-friendly paths");
  if (preferences.preferElevators) items.push("Prefer elevators");
  if (preferences.needAccessibleWashroom) items.push("Need an accessible washroom");
  if (preferences.avoidSteepPaths) items.push("Avoid steep paths");
  if (preferences.distancePriority === "low") items.push("A longer route is acceptable");
  return items.length ? items : ["No specific access constraints detected"];
}

export async function interpretAccessibilityNeeds(
  description: string,
): Promise<{ preferences: AccessPreferences; understoodAs: string[]; mode: AiMode; message: string }> {
  const aiResult = await askOpenAI(
    "Interpret accessibility needs as JSON only. Return keys avoidStairs, preferStepFree, wheelchairAccess, preferElevators, needAccessibleWashroom, avoidSteepPaths (booleans), and distancePriority (low, balanced, or high). Do not infer a disability that the user did not state. Low means the person accepts a longer route; high means they prioritize distance.",
    description,
  );
  const parsed = preferencesSchema.safeParse(aiResult);
  const mode: AiMode = parsed.success ? "live" : "demo";
  const preferences = parsed.success ? parsed.data : demoPreferences(description);
  return {
    preferences,
    understoodAs: preferenceSummary(preferences),
    mode,
    message:
      mode === "live"
        ? "Live AI interpretation. Review these preferences before using them."
        : "Demo mode: preferences were identified with local phrase matching, not a live AI call.",
  };
}

function fallbackReportAnalysis(input: {
  barrierType: string;
  description: string;
  urgency: string;
  accessibilityImpact?: string;
}): ReportAnalysis {
  const barrier = input.barrierType.toLowerCase();
  const category = barrier.includes("elevator")
    ? "Vertical access failure"
    : barrier.includes("washroom")
      ? "Washroom access"
      : barrier.includes("entrance")
        ? "Entrance accessibility"
        : barrier.includes("information")
          ? "Accessibility information"
          : barrier.includes("ramp") || barrier.includes("pathway")
            ? "Access obstruction"
            : "Step-free access";
  const severity =
    input.urgency === "critical"
      ? "Critical"
      : input.urgency === "high"
        ? "High"
        : input.urgency === "medium"
          ? "Medium"
          : "Low";
  const lower = `${input.description} ${input.accessibilityImpact ?? ""}`.toLowerCase();
  const affectedUsers = new Set<string>();
  if (/wheelchair|ramp|step[- ]free|entrance/.test(lower)) {
    affectedUsers.add("Wheelchair users");
    affectedUsers.add("People using mobility aids");
  }
  if (/blind|vision|visual|tactile/.test(lower)) {
    affectedUsers.add("Blind and low-vision people");
  }
  if (/deaf|hearing|audio|alert/.test(lower)) {
    affectedUsers.add("Deaf and hard-of-hearing people");
  }
  if (affectedUsers.size === 0) affectedUsers.add("People affected by this barrier");
  return {
    category,
    severity,
    affectedUsers: [...affectedUsers],
    summary: `${input.barrierType} reported: ${input.description.trim()}`,
    recommendedAction:
      input.urgency === "critical" || input.urgency === "high"
        ? "Verify the reported condition promptly, provide an accessible alternative, and update campus access information."
        : "Review the report on site, confirm the access impact, and update campus information if needed.",
  };
}

export async function analyzeAccessibilityReport(input: {
  barrierType: string;
  description: string;
  urgency: string;
  accessibilityImpact?: string;
  locationName: string;
}): Promise<{ analysis: ReportAnalysis; mode: AiMode }> {
  const aiResult = await askOpenAI(
    "Classify an accessibility barrier report. Return JSON only with category, severity (Low, Medium, High, Critical), affectedUsers (array of concise groups), summary, and recommendedAction. Use only information in the supplied report. Do not claim the barrier was verified or present a recommendation as completed work. Match severity to the stated urgency and impact.",
    JSON.stringify({
      location: input.locationName,
      barrierType: input.barrierType,
      description: input.description,
      urgency: input.urgency,
      accessibilityImpact: input.accessibilityImpact ?? "",
    }),
  );
  const parsed = reportAnalysisSchema.safeParse(aiResult);
  return parsed.success
    ? { analysis: parsed.data, mode: "live" }
    : {
        analysis: fallbackReportAnalysis(input),
        mode: "demo",
      };
}

export async function writeRouteInstructions(input: {
  pointNames: string[];
  segmentFacts: string[];
  avoidStairs: boolean;
}): Promise<{ instructions: string; mode: AiMode }> {
  const deterministic = [
    `Start at ${input.pointNames[0]}.`,
    ...input.pointNames.slice(1).map((name, index) => {
      const fact = input.segmentFacts[index];
      return fact
        ? `Continue to ${name} using the ${fact}.`
        : `Continue to ${name} along the mapped campus path.`;
    }),
    input.avoidStairs
      ? "This route avoids the stair segments in the campus route data."
      : "Follow the mapped campus route and check the on-site access information before you travel.",
    "The campus map and access details are demo data; verify conditions on site.",
  ].join(" ");
  const aiResult = await askOpenAI(
    "Write concise navigation instructions as JSON only: {\"instructions\":\"...\"}. Use only the ordered places and segment facts supplied. Do not invent turns, directions, entrances, hazards, closures, or accessibility features. Say the route avoids stairs only when the supplied route facts support that. Preserve the demo-data verification note.",
    JSON.stringify(input),
  );
  const instructions =
    aiResult && typeof aiResult === "object" && "instructions" in aiResult
      ? (aiResult as { instructions?: unknown }).instructions
      : undefined;
  if (
    typeof instructions === "string" &&
    instructions.length > 20 &&
    input.pointNames.every((name) => instructions.includes(name)) &&
    instructions.toLowerCase().includes("demo")
  ) {
    return { instructions, mode: "live" };
  }
  return { instructions: deterministic, mode: "demo" };
}