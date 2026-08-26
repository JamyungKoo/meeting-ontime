import fs from 'node:fs';
import { RULES_FILE, STATE_FILE } from './config.js';

/** 로컬 기준 YYYY-MM-DD */
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * rules.json:
 *   recurring: 매번 자동 참석할 미팅. Meet URL(회차가 바뀌어도 동일) 또는
 *              반복 이벤트의 base ID로 매칭. 시작 시간은 매일 캘린더에서 읽어옴.
 *   once:      특정 날짜 1회만 참석할 미팅.
 *   skips:     [{url, date}] — 등록된 미팅이라도 이 날짜의 회차는 건너뜀.
 *   pause:     {from, to} — 휴가 등으로 이 기간 전체 자동 참여 중지.
 */
export function loadRules() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
  } catch {}
  return {
    recurring: raw.recurring || [],
    once: raw.once || [],
    skips: raw.skips || [],
    pause: raw.pause || null,
  };
}

export function saveRules(rules) {
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

/** state.json: 이미 접속한 미팅 기록 (재시작해도 중복 접속 방지) */
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { joined: {} };
  }
}

export function joinKey(meeting) {
  return `${meeting.url || meeting.id}@${dateKey(new Date(meeting.start))}`;
}

export function wasJoined(meeting) {
  return Boolean(loadState().joined[joinKey(meeting)]);
}

export function markJoined(meeting) {
  const state = loadState();
  state.joined[joinKey(meeting)] = new Date().toISOString();
  // 오늘 이전 기록은 정리
  const today = dateKey();
  for (const key of Object.keys(state.joined)) {
    if (key.split('@').pop() < today) delete state.joined[key];
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function formatMeeting(m) {
  const t = new Date(m.start).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${t}  ${m.title}${m.url ? `  (${m.url})` : '  (Meet 링크 없음)'}`;
}
