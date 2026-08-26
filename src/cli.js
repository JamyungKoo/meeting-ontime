import { openInChrome } from './chrome-open.js';
import { startServer } from './server.js';
import { addOnce } from './engine.js';
import { loadRules, dateKey, formatMeeting } from './store.js';

const [, , command, ...args] = process.argv;

const usage = `사용법:
  npm start                         실행 — 관리 페이지(localhost)가 자동으로 열리고,
                                    등록된 미팅을 매일 시작 1분 전에 자동 접속

  (터미널용 보조 명령)
  npm run list                                    등록된 미팅 확인
  node src/cli.js add <HH:mm> <meet-url> [제목]   오늘 1회성 미팅 수동 추가
  node src/cli.js join <meet-url>                 지금 바로 접속 테스트
`;

function cmdList() {
  const rules = loadRules();
  if (!rules.recurring.length && !rules.once.length) {
    return console.log('등록된 미팅이 없습니다. 관리 페이지에서 등록하세요.');
  }
  if (rules.recurring.length) {
    console.log('매번 자동 참석 (캘린더에 뜨는 날마다 접속):');
    for (const r of rules.recurring) console.log(`  - ${r.title}  (${r.key})`);
  }
  if (rules.once.length) {
    console.log('1회성 참석:');
    for (const o of rules.once) {
      console.log(`  - ${dateKey(new Date(o.start))} ${formatMeeting(o)}`);
    }
  }
  if (rules.pause) console.log(`휴가 모드: ${rules.pause.from} ~ ${rules.pause.to}`);
}

function cmdAdd() {
  const [time, url, ...titleParts] = args;
  try {
    addOnce({ time, url, title: titleParts.join(' ') });
  } catch (err) {
    console.log(`오류: ${err.message}`);
    console.log('사용법: node src/cli.js add <HH:mm> <meet-url> [제목]');
    process.exit(1);
  }
  console.log('추가 완료:');
  cmdList();
}

function cmdJoin() {
  const url = args[0];
  if (!url?.includes('meet.google.com')) {
    console.log('사용법: node src/cli.js join <meet-url>');
    process.exit(1);
  }
  openInChrome({ title: '(테스트)', url });
  console.log('실제 Chrome에서 열었습니다. 확장이 설치되어 있으면 카메라/마이크가 자동으로 꺼집니다.');
}

switch (command) {
  case 'run':
    startServer();
    break;
  case 'list':
    cmdList();
    break;
  case 'add':
    cmdAdd();
    break;
  case 'join':
    cmdJoin();
    break;
  default:
    console.log(usage);
}
