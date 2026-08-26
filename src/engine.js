import { fetchMeetingsIcs } from './ics.js';
import { openInChrome } from './chrome-open.js';
import {
  loadRules,
  saveRules,
  dateKey,
  wasJoined,
  markJoined,
  formatMeeting,
} from './store.js';
import { env } from './config.js';

const CHECK_INTERVAL_MS = 10000;
const SYNC_RETRY_MS = 10 * 60 * 1000;
// 시작 후 이 시간이 지난 미팅은 접속하지 않음 (이미 끝났을 가능성)
const STALE_AFTER_MS = 30 * 60 * 1000;

const FETCH_DAYS = 7;

const state = {
  meetings: [], // 오늘부터 7일치 캘린더 이벤트 (Meet 링크 있는 것)
  noLink: [], // Meet 링크가 없어 자동화 불가한 이벤트
  schedule: [], // 오늘 실제로 접속할 미팅
  scheduleDate: null,
  syncing: false,
  lastSyncAt: null,
  lastError: null,
};

let lastSyncAttempt = 0;

function matchesRecurring(meeting, rule) {
  return (
    (meeting.url && rule.key === meeting.url) ||
    (meeting.baseEventId &&
      rule.baseEventId &&
      rule.baseEventId === meeting.baseEventId)
  );
}

/** 캘린더에서 읽어온 미팅의 현재 등록 상태: 'recurring' | 'once' | 'off' */
export function meetingMode(meeting, rules = loadRules()) {
  if (rules.recurring.some((r) => matchesRecurring(meeting, r))) return 'recurring';
  const dk = dateKey(new Date(meeting.start));
  if (
    rules.once.some(
      (o) => o.url === meeting.url && dateKey(new Date(o.start)) === dk,
    )
  ) {
    return 'once';
  }
  return 'off';
}

export function isSkipped(meeting, rules = loadRules()) {
  const dk = dateKey(new Date(meeting.start));
  return rules.skips.some((s) => s.url === meeting.url && s.date === dk);
}

export function inPause(date, pause) {
  return Boolean(pause && pause.from && pause.to && date >= pause.from && date <= pause.to);
}

function resolveSchedule() {
  const rules = loadRules();
  const today = dateKey();

  // 휴가 기간에는 아무것도 접속하지 않음
  if (inPause(today, rules.pause)) {
    state.schedule = [];
    return;
  }

  const out = [];
  const seenUrls = new Set();

  for (const m of state.meetings) {
    if (dateKey(new Date(m.start)) !== today) continue;
    const mode = meetingMode(m, rules);
    if (mode === 'off' || !m.url) continue;
    if (isSkipped(m, rules)) continue;
    out.push({ ...m, source: mode === 'recurring' ? '반복' : '1회' });
    seenUrls.add(m.url);
  }

  // 캘린더 파싱에 안 잡혔더라도 오늘 날짜의 1회성 등록(수동 추가 등)은 포함
  for (const o of rules.once) {
    if (dateKey(new Date(o.start)) !== today) continue;
    if (o.url && seenUrls.has(o.url)) continue;
    if (isSkipped(o, rules)) continue;
    out.push({ ...o, source: '1회' });
  }

  out.sort((a, b) => new Date(a.start) - new Date(b.start));
  state.schedule = out;
}

function pruneOnceRules() {
  const rules = loadRules();
  const today = dateKey();
  const kept = rules.once.filter((o) => dateKey(new Date(o.start)) >= today);
  if (kept.length !== rules.once.length) {
    rules.once = kept;
    saveRules(rules);
  }
}

/** 오늘 캘린더를 다시 읽어와 스케줄을 갱신 */
export async function sync() {
  if (state.syncing) return;
  state.syncing = true;
  state.lastError = null;
  lastSyncAttempt = Date.now();
  try {
    pruneOnceRules();
    console.log(`[${new Date().toLocaleTimeString()}] 오늘 캘린더 동기화 중...`);
    if (!env.ICS_URL) {
      throw new Error('.env에 ICS_URL이 없습니다. README의 설정 가이드를 따라 캘린더 iCal 비공개 주소를 설정하세요.');
    }
    // 비공개 iCal 주소로 오늘부터 7일치 조회 (브라우저/로그인 불필요)
    const fetched = await fetchMeetingsIcs(env.ICS_URL, FETCH_DAYS);
    state.meetings = fetched.filter((m) => m.url);
    state.noLink = fetched.filter((m) => !m.url);
    state.scheduleDate = dateKey();
    state.lastSyncAt = new Date().toISOString();
    resolveSchedule();

    console.log(`[${state.scheduleDate}] 오늘 자동 접속 예정:`);
    if (!state.schedule.length) console.log('  (없음)');
    for (const m of state.schedule) {
      console.log(`  - [${m.source}] ${formatMeeting(m)}${wasJoined(m) ? ' [접속 완료]' : ''}`);
    }
  } catch (err) {
    state.lastError = err.message;
    state.scheduleDate = null;
    console.error('캘린더 동기화 실패:', err.message);
  } finally {
    state.syncing = false;
  }
}

/** 대시보드용 현재 상태 */
export function getState() {
  const rules = loadRules();
  return {
    syncing: state.syncing,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    env: {
      LEAD_SECONDS: env.LEAD_SECONDS,
      AUTO_JOIN: env.AUTO_JOIN,
      ICS: Boolean(env.ICS_URL),
    },
    today: dateKey(),
    meetings: state.meetings.map((m) => {
      const dk = dateKey(new Date(m.start));
      return {
        ...m,
        date: dk,
        mode: meetingMode(m, rules),
        skipped: isSkipped(m, rules),
        paused: inPause(dk, rules.pause),
        joined: dk === dateKey() && wasJoined(m),
      };
    }),
    noLink: state.noLink,
    schedule: state.schedule.map((m) => ({ ...m, joined: wasJoined(m) })),
    rules,
  };
}

/** 미팅의 등록 상태 변경: 'recurring' | 'once' | 'off' */
export function setMode(meeting, mode) {
  const rules = loadRules();
  const dk = dateKey(new Date(meeting.start));

  rules.recurring = rules.recurring.filter((r) => !matchesRecurring(meeting, r));
  rules.once = rules.once.filter(
    (o) => !(o.url === meeting.url && dateKey(new Date(o.start)) === dk),
  );

  if (mode === 'recurring') {
    rules.recurring.push({
      key: meeting.url,
      baseEventId: meeting.baseEventId,
      title: meeting.title,
    });
  } else if (mode === 'once') {
    rules.once.push({
      id: meeting.id,
      title: meeting.title,
      start: meeting.start,
      url: meeting.url,
    });
  }
  saveRules(rules);
  resolveSchedule();
}

/** 특정 날짜의 회차만 건너뛰기 설정/해제 */
export function toggleSkip(meeting, skipped) {
  const rules = loadRules();
  const dk = dateKey(new Date(meeting.start));
  rules.skips = rules.skips.filter((s) => !(s.url === meeting.url && s.date === dk));
  if (skipped) rules.skips.push({ url: meeting.url, date: dk, title: meeting.title });
  // 지난 날짜 스킵은 정리
  rules.skips = rules.skips.filter((s) => s.date >= dateKey());
  saveRules(rules);
  resolveSchedule();
}

/** 휴가 기간 설정 (null이면 해제) — 기간 내 모든 자동 참여 중지 */
export function setPause(range) {
  const rules = loadRules();
  if (range && range.from && range.to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) {
      throw new Error('날짜 형식은 YYYY-MM-DD 이어야 합니다');
    }
    rules.pause = { from: range.from, to: range.to };
  } else {
    rules.pause = null;
  }
  saveRules(rules);
  resolveSchedule();
}

export function removeRule(type, key) {
  const rules = loadRules();
  if (type === 'recurring') {
    rules.recurring = rules.recurring.filter((r) => r.key !== key);
  } else {
    rules.once = rules.once.filter((o) => o.id !== key);
  }
  saveRules(rules);
  resolveSchedule();
}

/** 1회성 미팅 수동 추가 (date 없으면 오늘) */
export function addOnce({ date, time, url, title }) {
  if (!/^\d{1,2}:\d{2}$/.test(time || '')) throw new Error('시간 형식은 HH:mm 이어야 합니다');
  if (!url?.includes('meet.google.com')) throw new Error('meet.google.com 링크가 아닙니다');
  const [h, min] = time.split(':').map(Number);
  const start = date ? new Date(`${date}T00:00:00`) : new Date();
  start.setHours(h, min, 0, 0);

  const rules = loadRules();
  rules.once.push({
    id: `manual-${Date.now()}`,
    title: title || '(수동 추가)',
    start: start.toISOString(),
    url,
  });
  saveRules(rules);
  resolveSchedule();
}

/** 지금 바로 접속 — 실제 Chrome 창에서 열림 */
export async function joinNow(meeting) {
  openInChrome(meeting);
  // 실제 접속 시간대에 수동으로 열었을 때만 완료 처리 (스케줄러 중복 접속 방지).
  // 그 외(미리 테스트 등)에는 기록하지 않아야 예정된 자동 접속이 막히지 않는다.
  if (meeting.start) {
    const start = new Date(meeting.start).getTime();
    const now = Date.now();
    if (now >= start - env.LEAD_SECONDS * 1000 && now <= start + STALE_AFTER_MS) {
      markJoined(meeting);
    }
  }
}

// 업무 시간대(로컬 08~13시)에는 1시간마다 자동 재동기화.
// 맥북을 덮었다 열어도(sleep) 다음 tick에서 경과 시간으로 판단하므로 놓치지 않는다.
const RESYNC_HOUR_START = 8;
const RESYNC_HOUR_END = 13;
const RESYNC_INTERVAL_MS = 60 * 60 * 1000;

function needsHourlyResync() {
  const now = new Date();
  const h = now.getHours();
  if (h < RESYNC_HOUR_START || h > RESYNC_HOUR_END) return false;
  return !state.lastSyncAt || now - new Date(state.lastSyncAt) >= RESYNC_INTERVAL_MS;
}

async function tick() {
  if (state.scheduleDate !== dateKey()) {
    if (lastSyncAttempt === 0 || Date.now() - lastSyncAttempt >= SYNC_RETRY_MS) {
      await sync();
    }
    if (state.scheduleDate !== dateKey()) return;
  } else if (needsHourlyResync()) {
    if (Date.now() - lastSyncAttempt >= SYNC_RETRY_MS) await sync();
  }

  const now = Date.now();
  for (const m of state.schedule) {
    if (wasJoined(m)) continue;
    const start = new Date(m.start).getTime();

    if (now < start - env.LEAD_SECONDS * 1000) continue;
    if (now > start + STALE_AFTER_MS) {
      markJoined(m); // 너무 늦어서 건너뜀 처리
      console.log(`건너뜀 (시작한 지 30분 초과): ${m.title}`);
      continue;
    }

    try {
      openInChrome(m);
      markJoined(m);
    } catch (err) {
      console.error(`접속 실패: ${m.title} —`, err.message);
    }
  }
}

export function startEngine() {
  setInterval(tick, CHECK_INTERVAL_MS);
  tick();
}
