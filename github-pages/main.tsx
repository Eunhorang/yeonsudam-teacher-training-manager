import { createRoot } from "react-dom/client";
import { TrainingManager } from "@/components/TrainingManager";
import "@/app/globals.css";
import "./pages.css";

const chatGptSiteUrl =
  "https://yeonsudam-teacher-training.rn-act.chatgpt.site";
const root = document.getElementById("root");

if (!root) {
  throw new Error("연수담 화면을 표시할 영역을 찾지 못했습니다.");
}

createRoot(root).render(
  <>
    <aside className="github-pages-notice no-print" aria-label="GitHub Pages 저장 안내">
      <div className="github-pages-notice-inner">
        <span className="github-pages-label">이 기기에만 저장됨</span>
        <div>
          <strong>기록은 현재 브라우저에 저장돼요.</strong>
          <p>
            기존 기록은 JSON 백업 파일로 옮길 수 있습니다.
          </p>
        </div>
        <a href={chatGptSiteUrl}>로그인·기기 동기화 버전 ↗</a>
      </div>
    </aside>
    <TrainingManager
      account={null}
      signInPath={`${chatGptSiteUrl}/signin-with-chatgpt?return_to=%2F`}
      signOutPath={`${chatGptSiteUrl}/signout-with-chatgpt?return_to=%2F`}
      cloudSyncEnabled={false}
      privacyPath="./privacy.html"
    />
  </>,
);
