import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { locationsTable } from "./locations";
import { usersTable } from "./users";

export const accessibilityReportsTable = pgTable("accessibility_reports", {
  id: text("id").primaryKey(),
  locationId: text("location_id").notNull().references(() => locationsTable.id, { onDelete: "cascade" }),
  submittedBy: text("submitted_by").references(() => usersTable.id, { onDelete: "set null" }),
  barrierType: text("barrier_type").notNull(),
  description: text("description").notNull(),
  urgency: text("urgency").notNull(),
  accessibilityImpact: text("accessibility_impact"),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  affectedUsers: text("affected_users").array().notNull().default([]),
  summary: text("summary").notNull(),
  recommendedAction: text("recommended_action").notNull(),
  aiMode: text("ai_mode").notNull(),
  status: text("status").notNull().default("Reported"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccessibilityReportSchema = createInsertSchema(accessibilityReportsTable).omit({ createdAt: true });
export type InsertAccessibilityReport = z.infer<typeof insertAccessibilityReportSchema>;
export type AccessibilityReport = typeof accessibilityReportsTable.$inferSelect;