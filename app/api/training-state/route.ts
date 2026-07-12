import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureTrainingStateSchema, getD1 } from "@/db";
import {
  parseTrainingState,
  STATE_VERSION,
  type TrainingAppState,
} from "@/lib/training-state";
import { userKeyFromEmail } from "@/lib/user-key.server";

export const dynamic = "force-dynamic";

const MAX_STATE_BYTES = 1_500_000;

interface StoredRow {
  revision: number;
  schema_version: number;
  state_json: string;
  updated_at: string;
}

export async function GET() {
  const identity = await requireApiIdentity();
  if (identity instanceof Response) return identity;

  const db = getD1();
  await ensureTrainingStateSchema(db);
  const row = await readStoredRow(db, identity.userKey);

  if (!row) {
    return apiJson({
      exists: false,
      revision: 0,
      state: null,
      updatedAt: null,
      accountScope: identity.accountScope,
    });
  }

  const state = parseTrainingState(safeJson(row.state_json));
  if (!state) {
    return apiJson(
      { error: "클라우드 기록 형식을 읽을 수 없습니다." },
      { status: 500 },
    );
  }

  return apiJson({
    exists: true,
    revision: row.revision,
    state,
    updatedAt: row.updated_at,
    accountScope: identity.accountScope,
  });
}

export async function PUT(request: Request) {
  const identity = await requireApiIdentity();
  if (identity instanceof Response) return identity;
  const requestError = validateWriteRequest(request);
  if (requestError) return requestError;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_STATE_BYTES) {
    return apiJson({ error: "저장할 기록이 너무 큽니다." }, { status: 413 });
  }

  let body: { baseRevision?: unknown; state?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiJson({ error: "JSON 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const baseRevision = Number(body.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    return apiJson({ error: "저장 버전 값이 올바르지 않습니다." }, { status: 422 });
  }
  if (
    !body.state ||
    typeof body.state !== "object" ||
    (body.state as { version?: unknown }).version !== STATE_VERSION
  ) {
    return apiJson({ error: "지원하지 않는 기록 형식입니다." }, { status: 422 });
  }

  const state = parseTrainingState(body.state);
  if (!state) {
    return apiJson({ error: "연수 기록을 확인해 주세요." }, { status: 422 });
  }
  const stateJson = JSON.stringify(state satisfies TrainingAppState);
  if (new TextEncoder().encode(stateJson).byteLength > MAX_STATE_BYTES) {
    return apiJson({ error: "저장할 기록이 너무 큽니다." }, { status: 413 });
  }

  const db = getD1();
  await ensureTrainingStateSchema(db);
  const now = new Date().toISOString();

  if (baseRevision === 0) {
    const insert = await db
      .prepare(
        `INSERT OR IGNORE INTO user_training_states
          (user_key, schema_version, revision, state_json, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)`,
      )
      .bind(identity.userKey, STATE_VERSION, stateJson, now, now)
      .run();
    if ((insert.meta.changes ?? 0) === 1) {
      return apiJson({ revision: 1, updatedAt: now, state });
    }
    return conflictResponse(db, identity.userKey, identity.accountScope);
  }

  const update = await db
    .prepare(
      `UPDATE user_training_states
       SET schema_version = ?, revision = revision + 1, state_json = ?, updated_at = ?
       WHERE user_key = ? AND revision = ?`,
    )
    .bind(STATE_VERSION, stateJson, now, identity.userKey, baseRevision)
    .run();

  if ((update.meta.changes ?? 0) !== 1) {
    return conflictResponse(db, identity.userKey, identity.accountScope);
  }

  return apiJson({ revision: baseRevision + 1, updatedAt: now, state });
}

export async function DELETE(request: Request) {
  const identity = await requireApiIdentity();
  if (identity instanceof Response) return identity;
  const requestError = validateWriteRequest(request);
  if (requestError) return requestError;

  let body: { baseRevision?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiJson({ error: "JSON 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const baseRevision = Number(body.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 1) {
    return apiJson({ error: "저장 버전 값이 올바르지 않습니다." }, { status: 422 });
  }

  const db = getD1();
  await ensureTrainingStateSchema(db);
  const result = await db
    .prepare(
      "DELETE FROM user_training_states WHERE user_key = ? AND revision = ?",
    )
    .bind(identity.userKey, baseRevision)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    return conflictResponse(db, identity.userKey, identity.accountScope);
  }
  return apiJson({ deleted: true });
}

async function requireApiIdentity() {
  const user = await getChatGPTUser();
  if (!user) {
    return apiJson({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const userKey = await userKeyFromEmail(user.email);
  return { userKey, accountScope: userKey.slice(0, 20) };
}

function validateWriteRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return apiJson({ error: "JSON 요청만 허용됩니다." }, { status: 415 });
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return apiJson({ error: "다른 사이트에서 보낸 요청은 허용되지 않습니다." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const requestUrl = new URL(request.url);
    const expectedOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
    if (origin !== expectedOrigin) {
      return apiJson({ error: "요청 출처를 확인할 수 없습니다." }, { status: 403 });
    }
  }
  return null;
}

async function readStoredRow(db: D1Database, userKey: string) {
  return db
    .prepare(
      `SELECT revision, schema_version, state_json, updated_at
       FROM user_training_states WHERE user_key = ?`,
    )
    .bind(userKey)
    .first<StoredRow>();
}

async function conflictResponse(
  db: D1Database,
  userKey: string,
  accountScope: string,
) {
  const row = await readStoredRow(db, userKey);
  return apiJson(
    {
      error: "다른 기기에서 기록이 먼저 변경되었습니다.",
      revision: row?.revision ?? 0,
      state: row ? parseTrainingState(safeJson(row.state_json)) : null,
      updatedAt: row?.updated_at ?? null,
      accountScope,
    },
    { status: 409 },
  );
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function apiJson(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json; charset=utf-8");
  return Response.json(data, { ...init, headers });
}
