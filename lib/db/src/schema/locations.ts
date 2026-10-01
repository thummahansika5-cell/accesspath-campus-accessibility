import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, doublePrecision } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const locationsTable = pgTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accessibilityStatus: text("accessibility_status").notNull(),
  notes: text("notes").notNull().default(""),
});

export const insertLocationSchema = createInsertSchema(locationsTable);
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;