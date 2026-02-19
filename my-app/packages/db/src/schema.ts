import { pgTable, serial, varchar, text, timestamp,integer, } from "drizzle-orm/pg-core";
import {user} from "./loginschema";



export const todos = pgTable("todos", {
  id: serial("id").primaryKey(),

  text: varchar("text").notNull(),

  description: text("description").notNull(),

  status: varchar("status").notNull(),

  startAt: timestamp("start_at").notNull(),

  endAt: timestamp("end_at").notNull(),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
