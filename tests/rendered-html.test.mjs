import assert from "node:assert/strict";
import { access, glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { Miniflare } from "miniflare";

let miniflare;
let miniflarePromise;

async function getMiniflare() {
  miniflarePromise ??= (async () => {
    const serverRoot = fileURLToPath(new URL("../dist/server/", import.meta.url));
    const modulePaths = [];
    for await (const path of glob("**/*.js", { cwd: serverRoot })) {
      if (path !== "index.js") modulePaths.push(path);
    }
    miniflare = new Miniflare({
      modulesRoot: serverRoot,
      modules: ["index.js", ...modulePaths].map((path) => ({
        type: "ESModule",
        path: join(serverRoot, path),
      })),
      compatibilityDate: "2026-05-15",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "yeonsudam-test-db" },
      serviceBindings: {
        ASSETS: async () => new Response("Not found", { status: 404 }),
      },
    });
    return miniflare;
  })();
  return miniflarePromise;
}

after(async () => {
  if (miniflarePromise) await (await miniflarePromise).dispose();
});

async function render(path = "/") {
  return (await getMiniflare()).dispatchFetch(`http://localhost${path}`, {
    headers: {
      accept: path.startsWith("/api/") ? "application/json" : "text/html",
      host: "localhost",
    },
  });
}

test("연수담 첫 화면을 서버에서 정상 렌더링한다", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="ko"/i);
  assert.match(html, /<title>연수담 \| 초등교사 연수관리<\/title>/i);
  assert.match(html, /올해의 연수/);
  assert.match(html, /아동학대 신고의무자 교육/);
  assert.match(html, /연수 추가/);
  assert.match(html, /로그인 전에는 이 브라우저에만 저장됩니다/);
  assert.match(html, /내 근무 조건을 설정해 주세요/);
  assert.match(html, /학교안전교육/);
  assert.match(html, /\/signin-with-chatgpt\?return_to=%2F/);
  assert.match(html, /개인정보 안내/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("개인정보 안내 화면을 제공한다", async () => {
  const response = await render("/privacy");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /학생 개인정보를 수집할 목적으로 설계되지 않았습니다/);
  assert.match(html, /클라우드 기록 삭제/);
});

test("비로그인 사용자의 계정 API 접근을 차단한다", async () => {
  const response = await render("/api/training-state");
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const body = await response.json();
  assert.equal(body.error, "로그인이 필요합니다.");
});

test("계정 API가 D1 저장·수정 충돌·삭제를 안전하게 처리한다", async () => {
  const mf = await getMiniflare();
  const authHeaders = {
    "oai-authenticated-user-email": "teacher-api-test@example.com",
    accept: "application/json",
  };
  const writeHeaders = {
    ...authHeaders,
    "content-type": "application/json",
    origin: "http://localhost",
    "sec-fetch-site": "same-origin",
  };
  const state = {
    version: 3,
    activeYear: 2026,
    recordsByYear: { "2026": [] },
    profilesByYear: {},
  };

  const overLimit = await mf.dispatchFetch("http://localhost/api/training-state", {
    method: "PUT",
    headers: writeHeaders,
    body: JSON.stringify({
      baseRevision: 0,
      state: {
        ...state,
        recordsByYear: { "2026": Array.from({ length: 1001 }, () => ({})) },
      },
    }),
  });
  assert.equal(overLimit.status, 413);

  const initial = await mf.dispatchFetch("http://localhost/api/training-state", {
    headers: authHeaders,
  });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).exists, false);

  const created = await mf.dispatchFetch("http://localhost/api/training-state", {
    method: "PUT",
    headers: writeHeaders,
    body: JSON.stringify({ baseRevision: 0, state }),
  });
  assert.equal(created.status, 200);
  assert.equal((await created.json()).revision, 1);

  const staleCreate = await mf.dispatchFetch("http://localhost/api/training-state", {
    method: "PUT",
    headers: writeHeaders,
    body: JSON.stringify({ baseRevision: 0, state }),
  });
  assert.equal(staleCreate.status, 409);
  assert.equal((await staleCreate.json()).revision, 1);

  const updated = await mf.dispatchFetch("http://localhost/api/training-state", {
    method: "PUT",
    headers: writeHeaders,
    body: JSON.stringify({
      baseRevision: 1,
      state: { ...state, activeYear: 2027, recordsByYear: { "2027": [] } },
    }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).revision, 2);

  const staleDelete = await mf.dispatchFetch("http://localhost/api/training-state", {
    method: "DELETE",
    headers: writeHeaders,
    body: JSON.stringify({ baseRevision: 1 }),
  });
  assert.equal(staleDelete.status, 409);

  const deleted = await mf.dispatchFetch("http://localhost/api/training-state", {
    method: "DELETE",
    headers: writeHeaders,
    body: JSON.stringify({ baseRevision: 2 }),
  });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).deleted, true);
});

test("임시 스타터를 제거하고 운영 필수 파일을 포함한다", async () => {
  const [page, layout, packageJson, hosting, apiRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/training-state/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /TrainingManager/);
  assert.match(layout, /lang="ko"/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(hosting, /"d1"\s*:\s*"DB"/);
  assert.match(apiRoute, /baseRevision/);
  assert.match(apiRoute, /status:\s*409/);

  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../drizzle\/0000_magical_alex_power.sql", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
