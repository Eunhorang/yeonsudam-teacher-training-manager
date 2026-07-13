import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error("연수 기록 저장소를 사용할 수 없습니다.");
  }
  return env.DB;
}

export async function ensureTrainingStateSchema(db: D1Database) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_training_states (
        user_key TEXT PRIMARY KEY NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 4,
        revision INTEGER NOT NULL DEFAULT 1,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS user_training_states_updated_at_idx
      ON user_training_states (updated_at)
    `),
  ]);
}
