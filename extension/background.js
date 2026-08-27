// 관리 페이지 포트. .env의 PORT를 바꿨다면 이 값도 같이 맞춰야 한다
// (확장은 .env를 읽을 수 없어 자동 동기화 불가).
const DASHBOARD_PORT = 5959;

// 툴바 아이콘 클릭 → 관리 페이지 열기
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: `http://localhost:${DASHBOARD_PORT}` });
});
