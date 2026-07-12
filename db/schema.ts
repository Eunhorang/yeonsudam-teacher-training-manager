import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 이메일 원문 대신 서버에서 만든 SHA-256 식별값을 기본키로 사용합니다.
export const userTrainingStates = sqliteTable(
  "user_training_states",
  {
    userKey: text("user_key").primaryKey(),
    schemaVersion: integer("schema_version").notNull().default(3),
    revision: integer("revision").notNull().default(1),
    stateJson: text("state_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("user_training_states_updated_at_idx").on(table.updatedAt),
  ],
);
