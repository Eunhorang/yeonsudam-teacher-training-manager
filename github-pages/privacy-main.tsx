import { createRoot } from "react-dom/client";
import "@/app/globals.css";

const chatGptSiteUrl =
  "https://yeonsudam-teacher-training.rn-act.chatgpt.site";
const root = document.getElementById("root");

if (!root) {
  throw new Error("개인정보 안내를 표시할 영역을 찾지 못했습니다.");
}

createRoot(root).render(
  <main className="privacy-page">
    <div className="privacy-shell">
      <a className="privacy-back" href="./">
        ← 연수담으로 돌아가기
      </a>
      <span className="section-kicker">PRIVACY</span>
      <h1>개인정보 안내</h1>
      <p className="privacy-lead">
        GitHub Pages 버전의 연수담은 입력한 연수 기록을 현재 브라우저 안에만
        보관하며, 학생 개인정보를 수집할 목적으로 설계되지 않았습니다.
      </p>

      <section>
        <h2>1. 저장 위치</h2>
        <p>
          연수 기록과 근무 조건은 현재 브라우저의 로컬 저장소에만 저장됩니다.
          쉽게 말해 이 브라우저 안의 작은 기록 보관함입니다. 입력한 기록을
          GitHub 저장소나 온라인 데이터베이스로 전송하지 않습니다.
        </p>
      </section>

      <section>
        <h2>2. 저장되는 정보</h2>
        <ul>
          <li>연도별 연수명, 상태, 시간, 기관, 날짜와 사용자가 적은 메모</li>
          <li>시·도교육청, 학교 유형, 고용 형태와 선택한 담당업무</li>
        </ul>
        <p>학교명, 교직원 번호, 주민등록번호, 학생 명단은 요구하지 않습니다.</p>
      </section>

      <section>
        <h2>3. 보관과 삭제</h2>
        <p>
          브라우저 데이터를 삭제하거나 다른 기기·브라우저를 사용하면 기록이
          보이지 않을 수 있습니다. 중요한 기록은 데이터 관리에서 전체 연도 JSON
          백업 파일로 내려받으세요. 기기 기록 삭제는 브라우저의 사이트 데이터
          설정에서 할 수 있습니다.
        </p>
      </section>

      <section>
        <h2>4. 학교 현장 사용 시 주의</h2>
        <p>
          학생 이름, 상담 내용, 연락처, 건강정보, 생활기록부 내용 등 학생
          개인정보를 연수명이나 메모에 입력하지 마세요. 공용 PC에서는 사용을
          마친 뒤 기기에 남은 자료를 확인하세요.
        </p>
      </section>

      <section>
        <h2>5. 기존 주소의 기록 옮기기</h2>
        <p>
          ChatGPT 주소와 GitHub 주소는 서로 다른 브라우저 저장 공간을 사용합니다.
          기존 주소의 데이터 관리에서 전체 연도 백업을 내려받은 다음, GitHub
          주소에서 백업 파일 불러오기를 선택하면 기록을 옮길 수 있습니다.
        </p>
      </section>

      <section>
        <h2>6. 로그인·여러 기기 동기화</h2>
        <p>
          GitHub Pages는 서버 기능을 제공하지 않아 로그인·기기 동기화를 지원하지
          않습니다. 해당 기능이 필요하면{" "}
          <a href={chatGptSiteUrl}>연수담 계정 동기화 버전</a>을 이용해 주세요.
        </p>
      </section>

      <p className="privacy-updated">최종 갱신: 2026년 7월 12일</p>
    </div>
  </main>,
);
