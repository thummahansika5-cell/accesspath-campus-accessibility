import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, boolean } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { locationsTable } from "./locations";

export const accessibilityFeaturesTable = pgTable("accessibility_features", {
  id: text("id").primaryKey(),
  locationId: text("location_id").notNull().unique().references(() => locationsTable.id, { onDelete: "cascade" }),
  stepFreeEntrance: boolean("step_free_entrance").notNull().default(false),
  rampAvailable: boolean("ramp_available").notNull().default(false),
  elevatorAvailable: boolean("elevator_available").notNull().default(false),
  accessibleWashroom: boolean("accessible_washroom").notNull().default(false),
  notes: text("notes").notNull().default(""),
});

export const insertAccessibilityFeaturesSchema = createInsertSchema(accessibilityFeaturesTable);
export type InsertAccessibilityFeatures = z.infer<typeof insertAccessibilityFeaturesSchema>;
export type AccessibilityFeatures = typeof accessibilityFeaturesTable.$inferSelect;