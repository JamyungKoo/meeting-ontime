import ical from 'node-ical';

const MEET_RE = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/;

function meetUrlOf(ev) {
  const fields = [
    ev['GOOGLE-CONFERENCE'],
    ev.location,
    ev.description,
    ev.url,
  ];
  for (const v of fields) {
    const s = typeof v === 'string' ? v : v?.val || '';
    const m = s.match(MEET_RE);
    if (m) return `https://meet.google.com/${m[1]}`;
  }
  // 어느 필드에 있든 잡아내는 최후 폴백
  try {
    const m = JSON.stringify(ev).match(MEET_RE);
    if (m) return `https://meet.google.com/${m[1]}`;
  } catch {}
  return null;
}

/**
 * Google Calendar 비공개 iCal 주소(ICS)에서 오늘부터 days일치 이벤트를 가져온다.
 * 브라우저/로그인 불필요. 반복 이벤트는 RRULE을 해당 범위로 전개.
 */
export async function fetchMeetingsIcs(icsUrl, days = 7) {
  const data = await ical.async.fromURL(icsUrl);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + days);

  const out = [];

  const push = (ev, start, recurring) => {
    if (!(start >= dayStart && start < dayEnd)) return;
    out.push({
      id: `${ev.uid}@${start.toISOString()}`,
      baseEventId: ev.uid,
      recurring,
      title: ev.summary || '(제목 없음)',
      start: start.toISOString(),
      url: meetUrlOf(ev),
    });
  };

  for (const ev of Object.values(data)) {
    if (ev.type !== 'VEVENT') continue;
    if (ev.datetype === 'date') continue; // 종일 이벤트 제외

    if (ev.rrule) {
      const exdates = new Set(
        Object.values(ev.exdate || {}).map((d) => new Date(d).getTime()),
      );
      // node-ical은 같은 override를 두 키('YYYY-MM-DD'와 ISO)로 중복 수록하므로
      // 원래 회차 시각(recurrenceid) 기준으로 dedupe
      const overrideMap = new Map();
      for (const ov of Object.values(ev.recurrences || {})) {
        overrideMap.set(new Date(ov.recurrenceid ?? ov.start).getTime(), ov);
      }

      for (const d of ev.rrule.between(dayStart, dayEnd, true)) {
        const t = d.getTime();
        if (exdates.has(t) || overrideMap.has(t)) continue;
        push(ev, d, true);
      }
      // 시간/제목이 수정된 회차는 override 기준으로
      for (const ov of overrideMap.values()) {
        if (ov.datetype === 'date') continue;
        push({ ...ov, uid: ev.uid }, new Date(ov.start), true);
      }
    } else if (ev.start) {
      push(ev, new Date(ev.start), false);
    }
  }

  // Google이 반복 시리즈를 여러 구간(UID)으로 쪼개는 경우 등 최종 안전망 dedupe
  const seen = new Set();
  const deduped = out.filter((m) => {
    const k = `${m.url || m.baseEventId}@${m.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  deduped.sort((a, b) => new Date(a.start) - new Date(b.start));
  return deduped;
}
