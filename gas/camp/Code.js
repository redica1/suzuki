/* build: 20261024-004449 */
/**
 * 스즈키 겨울 음악제(2027 · 27W) 캠프 접수 — 앱스크립트판 (시험: 마포스즈키만)
 *
 * 이 스크립트는 「접수 DB」 구글 시트에 붙여서(확장 프로그램 › Apps Script) 씁니다.
 *  1) 처음 한 번 setup() 실행 → 시트(명단_교사, 명단_학생, 접수, 참가자, 입금신고, 환불요청, 앙상블팀, 기록)를 만들고 마포스즈키 명단을 넣음
 *  2) 배포 › 새 배포 › 웹 앱 (실행: 나, 액세스: 모든 사용자) → 나온 주소를 선생님께 안내
 *  3) 관리자 화면: 같은 주소 뒤에 ?page=admin  (아이디·비밀번호는 「설정」 탭에서 정함)
 *
 * 데이터 원칙
 *  - 접수 1건 = 「접수」 1행 (전체 내용은 JSON 열에), 참가자 1명 = 「참가자」 1행 (운영진이 보는 표)
 *  - 입금 확인은 운영진이 「참가자」 시트의 [운영진] 입금확인일 · 입금확인액 칸에 적음 → 선생님 화면에 「입금 확인」으로 보임
 *  - 선생님 화면은 이 칸을 바꿀 수 없음 (서버가 시트 값으로 덮어씀)
 */

const CAMP_ID = '27W';
const CAMP_NAME = '2027 스즈키 겨울 음악제';
const TZ = 'Asia/Seoul';
const TEST_ACADS = ['마포스즈키'];          // 「설정」 탭 「접수 가능 학원」이 비어 있을 때만 씀
/** 접수 가능 학원: 설정 「접수 가능 학원」 = 전체 / 학원1, 학원2 … (없으면 TEST_ACADS) */
function acadOpen_() { const v = setting_('접수 가능 학원'); if (!v) return TEST_ACADS; if (/^전체$/.test(v)) return null; return v.split(',').map(s => s.trim()).filter(Boolean); }
const ADMIN_EMAIL = '';                     // 새 접수 알림을 받을 주소 (비워 두면 안 보냄)
const JSON_CHUNK = 45000;                   // 시트 한 칸 글자 수 한도(5만) 아래로 나눠 저장

/* ---------------- 참가비 · 옵션 (화면 Index 의 값과 같아야 함 — 금액은 서버가 다시 계산해서 저장) ---------------- */
const FEES = {
  '교사': [560000, 570000, 590000], '연수생': [560000, 570000, 590000], '소속없는 중급연수생': [560000, 570000, 590000], '학생': [560000, 570000, 590000],
  '회원의 악기하는 자녀': [510000, 520000, 540000], '회원의 첫번째 보호자': [510000, 520000, 540000],
  '회원의 그외 악기 안하는 동반가족': [410000, 420000, 440000], '동반가족 중 돌전아기': [310000, 320000, 340000]
};
const ROUND_NAMES = ['1차', '2차', '3차'];
const OPT = { lessonFee: 60000, lessonMax: 5, studentDues: 30000, teacherDues: 300000, roomCap: 4, roomEmptyFee: 130000 };
const PLAYS = ['교사', '연수생', '소속없는 중급연수생', '학생', '회원의 악기하는 자녀'];
const MASTER = [{ n: '안드레아 부샤츠', fee: 150000 }, { n: '이성주', fee: 150000 }];
const PAY_MAX = 10000000;            // 한 사람 입금 신고 금액 상한
const RP_HEAD = ['기록 일시', '신고ID', '접수번호', '학원', '접수 교사', '참가자', '입금자명', '입금일', '금액', '메모', '구분', '환불 계좌'];
const SETTINGS = [['관리자 아이디', 'admin', '관리자 화면(?page=admin) 로그인 아이디'],
  ['관리자 비밀번호', '', '여기에 비밀번호를 적어야 관리자 화면에 들어갈 수 있어요 (8자 이상)'],
  ['입금 은행', '', '선생님 화면 입금 안내에 보이는 은행 (예: 국민은행)'],
  ['입금 계좌번호', '', '입금 계좌번호 (선생님 화면에서 복사 가능)'],
  ['예금주', '', '입금 계좌 예금주'],
  ['입금 시작일', '2026-10-01', '이 날짜보다 앞선 입금일로는 신고할 수 없어요'],
  ['공유주소', 'https://redica1.github.io/suzuki/camp/', '카카오톡 안에서 열었을 때 바깥 브라우저로 넘길 주소'],
  ['접수 가능 학원', '마포스즈키', '「전체」 또는 학원 이름을 쉼표로 (예: 마포스즈키, 미사스즈키)']];

const SH = {
  T: '명단_교사', S: '명단_학생', SUB: '접수', P: '참가자', RP: '입금신고', CX: '환불요청', ENS: '앙상블팀', LOG: '기록'
};
const SUB_HEAD = ['접수번호', '접수일시', '수정일시', '학원', '접수 교사', '차수', '인원(정상)', '청구액', '입금확인액', '남은 금액', '앙상블', 'JSON_1', 'JSON_2', 'JSON_3', 'JSON_4'];
const P_HEAD = ['참가자ID', '접수번호', '차수', '학원', '접수 교사', '들어온 차례', '추가 일시', '이름', '구분', '참가 구분', '악기', '담당 교사', '출생연도', '성별',
  '현재 진도', '선호 교수1', '선호 교수2', '추가 레슨', '마스터클래스', '음악회', '음악회 곡', '가족방', '참가비', '레슨·MC', '연회비', '가족방비', '청구액', '상태',
  '입금 상태', '신고 입금자명', '신고 입금일', '신고 금액', '신고 메모', '[운영진] 입금확인일', '[운영진] 입금확인액', '[운영진] 메모'];
const ADMIN_COLS = ['[운영진] 입금확인일', '[운영진] 입금확인액', '[운영진] 메모'];
const CX_HEAD = ['요청 일시', '접수번호', '학원', '요청 교사', '참가자', '사유', '환불 예정액', '은행', '계좌번호', '예금주', '진단서', '처리', '처리일', '메모', '참가자ID', '신청액', '입금액', '적용 규정', '접수일'];

/* ---------------- 웹 앱 ---------------- */
function doGet(e) {
  const admin = e && e.parameter && e.parameter.page === 'admin';
  let page;
  if (admin) page = HtmlService.createHtmlOutputFromFile('Admin');
  else { const t = HtmlService.createTemplateFromFile('Index'); let share = ''; let tl = ''; try { ensureSettings_(); share = setting_('공유주소'); tl = setting_('테스트 로그인'); } catch (x) {} t.shareUrl = share; t.testLogin = tl; /* 테스트 로그인: STG 「설정」에만 (이름/휴대전화) — 로그인 칸을 미리 채움 */ page = t.evaluate(); }
  return page
    .setTitle(CAMP_NAME + (admin ? ' 접수 관리' : ' 접수'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 화면 코드가 길어서 App1, App2 … 파일로 나눠 둠 → Index.html 이 붙여서 보냄 */
function include(name) { return HtmlService.createTemplateFromFile(name).getRawContent(); }   // App1~5는 자바스크립트라 HTML 검사 없이 그대로 붙임

/* ---------------- 처음 설정 ---------------- */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const mk = (name, head) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(head); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold'); }
    return sh;
  };
  const shT = mk(SH.T, ['ID', '이름', '직급', '악기', '휴대전화 뒤 4자리', '소속 학원', '회비 납부일', '연회비', '상태']);
  const shS = mk(SH.S, ['ID', '고유번호', '이름', '구분 표시', '학원', '악기', '출생연도', '담당 교사', '회비 납부일']);
  mk(SH.SUB, SUB_HEAD);
  const shP = mk(SH.P, P_HEAD);
  mk(SH.RP, RP_HEAD);
  mk(SH.CX, CX_HEAD);
  setupAdmin_();
  mk(SH.ENS, ['대표 접수번호', '팀 이름', '대표 학원', '함께하는 학원', '곡1 작곡가', '곡1 곡명', '곡1 원어', '곡1 반주', '곡1 영상', '곡2 작곡가', '곡2 곡명', '곡2 원어', '곡2 반주', '곡2 영상', '연주시간']);
  mk(SH.LOG, ['일시', '누가', '무엇', '내용']);
  // 운영진 칸 색
  const c0 = P_HEAD.indexOf(ADMIN_COLS[0]) + 1;
  shP.getRange(1, c0, 1, ADMIN_COLS.length).setBackground('#fff2cc');

  // 마포스즈키 명단 (시험용) — 이미 있으면 다시 넣지 않음
  if (shT.getLastRow() < 2) {
    const rows = MAPO.teachers.map((t, i) => ['M' + (i + 1), t.name, t.role || '강사', t.inst, "'" + t.p4, [MAPO.acad].concat(t.extra || []).join(', '),
      MAPO.paid[t.name] || '', t.role === '원장' ? 500000 : 300000, '승인']);
    shT.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  if (shS.getLastRow() < 2) {
    const rows = MAPO.students.map(([raw, inst], i) => {
      const m = String(raw).match(/^(.*?)\s*\(([^)]*)\)$/);
      const name = m ? m[1] : raw, tag = m ? m[2].replace(/[A-Za-z]+$/, '') : '';   // (남A)(남B)의 A·B는 쓰지 않음
      return ['S' + (i + 1), 'S' + String(i + 1).padStart(4, '0'), name, tag, MAPO.acad, inst, '', '', '2026-04-01'];
    });
    shS.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  log_('설정', 'setup', '시트 준비 완료');
  return '준비 완료';
}

/* ---------------- 잠금 ---------------- */
/** 동시에 몰릴 때: 30초 기다려도 못 잡으면 'BUSY' → 화면이 잠시 뒤 자동으로 다시 보냄 */
function lock_() { const l = LockService.getScriptLock(); if (!l.tryLock(30000)) throw new Error('BUSY'); return l; }

/* ---------------- 로그인 ---------------- */
const bare_ = s => String(s || '').replace(/[A-Za-z\s]+$/, '').replace(/\s/g, '');
const today_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const stamp_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');

function rows_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const h = v[0];
  return v.slice(1).map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; });
}
const dstr_ = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '');

function teachers_() {
  return rows_(SH.T).filter(r => r['ID']).map(r => ({
    id: String(r['ID']), name: String(r['이름']), role: String(r['직급'] || '강사'), inst: String(r['악기'] || ''),
    p4: String(r['휴대전화 뒤 4자리'] || '').replace(/\D/g, ''), acads: String(r['소속 학원'] || '').split(',').map(s => s.trim()).filter(Boolean),
    paidDate: dstr_(r['회비 납부일']), dueAmt: +r['연회비'] || 0, state: String(r['상태'] || '승인')
  }));
}

/** 이름 + 휴대전화로 로그인 (시험 기간: 명단의 휴대전화 뒤 4자리와 비교) */
function login(name, phone) {
  const ph = String(phone || '').replace(/\D/g, '');
  const nm = bare_(name);
  if (!nm || ph.length < 10) return { ok: false, msg: '이름과 휴대전화를 모두 넣어 주세요.' };
  const t = teachers_().find(x => bare_(x.name) === nm && x.p4 && ph.endsWith(x.p4));
  if (!t) return { ok: false, msg: '회원 명단의 이름·휴대전화와 맞지 않아요.' };
  if (t.state === '대기') return { ok: false, msg: '승인 대기 중이에요. 협회가 확인하면 이메일로 알려 드려요.' };
  try { ensureSettings_(); } catch (x) {}
  const open = acadOpen_();
  const own = [...new Set(loadSubs_().filter(x => x.owner === t.name).map(x => x.acad))];
  const acads = [...new Set(t.acads.concat(own))].filter(a => !open || open.includes(a));
  if (!acads.length) return { ok: false, msg: '지금은 ' + open.join(', ') + '만 접수할 수 있어요.' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ name: t.name, acads }), 21600);
  log_(t.name, '로그인', '');
  return Object.assign({ ok: true, token, today: today_(), teacher: { id: t.id, name: t.name, role: t.role, inst: t.inst, acads, home: t.acads, p4: t.p4 }, myAcct: myAcct_(t.name) }, bundle_(acads));
}

/** 교사(선생님 본인 포함)는 모든 학원을 통틀어 한 번만 — 다른 학원(겸임·내 클래스)에는 학생만 */
function teacherDup_(all, sb, onlyIds) {
  const tk = (no, id) => { const k = id.slice(no.length + 1); return /^t_/.test(k) ? k : ''; };
  const taken = {};
  all.forEach(x => { if (x.no === sb.no) return; x.ppl.forEach(p => { if (p.status === '정상' || p.status === '취소요청') { const k = tk(x.no, p.id); if (k) taken[k] = x; } }); });
  const d = sb.ppl.filter(p => p.status === '정상' && (!onlyIds || onlyIds.includes(p.id)) && tk(sb.no, p.id) && taken[tk(sb.no, p.id)]);
  if (d.length) { const x = taken[tk(sb.no, d[0].id)]; throw new Error(d.map(p => p.name).join(', ') + ' 선생님은 이미 ' + x.no + ' (' + x.acad + ')에 교사로 접수돼 있어요. 선생님은 한 번만 접수할 수 있어요 · 이 학원에는 학생만 추가해 주세요.'); }
}
/** 환불요청 시트에서 그 사람 줄의 처리 상태를 바꿈 */
function markCx_(no, pid, from, to, memo) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.CX); if (!sh) return;
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  rows_(SH.CX).filter(r => String(r['접수번호']) === no && String(r['처리']) === from && String(r['참가자ID'] || '').split(',').includes(pid)).forEach(r => {
    sh.getRange(r._row, h.indexOf('처리') + 1).setValues([[to]]); sh.getRange(r._row, h.indexOf('처리일') + 1).setValues([[today_()]]);
    if (memo) sh.getRange(r._row, h.indexOf('메모') + 1).setValues([[memo]]);
  });
}
/** 선생님: 운영진이 접수하기 전의 취소 요청을 거둠 (그 요청에 든 사람 모두 참가로) */
function withdrawCx(token, no, pid) {
  const u = who_(token);
  const lock = lock_();
  try {
    const all = loadSubs_(), sb = all.find(x => x.no === no);
    if (!sb || sb.owner !== u.name) throw new Error('이 접수의 취소 요청을 거둘 수 없어요.');
    const r = rows_(SH.CX).filter(x => String(x['접수번호']) === no && String(x['사유']) !== '차액 환불' && String(x['참가자ID'] || '').split(',').includes(pid)).pop();
    if (!r) throw new Error('취소 요청을 찾지 못했어요. 새로 고쳐 주세요.');
    if (String(r['처리'] || '요청') !== '요청') throw new Error('운영진이 이미 처리했어요(' + r['처리'] + '). 운영진에게 문의해 주세요.');
    const ids = String(r['참가자ID'] || '').split(',').filter(Boolean);
    sb.ppl.forEach(p => { if (ids.includes(p.id) && p.status === '취소요청') { p.status = '정상'; delete p.cxReqAt; p.cxWithdrawn = stamp_(); } });
    sb.rev = (+sb.rev || 0) + 1; writeSub_(sb, false); writeTeams_(all);
    markCx_(no, pid, '요청', '철회', '선생님이 취소 요청을 거둠');
    log_(u.name, '취소 요청 철회', no + ' · ' + r['참가자']);
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true }, bundle_(who_(token).acads));
}
/** 다른 학원 학생도 접수 (겸임) — 소속은 그대로, 이 로그인 동안 그 학원 명단·접수를 열어 줌 */
function addAcad(token, acad) {
  const C = CacheService.getScriptCache(), v = C.get('tok_' + token);
  if (!v) throw new Error('로그인이 끝났어요. 화면을 새로 고쳐 다시 로그인해 주세요.');
  const u = JSON.parse(v); acad = String(acad || '').trim();
  if (!acad) throw new Error('학원을 골라 주세요.');
  const own = acad === u.name + ' 클래스';   // 「직접 입력」: 학원 소속 없이 내 이름 클래스
  const open = acadOpen_(); if (!own && open && !open.includes(acad)) throw new Error('지금은 ' + open.join(', ') + '만 접수할 수 있어요.');
  if (!u.acads.includes(acad)) { u.acads.push(acad); C.put('tok_' + token, JSON.stringify(u), 21600); log_(u.name, '다른 학원 접수(겸임)', acad); }
  return Object.assign({ ok: true, acads: u.acads }, bundle_(u.acads));
}
function who_(token) {
  const v = CacheService.getScriptCache().get('tok_' + token);
  if (!v) throw new Error('로그인이 끝났어요. 화면을 새로 고쳐 다시 로그인해 주세요.');
  return JSON.parse(v);
}

/** 화면에 필요한 것: 학원 명단, 그 학원 접수 전부(다른 선생님 것 포함 — 중복 접수 막기용), 앙상블 팀 */
function bundle_(acads) {
  const ts = teachers_();
  const st = rows_(SH.S);
  const rosters = {};
  acads.forEach(a => {
    rosters[a] = {
      teachers: ts.filter(t => t.acads.includes(a)).map(t => ({ id: t.id, name: t.name, role: t.role, inst: t.inst, paidDate: t.paidDate, dueAmt: t.dueAmt, extra: t.acads.filter(x => x !== a) })),
      students: st.filter(r => String(r['학원']) === a && r['ID']).map(r => ({
        id: String(r['ID']), uid: String(r['고유번호']), name: String(r['이름']), tag: String(r['구분 표시'] || ''), inst: String(r['악기'] || ''),
        birth: String(r['출생연도'] || ''), teacher: String(r['담당 교사'] || ''), paidDate: dstr_(r['회비 납부일'])
      }))
    };
  });
  const all = loadSubs_();
  return { rosters, subs: all.filter(sb => acads.includes(sb.acad)), teams: teams_(all), bank: bankInfo_(), today: today_() };
}

/* ---------------- 접수 읽고 쓰기 ---------------- */
function loadSubs_() {
  const admin = adminMap_();
  return rows_(SH.SUB).filter(r => r['접수번호']).map(r => {
    const js = ['JSON_1', 'JSON_2', 'JSON_3', 'JSON_4'].map(k => String(r[k] || '')).join('');
    let sb; try { sb = JSON.parse(js); } catch (e) { return null; }
    applyAdmin_(sb, admin);
    return sb;
  }).filter(Boolean);
}

/** 운영진이 참가자 시트에 적은 입금 확인 → 접수 내용에 반영 (선생님 화면은 이 값을 바꿀 수 없음) */
function adminMap_() {
  const m = {};
  rows_(SH.P).forEach(r => {
    const id = String(r['참가자ID'] || ''); if (!id) return;
    m[id] = { date: dstr_(r['[운영진] 입금확인일']), amt: +String(r['[운영진] 입금확인액'] || '').replace(/[^\d]/g, '') || 0, memo: String(r['[운영진] 메모'] || '') };
  });
  return m;
}
function applyAdmin_(sb, admin) {
  (sb.ppl || []).forEach(p => {
    const a = admin[p.id];
    if (a && a.amt > 0) {
      p.paidAmt = a.amt;
      const row = p.rep && p.rep.rows && p.rep.rows[p.id];
      if (p.pay === '신고' && row && row.base !== undefined && a.amt <= +row.base) {
        // 이미 일부 확인된 뒤에 낸 차액 신고: 운영진이 확인액을 늘리기 전까지 「신고 · 확인 중」 그대로
      } else {
        p.pay = '확인';
        p.rep = Object.assign({}, p.rep || {}, { ok: a.date || (p.rep && p.rep.date) || '' });
      }
    } else {
      p.paidAmt = 0;
      if (p.pay === '확인') p.pay = p.rep && p.rep.ids ? '신고' : '전';
    }
  });
  return sb;
}

function writeSub_(sb, isNew) { writeSubRow_(sb, isNew); writePeople_(sb); }
function writeSubRow_(sb, isNew) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SH.SUB);
  const live = sb.ppl.filter(p => p.status === '정상');
  const amt = p => (+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0);
  const bill = live.reduce((t, p) => t + amt(p), 0), paid = live.reduce((t, p) => t + (+p.paidAmt || 0), 0);
  const json = JSON.stringify(sb);
  const chunks = [0, 1, 2, 3].map(i => json.slice(i * JSON_CHUNK, (i + 1) * JSON_CHUNK));
  if (json.length > JSON_CHUNK * 4) throw new Error('접수 내용이 너무 길어요. 접수를 나눠서 내 주세요.');
  const e = sb.form && sb.form.ens || {};
  const row = [sb.no, sb.createdAt || stamp_(), isNew ? '' : stamp_(), sb.acad, sb.owner, sb.round, live.length, bill, paid, Math.max(0, bill - paid),
    e.on ? '대표 · ' + (e.group || '') : e.member ? '함께 · ' + (e.joinNo || e.joinRep || '') : ''].concat(chunks);
  const found = rows_(SH.SUB).find(r => String(r['접수번호']) === sb.no);
  if (found) { row[1] = found['접수일시'] instanceof Date ? Utilities.formatDate(found['접수일시'], TZ, 'yyyy-MM-dd HH:mm:ss') : found['접수일시']; sh.getRange(found._row, 1, 1, row.length).setValues([row]); }
  else sh.appendRow(row);
}

/** 참가자 시트: 그 접수의 줄을 다시 씀. 운영진 칸은 참가자ID 기준으로 지킴 */
function writePeople_(sb) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.P);
  const old = rows_(SH.P).filter(r => String(r['접수번호']) === sb.no);
  const keep = {}; old.forEach(r => keep[String(r['참가자ID'])] = ADMIN_COLS.map(k => r[k]));
  old.map(r => r._row).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
  const f = sb.form || {}, info = f.info || {};
  const rows = sb.ppl.map(p => {
    const key = p.id.slice(sb.no.length + 1), i = info[key] || {};
    const r = p.rep && p.rep.rows && p.rep.rows[p.id] || (p.rep && p.rep.ids ? { name: p.rep.name, date: p.rep.date, a: p.rep.amt } : {});
    const vals = {
      '참가자ID': p.id, '접수번호': sb.no, '차수': sb.round, '학원': sb.acad, '접수 교사': sb.owner, '들어온 차례': (p.batch || 1) === 1 ? '처음 접수' : '추가 ' + ((p.batch || 1) - 1),
      '추가 일시': p.addAt || '', '이름': p.name, '구분': p.kind, '참가 구분': p.type, '악기': p.inst || i.inst || '', '담당 교사': i.teacher || '', '출생연도': i.by || '', '성별': i.gender || '',
      '현재 진도': i.prog || '', '선호 교수1': i.p1 || '', '선호 교수2': i.p2 || '', '추가 레슨': i.lessons || '', '마스터클래스': (i.mc || []).join(', '),
      '음악회': i.concert && i.concert !== '없음' ? i.concert : '', '음악회 곡': i.other ? (String(i.oc || '') + ' ' + String(i.ot || '')).trim() : (i.song || ''),
      '가족방': p.room ? '대표(빈 자리 요금)' : (f.room && f.room[key] ? '대표' : ''), '참가비': p.fee, '레슨·MC': p.lesson, '연회비': p.dues, '가족방비': p.room || 0,
      '청구액': (+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0), '상태': p.status, '입금 상태': p.pay,
      '신고 입금자명': r.name || '', '신고 입금일': r.date || '', '신고 금액': r.a || '', '신고 메모': p.rep && p.rep.memo || ''
    };
    const k = keep[p.id] || ['', '', ''];
    ADMIN_COLS.forEach((c, j) => vals[c] = k[j]);
    return P_HEAD.map(h => vals[h] === undefined ? '' : vals[h]);
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, P_HEAD.length).setValues(rows);
}

/** 앙상블 팀: 접수 내용에서 다시 만듦 (대표 학원 접수 + 「대표가 이미 있어요」로 들어온 학원) */
function teams_(all) {
  const L = all.filter(sb => sb.form && sb.form.ens && sb.form.ens.on && (sb.form.ens.group || '').trim() && sb.ppl.some(p => p.status === '정상'))
    .map(sb => { const e = sb.form.ens; return { name: e.group.trim(), rep: sb.acad, by: sb.owner || '', acads: (e.acads || []).slice(), no: sb.no, mem: [], e }; });
  all.forEach(sb => {
    const e = sb.form && sb.form.ens;
    if (e && e.member && e.joinNo && sb.ppl.some(p => p.status === '정상')) { const t = L.find(x => x.no === e.joinNo); if (t) { if (!t.acads.includes(sb.acad)) t.acads.push(sb.acad); t.mem.push({ acad: sb.acad, by: sb.owner || '', no: sb.no }); } }
  });
  return L.map(t => ({ name: t.name, rep: t.rep, by: t.by, acads: t.acads, no: t.no, mem: t.mem }));
}
/** 대표 팀에 함께하는 학원이 있으면: 앙상블을 끄거나 그 접수의 사람을 모두 취소할 수 없음 */
function guardRepTeam_(no, all, ensOn, leftCount) {
  const t = teams_(all).find(x => x.no === no); if (!t) return;
  const m = t.acads.filter(a => a !== t.rep); if (!m.length) return;
  if (!ensOn) throw new Error('앙상블 「' + t.name + '」 팀에 함께하는 학원(' + m.join(', ') + ')이 있어서 대표 신청을 취소할 수 없어요. 운영진에게 연락해 주세요.');
  if (leftCount < 1) throw new Error(no + ' 접수는 앙상블 「' + t.name + '」 팀 대표예요. 함께하는 학원(' + m.join(', ') + ')이 있어서 모두 취소할 수 없어요. 운영진에게 연락해 주세요.');
}
/** 한 학원은 한 팀에만: 이미 다른 접수(다른 선생님 포함)로 팀에 들어가 있으면 대표·함께 신청을 막음 */
function checkEns_(sb, all) {
  const e = sb.form && sb.form.ens; if (!e || !(e.on || e.member)) return;
  const T = teams_(all.filter(x => x.no !== sb.no));
  const t = T.find(x => x.rep === sb.acad || x.acads.includes(sb.acad));
  if (!t) return;
  if (e.member && e.joinNo === t.no) return;
  throw new Error(sb.acad + '은(는) 이미 앙상블 「' + t.name + '」 팀에 들어가 있어요 (대표 학원 ' + t.rep + ' · ' + t.by + ' 선생님 신청). 화면을 새로 고쳐 확인해 주세요.');
}
function writeTeams_(all) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.ENS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  const T = teams_(all);
  const rows = T.map(t => { const e = (all.find(sb => sb.no === t.no).form.ens) || {};
    return [t.no, t.name, t.rep, t.acads.join(', '), e.k1 || '', e.c1 || '', e.o1 || '', e.acc1 ? 'O' : '', e.video1 ? 'O' : '', e.k2 || '', e.c2 || '', e.o2 || '', e.acc2 ? 'O' : '', e.video2 ? 'O' : '',
      (e.tm || e.ts) ? (+e.tm || 0) + '분 ' + (+e.ts || 0) + '초' : '']; });
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/* ---------------- 금액은 서버가 다시 계산 ---------------- */
/** 화면이 보낸 금액을 믿지 않고 참가 구분·차수·레슨·마스터클래스·연회비·가족방으로 다시 계산 */
function recalc_(sb) {
  const f = sb.form || {}, info = f.info || {}, ri = Math.max(0, Math.min(ROUND_NAMES.length - 1, +f.ri || 0));
  sb.round = ROUND_NAMES[ri];
  const tPaid = {}; teachers_().forEach(t => tPaid['t_' + t.id] = !!t.paidDate);
  const sPaid = {}; rows_(SH.S).forEach(r => sPaid[String(r['ID'])] = !!dstr_(r['회비 납부일']));
  const key = p => p.id.slice(sb.no.length + 1);
  const live = sb.ppl.filter(p => p.status !== '취소');
  const liveKeys = live.map(key);
  // 가족방: 대표 + 같은 방 형제 + 그 가족
  const roomBy = {};
  Object.keys(f.room || {}).filter(k => f.room[k] && liveKeys.includes(k)).forEach(k => {
    const heads = [k].concat(Object.keys(f.join || {}).filter(j => f.join[j] === k && liveKeys.includes(j)));
    const fam = (f.fam || []).filter(x => heads.includes(x.link) && liveKeys.includes(x.id)).length;
    roomBy[k] = Math.max(0, OPT.roomCap - (heads.length + fam)) * OPT.roomEmptyFee;
  });
  sb.ppl.forEach(p => {
    const k = key(p), i = info[k];
    if (!i) return;                                   // 입금돼서 남겨 둔 사람(명단에서 뺀 사람)은 그대로
    if (!FEES[i.type]) throw new Error(p.name + '의 참가 구분(' + i.type + ')을 확인해 주세요.');
    const plays = PLAYS.includes(i.type);
    const les = plays ? Math.max(0, Math.min(OPT.lessonMax, +i.lessons || 0)) : 0;
    const mc = plays ? (i.mc || []).reduce((t, n) => t + ((MASTER.find(m => m.n === n) || {}).fee || 0), 0) : 0;
    const isT = /^t_|^me_/.test(k), isFam = (f.fam || []).some(x => x.id === k);
    const paid = isFam ? true : isT ? (k.indexOf('me_') === 0 ? true : !!tPaid[k]) : !!sPaid[k];
    p.type = i.type; p.fee = FEES[i.type][ri]; p.lesson = les * OPT.lessonFee + mc;
    p.dues = paid ? 0 : (isT ? OPT.teacherDues : OPT.studentDues);
    p.room = roomBy[k] || 0;
  });
  return sb;
}

/** 입금 신고 검사: 날짜(오늘까지 · 입금 시작일 이후) · 금액 · 입금자명 */
function checkRep_(p) {
  const r = p.rep && p.rep.rows && p.rep.rows[p.id];
  if (!r) throw new Error(p.name + ' 입금 신고 내용이 비어 있어요.');
  const d = String(r.date || ''), from = setting_('입금 시작일') || '2026-10-01';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(p.name + ' 입금일을 선택해 주세요.');
  if (d > today_()) throw new Error(p.name + ' 입금일이 오늘보다 뒤예요. 날짜를 확인해 주세요.');
  if (d < from) throw new Error(p.name + ' 입금일이 ' + from + ' 보다 앞이에요. 날짜를 확인해 주세요.');
  const a = +r.a || 0;
  if (!(a > 0) || a > PAY_MAX) throw new Error(p.name + ' 입금 금액을 확인해 주세요.');
  const nm = String(r.name || '').trim();
  if (!nm || nm.length > 20) throw new Error(p.name + ' 입금자명을 20자 안으로 넣어 주세요.');
  r.name = nm; r.a = a;
}
/** 선생님이 마지막으로 적은 환불 계좌 (환불요청·입금신고 시트에서 찾음) → 다음 환불 칸에 미리 채움 */
function myAcct_(name) {
  let best = null;
  const put = (at, bank, acct, holder) => { acct = String(acct || '').replace(/[^\d-]/g, ''); if (!bank || acct.replace(/-/g, '').length < 6 || !holder) return; at = at instanceof Date ? Utilities.formatDate(at, TZ, 'yyyy-MM-dd HH:mm:ss') : String(at || ''); if (!best || at >= best.at) best = { at, bank: String(bank).trim(), acct, holder: String(holder).trim() }; };
  try { rows_(SH.CX).forEach(r => { if (String(r['요청 교사']) === name) put(r['요청 일시'], r['은행'], r['계좌번호'], r['예금주']); }); } catch (x) {}
  try { rows_(SH.RP).forEach(r => { if (String(r['접수 교사']) !== name) return; const m = String(r['환불 계좌'] || '').trim().match(/^(.+?)\s+([\d-]{6,})\s+(.+)$/); if (m) put(r['기록 일시'], m[1], m[2], m[3]); }); } catch (x) {}
  return best ? { bank: best.bank, acct: best.acct, holder: best.holder } : null;
}
/** 과납 환불 계좌: 시트(입금신고)에만 쓰고 접수 내용(JSON)에서는 뺌 */
function takeRefundAcct_(p) {
  const x = p.rep && p.rep.refund; if (!x) return '';
  delete p.rep.refund;
  const acct = String(x.acct || '').replace(/[^\d-]/g, '');
  if (!x.bank || acct.replace(/-/g, '').length < 6 || acct.replace(/-/g, '').length > 20 || !String(x.holder || '').trim()) throw new Error(p.name + ' 환불 계좌(은행·계좌번호·예금주)를 확인해 주세요.');
  return x.bank + ' ' + acct + ' ' + String(x.holder).trim();
}

/* ---------------- 선생님이 부르는 기능 ---------------- */
/** 새 접수: 접수번호는 서버가 붙임 (27W-001 …) */
function submitNew(token, sb) {
  const u = who_(token);
  if (!u.acads.includes(sb.acad)) throw new Error('이 학원으로 접수할 수 없어요.');
  const lock = lock_();
  try {
    const all = loadSubs_();
    // 응답이 늦어 다시 보냈거나 자동 재시도한 같은 요청이면 → 이미 만든 접수를 그대로 돌려줌
    if (sb.reqId) { const done = all.find(x => x.reqId === sb.reqId); if (done) { lock.releaseLock(); return Object.assign({ ok: true, no: done.no, again: true }, bundle_(u.acads)); } }
    // 같은 학원 다른 접수에 이미 있는 사람은 다시 못 넣음
    const key = id => id.slice(id.indexOf('_') + 1);
    const taken = {};
    all.filter(x => x.acad === sb.acad).forEach(x => x.ppl.filter(p => p.status === '정상').forEach(p => taken[key(p.id)] = x.no));
    const dup = sb.ppl.filter(p => p.kind !== '가족' && taken[key(p.id)]);
    if (dup.length) throw new Error(`${dup.map(p => p.name).join(', ')}은(는) 이미 ${taken[key(dup[0].id)]}에 접수돼 있어요. 「내 접수」에서 확인해 주세요.`);
    const n = all.reduce((m, x) => Math.max(m, +String(x.no).split('-')[1] || 0), 0) + 1;
    const no = CAMP_ID + '-' + String(n).padStart(3, '0');
    const tmp = sb.no;
    sb.no = no; sb.owner = u.name; sb.createdAt = stamp_();
    sb.ppl.forEach(p => { p.id = no + p.id.slice(tmp.length); p.pay = '전'; p.paidAmt = 0; delete p.rep; });
    sb.rev = 1; recalc_(sb); checkEns_(sb, all);
    teacherDup_(all, sb);
    writeSub_(sb, true);
    all.push(sb); writeTeams_(all);
    log_(u.name, '새 접수', no + ' · ' + sb.ppl.length + '명');
    mail_(sb, u);
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true, no: sb.no }, bundle_(u.acads));
}

/** 내 접수 저장 (인원 추가·정보 수정·입금 신고·신고 수정·취소) — 내가 낸 접수만 */
function saveSubs(token, subs) {
  const u = who_(token);
  const lock = lock_();
  try {
    const all = loadSubs_();
    // 다른 화면(원장님 PC·폰 등)에서 그 사이 먼저 고쳤으면 덮어쓰지 않고 새로 불러오게 함
    const stale = (subs || []).filter(sb => { const cur = all.find(x => x.no === sb.no); return cur && (+cur.rev || 0) !== (+sb.rev || 0); });
    if (stale.length) { lock.releaseLock(); return Object.assign({ ok: false, conflict: true, msg: stale.map(x => x.no).join(', ') + ' 접수를 다른 화면에서 먼저 고쳤어요. 최신 내용으로 다시 불러왔으니 한 번 더 해 주세요.' }, bundle_(u.acads)); }
    (subs || []).forEach(sb => {
      const cur = all.find(x => x.no === sb.no);
      if (!cur) throw new Error(sb.no + ' 접수를 찾지 못했어요.');
      if (cur.owner !== u.name) throw new Error(sb.no + '는 ' + cur.owner + ' 선생님이 낸 접수라 고칠 수 없어요.');
      sb.acad = cur.acad; sb.owner = cur.owner; sb.createdAt = cur.createdAt; sb.no = cur.no; sb.reqId = cur.reqId; sb.rev = (+cur.rev || 0) + 1;
      recalc_(sb);
      teacherDup_(all, sb, sb.ppl.filter(p => !cur.ppl.some(c => c.id === p.id)).map(p => p.id));
      if (JSON.stringify((sb.form || {}).ens || {}) !== JSON.stringify((cur.form || {}).ens || {})) checkEns_(sb, all);
      guardRepTeam_(cur.no, all, !!(sb.form && sb.form.ens && sb.form.ens.on), sb.ppl.filter(p => p.status === '정상').length);
      // 새로 낸 신고에는 그때까지 확인된 금액(base)을 적어 둠 → 차액 신고를 운영진 확인 전까지 지킴
      sb.ppl.forEach(p => { const c = cur.ppl.find(x => x.id === p.id); const row = p.rep && p.rep.rows && p.rep.rows[p.id];
        if (p.pay === '신고' && row) { const old = c && c.rep && c.rep.rows && c.rep.rows[p.id]; if (!(c && c.pay === '신고' && c.rep && c.rep.id === p.rep.id && old)) row.base = c ? (+c.paidAmt || 0) : 0; else row.base = old.base !== undefined ? old.base : (+c.paidAmt || 0); } });
      // 입금 신고 확인 전인 사람은 금액이 바뀌는 수정 금지 (가족방 빈 자리 요금은 다른 사람 때문에 바뀔 수 있어 뺌)
      { const lk = sb.ppl.filter(p => { const c = cur.ppl.find(x => x.id === p.id); return c && c.status === '정상' && c.pay === '신고' && p.status === '정상' && ((+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0)) !== ((+c.fee || 0) + (+c.lesson || 0) + (+c.dues || 0)); });
        if (lk.length) throw new Error(lk.map(p => p.name).join(', ') + '은(는) 입금 신고 확인 중이라 운영진이 확인하기 전까지 정보를 고칠 수 없어요.'); }
      // 입금 확인은 운영진 칸 기준 (선생님 화면 값 무시)
      const admin = adminMap_(); applyAdmin_(sb, admin);
      // 운영진이 정한 것은 선생님 화면의 옛 값으로 되돌리지 않음
      cur.ppl.forEach(c => {
        const p = sb.ppl.find(x => x.id === c.id); if (!p) return;
        if (c.status === '취소' && c.refund) { p.status = '취소'; p.refund = c.refund; }
        if (c.status === '정상' && c.cxRejected && p.status === '취소요청' && !(p.cxReqAt && p.cxReqAt > c.cxRejected)) { p.status = '정상'; }
        p.cxRejected = c.cxRejected; p.rejected = c.rejected;
        ['ovReq', 'ovDone', 'ovRejected'].forEach(k => { if (c[k] !== undefined) p[k] = c[k]; else delete p[k]; });
        if (p.pay === '신고' && p.rep && (c.rejected || []).some(r => r.id === p.rep.id)) { p.pay = '전'; delete p.rep; }
      });
      // 입금 신고 기록 남기기 (새로 생긴 신고·바뀐 신고·취소)
      const before = {}; cur.ppl.forEach(p => before[p.id] = p);
      sb.ppl.forEach(p => {
        const b = before[p.id] || {};
        const r = x => x && x.rep && x.pay === '신고' ? JSON.stringify(x.rep.rows && x.rep.rows[x.id] || [x.rep.name, x.rep.date, x.rep.amt]) : '';
        let refund = '';
        if (p.pay === '신고' && r(p) !== r(b)) { checkRep_(p); refund = takeRefundAcct_(p); }
        else if (p.rep && p.rep.refund) delete p.rep.refund;
        if (r(p) !== r(b)) {
          const row = p.rep && p.rep.rows && p.rep.rows[p.id] || {};
          ensureHead_(SH.RP, RP_HEAD);
          SpreadsheetApp.getActive().getSheetByName(SH.RP).appendRow([stamp_(), p.rep ? p.rep.id : (b.rep && b.rep.id) || '', sb.no, sb.acad, u.name, p.name,
            row.name || '', row.date || '', row.a || '', p.rep && p.rep.memo || '', p.pay === '신고' ? (b.pay === '신고' ? '신고 수정' : '새 신고') : '신고 취소', refund ? "'" + refund : '']);
        }
        if (p.status !== '정상' && b.status === '정상') log_(u.name, p.status === '취소' ? '취소' : '취소 요청', sb.no + ' · ' + p.name);
        // 입금 전 바로 취소: 운영진이 볼 수 있게 「환불요청」 시트에 기록 (처리 = 바로 취소)
        if (p.status === '정상' && b.status === '취소' && !b.refund) {
          if ((+b.paidAmt || 0) > 0) throw new Error(p.name + '은(는) 입금 기록이 있어 운영진에게 문의해 주세요.');
          const k = p.id.slice(sb.no.length + 1);
          const other = all.find(x => x.no !== sb.no && (x.acad === sb.acad || /^t_/.test(k)) && x.ppl.some(q => q.id.slice(x.no.length + 1) === k && (q.status === '정상' || q.status === '취소요청')));
          if (other) throw new Error(p.name + '은(는) 이미 ' + other.no + '에 접수돼 있어서 다시 참가할 수 없어요.');
          delete p.cxAt; delete p.cxWhy; p.rejoinAt = stamp_();
          log_(u.name, '다시 참가', sb.no + ' · ' + p.name);
          markCx_(sb.no, p.id, '바로 취소', '다시 참가', '선생님이 다시 참가로 되돌림');
        }
        if (p.status === '취소' && b.status === '정상' && !p.refund) {
          if ((+p.paidAmt || 0) > 0) throw new Error(p.name + '은(는) 방금 입금이 확인됐어요. 화면을 새로 고친 뒤 「취소 요청」으로 다시 해 주세요.');
          p.cxAt = stamp_();
          ensureHead_(SH.CX, CX_HEAD);
          SpreadsheetApp.getActive().getSheetByName(SH.CX).appendRow([stamp_(), sb.no, sb.acad, u.name, p.name, String(p.cxWhy || '').slice(0, 40), 0, '', '', '', '', '바로 취소', today_(), '입금 전이라 선생님이 바로 취소', p.id, amt_(p), 0, '입금 전 취소 (환불 없음)']);
        }
      });
      writeSub_(sb, false);
      const i = all.indexOf(cur); all[i] = sb;
      log_(u.name, '접수 저장', sb.no);
    });
    writeTeams_(all);
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true }, bundle_(u.acads));
}

/** 더 낸 금액(차액) 돌려받기 요청: 수정으로 청구액이 줄었거나 더 많이 입금한 사람. 취소가 아님 */
const amt_ = p => (+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0);
function overRefundReq(token, req) {
  const u = who_(token);
  const acct = String(req.acct || '').replace(/[^\d-]/g, ''), n = acct.replace(/-/g, '').length;
  if (!req.bank || n < 6 || n > 20 || !String(req.holder || '').trim()) throw new Error('돌려받을 은행·계좌번호(6~20자리)·예금주를 확인해 주세요.');
  const lock = lock_();
  try {
    const all = loadSubs_(); const sb = all.find(x => x.no === req.no);
    if (!sb || sb.owner !== u.name || !u.acads.includes(sb.acad)) throw new Error('이 접수의 환불을 요청할 수 없어요.');
    applyAdmin_(sb, adminMap_());
    const items = sb.ppl.filter(p => (req.ids || []).includes(p.id) && p.status === '정상' && !p.ovReq && (+p.paidAmt || 0) - amt_(p) > 0)
      .map(p => ({ p, amt: (+p.paidAmt || 0) - amt_(p) }));
    if (!items.length) throw new Error('돌려받을 금액이 없어요. 화면을 새로 고쳐 확인해 주세요.');
    const sum = items.reduce((t, x) => t + x.amt, 0);
    items.forEach(x => { x.p.ovReq = { at: stamp_(), amt: x.amt }; delete x.p.ovRejected; });
    ensureHead_(SH.CX, CX_HEAD);
    SpreadsheetApp.getActive().getSheetByName(SH.CX).appendRow([stamp_(), sb.no, sb.acad, u.name, items.map(x => x.p.name).join(', '), '차액 환불', sum,
      req.bank, "'" + acct, String(req.holder).trim(), '', '요청', '', items.map(x => x.p.name + ' ' + x.amt).join(' / '), items.map(x => x.p.id).join(','), items.reduce((t, x) => t + amt_(x.p), 0), items.reduce((t, x) => t + (+x.p.paidAmt || 0), 0), '차액 환불 (참가 그대로)']);
    sb.rev = (+sb.rev || 0) + 1; writeSub_(sb, false);
    log_(u.name, '차액 환불 요청', sb.no + ' · ' + sum);
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true }, bundle_(u.acads));
}

/** 환불 요청: 계좌·진단서는 「환불요청」 시트와 드라이브 폴더에만 (접수 내용 JSON에는 넣지 않음) */
function cancelReq(token, req) {
  const u = who_(token);
  const lock = lock_();
  try {
  const sb = loadSubs_().find(x => x.no === req.no);
  if (!sb || sb.owner !== u.name || !u.acads.includes(sb.acad)) throw new Error('이 접수의 환불을 요청할 수 없어요.');
  const ps = sb.ppl.filter(p => (req.ids || []).includes(p.id));
  if (!ps.length) throw new Error('환불 요청할 사람을 찾지 못했어요.');
  guardRepTeam_(sb.no, loadSubs_(), true, sb.ppl.filter(p => p.status === '정상' && !(req.ids || []).includes(p.id)).length);
  req.acad = sb.acad; req.names = ps.map(p => p.name);
  applyAdmin_(sb, adminMap_());
  const baseAmt = ps.reduce((t, p) => t + amt_(p), 0), paidAmt = ps.reduce((t, p) => t + (+p.paidAmt || 0), 0);
  const maxAmt = ps.reduce((t, p) => t + Math.max(0, (+p.paidAmt || 0) - (+p.dues || 0)), 0);
  req.amt = Math.max(0, Math.min(+req.amt || 0, maxAmt));
  if (req.amt > 0) {
    const acct = String(req.acct || '').replace(/[^\d-]/g, ''), n = acct.replace(/-/g, '').length;
    if (!req.bank || n < 6 || n > 20 || !String(req.holder || '').trim()) throw new Error('환불 받을 은행·계좌번호(6~20자리)·예금주를 확인해 주세요.');
    req.acct = acct;
  }
  if (!String(req.why || '').trim()) throw new Error('취소 사유를 골라 주세요.');
  let link = '';
  if (req.file && req.file.data) {
    const it = DriveApp.getFoldersByName('캠프 진단서 ' + CAMP_ID);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder('캠프 진단서 ' + CAMP_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(req.file.data), req.file.type || 'application/octet-stream',
      `${req.acad}-${req.names.join('_')}-${Utilities.formatDate(new Date(), TZ, 'yyyyMMdd')}-${req.file.name}`);
    link = folder.createFile(blob).getUrl();
  }
  ensureHead_(SH.CX, CX_HEAD);
  SpreadsheetApp.getActive().getSheetByName(SH.CX).appendRow([stamp_(), req.no, req.acad, u.name, req.names.join(', '), req.why, req.amt || 0,
    req.bank || '', req.acct ? "'" + req.acct : '', req.holder || '', link, '요청', '', '', (req.ids || []).join(','), baseAmt, paidAmt, String(req.rule || '').slice(0, 60)]);
  log_(u.name, '환불 요청', req.no + ' · ' + req.names.join(', '));
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ---------------- 관리자 ---------------- */
/** 「설정」 탭: 관리자 아이디·비밀번호 (비밀번호는 시트에서 직접 정함) */
function setupAdmin_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('설정');
  if (!sh) { sh = ss.insertSheet('설정'); sh.appendRow(['항목', '값', '설명']);
    sh.appendRow(['관리자 아이디', 'admin', '관리자 화면(?page=admin) 로그인 아이디']);
    sh.appendRow(['관리자 비밀번호', '', '여기에 비밀번호를 적어야 관리자 화면에 들어갈 수 있어요 (8자 이상)']);
    sh.setFrozenRows(1); }
  return sh;
}
function ensureSettings_() {
  const sh = setupAdmin_();
  sh.getRange('B:B').setNumberFormat('@');   // 값 칸은 글자 그대로 (날짜·계좌번호가 바뀌지 않게)
  const have = rows_('설정').map(r => String(r['항목']));
  SETTINGS.forEach(r => { if (!have.includes(r[0])) sh.appendRow(r); });
}
function bankInfo_() { return { bank: setting_('입금 은행'), acct: setting_('입금 계좌번호'), holder: setting_('예금주'), from: setting_('입금 시작일') || '2026-10-01' }; }
function setting_(k) { const r = rows_('설정').find(x => String(x['항목']) === k); return r ? dstr_(r['값']).trim() : ''; }
function ensureHead_(name, head) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  const cur = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  head.forEach(h => { if (!cur.includes(h)) { cur.push(h); sh.getRange(1, cur.length).setValues([[h]]); } });
}
function adminLogin(id, pw) {
  ensureSettings_();
  const C = CacheService.getScriptCache(), fails = +C.get('adm_fail') || 0;
  if (fails >= 10) return { ok: false, msg: '비밀번호를 여러 번 틀려서 5분 동안 잠겼어요. 잠시 뒤 다시 해 주세요.' };
  const want = setting_('관리자 비밀번호');
  if (!want || want.length < 8) return { ok: false, msg: '「설정」 탭의 관리자 비밀번호 칸에 8자 이상 비밀번호를 먼저 적어 주세요.' };
  if (String(id).trim() !== setting_('관리자 아이디') || String(pw) !== want) { C.put('adm_fail', String(fails + 1), 300); Utilities.sleep(800); return { ok: false, msg: '아이디나 비밀번호가 맞지 않아요.' + (fails >= 6 ? ' (' + (10 - fails - 1) + '번 더 틀리면 5분 잠김)' : '') }; }
  C.remove('adm_fail');
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('adm_' + token, JSON.stringify({ name: String(id).trim() }), 21600);
  log_('관리자 ' + id, '로그인', '');
  return Object.assign({ ok: true, token }, adminData(token));
}
/** STG 전용: 「설정」 탭 「관리자 자동 로그인」 = 예 이면 비밀번호 없이 들어감 (메인 시트에는 이 줄을 두지 않음) */
function adminAuto() {
  if (setting_('관리자 자동 로그인') !== '예') return { ok: false };
  const token = Utilities.getUuid(), id = setting_('관리자 아이디') || 'admin';
  CacheService.getScriptCache().put('adm_' + token, JSON.stringify({ name: id + '(자동)' }), 21600);
  log_('관리자 ' + id, '자동 로그인(테스트)', '');
  return Object.assign({ ok: true, token, id }, adminData(token));
}
function adm_(token) {
  const v = CacheService.getScriptCache().get('adm_' + token);
  if (!v) throw new Error('관리자 로그인이 끝났어요. 새로 고쳐 다시 로그인해 주세요.');
  return JSON.parse(v);
}
/** 관리자 화면에 필요한 것: 모든 접수 · 운영진 칸 · 환불 요청 · 앙상블 팀 */
function adminData(token) {
  adm_(token);
  const subs = loadSubs_();
  const admin = adminMap_();
  ensureHead_(SH.CX, CX_HEAD);
  const cx = rows_(SH.CX).filter(r => r['접수번호']).map(r => ({ row: r._row, at: String(r['요청 일시']), no: String(r['접수번호']), acad: String(r['학원']), by: String(r['요청 교사']),
    names: String(r['참가자']), why: String(r['사유']), amt: +r['환불 예정액'] || 0, bank: String(r['은행'] || ''), acct: String(r['계좌번호'] || ''), holder: String(r['예금주'] || ''),
    doc: String(r['진단서'] || ''), state: String(r['처리'] || '요청'), done: dstr_(r['처리일']), memo: String(r['메모'] || ''), ids: String(r['참가자ID'] || '').split(',').filter(Boolean), base: +r['신청액'] || 0, paid: +r['입금액'] || 0, rule: String(r['적용 규정'] || ''), okAt: dstr_(r['접수일']) }));
  // 통계용: 예전 접수라 사람마다 악기가 비어 있으면 명단에서 채워서 보냄 (시트에는 안 씀)
  const inst = {}; teachers_().forEach(t => inst['t_' + t.id] = t.inst); rows_(SH.S).forEach(r => inst[String(r['ID'])] = String(r['악기'] || ''));
  subs.forEach(sb => sb.ppl.forEach(p => { if (!p.inst) { const k = p.id.slice(sb.no.length + 1), i = (sb.form && sb.form.info && sb.form.info[k]) || {}; p.inst = i.inst || inst[k] || ''; } }));
  return { today: today_(), subs, admin, cx, teams: teams_(subs), issues: issues_() };
}
function setAdminCols_(pid, vals) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.P);
  const r = rows_(SH.P).find(x => String(x['참가자ID']) === pid);
  if (!r) throw new Error('참가자 줄을 찾지 못했어요: ' + pid);
  const c0 = P_HEAD.indexOf(ADMIN_COLS[0]) + 1;
  sh.getRange(r._row, c0, 1, 3).setValues([vals]);
  const ci = P_HEAD.indexOf('입금 상태') + 1;
  sh.getRange(r._row, ci, 1, 1).setValues([[vals[1] ? '확인' : '']]);
}
/** 입금 확인 (날짜 필수). amt를 비우면 확인 취소 */
function adminConfirm(token, items) {
  const a = adm_(token);
  const lock = lock_();
  try {
    items.forEach(it => {
      if (it.amt > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(it.date || '')) throw new Error('입금일을 선택해 주세요.');
      setAdminCols_(it.pid, it.amt > 0 ? [it.date, it.amt, it.memo || ''] : ['', '', it.memo || '']);
      log_('관리자 ' + a.name, it.amt > 0 ? '입금 확인' : '입금 확인 취소', it.pid + (it.amt > 0 ? ' · ' + it.date + ' · ' + it.amt : ''));
    });
    // 접수 탭 합계 다시 쓰기
    const subs = loadSubs_(); const nos = [...new Set(items.map(it => it.pid.split('_')[0]))];
    subs.filter(sb => nos.includes(sb.no)).forEach(sb => writeSubRow_(sb));
  } finally { lock.releaseLock(); }
  return adminData(token);
}
/** 입금 신고 반려: 그 사람은 다시 「입금 전」, 선생님 화면에 사유 표시 */
/** 입금 신고 반려 (한 명 또는 여러 명: pid 자리에 배열) */
function adminRejectReport(token, pid, reason) {
  const a = adm_(token);
  const pids = Array.isArray(pid) ? pid : [pid];
  if (!pids.length) throw new Error('반려할 사람을 골라 주세요.');
  const lock = lock_();
  try {
    const all = loadSubs_(), touched = [];
    pids.forEach(id => {
      const sb = all.find(x => id.indexOf(x.no + '_') === 0); if (!sb) throw new Error('접수를 찾지 못했어요.');
      const p = sb.ppl.find(x => x.id === id);
      if (!p || p.pay !== '신고' || !p.rep) throw new Error((p ? p.name : id) + ' 은(는) 입금 신고 상태가 아니에요. 새로 불러와 주세요.');
      const row = p.rep.rows && p.rep.rows[p.id] || {};
      p.rejected = (p.rejected || []).concat([{ id: p.rep.id, at: stamp_(), why: reason || '' }]);
      p.pay = '전'; delete p.rep;
      if (!touched.includes(sb)) touched.push(sb);
      SpreadsheetApp.getActive().getSheetByName(SH.RP).appendRow([stamp_(), p.rejected.slice(-1)[0].id, sb.no, sb.acad, '관리자 ' + a.name, p.name, row.name || '', row.date || '', row.a || '', reason || '', '반려']);
      log_('관리자 ' + a.name, '입금 신고 반려', id + ' · ' + (reason || ''));
    });
    touched.forEach(sb => writeSub_(sb, false));
  } finally { lock.releaseLock(); }
  return adminData(token);
}
/** 관리자: 앙상블 팀 정보 고치기 (팀 이름·함께하는 학원·곡·시간·운영진 메모) */
function adminSaveEns(token, no, patch) {
  const a = adm_(token);
  const lock = lock_();
  try {
    const all = loadSubs_(); const sb = all.find(x => x.no === no);
    if (!sb || !sb.form || !sb.form.ens || !sb.form.ens.on) throw new Error('앙상블 대표 접수를 찾지 못했어요. 새로 불러와 주세요.');
    const e = sb.form.ens, t = s => String(s == null ? '' : s).trim().slice(0, 200);
    if (!t(patch.group)) throw new Error('팀 이름을 넣어 주세요.');
    const before = JSON.stringify(e);
    e.group = t(patch.group);
    e.acads = [...new Set((patch.acads || []).map(t).filter(x => x && x !== sb.acad))];
    ['k1', 'c1', 'o1', 'k2', 'c2', 'o2', 'adminMemo'].forEach(k => e[k] = t(patch[k]));
    ['acc1', 'video1', 'acc2', 'video2'].forEach(k => e[k] = !!patch[k]);
    e.tm = String(Math.min(99, Math.max(0, parseInt(patch.tm, 10) || 0)) || ''); e.ts = String(Math.min(59, Math.max(0, parseInt(patch.ts, 10) || 0)) || '');
    if (JSON.stringify(e) === before) return adminData(token);
    e.adminEdited = stamp_() + ' ' + a.name;
    sb.rev = (+sb.rev || 0) + 1;
    writeSub_(sb, false); writeTeams_(all);
    log_('관리자 ' + a.name, '앙상블 수정', no + ' · ' + e.group);
  } finally { lock.releaseLock(); }
  return adminData(token);
}
/** 환불 요청 처리: 완료(환불한 날 필수) / 반려 */
/** 환불 처리는 두 단계: ① 접수(승인) — 참가 취소·환불 예정 금액 확정  ② 환불 완료 — 실제로 돈을 보낸 날짜(필수)
 *  action: '접수' | '완료' | '반려'   (환불액 0원이면 '접수' = 취소 확정, 송금 단계 없음) */
function adminRefund(token, row, action, date, memo, amt) {
  const a = adm_(token);
  if (action === '완료' && !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('환불한(돈을 보낸) 날짜를 선택해 주세요.');
  const lock = lock_();
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SH.CX);
    ensureHead_(SH.CX, CX_HEAD);
    const r = rows_(SH.CX).find(x => x._row === row); if (!r) throw new Error('요청 줄을 찾지 못했어요.');
    const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const set = (k, v) => sh.getRange(row, h.indexOf(k) + 1).setValues([[v]]);
    const st = String(r['처리'] || '요청');
    if (action === '접수' && st !== '요청') throw new Error('이미 처리한 요청이에요. 새로 불러와 주세요.');
    if (action === '완료' && st !== '환불 예정') throw new Error('먼저 「환불 접수」를 해 주세요.');
    if (action === '반려' && !['요청', '환불 예정'].includes(st)) throw new Error('이미 끝난 요청이에요.');
    const money = (amt !== undefined && amt !== '') ? +amt || 0 : +r['환불 예정액'] || 0;
    const ov = String(r['사유']) === '차액 환불';
    let newSt = action === '반려' ? '반려' : action === '완료' ? '환불 완료' : (money > 0 ? '환불 예정' : (ov ? '반려' : '취소 확정'));
    set('처리', newSt); set('메모', memo || String(r['메모'] || ''));
    if (action === '접수') { set('접수일', today_()); set('환불 예정액', money); set('처리일', money > 0 ? '' : today_()); }
    else set('처리일', action === '완료' ? date : today_());
    const ids = String(r['참가자ID'] || '').split(',').filter(Boolean);
    const all = loadSubs_(); const sb = all.find(x => x.no === String(r['접수번호']));
    if (sb && ov) {
      const am = adminMap_(), hits = sb.ppl.filter(p => ids.includes(p.id));
      const want = hits.reduce((t, p) => t + (p.ovReq ? +p.ovReq.amt : 0), 0), total = (amt !== undefined && amt !== '') ? +amt || 0 : (+r['환불 예정액'] || want);
      hits.forEach((p, i) => {
        if (action === '접수') { if (p.ovReq) p.ovReq.ok = today_(); }
        else if (action === '완료') {
          // 사람마다 요청한 금액만큼 (운영진이 합계를 바꿨으면 마지막 사람에게 차이를 붙임)
          let give = p.ovReq ? +p.ovReq.amt : 0; if (i === hits.length - 1) give += total - want;
          const a0 = am[p.id] || { date: '', amt: +p.paidAmt || 0, memo: '' };
          const left = Math.max(0, a0.amt - give);
          setAdminCols_(p.id, [a0.date || date, left, (a0.memo ? a0.memo + ' / ' : '') + '차액 환불 ' + give + '원 ' + date]);
          p.paidAmt = left; p.ovDone = (p.ovDone || []).concat([{ date, amt: give }]); delete p.ovReq;
        } else { p.ovRejected = { at: stamp_(), why: memo || '' }; delete p.ovReq; }
      });
      writeSub_(sb, false);
    } else if (sb) {
      sb.ppl.forEach(p => {
        const hit = ids.length ? ids.includes(p.id) : String(r['참가자']).split(', ').includes(p.name) && p.status === '취소요청';
        if (!hit) return;
        if (action === '접수') { p.status = '취소'; p.refund = { amt: money, okAt: today_(), date: '' }; }
        else if (action === '완료') { p.status = '취소'; p.refund = Object.assign({}, p.refund || {}, { amt: money, date }); }
        else { p.status = '정상'; delete p.refund; p.cxRejected = stamp_(); p.cxWhy = memo || ''; }
      });
      writeSub_(sb, false); writeTeams_(all);
    }
    log_('관리자 ' + a.name, { 접수: money > 0 ? '환불 접수' : '취소 확정', 완료: '환불 완료(송금)', 반려: '환불 요청 반려' }[action], String(r['접수번호']) + ' · ' + r['참가자'] + ' · ' + money + (date ? ' · ' + date : ''));
  } finally { lock.releaseLock(); }
  return adminData(token);
}

/* ---------------- 알림·기록 ---------------- */
function mail_(sb, u) {
  try {
    const live = sb.ppl.filter(p => p.status === '정상');
    const bill = live.reduce((t, p) => t + (+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0), 0);
    const body = `${CAMP_NAME} 접수가 완료되었어요.\n\n접수번호: ${sb.no}\n학원: ${sb.acad}\n접수 교사: ${u.name}\n차수: ${sb.round}\n인원: ${live.length}명\n입금하실 금액: ${bill.toLocaleString('ko-KR')}원\n\n` +
      live.map(p => `- ${p.name} (${p.type}) ${((+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0)).toLocaleString('ko-KR')}원`).join('\n') +
      `\n\n입금한 뒤 접수 화면의 「내 접수」에서 사람별로 입금 신고를 해 주세요.`;
    if (sb.email) MailApp.sendEmail(sb.email, `[${CAMP_NAME}] 접수 완료 ${sb.no}`, body);
    if (ADMIN_EMAIL) MailApp.sendEmail(ADMIN_EMAIL, `[캠프 접수] ${sb.acad} ${sb.no} · ${live.length}명`, body);
  } catch (e) { log_('시스템', '메일 실패', String(e)); }
}
/* ---------------- 오류·건의 게시판 (「문의」 시트) ----------------
   글은 시트 한 줄(칸 13개)이라 용량 걱정 없음. 사진은 드라이브 「캠프 문의 사진」 폴더에(5MB까지). */
const ISS = '문의';
const ISS_HEAD = ['번호', '일시', '이름', '연락처 뒤4자리', '학원', '화면', '내용', '사진', '상태', '답변', '처리일', '처리자', '환경'];
const ISS_STATES = ['미해결', '해결 중', '해결'];
function issSheet_() {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(ISS);
  if (!sh) { sh = ss.insertSheet(ISS); sh.appendRow(ISS_HEAD); sh.setFrozenRows(1); sh.getRange('A:A').setNumberFormat('@'); }
  return sh;
}
function issues_() {
  issSheet_();
  return rows_(ISS).filter(r => r['번호']).map(r => ({ row: r._row, no: String(r['번호']), at: String(r['일시']), name: String(r['이름']), p4: String(r['연락처 뒤4자리'] || ''), acad: String(r['학원'] || ''),
    where: String(r['화면'] || ''), text: String(r['내용'] || ''), pic: String(r['사진'] || ''), state: String(r['상태'] || '미해결'), reply: String(r['답변'] || ''),
    done: dstr_(r['처리일']), by: String(r['처리자'] || ''), env: String(r['환경'] || '') }));
}
/** 선생님: 글 쓰기 (로그인 안 해도 됨 — 로그인이 안 되는 오류도 적을 수 있게) */
function submitIssue(token, d) {
  d = d || {};
  let u = null; try { if (token) u = who_(token); } catch (e) {}
  const name = String(u ? u.name : d.name || '').trim().slice(0, 20);
  const p4 = String(d.phone || '').replace(/\D/g, '').slice(-4);
  const text = String(d.text || '').trim();
  if (!name) throw new Error('이름을 넣어 주세요.');
  if (!u && p4.length < 4) throw new Error('휴대전화 번호를 넣어 주세요 (답을 드릴 때 써요).');
  if (text.length < 2) throw new Error('어떤 문제인지 적어 주세요.');
  if (text.length > 2000) throw new Error('2000자까지 적을 수 있어요.');
  const C = CacheService.getScriptCache(), k = 'iss_' + (name + p4).replace(/\s/g, '');
  if (C.get(k)) throw new Error('방금 글을 올렸어요. 1분 뒤에 다시 올려 주세요.');
  let pic = '';
  if (d.file && d.file.data) {
    if (String(d.file.data).length > 7000000) throw new Error('사진은 5MB까지 올릴 수 있어요.');
    if (!/^image\//.test(d.file.type || '')) throw new Error('사진(이미지) 파일만 올릴 수 있어요.');
    const it = DriveApp.getFoldersByName('캠프 문의 사진 ' + CAMP_ID);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder('캠프 문의 사진 ' + CAMP_ID);
    pic = folder.createFile(Utilities.newBlob(Utilities.base64Decode(d.file.data), d.file.type, Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss') + '-' + name + '-' + String(d.file.name || 'pic').slice(-40))).getUrl();
  }
  const lock = lock_();
  let no;
  try {
    const sh = issSheet_();
    const n = rows_(ISS).reduce((m, r) => Math.max(m, +String(r['번호']).replace(/\D/g, '') || 0), 0) + 1;
    no = 'Q' + String(n).padStart(3, '0');
    const acad = u ? (u.acads || []).join(', ') : String(d.acad || '').slice(0, 40);
    sh.appendRow([no, stamp_(), name, p4 ? "'" + p4 : '', acad, String(d.where || '').slice(0, 40), text, pic, '미해결', '', '', '', String(d.env || '').slice(0, 300)]);
    C.put(k, '1', 60);
  } finally { lock.releaseLock(); }
  log_(name, '문의', no);
  return { ok: true, no, mine: u ? myIssues_(u.name) : [] };
}
function myIssues_(name) { return issues_().filter(x => x.name === name).reverse().map(x => ({ no: x.no, at: x.at, where: x.where, text: x.text, pic: !!x.pic, state: x.state, reply: x.reply, done: x.done })); }
function myIssues(token) { const u = who_(token); return { ok: true, mine: myIssues_(u.name) }; }
/** 관리자: 상태·답변 */
function adminSetIssue(token, row, state, reply) {
  const a = adm_(token);
  if (!ISS_STATES.includes(state)) throw new Error('상태를 골라 주세요.');
  const lock = lock_();
  try {
    const sh = issSheet_(), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const r = rows_(ISS).find(x => x._row === row); if (!r) throw new Error('글을 찾지 못했어요. 새로 불러와 주세요.');
    const set = (k, v) => sh.getRange(row, h.indexOf(k) + 1).setValues([[v]]);
    set('상태', state); set('답변', String(reply || '').slice(0, 2000)); set('처리일', state === '미해결' ? '' : today_()); set('처리자', a.name);
    log_('관리자 ' + a.name, '문의 ' + state, String(r['번호']));
  } finally { lock.releaseLock(); }
  return adminData(token);
}

function log_(who, what, detail) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.LOG);
  if (sh) sh.appendRow([stamp_(), who, what, detail]);
}

/* ---------------- 시험용 마포스즈키 명단 (setup에서 시트로 옮긴 뒤에는 시트가 원본) ---------------- */
const MAPO = { acad: "마포스즈키", teachers: [], students: [], paid: {} }; /* 명단은 접수 DB 시트(명단_교사·명단_학생)에 있음. 코드에는 개인정보를 넣지 않음 */
