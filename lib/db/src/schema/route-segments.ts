import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { routeNodesTable } from "./route-nodes";

export const routeSegmentsTable = pgTable("route_segments", {
  id: serial("id").primaryKey(),
  fromNodeId: text("from_node_id").notNull().references(() => routeNodesTable.id, { onDelete: "cascade" }),
  toNodeId: text("to_node_id").notNull().references(() => routeNodesTable.id, { onDelete: "cascade" }),
  distanceMeters: integer("distance_meters").notNull(),
  stairs: boolean("stairs").notNull().default(false),
  stepFree: boolean("step_free").notNull().default(true),
  ramp: boolean("ramp").notNull().default(false),
  elevator: boolean("elevator").notNull().default(false),
  wheelchairSuitable: boolean("wheelchair_suitable").notNull().default(true),
  steep: boolean("steep").notNull().default(false),
  surface: text("surface").notNull(),
  notes: text("notes").notNull().default(""),
});

export const insertRouteSegmentSchema = createInsertSchema(routeSegmentsTable).omit({ id: true });
export type InsertRouteSegment = z.infer<typeof insertRouteSegmentSchema>;
export type RouteSegment = typeof routeSegmentsTable.$inferSelect;