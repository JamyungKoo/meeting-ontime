import { execFile } from 'node:child_process';
import { env } from './config.js';

const SAFE_MEET_URL = /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i;

/**
 * 실제 Chrome(평소 쓰는 프로필/로그인)에서 Meet 링크를 연다.
 * ontime=1 파라미터를 붙여서, 설치된 확장(extension/)이 그 탭에서만
 * 카메라/마이크를 끄고 (AUTO_JOIN이면) 참여 버튼까지 눌러준다.
 */
export function openInChrome(meeting) {
  if (!SAFE_MEET_URL.test(meeting.url)) {
    throw new Error(`올바른 Meet 링크가 아닙니다: ${meeting.url}`);
  }
  const url = `${meeting.url}?ontime=1${env.AUTO_JOIN ? '&ontime_join=1' : ''}`;
  console.log(
    `[${new Date().toLocaleTimeString()}] Chrome으로 미팅 열기: ${meeting.title} → ${url}`,
  );
  execFile('open', ['-a', 'Google Chrome', url], (err) => {
    if (err) console.error('Chrome 열기 실패:', err.message);
  });
}
