// 툴바 아이콘 클릭 → 관리 페이지 열기
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'http://localhost:5959' });
});
