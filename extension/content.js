// meeting-ontime helper
// meeting-ontime 프로그램이 연 탭(?ontime=1)에서만 동작:
//   1) 참여 전 화면에서 카메라/마이크 토글을 모두 끔 (data-is-muted="false" → 클릭)
//   2) ontime_join=1 이면 "지금 참여"/"참여 요청" 버튼 클릭
// 직접 연 Meet 탭에는 아무 영향 없음.

(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('ontime') !== '1') return;

  const autoJoin = params.get('ontime_join') === '1';
  const startedAt = Date.now();
  const TIMEOUT_MS = 90000;
  const lastClick = new WeakMap(); // 같은 토글 연타로 도로 켜지는 것 방지

  const muteAll = () => {
    const toggles = document.querySelectorAll('[data-is-muted]');
    let allMuted = toggles.length > 0;
    toggles.forEach((el) => {
      if (el.getAttribute('data-is-muted') === 'false') {
        allMuted = false;
        const last = lastClick.get(el) || 0;
        if (Date.now() - last > 2000) {
          el.click();
          lastClick.set(el, Date.now());
        }
      }
    });
    return allMuted;
  };

  // "Join anyway"는 예정 시각 밖에 들어갈 때, "참여 요청/Ask to join"은 승인제 회의
  const JOIN_RE = /지금 참여|참여 요청|그래도 참여|바로 참여|Join now|Join anyway|Ask to join/i;

  const findJoinButton = () =>
    [...document.querySelectorAll('button, [role="button"]')].find(
      (b) =>
        JOIN_RE.test(b.textContent || '') ||
        JOIN_RE.test(b.getAttribute('aria-label') || ''),
    );

  const inCall = () =>
    [...document.querySelectorAll('button, [role="button"]')].some((b) =>
      /통화에서 나가기|Leave call/i.test(b.getAttribute('aria-label') || ''),
    );

  const timer = setInterval(() => {
    if (Date.now() - startedAt > TIMEOUT_MS || inCall()) {
      clearInterval(timer);
      return;
    }

    const allMuted = muteAll();

    if (autoJoin) {
      // 토글이 모두 꺼졌거나, 15초가 지나도 토글을 못 찾으면(권한 차단 등) 참여 시도
      const waitedEnough = Date.now() - startedAt > 15000;
      if (allMuted || waitedEnough) {
        const btn = findJoinButton();
        if (btn) btn.click();
      }
    }
  }, 500);
})();
