import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// GitHub의 프로젝트 사이트는 사용자 주소 뒤에 저장소 이름이 붙습니다.
// 예: https://Eunhorang.github.io/yeonsudam-teacher-training-manager/
const repositoryName = "yeonsudam-teacher-training-manager";
const projectRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./github-pages", import.meta.url)),
  base: `/${repositoryName}/`,
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-github-pages", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./github-pages/index.html", import.meta.url)),
        privacy: fileURLToPath(
          new URL("./github-pages/privacy.html", import.meta.url),
        ),
      },
    },
  },
});
