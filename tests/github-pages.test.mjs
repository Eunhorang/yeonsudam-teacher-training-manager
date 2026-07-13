import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages 전용 정적 화면과 하위 경로 자산을 만든다", async () => {
  const [indexHtml, privacyHtml] = await Promise.all([
    readFile(new URL("../dist-github-pages/index.html", import.meta.url), "utf8"),
    readFile(new URL("../dist-github-pages/privacy.html", import.meta.url), "utf8"),
    access(new URL("../dist-github-pages/.nojekyll", import.meta.url)),
    access(new URL("../dist-github-pages/favicon.svg", import.meta.url)),
    access(new URL("../dist-github-pages/og.png", import.meta.url)),
  ]);

  assert.match(indexHtml, /연수담 \| 초등교사 연수관리/);
  assert.match(indexHtml, /\/yeonsudam-teacher-training-manager\/assets\//);
  assert.match(privacyHtml, /개인정보 안내 \| 연수담/);
  assert.match(privacyHtml, /\/yeonsudam-teacher-training-manager\/assets\//);
});

test("GitHub Pages에서는 계정 API 대신 브라우저 저장 모드를 사용한다", async () => {
  const [entry, manager, workflow] = await Promise.all([
    readFile(new URL("../github-pages/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TrainingManager.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(entry, /cloudSyncEnabled=\{false\}/);
  assert.match(entry, /privacyPath="\.\/privacy\.html"/);
  assert.match(manager, /이 GitHub Pages 주소의 기록은 현재 브라우저에만 저장됩니다/);
  assert.match(workflow, /npm run build:github-pages/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
});

test("모바일 핵심 링크와 모달 키보드 접근성을 유지한다", async () => {
  const [manager, dialogFocus, globalCss, pagesCss] = await Promise.all([
    readFile(new URL("../components/TrainingManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/useDialogFocus.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../github-pages/pages.css", import.meta.url), "utf8"),
  ]);

  assert.match(manager, /현재 기록 백업 후 불러오기/);
  assert.match(manager, /aria-live="polite"/);
  assert.match(manager, /localState:\s*latestAppStateRef\.current/);
  assert.match(manager, /activeDialogKey === "conflict"/);
  assert.match(manager, /parseTrainingBackupState\(rawState/);
  assert.match(dialogFocus, /event\.key !== "Tab"/);
  assert.match(dialogFocus, /previousFocus\.focus\(\)/);
  assert.doesNotMatch(globalCss, /\.row-actions a\s*\{\s*display:\s*none/);
  assert.match(pagesCss, /\.github-pages-notice a\s*\{[\s\S]*display:\s*inline-flex/);
});
