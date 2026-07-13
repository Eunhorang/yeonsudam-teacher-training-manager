import Link from "next/link";

export const metadata = {
  title: "개인정보 안내",
  description: "연수담의 로그인, 기기 저장, 계정 동기화와 데이터 삭제 안내",
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <div className="privacy-shell">
        <Link className="privacy-back" href="/">← 연수담으로 돌아가기</Link>
        <span className="section-kicker">PRIVACY</span>
        <h1>개인정보 안내</h1>
        <p className="privacy-lead">
          연수담은 연수 관리에 꼭 필요한 정보만 사용하며, 학생 개인정보를 수집할 목적으로 설계되지 않았습니다.
        </p>

        <section>
          <h2>1. 로그인하지 않고 사용할 때</h2>
          <p>연수 기록과 근무 조건은 현재 브라우저 안에만 저장됩니다. 브라우저 데이터를 삭제하거나 기기를 바꾸면 기록이 사라질 수 있습니다.</p>
        </section>

        <section>
          <h2>2. ChatGPT 계정으로 로그인할 때</h2>
          <p>ChatGPT Sites가 전달한 계정 이메일은 사용자를 구분하는 데만 사용합니다. 연수담 데이터베이스에는 이메일 원문 대신 일방향 변환한 식별값을 저장합니다. 표시 이름은 화면에만 보여 주며 연수 기록 데이터에 저장하지 않습니다.</p>
        </section>

        <section>
          <h2>3. 계정에 저장되는 정보</h2>
          <ul>
            <li>연도별 연수명, 상태, 시간, 기관, 날짜와 사용자가 적은 메모</li>
            <li>사용자가 적은 수료증 파일명과 보관 위치(수료증 파일 자체는 업로드하지 않음)</li>
            <li>시·도교육청, 국공립·사립 여부, 고용 형태와 선택한 담당업무</li>
            <li>여러 기기의 동시수정을 안전하게 확인하기 위한 저장 버전과 시각</li>
          </ul>
          <p>학교명, 교직원 번호, 주민등록번호, 학생 명단은 요구하지 않습니다.</p>
        </section>

        <section>
          <h2>4. 보관과 삭제</h2>
          <p>기록은 사용자가 직접 삭제할 때까지 보관됩니다. 웹앱의 <b>데이터 관리 → 클라우드 기록 삭제</b>를 이용하면 로그인 계정에 저장된 기록을 삭제할 수 있습니다. 기기 안의 기록은 브라우저 설정에서 별도로 삭제할 수 있습니다.</p>
        </section>

        <section>
          <h2>5. 학교 현장 사용 시 주의</h2>
          <p>학생 이름, 상담 내용, 연락처, 건강정보, 생활기록부 내용 등 학생 개인정보를 연수명·메모·수료증 파일명이나 보관 위치에 입력하지 마세요. 공용 PC에서는 사용을 마친 뒤 기기 저장 자료와 로그인 상태를 확인하세요.</p>
        </section>

        <section>
          <h2>6. 동기화와 저장 위치</h2>
          <p>로그인 동기화 자료는 ChatGPT Sites의 데이터 저장 기능을 사용합니다. 학교·교육청의 보안 정책이나 데이터 국외 저장 제한이 있는 경우에는 로그인 동기화를 사용하기 전에 소속 기관의 지침을 확인하세요.</p>
        </section>

        <p className="privacy-updated">최종 갱신: 2026년 7월 13일</p>
      </div>
    </main>
  );
}
