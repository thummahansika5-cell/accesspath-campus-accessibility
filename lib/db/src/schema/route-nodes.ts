import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, doublePrecision } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { locationsTable } from "./locations";

export const routeNodesTable = pgTable("route_nodes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  locationId: text("location_id").references(() => locationsTable.id, { onDelete: "set null" }),
});

export const insertRouteNodeSchema = createInsertSchema(routeNodesTable);
export type InsertRouteNode = z.infer<typeof insertRouteNodeSchema>;
export type RouteNode = typeof routeNodesTable.$inferSelect;