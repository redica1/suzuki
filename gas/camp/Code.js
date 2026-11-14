/* build: 20261115-015331 */
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
  '회원의 그외 악기 안하는 동반가족': [410000, 420000, 440000], '동반가족 중 15개월 미만': [310000, 320000, 340000],
  /* 비회원(학부모 직접 접수) — 금액은 「캠프 설정」 참가비표에서 정함 (기본값은 회원 금액과 같게 넣어 둠) */
  '비회원 학생': [560000, 570000, 590000], '비회원 보호자': [510000, 520000, 540000], '비회원 동반가족': [410000, 420000, 440000], '비회원 15개월 미만': [310000, 320000, 340000],
  /* 관계자 (10-31) — 금액은 「캠프 설정」 참가비표에서 (기본 0원) */
  '초빙교수': [0, 0, 0], '반주자': [0, 0, 0], '지휘자': [0, 0, 0], '통역': [0, 0, 0], '초청강사': [0, 0, 0], '스태프': [0, 0, 0], '기타 관계자': [0, 0, 0],
  /* 해외 단체 (10-31, 영어 화면) — 금액은 「캠프 설정」 참가비표에서, 연회비 없음 */
  '해외 학생': [0, 0, 0], '해외 교사': [0, 0, 0], '해외 보호자': [0, 0, 0], '해외 동반가족': [0, 0, 0], '해외 15개월 미만': [0, 0, 0]   /* 해외 줄은 USD (opt.usdRate 로 원화 청구액 계산) */
};
const ROUND_NAMES = ['1차', '2차', '3차'];
const OPT = { lessonFee: 60000, lessonMax: 5, studentDues: 30000, teacherDues: 300000, roomCap: 4, roomEmptyFee: 140000 };
const PLAYS = ['교사', '연수생', '소속없는 중급연수생', '학생', '회원의 악기하는 자녀', '비회원 학생', '해외 학생', '해외 교사'];
const MASTER = [{ n: '안드레아 부샤츠', fee: 150000 }, { n: '이성주', fee: 150000 }];
/* 교수진: 「교수진」 시트에서 관리 (처음 한 번만 아래 목록으로 채움) */
const PROF_SEED = {
  '바이올린':['곽은수','김소정','김유정','김한기','민연희','변지혜','서민정','신재원','양승돈','오영근','이광호','이슬비','정호진','황경익','황선영','Ayumi Moriyama','Jeffrey Solares','Motomichi Kisohara','Sara M. Gonzales'],
  '첼로':['김현실','이숙정','황선경']};
const PROF_HEAD = ['이름', '악기', '레슨', '마스터클래스', '시간(분)', '마스터클래스 금액', '소속', '사용', '메모', '레슨실', '책자', '책자 묶음', '영문 이름', '직함', '약력', '책자 순서'];   /* 책자 = 협회 · 초청 · (빈칸 = 책자에 안 넣음) (11-05) */
const PROF_INST = ['바이올린', '첼로', '플루트', '비올라', '피아노', '지휘', '기타'];   /* 기본 목록 · 관리자 교수진에서 새 악기를 더할 수 있음 (11-14) */
let PROF_CACHE = null;
function profSheet_() {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(SH.PROF);
  if (!sh) {
    sh = ss.insertSheet(SH.PROF); sh.appendRow(PROF_HEAD);
    Object.keys(PROF_SEED).forEach(i => PROF_SEED[i].forEach(n => sh.appendRow([n, i, '예', '아니오', '', '', '교수진', '예', '', ''])));
    MASTER.forEach(m => sh.appendRow([m.n, '바이올린', '아니오', '예', 45, m.fee, '교수진', '예', '', '']));
  } else ensureHead_(SH.PROF, PROF_HEAD);
  return sh;
}
const yes_ = v => /^(예|y|yes|o|true|1|사용)$/i.test(String(v).trim());
/** 교수진 전체 (사용 안 함 포함) */
function profs_() {
  if (PROF_CACHE) return PROF_CACHE;
  profSheet_();
  PROF_CACHE = rows_(SH.PROF).filter(r => String(r['이름'] || '').trim()).map(r => ({
    name: String(r['이름']).trim(), inst: String(r['악기'] || '').trim(), lesson: yes_(r['레슨']), mc: yes_(r['마스터클래스']),
    min: +r['시간(분)'] || 0, fee: +String(r['마스터클래스 금액'] || 0).replace(/[^\d]/g, '') || 0, org: String(r['소속'] || ''), on: String(r['사용'] || '예').trim() === '' || yes_(r['사용']), memo: String(r['메모'] || ''), room: String(r['레슨실'] || ''),
    book: String(r['책자'] || '').trim(), bgrp: String(r['책자 묶음'] || '').trim(), en: String(r['영문 이름'] || '').trim(), title: String(r['직함'] || '').trim(), bio: String(r['약력'] || ''), bord: +r['책자 순서'] || 0 }));
  return PROF_CACHE;
}
/** 접수 화면용: 사용하는 교수만 (선호 교수 목록 · 마스터클래스) */
function profPublic_() { return profs_().filter(p => p.on).map(p => ({ n: p.name, i: p.inst, l: p.lesson, mc: p.mc, min: p.min, fee: p.fee })); }
const mcList_ = () => profs_().filter(p => p.on && p.mc).map(p => ({ n: p.name, fee: p.fee }));
const PAY_MAX = 10000000;            // 한 사람 입금 신고 금액 상한
const RP_HEAD = ['기록 일시', '신고ID', '접수번호', '학원', '접수 교사', '참가자', '입금자명', '입금일', '금액', '메모', '구분', '환불 계좌'];
const SETTINGS = [['관리자 아이디', 'admin', '관리자 화면(?page=admin) 로그인 아이디'],
  ['관리자 비밀번호', '', '여기에 비밀번호를 적어야 관리자 화면에 들어갈 수 있어요 (8자 이상)'],
  ['입금 은행', '', '선생님 화면 입금 안내에 보이는 은행 (예: 국민은행)'],
  ['입금 계좌번호', '', '입금 계좌번호 (선생님 화면에서 복사 가능)'],
  ['예금주', '', '입금 계좌 예금주'],
  ['입금 시작일', '2026-10-01', '이 날짜보다 앞선 입금일로는 신고할 수 없어요'],
  ['공유주소', 'https://app.suzukimusickorea.org/camp/', '카카오톡 안에서 열었을 때 바깥 브라우저로 넘길 주소'],
  ['회원관리 시트', '', '회원관리 DB 시트 ID 또는 주소 — 선생님 로그인(이메일 · 비밀번호)을 회원관리 계정으로 확인. 비우면 이름 + 휴대전화'],
  ['로그인 방식', '둘 다', '「둘 다」 = 이메일 · 비밀번호 + (회원 가입 전 선생님은) 이름 + 휴대전화 / 「회원관리 계정」 = 이메일 · 비밀번호만 / 「이름+휴대전화」 = 예전 방식'],
  ['회원관리 주소', 'https://app.suzukimusickorea.org/member/', '선생님 가입 · 비밀번호 찾기 안내에 쓰는 회원관리 주소 (STG 는 끝에 ?test)'],
  ['회원 명단 파일', '', '회원관리가 만드는 「행사용 명단」 파일 ID 또는 주소. 넣으면 명단_교사 · 명단_학생을 그 파일로 5분마다 맞춤 (비우면 지금처럼 이 시트의 명단 그대로)'],
  ['수당 공개', '아니오', '「예」면 선생님 화면에 「내 수당」(결산에서 회원관리로 보낸 정산)이 보여요. 정산을 마치기 전까지는 「아니오」'],
  ['해외 송금 안내', '', '해외 단체 영어 화면에 보이는 송금 안내 (영어로: 은행 · SWIFT · 계좌 · 예금주 · 주소 등)'],
  ['접수 가능 학원', '마포스즈키', '「전체」 또는 학원 이름을 쉼표로 (예: 마포스즈키, 미사스즈키)'],
  ['시간표 공개', '아니오', '「예」면 선생님 화면 「내 시간표」에 교사 일정·개인레슨이 보여요']];

const SH = {
  T: '명단_교사', S: '명단_학생', SUB: '접수', P: '참가자', RP: '입금신고', CX: '환불요청', ENS: '앙상블팀', LOG: '기록', PROF: '교수진', ACT: '교사일정', ACTCFG: '일정설정', ACTLOG: '일정기록', LES: '개인레슨', ROOM: '방배정', CON: '음악회순서'
};
const SUB_HEAD = ['접수번호', '접수일시', '수정일시', '학원', '접수 교사', '차수', '인원(정상)', '청구액', '입금확인액', '남은 금액', '앙상블', 'JSON_1', 'JSON_2', 'JSON_3', 'JSON_4'];
const P_HEAD = ['참가자ID', '접수번호', '차수', '학원', '접수 교사', '들어온 차례', '추가 일시', '이름', '구분', '참가 구분', '악기', '담당 교사', '출생연도', '성별',
  '현재 진도', '선호 교수1', '선호 교수2', '추가 레슨', '마스터클래스', '음악회', '음악회 곡', '가족방', '참가비', '레슨·MC', '연회비', '가족방비', '청구액', '상태',
  '입금 상태', '신고 입금자명', '신고 입금일', '신고 금액', '신고 메모', '[운영진] 입금확인일', '[운영진] 입금확인액', '[운영진] 메모'];
const ADMIN_COLS = ['[운영진] 입금확인일', '[운영진] 입금확인액', '[운영진] 메모'];
const CX_HEAD = ['요청 일시', '접수번호', '학원', '요청 교사', '참가자', '사유', '환불 예정액', '은행', '계좌번호', '예금주', '진단서', '처리', '처리일', '메모', '참가자ID', '신청액', '입금액', '적용 규정', '접수일'];

/* ---------------- 웹 앱 ---------------- */
function doGet(e) {
  if (e && e.parameter && e.parameter.perf) return perf_();   /* 속도 재기 (11-13): 시간만 보여 줌 */
  const admin = e && e.parameter && e.parameter.page === 'admin';
  let page, cname = CAMP_NAME, cj = '';
  try { const c = campPublic_(); cname = c.base.name; cj = JSON.stringify(c); } catch (x) {}
  const intl = e && e.parameter && e.parameter.page === 'intl';
  if (e && e.parameter && e.parameter.page === 'meal') return HtmlService.createHtmlOutputFromFile('Meal').setTitle(cname + ' · 식권 스캐너').addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=no').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // 식권 스캐너 (11-04)
  if (e && e.parameter && e.parameter.page === 'qa') return qaOn_() ? HtmlService.createHtmlOutputFromFile('QA').setTitle('[STG] 캠프 접수 시험 체크').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL) : HtmlService.createHtmlOutput('STG에서만 열려요.');
  if (e && e.parameter && e.parameter.page === 'parent') return HtmlService.createHtmlOutputFromFile('Parent').setTitle(cname + ' · 학부모 신청').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (e && e.parameter && e.parameter.page === 'find') return HtmlService.createTemplateFromFile('Find').evaluate().setTitle(cname + ' · 일정 찾기').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (admin) page = HtmlService.createTemplateFromFile('Admin').evaluate();
  else if (intl) page = HtmlService.createHtmlOutputFromFile('Intl');
  else { const t = HtmlService.createTemplateFromFile('Index'); let share = ''; let tl = ''; try { ensureSettingsLazy_(); share = setting_('공유주소'); tl = setting_('테스트 로그인'); } catch (x) {} t.shareUrl = share; t.testLogin = tl; try { t.testNames = tl ? setting_('테스트 선생님') : ''; } catch (x) { t.testNames = ''; } t.campJson = cj; try { t.loginPw = { pw: '1', both: '2' }[loginMode_()] || ''; t.memberUrl = setting_('회원관리 주소'); } catch (x) { t.loginPw = ''; t.memberUrl = ''; } /* 테스트 로그인: STG 「설정」에만 (이름/휴대전화) — 로그인 칸을 미리 채움 · campJson: 「캠프설정」 시트 값 (날짜·장소·차수·참가비) */ page = t.evaluate(); }
  return page
    .setTitle(intl ? 'Suzuki Winter Music Camp · Overseas Registration' : cname + (admin ? ' 접수 관리' : ' 접수'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function perf_() {
  const T = [], t0 = Date.now(); let t = t0; const m = k => { const n = Date.now(); T.push(k + ' ' + (n - t) + 'ms'); t = n; };
  CAMP_CACHE = null; const c = campPublic_(); m('campPublic_'); const cj = JSON.stringify(c); m('stringify ' + cj.length + '자');
  ensureSettingsLazy_(); m('ensureSettingsLazy_'); setting_('공유주소'); setting_('테스트 로그인'); m('setting_');
  const tp = HtmlService.createTemplateFromFile('Index'); tp.shareUrl = ''; tp.testLogin = ''; tp.testNames = ''; tp.campJson = cj; tp.loginPw = ''; tp.memberUrl = '';
  let h = ''; try { h = tp.evaluate().getContent(); } catch (x) { h = 'ERR ' + x.message; } m('Index evaluate ' + h.length + '자');
  try { const a = HtmlService.createTemplateFromFile('Admin').evaluate().getContent(); m('Admin evaluate ' + a.length + '자'); } catch (x) { m('Admin ERR'); }
  T.push('합계 ' + (Date.now() - t0) + 'ms');
  return ContentService.createTextOutput(T.join('\n'));
}
/* ---------- 몰림 시험 (11-13, STG만): 브라우저에서 동시에 POST → 실제 새 접수와 같은 잠금 · 읽기 · 쓰기를 하고 걸린 시간을 돌려줌 ----------
 *  STG(설정 「테스트 로그인」이 있음) + 설정 「몰림 시험 키」가 맞을 때만. 만든 접수는 가상 표시(fake) → 관리자 「가상 접수 모두 지우기」 또는 op=clear */
function doPost(e) {
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const t0 = Date.now(); let q = {};
  try { q = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) {}
  try {
    const key = String(setting_('몰림 시험 키') || '');
    if (!String(setting_('테스트 로그인') || '').trim() || key.length < 12 || q.key !== key) return out({ ok: false, msg: 'no' });
    if (q.op === 'clear') {
      const lock = lock_(); let k = 0;
      try { const fk = loadSubs_().filter(sb => sb.fake && sb.load).map(sb => sb.no); const ss = SpreadsheetApp.getActive();
        [[SH.SUB, '접수번호'], [SH.P, '접수번호']].forEach(([name, col]) => { const sh = ss.getSheetByName(name); rows_(name).filter(r => fk.includes(String(r[col]))).map(r => r._row).sort((x, y) => y - x).forEach(r => { sh.deleteRow(r); k++; }); });
        writeTeams_(loadSubs_()); } finally { lock.releaseLock(); }
      return out({ ok: true, rows: k });
    }
    if (q.op === 'read') { const acad = String(q.acad || ''); const b = bundle_([acad], ''); return out({ ok: true, ms: Date.now() - t0, n: (b.subs || []).length }); }
    /* op=sub: 새 접수 1건 (교사 1 · 학생 3) */
    const i = +q.i || 0, acad = '가상몰림' + (i % 20) + '스즈키';
    let t = Date.now(); const all = loadSubs_(); const tRead = Date.now() - t;
    RC_MEMO = { adj: adjMap_(), t: teachers_(), s: rows_(SH.S), via: duesViaCamp_(), am: adminMap_() };
    let tw = Date.now(); const lock = lock_(); const wait = Date.now() - tw, tIn = Date.now(); let no = '', tWrite = 0, tTeam = 0;
    try {
      no = subNoNext_();
      const at = stamp_(), info = {}, picked = {}, ppl = [];
      [['t_ld' + t0 + i, '교사'], ['ld1', '학생'], ['ld2', '학생'], ['ld3', '학생']].forEach(([k, ty], j) => { picked[k] = true; info[k] = ty === '교사' ? { type: '교사', gender: '여', concert: '없음' } : { type: '학생', gender: '여', by: '2016', teacher: '몰림' + i, prog: '2권A 요정의 춤 ~', lessons: 0, concert: '없음' };
        ppl.push({ id: no + '_' + k, name: '몰림' + i + '-' + j, kind: ty, type: ty, inst: '바이올린', status: '정상', addAt: at, batch: 1, pay: '전', paidAmt: 0 }); });
      const sb = { no, acad, owner: '몰림' + i, fake: true, load: true, createdAt: at, date: at.slice(0, 10), email: '', rev: 1, reqId: 'ld' + t0 + '_' + i, form: { ri: 0, picked, info, extra: [], fam: [], room: {}, join: {}, ens: { on: false } }, ppl };
      recalc_(sb); sb.ppl.forEach(p => p.dues = 0); checkEns_(sb, all); teacherDup_(all, sb);
      t = Date.now(); writeSub_(sb, 'append'); tWrite = Date.now() - t;
    } finally { RC_MEMO = null; lock.releaseLock(); }
    const inLock = Date.now() - tIn; t = Date.now(); bundle_([acad], '몰림' + i); const tBundle = Date.now() - t;
    return out({ ok: true, no, wait, inLock, tRead, tWrite, tTeam, tBundle, total: Date.now() - t0 });
  } catch (x) { return out({ ok: false, msg: String(x && x.message || x), total: Date.now() - t0 }); }
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
    paidDate: dstr_(r['회비 납부일']), dueAmt: +r['연회비'] || 0, state: String(r['상태'] || '승인'), kind: String(r['회원구분'] || ''),
    acct: String(r['계좌'] || '') === '있음', rrn: String(r['주민번호'] || '') === '있음', inc: String(r['소득구분'] || '')
  }));
}

/** 이름 + 휴대전화로 로그인 (시험 기간: 명단의 휴대전화 뒤 4자리와 비교) */
/* ---------------- 회원관리 계정 로그인 (10-28) ----------------
 * 회원관리 시트 「계정」 탭(이메일 · 교사ID · 비번해시 · 솔트 · 상태)을 읽어 회원관리와 같은 방식(솔트 + SHA-256 5,000번)으로 확인.
 * 맞으면 그 교사ID 로 명단_교사(회원관리에서 맞춘 것)에서 선생님을 찾음. 비밀번호는 캠프에 저장하지 않음. */
function memberSheetId_() { const v = setting_('회원관리 시트'); const m = v.match(/\/d\/([a-zA-Z0-9_-]{20,})/); return m ? m[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(v) ? v : ''); }
/** 로그인 방식: 'pw' = 이메일 · 비밀번호만, 'both' = 둘 다(가입 전 선생님은 이름 + 휴대전화), '' = 이름 + 휴대전화만 (10-31) */
function loginMode_() { if (!memberSheetId_()) return ''; const v = setting_('로그인 방식'); return v === '이름+휴대전화' ? '' : v === '회원관리 계정' ? 'pw' : 'both'; }
function pwMode_() { return loginMode_() === 'pw'; }
function mHash_(pw, salt) { let h = salt + '|' + pw; for (let i = 0; i < 5000; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8)); return 'S256x5000$' + h; }
function acctCheck_(email, pw) {
  email = String(email || '').trim().toLowerCase(); pw = String(pw || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !pw) throw new Error('이메일과 비밀번호를 넣어 주세요.');
  const C = CacheService.getScriptCache(), k = 'cl_' + email, n = +(C.get(k) || 0);
  if (n >= 10) throw new Error('로그인을 여러 번 실패했어요. 15분 뒤 다시 해 주세요.');
  const sh = SpreadsheetApp.openById(memberSheetId_()).getSheetByName('계정'); if (!sh) throw new Error('회원관리 계정 표를 찾지 못했어요. 운영진에게 알려 주세요.');
  const v = sh.getDataRange().getDisplayValues(), h = v[0], ix = x => h.indexOf(x);
  const L = v.slice(1).filter(r => String(r[ix('이메일')]).trim().toLowerCase() === email), a = L.filter(r => r[ix('상태')] !== '반려').pop() || L.pop();
  if (!a || mHash_(pw, a[ix('솔트')]) !== a[ix('비번해시')]) { C.put(k, String(n + 1), 900); throw new Error('이메일이나 비밀번호가 맞지 않아요. 회원관리(선생님 회원)에서 만든 이메일 · 비밀번호로 들어가요.'); }
  if (a[ix('상태')] === '대기') throw new Error('협회가 회원 가입을 확인하는 중이에요. 확인되면 이메일로 알려 드려요.');
  if (a[ix('상태')] !== '사용' || !a[ix('교사ID')]) throw new Error('사용할 수 없는 계정이에요. 협회에 문의해 주세요.');
  C.remove(k);
  const t = teachers_().find(x => x.id === String(a[ix('교사ID')]));
  if (!t) throw new Error('캠프 회원 명단에 아직 선생님이 없어요(회원관리에서 막 바뀌었다면 5분 뒤 다시 해 주세요). 계속 안 되면 운영진에게 알려 주세요.');
  return t;
}
function authCheckPw(email, pw, staff) {
  try { const t = acctCheck_(email, pw); staffOk_(t, staff); const subs = loadSubs_().filter(x => x.owner === t.name); return { ok: true, name: t.name, subs: subs.map(x => x.no), fresh: !subs.length }; }
  catch (e) { return { ok: false, msg: e.message }; }
}
function loginPw(email, pw, consent, staff) {
  let t; try { t = acctCheck_(email, pw); staffOk_(t, staff); } catch (e) { return { ok: false, msg: e.message }; }
  return loginT_(t, consent);
}
function login(name, phone, consent) {
  const ph = String(phone || '').replace(/\D/g, '');
  const nm = bare_(name);
  /* STG 시험 버튼(설정 「테스트 로그인」 = 이름/휴대전화)은 비밀번호 방식이어도 들어감 (11-02) */
  let tl = ''; try { tl = String(setting_('테스트 로그인') || ''); } catch (e) {}
  const isTest = !!tl && bare_(tl.split('/')[0]) === nm && String(tl.split('/')[1] || '').replace(/\D/g, '') === ph;
  if (pwMode_() && !isTest) return { ok: false, msg: '이메일 · 비밀번호로 로그인해 주세요. 화면을 새로 고쳐 주세요.' };
  if (!nm || ph.length < 10) return { ok: false, msg: '이름과 휴대전화를 모두 넣어 주세요.' };
  const t = teachers_().find(x => bare_(x.name) === nm && x.p4 && ph.endsWith(x.p4));
  if (!t) return { ok: false, msg: '회원 명단의 이름·휴대전화와 맞지 않아요.' };
  return loginT_(t, consent);
}
/** STG 시험 (11-12): 설정 「테스트 선생님」(쉼표로 이름 여럿)에 있는 선생님으로 비밀번호 없이 들어감. 「테스트 로그인」이 있는 STG에서만 */
function testLogin(name, consent) {
  let tl = '', tn = ''; try { tl = String(setting_('테스트 로그인') || '').trim(); tn = String(setting_('테스트 선생님') || ''); } catch (e) {}
  const nm = bare_(name);
  if (!tl || !nm || !tn.split(/[,\n]/).map(bare_).includes(nm)) return { ok: false, msg: 'STG 시험 선생님이 아니에요.' };
  const t = teachers_().find(x => bare_(x.name) === nm);
  if (!t) return { ok: false, msg: nm + ' 선생님이 캠프 명단에 없어요.' };
  return loginT_(t, consent);
}
/** 접수 전(11-12): 이름 · 휴대전화로 회원가입이 되어 있는지만 알려 줌 (아무것도 저장 안 함, 번호마다 10분에 8번까지)
 *  → { ok, st: 'ready'(가입 · 사용) | 'wait'(승인 대기) | 'nosignup'(명단에 있음 · 가입 전) | 'none'(명단에 없음) } */
function signupCheck(name, phone) {
  const nm = bare_(name), ph = String(phone || '').replace(/\D/g, '');
  if (!nm || !/^01\d{8,9}$/.test(ph)) return { ok: false, msg: '이름과 휴대전화를 확인해 주세요.' };
  const C = CacheService.getScriptCache(), k = 'sg_' + ph, n = +(C.get(k) || 0);
  if (n >= 8) return { ok: false, msg: '여러 번 확인했어요. 10분 뒤 다시 해 주세요.' };
  C.put(k, String(n + 1), 600);
  const mid = memberSheetId_();
  if (mid) {
    try {
      const ss = SpreadsheetApp.openById(mid), tv = ss.getSheetByName('교사').getDataRange().getDisplayValues(), th = tv[0];
      const iI = th.indexOf('교사ID'), iN = th.indexOf('이름'), iP = th.indexOf('휴대전화'), iS = th.indexOf('상태');
      const T = tv.slice(1).filter(r => r[iI] && bare_(r[iN]) === nm && String(r[iP]).replace(/\D/g, '') === ph && r[iS] !== '삭제');
      if (!T.length) return { ok: true, st: 'none' };
      const av = ss.getSheetByName('계정').getDataRange().getDisplayValues(), ah = av[0], aT = ah.indexOf('교사ID'), aS = ah.indexOf('상태');
      const ids = T.map(r => String(r[iI])), A = av.slice(1).filter(r => ids.includes(String(r[aT])) && r[aS] !== '반려').map(r => r[aS]);
      return { ok: true, st: A.includes('사용') ? 'ready' : A.includes('대기') ? 'wait' : 'nosignup' };
    } catch (e) { Logger.log('signupCheck: ' + e.message); }
  }
  const t = teachers_().find(x => bare_(x.name) === nm && x.p4 && ph.endsWith(x.p4));
  return { ok: true, st: t ? 'nosignup' : 'none' };
}
/* ---------------- 관계자 (10-31) ----------------
 * 회원관리 「외부인」(X0001) 계정 = 관계자: 학원 「관계자」로만 접수, 본인 참가 구분 = 역할(초빙교수 · 반주자 …, 참가비는 캠프 설정 참가비표), 가족은 회원 가족 참가비, 연회비 없음.
 * 운영진은 관리자 화면 「접수 · 입금 확인 › 관계자」에서 대신 등록(staffAdd). 초빙교수는 「교수진」 탭에 자동으로 들어감(staffProfs_). */
const STAFF_ACAD = '관계자';
const NOACAD = '소속 없음';   /* 학원 소속이 없는 회원 선생님(협회 단체납부 등)의 접수 묶음 (10-31). 본인 접수만 보임 */
const STAFF_TYPES = ['초빙교수', '반주자', '지휘자', '통역', '초청강사', '스태프', '기타 관계자'];
const STAFF_FAM = ['회원의 첫번째 보호자', '회원의 그외 악기 안하는 동반가족', '동반가족 중 15개월 미만'];
const isStaffT_ = t => t && t.kind === '외부인';
function staffOk_(t, staff) {
  if (staff && !isStaffT_(t)) throw new Error('관계자(외부인) 계정이 아니에요. 회원 선생님은 처음 화면에서 「회원 선생님」을 골라 주세요.');
}
/* ---------------- 해외 단체 (10-31) ----------------
 * 해외 단체(예: 필리핀) = 대표 한 명이 영어 화면(?page=intl)에서 단체 사람을 모두 접수. 운영진이 관리자 「접수 · 입금 확인 › 해외」에서 단체를 만들고
 * 접속 코드를 대표 이메일로 보냄 → 대표는 이메일 + 코드로 로그인. 단체 하나 = 접수 하나(학원 「해외 · 단체이름」, sb.intl = true).
 * 참가 구분 = 해외 학생 · 해외 교사 · 해외 보호자 · 해외 동반가족 · 해외 15개월 미만 (캠프 설정 참가비표), 연회비 없음. 송금은 단체가 한꺼번에 → 대표가 송금 신고(intlRep),
 * 운영진이 받은 금액으로 사람마다 입금 확인(기존 일괄 확인). */
const INTL_SH = '해외단체', INTL_HEAD = ['단체ID', '단체', '나라', '대표', '이메일', '접속코드', '만든날', '사용', '메모'];
const INTL_TYPES = ['해외 학생', '해외 교사', '해외 보호자', '해외 동반가족', '해외 15개월 미만'];
const INTL_PLAY = ['해외 학생', '해외 교사'];
function intlSheet_() { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(INTL_SH); if (!sh) { sh = ss.insertSheet(INTL_SH); sh.getRange(1, 1, 1, INTL_HEAD.length).setValues([INTL_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('A:I').setNumberFormat('@'); } return sh; }
function intlGroups_() { intlSheet_(); return rows_(INTL_SH).filter(r => r['단체ID']).map(r => ({ id: String(r['단체ID']), name: String(r['단체']), country: String(r['나라'] || ''), lead: String(r['대표'] || ''), email: String(r['이메일'] || '').toLowerCase(), code: String(r['접속코드'] || ''), at: String(r['만든날'] || ''), on: String(r['사용'] || '예') !== '아니오', memo: String(r['메모'] || ''), _row: r._row })); }
const intlAcad_ = g => '해외 · ' + g.name;
function intlCode_() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 8; i++) c += A[Math.floor(Math.random() * A.length)]; return c.slice(0, 4) + '-' + c.slice(4); }
/** 관리자: 해외 단체 목록 + 만들기 · 고치기 · 코드 새로 만들기 */
function intlAdmin(token, op) {
  const a = adm_(token); need_(a, ['subs']);
  op = op || {};
  if (op.act) {
    const lock = lock_();
    try {
      const sh = intlSheet_(), L = intlGroups_();
      if (op.act === 'add') {
        const name = String(op.name || '').trim().replace(/\s+/g, ' '), email = String(op.email || '').trim().toLowerCase();
        if (name.length < 2 || name.length > 40 || /[·]/.test(name)) throw new Error('단체 이름을 2~40자로 넣어 주세요.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('대표 이메일을 확인해 주세요.');
        if (L.some(g => g.name === name)) throw new Error('같은 이름의 단체가 있어요.');
        const id = 'G' + String(L.reduce((m, g) => Math.max(m, +g.id.slice(1) || 0), 0) + 1).padStart(3, '0');
        sh.appendRow([id, name, String(op.country || '').trim().slice(0, 30), String(op.lead || '').trim().slice(0, 40), email, intlCode_(), stamp_(), '예', String(op.memo || '').slice(0, 200)]);
        log_('관리자 ' + a.name, '해외 단체 만들기', id + ' · ' + name);
      } else {
        const g = L.find(x => x.id === op.id); if (!g) throw new Error('단체를 찾지 못했어요.');
        const col = k => INTL_HEAD.indexOf(k) + 1;
        if (op.act === 'code') sh.getRange(g._row, col('접속코드')).setValue(intlCode_());
        if (op.act === 'on') sh.getRange(g._row, col('사용')).setValue(op.on ? '예' : '아니오');
        if (op.act === 'edit') { const em = String(op.email || g.email).trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error('대표 이메일을 확인해 주세요.');
          sh.getRange(g._row, col('나라'), 1, 3).setValues([[String(op.country || '').trim().slice(0, 30), String(op.lead || '').trim().slice(0, 40), em]]); sh.getRange(g._row, col('메모')).setValue(String(op.memo || '').slice(0, 200)); }
        log_('관리자 ' + a.name, '해외 단체 ' + op.act, g.id + ' · ' + g.name);
      }
    } finally { lock.releaseLock(); }
  }
  const subs = loadSubs_();
  return { groups: intlGroups_().map(g => { const sb = subs.find(x => x.intl && x.intlId === g.id); const live = sb ? sb.ppl.filter(p => p.status === '정상') : [];
    return Object.assign({}, g, { _row: undefined, no: sb ? sb.no : '', n: live.length, bill: live.reduce((t, p) => t + amt_(p), 0), usd: live.reduce((t, p) => t + (+p.usd || 0), 0), paid: sb ? sb.ppl.reduce((t, p) => t + (+p.paidAmt || 0), 0) : 0, reps: sb ? (sb.intlRep || []) : [] }); }),
    rate: +camp_().opt.usdRate || 1450,
    url: setting_('공유주소') ? String(setting_('공유주소')).replace(/\/$/, '') + '/intl.html' : '' };
}
function intlWho_(token) { const v = CacheService.getScriptCache().get('intl_' + token); if (!v) throw new Error('Your session has ended. Please reload the page and sign in again.'); return JSON.parse(v); }
/** 대표 로그인: 이메일 + 접속 코드 */
function intlLogin(email, code, agree) {
  const C = camp_(); if (C.base.intl === false) return { ok: false, msg: 'Overseas registration is closed. Please contact the association.' };
  email = String(email || '').trim().toLowerCase(); code = String(code || '').trim().toUpperCase().replace(/\s/g, '');
  const Ca = CacheService.getScriptCache(), k = 'intlf_' + email, n = +(Ca.get(k) || 0);
  if (n >= 10) return { ok: false, msg: 'Too many attempts. Please try again in 15 minutes.' };
  const g = intlGroups_().find(x => x.email === email && x.code.replace(/-/g, '') === code.replace(/-/g, ''));
  if (!g) { Ca.put(k, String(n + 1), 900); Utilities.sleep(500); return { ok: false, msg: 'The email or access code does not match. Please check the code sent by the association.' }; }
  if (!g.on) return { ok: false, msg: 'This group is not active. Please contact the association.' };
  if (agree !== true) return { ok: false, msg: 'Please agree to the collection and use of personal information.' };
  Ca.remove(k);
  consentLog_('해외 단체', g.lead || g.name, '', { collect: true, third: true, minor: true, refund: true });
  const token = Utilities.getUuid(); Ca.put('intl_' + token, JSON.stringify({ id: g.id }), 21600);
  log_('해외 ' + g.name, '로그인', email);
  return Object.assign({ ok: true, token }, intlData_(g.id));
}
/** 코드 없이 새 단체 만들기 (11-15): 대표가 단체 이름 · 나라 · 이름 · 이메일만 넣으면 단체가 만들어지고 바로 들어감.
 *  접속 코드는 화면에 한 번 보여 주고 그 이메일로도 보냄(다음에 들어올 때 씀). 이미 있는 이메일이면 단체를 새로 만들지 않고 코드를 그 이메일로 다시 보냄 */
function intlMail_(g, why) { try { MailApp.sendEmail(g.email, '[' + camp_().base.name.replace('스즈키 겨울 음악제', 'Suzuki Winter Music Camp') + '] Your access code', 'Group: ' + g.name + '\nAccess code: ' + g.code + '\n\nSign in again at https:\/\/app.suzukimusickorea.org/camp/intl.html with this email and code.\n(' + why + ')'); return true; } catch (e) { return false; } }
function intlSignup(o, agree) {
  const C = camp_(); if (C.base.intl === false) return { ok: false, msg: 'Overseas registration is closed. Please contact the association.' };
  o = o || {}; const name = String(o.name || '').trim().replace(/\s+/g, ' ').replace(/[·|,]/g, ' ').slice(0, 40), email = String(o.email || '').trim().toLowerCase(), lead = String(o.lead || '').trim().slice(0, 40), country = String(o.country || '').trim().slice(0, 30);
  if (name.length < 2) return { ok: false, msg: 'Please enter your group name.' };
  if (!country) return { ok: false, msg: 'Please enter your country.' };
  if (!lead) return { ok: false, msg: 'Please enter the leader name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, msg: 'Please check the email address.' };
  if (agree !== true) return { ok: false, msg: 'Please agree to the collection and use of personal information.' };
  const Ca = CacheService.getScriptCache(), k = 'intls_' + email, n = +(Ca.get(k) || 0);
  if (n >= 5) return { ok: false, msg: 'Too many attempts. Please try again in 15 minutes.' };
  Ca.put(k, String(n + 1), 900);
  const lock = lock_();
  let g;
  try {
    const sh = intlSheet_(), L = intlGroups_(), had = L.find(x => x.email === email);
    if (had) { const sent = intlMail_(had, 'requested again'); return { ok: false, msg: 'This email already has a group (' + had.name + '). ' + (sent ? 'We sent the access code to that email. Please sign in with it.' : 'Please sign in with the access code, or contact the association.') }; }
    let nm = name; for (let i = 2; L.some(x => x.name === nm); i++) nm = name.slice(0, 36) + ' ' + i;
    const id = 'G' + String(L.reduce((m, x) => Math.max(m, +x.id.slice(1) || 0), 0) + 1).padStart(3, '0');
    sh.appendRow([id, nm, country, lead, email, intlCode_(), stamp_(), '예', '대표가 직접 만듦 (코드 없이)']);
    g = intlGroups_().find(x => x.id === id);
  } finally { lock.releaseLock(); }
  log_('해외 ' + g.name, '직접 만들기', email);
  intlMail_(g, 'new group');
  return Object.assign(intlLogin(g.email, g.code, true), { code: g.code });
}
function intlData_(gid) {
  const g = intlGroups_().find(x => x.id === gid); if (!g) throw new Error('Group not found.');
  const C = camp_(), sb = loadSubs_().find(x => x.intl && x.intlId === gid), ri = sb ? (+((sb.form || {}).ri) || 0) : curRound_(C);
  const rate = +C.opt.usdRate || 1450;
  const ppl = sb ? sb.ppl.filter(p => p.status !== '취소').map(p => { const k = p.id.slice(sb.no.length + 1), i = (sb.form.info || {})[k] || {};
    return { key: k, first: i.first || '', last: i.last || '', type: p.type, gender: i.gender || '', by: i.by || '', inst: i.inst || p.inst || '', prog: i.prog || '', note: i.note || '', room: i.room || '', roomFee: Math.round((+p.room || 0) / rate), fee: +p.usd || Math.round((+p.fee || 0) / rate), paid: Math.round((+p.paidAmt || 0) / rate), pay: p.pay }; }) : [];
  const fees = {}; INTL_TYPES.forEach(t => fees[t] = (C.fees[t] || [])[ri] || 0);   /* USD */
  return { group: { id: g.id, name: g.name, country: g.country, lead: g.lead, email: g.email }, no: sb ? sb.no : '', ppl, fees, cur: 'USD', roomCap: +C.opt.roomCap || 4, roomEmptyUsd: Math.round((+C.opt.roomEmptyFee || 0) / rate), round: C.rounds[ri].n,
    camp: { name: C.base.name, start: C.base.start, end: C.base.end, place: C.base.place }, remit: setting_('해외 송금 안내'), reps: sb ? (sb.intlRep || []) : [], today: today_() };
}
/** STG 시험: 설정 「해외 테스트 로그인」 = 이메일/접속코드 가 있으면 영어 화면에 「STG: 시험 단체로 바로 로그인」 버튼 (메인 시트에는 이 줄을 넣지 않음) */
function intlTest_() { const v = String(setting_('해외 테스트 로그인') || '').trim(), m = v.match(/^(\S+@\S+)\s*\/\s*(\S+)$/); return m ? { email: m[1], code: m[2] } : null; }
function intlTestInfo() { const t = intlTest_(); return { ok: true, test: !!t }; }
function intlTestLogin() { const t = intlTest_(); if (!t) return { ok: false, msg: 'Test sign-in is off.' }; return intlLogin(t.email, t.code, true); }
function intlData(token) { const u = intlWho_(token); return Object.assign({ ok: true }, intlData_(u.id)); }
/** 대표: 명단 저장 (전체를 보냄). 지운 사람은 입금 확인 전이면 「취소」, 확인된 사람은 지울 수 없음 */
function intlSave(token, list) {
  { const o = regPre_(); if (o) throw new Error('Registration opens on ' + o + ' (Korea time).'); }
  const u = intlWho_(token), g = intlGroups_().find(x => x.id === u.id); if (!g || !g.on) throw new Error('This group is not active.');
  if (!Array.isArray(list)) throw new Error('Nothing to save.'); if (list.length > 150) throw new Error('Up to 150 people per group.');
  const clean = list.map((x, n) => {
    const first = String(x.first || '').trim().replace(/\s+/g, ' ').slice(0, 40), last = String(x.last || '').trim().replace(/\s+/g, ' ').slice(0, 40), at = 'Row ' + (n + 1) + ': ';
    if (!first || !last) throw new Error(at + 'Please enter first name and last name.');
    if (!INTL_TYPES.includes(x.type)) throw new Error(at + 'Please choose a participant type.');
    if (!['남', '여'].includes(x.gender)) throw new Error(at + 'Please choose gender.');
    const by = String(x.by || '').trim(); if (!/^(19|20)\d{2}$/.test(by)) throw new Error(at + 'Please enter birth year (e.g. 2015).');
    const plays = INTL_PLAY.includes(x.type), inst = String(x.inst || '').trim().slice(0, 20);
    if (plays && !inst) throw new Error(at + 'Please choose an instrument.');
    if (x.type === '해외 학생' && !String(x.prog || '').trim()) throw new Error(at + 'Please choose the current book level.');
    return { key: /^o[a-z0-9]{3,20}$/.test(String(x.key || '')) ? x.key : '', first, last, type: x.type, gender: x.gender, by, inst: plays ? inst : '', prog: x.type === '해외 학생' ? String(x.prog).slice(0, 40) : '', note: String(x.note || '').slice(0, 200), room: String(x.room || '').trim().replace(/\s+/g, ' ').slice(0, 40) };
  });
  const lock = lock_();
  try {
    const all = loadSubs_(), C = camp_(); let sb = all.find(x => x.intl && x.intlId === g.id), isNew = false;
    if (!sb) {
      if (!clean.length) throw new Error('Please add at least one person.');
      const n = all.reduce((m, x) => Math.max(m, +String(x.no).split('-')[1] || 0), 0) + 1, ri = curRound_(C);
      sb = { no: C.base.id + '-' + String(n).padStart(3, '0'), owner: g.lead || g.name, acad: intlAcad_(g), intl: true, intlId: g.id, round: C.rounds[ri].n, date: today_(), createdAt: stamp_(), rev: 0, contact: g.email, ppl: [], form: { picked: {}, extra: [], fam: [], info: {}, room: {}, join: {}, ens: { on: false }, ri } };
      isNew = true;
    }
    const at = stamp_(), seen = {}, batch = Math.max(1, ...sb.ppl.map(p => +p.batch || 1)) + (isNew ? 0 : 1);
    clean.forEach(x => {
      let k = x.key && sb.ppl.some(p => p.id === sb.no + '_' + x.key) ? x.key : '';
      if (!k) { do { k = 'o' + Utilities.getUuid().replace(/-/g, '').slice(0, 8); } while (sb.ppl.some(p => p.id === sb.no + '_' + k)); }
      seen[k] = 1;
      const old = (sb.form.info || {})[k] || {}, p0 = sb.ppl.find(p => p.id === sb.no + '_' + k);
      if (p0 && (+p0.paidAmt || 0) > 0 && p0.type !== x.type) throw new Error(x.first + ' ' + x.last + ': payment is already confirmed, so the type cannot be changed. Please contact the association.');
      sb.form.info[k] = Object.assign(old, { type: x.type, gender: x.gender, by: x.by, inst: x.inst, prog: x.prog, first: x.first, last: x.last, note: x.note, room: x.room, teacher: '', lessons: 0, mc: [], concert: '없음' });
      const kind = x.type === '해외 학생' ? '학생' : x.type === '해외 교사' ? '교사' : '가족', name = x.first + ' ' + x.last;
      if (p0) { Object.assign(p0, { name, inst: x.inst, kind, type: x.type }); if (p0.status === '취소' && !(+p0.paidAmt > 0)) { p0.status = '정상'; p0.addAt = at; } }
      else sb.ppl.push({ id: sb.no + '_' + k, name, dtag: '', inst: x.inst, kind, type: x.type, status: '정상', pay: '전', paidAmt: 0, batch: isNew ? 1 : batch, addAt: at });
    });
    sb.ppl.forEach(p => { const k = p.id.slice(sb.no.length + 1); if (seen[k] || p.status === '취소') return;
      if ((+p.paidAmt || 0) > 0) throw new Error(p.name + ': payment is already confirmed, so this person cannot be removed here. Please contact the association.');
      p.status = '취소'; p.cxAt = at; });
    sb.rev = (+sb.rev || 0) + 1; recalc_(sb);
    writeSub_(sb, isNew); if (isNew) all.push(sb);
    log_('해외 ' + g.name, isNew ? '새 접수' : '명단 저장', sb.no + ' · ' + sb.ppl.filter(p => p.status === '정상').length + '명');
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true }, intlData_(g.id));
}
/** 관리자: 해외 단체가 보낸 USD 를 받은 대로 입금 확인 — 사람 순서대로 남은 금액을 채움(원화 = USD × 환율), 메모에 USD */
function intlConfirm(token, gid, date, usd, memo) {
  const a = adm_(token); need_(a, ['subs', 'rp']);
  date = String(date || ''); usd = +String(usd || '').replace(/[^\d.]/g, '') || 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('입금일을 넣어 주세요 (예: 2026-12-05).');
  if (!(usd > 0)) throw new Error('받은 USD 금액을 넣어 주세요.');
  const rate = +camp_().opt.usdRate || 1450, lock = lock_(); let left = usd, n = 0;
  try {
    const all = loadSubs_(), sb = all.find(x => x.intl && x.intlId === gid); if (!sb) throw new Error('이 단체 접수가 아직 없어요.');
    sb.ppl.filter(p => p.status === '정상').forEach(p => {
      if (left <= 0.004) return;
      const dueKrw = amt_(p) - (+p.paidAmt || 0); if (dueKrw <= 0) return;
      const dueUsd = dueKrw / rate, payUsd = Math.min(dueUsd, left), payKrw = payUsd >= dueUsd - 0.004 ? dueKrw : Math.round(payUsd * rate);
      setAdminCols_(p.id, [date, (+p.paidAmt || 0) + payKrw, ('USD ' + (Math.round(payUsd * 100) / 100) + ' (1 USD = ' + rate + '원)' + (memo ? ' · ' + String(memo).slice(0, 60) : '')).slice(0, 200)]);
      left -= payUsd; n++;
    });
    writeSubRow_(loadSubs_().find(x => x.no === sb.no));
    log_('관리자 ' + a.name, '해외 USD 입금 확인', sb.no + ' · ' + date + ' · USD ' + usd + ' → ' + n + '명' + (left > 0.004 ? ' · 남은 USD ' + (Math.round(left * 100) / 100) : ''));
  } finally { lock.releaseLock(); }
  return Object.assign({ left: Math.round(left * 100) / 100, n }, intlAdmin(token, {}));
}
/** 대표: 송금 신고 (단체 전체 한 번에) — 운영진이 받은 금액으로 사람마다 입금 확인 */
function intlReport(token, r) {
  const u = intlWho_(token), g = intlGroups_().find(x => x.id === u.id);
  const date = String((r || {}).date || ''), amt = +String((r || {}).amt || '').replace(/[^\d.]/g, '') || 0, cur = ['KRW', 'USD', 'PHP', 'JPY', 'EUR'].includes((r || {}).cur) ? r.cur : 'KRW';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today_()) throw new Error('Please choose the transfer date.');
  if (!(amt > 0)) throw new Error('Please enter the amount you sent.');
  const lock = lock_();
  try {
    const all = loadSubs_(), sb = all.find(x => x.intl && x.intlId === g.id); if (!sb) throw new Error('Please save the participant list first.');
    sb.intlRep = (sb.intlRep || []).concat([{ date, amt, cur, name: String(r.name || '').trim().slice(0, 60), memo: String(r.memo || '').trim().slice(0, 200), at: stamp_() }]).slice(-20);
    sb.rev = (+sb.rev || 0) + 1; writeSubRow_(sb, false);
    log_('해외 ' + g.name, '송금 신고', sb.no + ' · ' + date + ' · ' + cur + ' ' + amt);
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true }, intlData_(g.id));
}
/** 초빙교수로 접수된 사람을 「교수진」 탭에 자동으로 (없을 때만, 레슨 · 마스터클래스는 「아니오」로 넣고 운영진이 정함) */
function staffProfs_(sb) {
  if (!sb || sb.acad !== STAFF_ACAD) return;
  const L = (sb.ppl || []).filter(p => p.type === '초빙교수' && p.status !== '취소'); if (!L.length) return;
  const have = {}; profs_().forEach(p => have[p.name.replace(/\s/g, '')] = 1);
  const sh = profSheet_(); let n = 0;
  L.forEach(p => { const k = String(p.name).replace(/\s/g, ''); if (have[k]) return; have[k] = 1; n++;
    sh.appendRow([p.name, p.inst || '', '아니오', '아니오', '', '', '초빙교수 (관계자 접수)', '예', sb.no + ' 접수로 자동 추가 · 레슨 · 마스터클래스는 여기서 정해 주세요', '']); });
  if (n) { PROF_CACHE = null; log_('교수진', '초빙교수 자동 추가', sb.no + ' · ' + n + '명'); }
}
/** 운영진이 관계자를 대신 등록 (관리자 › 접수 · 입금 확인 › 관계자) — 본인 1명 + 동반 가족. 접수자 = 「운영진」 */
function staffAdd(token, d) {
  const a = adm_(token); need_(a, ['subs']);
  d = d || {};
  const name = String(d.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 30) throw new Error('이름을 넣어 주세요.');
  if (!STAFF_TYPES.includes(d.role)) throw new Error('역할을 골라 주세요.');
  if (!['남', '여'].includes(d.gender)) throw new Error('성별을 골라 주세요.');
  const ph = String(d.phone || '').replace(/\D/g, ''); if (ph && !/^01\d{8,9}$/.test(ph)) throw new Error('휴대전화를 확인해 주세요.');
  const fam = (d.fam || []).filter(f => f && String(f.name || '').trim()).slice(0, 8)
    .map(f => ({ type: STAFF_FAM.includes(f.type) ? f.type : STAFF_FAM[1], name: String(f.name).trim().slice(0, 30), gender: ['남', '여'].includes(f.gender) ? f.gender : '' }));
  const lock = lock_();
  try {
    const all = loadSubs_(), C = camp_(), ri = curRound_(C);
    const n = all.reduce((m, x) => Math.max(m, +String(x.no).split('-')[1] || 0), 0) + 1, no = C.base.id + '-' + String(n).padStart(3, '0');
    const key = 'me_r' + Date.now().toString(36), at = stamp_(), inst = String(d.inst || '').trim().slice(0, 20), info = {};
    info[key] = { type: d.role, gender: d.gender, by: '', teacher: '', inst, prog: '', lessons: 0, mc: [], concert: '없음' };
    const famL = fam.map((f, j) => { const id = 'fs' + key.slice(4) + j; info[id] = { type: f.type, gender: f.gender, by: '', lessons: 0, mc: [], concert: '없음' }; return { id, type: f.type, name: f.name, link: key }; });
    const ppl = [{ id: no + '_' + key, name, dtag: '', inst, kind: '교사', type: d.role, status: '정상', pay: '전', paidAmt: 0, batch: 1, addAt: at }]
      .concat(famL.map(f => ({ id: no + '_' + f.id, name: f.name, dtag: '', inst: '', kind: '가족', type: f.type, status: '정상', pay: '전', paidAmt: 0, batch: 1, addAt: at })));
    const picked = {}; picked[key] = true;
    const sb = { no, owner: '운영진', acad: STAFF_ACAD, round: C.rounds[ri].n, date: today_(), createdAt: at, rev: 1, proxy: a.name,
      contact: ph ? ph.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : '', memo: String(d.memo || '').trim().slice(0, 200), ppl,
      form: { picked, extra: [], fam: famL, info, room: {}, join: {}, ens: { on: false }, ri } };
    recalc_(sb); writeSub_(sb, true); all.push(sb); writeTeams_(all);
    log_('관리자 ' + a.name, '관계자 대신 등록', no + ' · ' + name + ' · ' + d.role + (famL.length ? ' + 가족 ' + famL.length : ''));
  } finally { lock.releaseLock(); }
  return adminData(token);
}
/** 운영진이 대신 등록한 관계자 접수 취소 (입금 전만 · 입금된 접수는 「취소 · 환불」로) */
function staffCancel(token, no) {
  const a = adm_(token); need_(a, ['subs']);
  const lock = lock_();
  try {
    const all = loadSubs_(), sb = all.find(x => x.no === no);
    if (!sb || sb.acad !== STAFF_ACAD || sb.owner !== '운영진') throw new Error('운영진이 대신 등록한 관계자 접수만 여기서 취소할 수 있어요.');
    if (sb.ppl.some(p => (+p.paidAmt || 0) > 0)) throw new Error('입금이 확인된 접수예요. 「취소 · 환불」에서 처리해 주세요.');
    sb.ppl.forEach(p => { if (p.status !== '취소') { p.status = '취소'; p.cxAt = stamp_(); } });
    sb.rev = (+sb.rev || 0) + 1; writeSub_(sb, false); writeTeams_(all);
    log_('관리자 ' + a.name, '관계자 접수 취소', no);
  } finally { lock.releaseLock(); }
  return adminData(token);
}
/** 회원관리 계정 이메일 (이름 · 휴대전화로 들어와도 접수 확인 메일을 다시 묻지 않게) */
function acctEmail_(tid) {
  try { if (!tid || !memberSheetId_()) return ''; const sh = SpreadsheetApp.openById(memberSheetId_()).getSheetByName('계정'); if (!sh) return '';
    const v = sh.getDataRange().getDisplayValues(), h = v[0], ie = h.indexOf('이메일'), it = h.indexOf('교사ID'), is = h.indexOf('상태');
    const r = v.slice(1).filter(x => String(x[it]) === String(tid) && x[is] === '사용').pop(); return r ? String(r[ie]).trim().toLowerCase() : ''; } catch (e) { return ''; }
}
function loginT_(t, consent) {
  if (t.state === '대기') return { ok: false, msg: '승인 대기 중이에요. 협회가 확인하면 이메일로 알려 드려요.' };
  if (isStaffT_(t) && camp_().base.staff === false) return { ok: false, msg: '지금은 관계자 접수를 받지 않아요. 협회에 연락하면 운영진이 대신 접수해 드려요.' };
  if (!isStaffT_(t) && camp_().base.member === false) return { ok: false, msg: '이 행사는 회원 접수를 받지 않아요.' };
  { const ce = consentErr_(consent); if (ce) return { ok: false, msg: ce }; }
  if (isStaffT_(t)) {
    consentLog_('관계자', t.name, t.p4, consent);
    const token = Utilities.getUuid(), acads = [STAFF_ACAD];
    CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ name: t.name, acads, staff: true, tid: t.id }), 21600);
    log_(t.name, '관계자 로그인', '');
    return Object.assign({ ok: true, token, today: today_(), teacher: { id: t.id, name: t.name, role: '관계자', inst: t.inst, acads, home: acads, p4: t.p4, staff: true, email: acctEmail_(t.id) }, myAcct: myAcct_(t.name) }, bundle_(acads, t.name));
  }
  consentLog_('회원(교사)', t.name, t.p4, consent);
  try { ensureSettings_(); } catch (x) {}
  const open = acadOpen_();
  const own = [...new Set(loadSubs_().filter(x => x.owner === t.name).map(x => x.acad))];
  let acads = [...new Set(t.acads.concat(own))].filter(a => !open || open.includes(a));
  if (!acads.length && !t.acads.length && (!open || open.includes(NOACAD))) acads = [NOACAD];
  if (!acads.length) return { ok: false, msg: open ? '지금은 ' + open.join(', ') + '만 접수할 수 있어요.' : '소속 학원이 없어요. 협회에 문의해 주세요.' };
  const token = Utilities.getUuid();
  const heads = t.role === '원장' ? t.acads.filter(a => acads.includes(a)) : [];   /* 원장: 소속 학원 접수는 누가 냈든 고칠 수 있음 (11-13) */
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ name: t.name, acads, tid: t.id, heads }), 21600);
  log_(t.name, '로그인', '');
  return Object.assign({ ok: true, token, today: today_(), teacher: { id: t.id, name: t.name, role: t.role, inst: t.inst, acads, home: t.acads, heads, p4: t.p4, email: acctEmail_(t.id) }, myAcct: myAcct_(t.name) }, bundle_(acads, t.name));
}

/** 학생도 같은 학원 다른 접수에 살아 있으면(정상 · 취소 요청 중) 다시 못 넣음 — 새 접수 · 고칠 때 새로 넣는 사람 (11-03: 취소 요청 중인 학생이 다른 접수에 또 들어가던 것) */
function stuDup_(all, sb, onlyIds) {
  const key = id => id.slice(id.indexOf('_') + 1), taken = {};
  all.filter(x => x.acad === sb.acad && x.no !== sb.no).forEach(x => x.ppl.forEach(p => { if (p.kind === '가족') return; if (p.status === '정상' || p.status === '취소요청') taken[key(p.id)] = { no: x.no, cx: p.status === '취소요청' }; }));
  const dup = sb.ppl.filter(p => p.kind !== '가족' && p.status === '정상' && (!onlyIds || onlyIds.includes(p.id)) && taken[key(p.id)]);
  if (!dup.length) return;
  const t = taken[key(dup[0].id)];
  throw new Error(dup.map(p => p.name).join(', ') + '은(는) 이미 ' + t.no + '에 접수돼 있어요' + (t.cx ? ' (취소 요청 중). 다시 오려면 그 접수에서 「취소 요청 거두기」를 해 주세요.' : '. 「내 접수」에서 확인해 주세요.'));
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
    if (!canEdit_(u, sb)) throw new Error('이 접수의 취소 요청을 거둘 수 없어요.');
    const r = rows_(SH.CX).filter(x => String(x['접수번호']) === no && String(x['사유']) !== '차액 환불' && String(x['참가자ID'] || '').split(',').includes(pid)).pop();
    if (!r) throw new Error('취소 요청을 찾지 못했어요. 새로 고쳐 주세요.');
    if (String(r['처리'] || '요청') !== '요청') throw new Error('운영진이 이미 처리했어요(' + r['처리'] + '). 운영진에게 문의해 주세요.');
    const ids = String(r['참가자ID'] || '').split(',').filter(Boolean);
    sb.ppl.forEach(p => { if (ids.includes(p.id) && p.status === '취소요청') { p.status = '정상'; delete p.cxReqAt; p.cxWithdrawn = stamp_(); } });
    sb.rev = (+sb.rev || 0) + 1; writeSub_(sb, false); writeTeams_(all);
    markCx_(no, pid, '요청', '철회', '선생님이 취소 요청을 거둠');
    log_(u.name, '취소 요청 철회', no + ' · ' + r['참가자']);
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true }, bundle_(who_(token).acads, who_(token).name));
}
/** 다른 학원 학생도 접수 (겸임) — 소속은 그대로, 이 로그인 동안 그 학원 명단·접수를 열어 줌 */
function addAcad(token, acad) {
  const C = CacheService.getScriptCache(), v = C.get('tok_' + token);
  if (!v) throw new Error('로그인이 끝났어요. 화면을 새로 고쳐 다시 로그인해 주세요.');
  const u = JSON.parse(v); acad = String(acad || '').trim();
  if (!acad) throw new Error('학원을 골라 주세요.');
  if (u.guest || u.staff || acad === GUEST_ACAD || acad === STAFF_ACAD) throw new Error('이 학원은 고를 수 없어요.');
  const own = acad === u.name + ' 클래스';   // 「직접 입력」: 학원 소속 없이 내 이름 클래스
  const open = acadOpen_(); if (!own && open && !open.includes(acad)) throw new Error('지금은 ' + open.join(', ') + '만 접수할 수 있어요.');
  if (!u.acads.includes(acad)) { u.acads.push(acad); C.put('tok_' + token, JSON.stringify(u), 21600); log_(u.name, '다른 학원 접수(겸임)', acad); }
  return Object.assign({ ok: true, acads: u.acads }, bundle_(u.acads, u.name));
}
/** 고칠 수 있는 접수 (11-13): 내가 낸 접수 + 원장이면 내 학원(소속 학원)에 들어온 접수 전부. 접수한 선생님(owner)은 그대로 */
function canEdit_(u, sb) { return !!sb && !!u && (sb.owner === u.name || ((u.heads || []).indexOf(sb.acad) >= 0 && sb.acad !== GUEST_ACAD && sb.acad !== STAFF_ACAD && sb.acad !== NOACAD)); }
function who_(token) {
  const v = CacheService.getScriptCache().get('tok_' + token);
  if (!v) throw new Error('로그인이 끝났어요. 화면을 새로 고쳐 다시 로그인해 주세요.');
  return JSON.parse(v);
}

/** 화면에 필요한 것: 학원 명단, 그 학원 접수 전부(다른 선생님 것 포함 — 중복 접수 막기용), 앙상블 팀 */
/** 취소 요청 중인 사람에게 요청한 환불 예정액(p.cxAmt)을 붙임 — 「취소 · 환불」 시트의 처리 전 줄, 여러 명이면 입금액 비율로 나눔 (11-03) */
function cxAmt_(subs) {
  const W = []; subs.forEach(sb => sb.ppl.forEach(p => { if (p.status === '취소요청') W.push({ sb, p }); })); if (!W.length) return;
  const R = rows_(SH.CX).filter(r => String(r['사유']) !== '차액 환불' && !['환불 완료', '반려', '취소 확정'].includes(String(r['처리'] || '')));
  W.forEach(({ sb, p }) => { const r = R.filter(x => String(x['접수번호']) === sb.no && String(x['참가자ID'] || '').split(',').includes(p.id)).pop(); if (!r) return;
    const ids = String(r['참가자ID'] || '').split(',').filter(Boolean), tot = +String(r['환불 예정액'] || 0).replace(/[^\d]/g, '') || 0;
    if (ids.length <= 1) { p.cxAmt = tot; return; }
    const paid = id => +((sb.ppl.find(q => q.id === id) || {}).paidAmt) || 0, all = ids.reduce((t, id) => t + paid(id), 0);
    p.cxAmt = all ? Math.round(tot * paid(p.id) / all) : Math.round(tot / ids.length); });
}
function bundle_(acads, owner) {
  const profs = (() => { try { return profPublic_(); } catch (x) { return null; } })();
  const ts = teachers_();
  const st = rows_(SH.S);
  const rosters = {};
  acads.forEach(a => {
    if (a === STAFF_ACAD) { rosters[a] = { teachers: [], students: [] }; return; }   /* 관계자: 본인은 화면이 넣음 */
    if (a === NOACAD) { rosters[a] = { teachers: ts.filter(t => !t.acads.length && t.name === owner).map(t => ({ id: t.id, name: t.name, role: t.role, inst: t.inst, paidDate: t.paidDate, dueAmt: t.dueAmt, extra: [] })), students: [] }; return; }   /* 소속 없음: 본인만 */
    rosters[a] = {
      teachers: ts.filter(t => t.acads.includes(a)).map(t => ({ id: t.id, name: t.name, role: t.role, inst: t.inst, paidDate: t.paidDate, dueAmt: t.dueAmt, extra: t.acads.filter(x => x !== a) })),
      students: st.filter(r => String(r['학원']) === a && r['ID']).map(r => ({
        id: String(r['ID']), uid: String(r['고유번호']), name: String(r['이름']), tag: String(r['구분 표시'] || ''), inst: String(r['악기'] || ''),
        birth: String(r['출생연도'] || ''), teacher: String(r['담당 교사'] || ''), paidDate: dstr_(r['회비 납부일'])
      }))
    };
  });
  const all = loadSubs_();
  let camp = null; try { camp = campPublic_(); } catch (x) {}
  try { cxAmt_(all.filter(sb => acads.includes(sb.acad))); } catch (x) {}
  /* 보이는 접수 (11-14 사용자 지시): 내가 낸 접수 + 원장이면 내 학원 접수 전부. 원장이 아닌 선생님에게 다른 사람 접수(관리자 · 원장이 낸 것 포함)는 보내지 않음 */
  let heads = []; try { teachers_().filter(t => t.name === owner && t.role === '원장').forEach(t => (t.acads || []).forEach(a => heads.push(a))); } catch (x) {}
  const vis = all.filter(sb => acads.includes(sb.acad) && (sb.owner === owner || (heads.includes(sb.acad) && sb.acad !== GUEST_ACAD && sb.acad !== STAFF_ACAD && sb.acad !== NOACAD)));
  let aud = null; try { aud = audMine_(vis); } catch (x) {}
  let audPre = {}; try { audPre = audPreMap_(acads); } catch (x) {}
  /* 중복 접수 막기용: 남의 접수 내용은 보내지 않고 「이미 접수된 사람」 번호만 (학생 = 내 학원들, 선생님 = 모든 학원) */
  const taken = []; all.forEach(sb => { if (vis.includes(sb)) return; sb.ppl.forEach(p => { if (p.status !== '정상' && p.status !== '취소요청') return; const k = String(p.id).slice(String(sb.no).length + 1); if (/^t_/.test(k) || acads.includes(sb.acad)) taken.push(k); }); });
  const preq = parentFor_(acads.filter(a => a !== GUEST_ACAD && a !== STAFF_ACAD && a !== NOACAD)), pbank = acadBanks_(acads);
  return { aud, audPre, preq, pbank, rosters, subs: vis, taken, teams: teams_(all), bank: bankInfo_(), today: today_(), profs, camp, myPay: (() => { try { const me = ts.filter(t => t.name === owner); return myPay_(me.length === 1 ? me[0].id : '', owner); } catch (x) { return null; } })() };
}


/* ---------------- 학부모 신청 (11-15, 선택 기능) ----------------
 * 학원 다니는 아이의 학부모가 회원가입 없이 이름 · 휴대전화 · 학원만으로 들어와 「간다 / 안 간다」와 같이 가는 가족 이름만 냄.
 * 학원 선생님 화면(참가자 선택)에 「학부모 신청」으로 보이고, 선생님이 「접수에 담기」 → 권수 · 곡 등을 넣어 지금처럼 접수.
 * 돈은 지금처럼 학원이 모아서 협회에 냄 (학부모 → 협회 직접 입금 없음). 입력한 사람 = 첫 번째 보호자 */
const PARENT_SH = '학부모 신청', PARENT_HEAD = ['신청ID', '학원', '보호자', '휴대전화', '내용', '처음', '마지막', '상태', '담은 선생님', '담은 때', '비번', '돈', '이메일'];   /* 비번 = 4자리 해시 · 돈 = 입금 신고 · 취소 요청 JSON (11-15) */
function parentSheet_() { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(PARENT_SH); if (!sh) { sh = ss.insertSheet(PARENT_SH); sh.getRange(1, 1, 1, PARENT_HEAD.length).setValues([PARENT_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('A:M').setNumberFormat('@'); }
  else if (sh.getLastColumn() < PARENT_HEAD.length) { sh.getRange(1, 1, 1, PARENT_HEAD.length).setValues([PARENT_HEAD]).setFontWeight('bold'); }   /* 예전 시트에 비번 · 돈 칸 더하기 */
  return sh; }
const pdt_ = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss') : String(v || '');   /* 시트가 날짜로 바꾼 칸도 「2026-11-15 01:36:22」로 (11-15: 「ov 15 2026」 이 보이던 것) */
function parentRows_() { return rows_(PARENT_SH).filter(r => r['신청ID']).map(r => { let d = {}; try { d = JSON.parse(String(r['내용'] || '{}')); } catch (e) {} let m = {}; try { m = JSON.parse(String(r['돈'] || '{}')) || {}; } catch (e) {} return { m, email: String(r['이메일'] || ''), pin: String(r['비번'] || ''), id: String(r['신청ID']), acad: String(r['학원']), name: String(r['보호자']), phone: String(r['휴대전화']).replace(/\D/g, ''), d, at0: pdt_(r['처음']), at: pdt_(r['마지막']), st: String(r['상태'] || '보냄'), by: String(r['담은 선생님'] || ''), byAt: pdt_(r['담은 때']), _row: r._row }; }); }
function parentAcads_() {
  const open = acadOpen_(), set = {};
  rows_(SH.S).forEach(r => { const a = String(r['학원'] || '').trim(); if (a) set[a] = 1; });
  try { teachers_().forEach(t => (t.acads || []).forEach(a => { if (a) set[a] = 1; })); } catch (e) {}
  return Object.keys(set).filter(a => a !== GUEST_ACAD && a !== STAFF_ACAD && a !== NOACAD && (!open || open.includes(a))).sort((x, y) => x.localeCompare(y, 'ko'));
}
function parentInit() {
  const C = camp_();
  return { ok: true, open: C.base.member !== false, acads: parentAcads_(), camp: { name: C.base.name, start: C.base.start, end: C.base.end, place: C.base.place }, consent: (C.consent.items || []).filter(x => x.on), refund: C.refund, roomCap: (C.opt || {}).roomCap || 4,
    /* 예상 참가비 (11-15): 학생 · 첫 보호자 · 동반가족 · 15개월 미만 × 차수, 지금 차수, 학생 회비 · 가족방 빈 자리 · 추가레슨 */
    price: { fees: ['학생', '회원의 첫번째 보호자', '회원의 그외 악기 안하는 동반가족', '동반가족 중 15개월 미만'].reduce((o, k) => { o[k] = C.fees[k] || []; return o; }, {}), rounds: C.rounds.map(r => ({ n: r.n, from: r.from, to: r.to })), ri: curRound_(C), dues: +(C.opt || {}).studentDues || 0, empty: +(C.opt || {}).roomEmptyFee || 0, lesson: +(C.opt || {}).lessonFee || 0 } };
}
function parentWho_(tok) { const v = tok && CacheService.getScriptCache().get('pt_' + tok); if (!v) throw new Error('들어온 지 오래되어 끊겼어요. 처음 화면에서 다시 들어와 주세요.'); return JSON.parse(v); }
function parentOut_(r) { return r ? { id: r.id, acad: r.acad, name: r.name, d: r.d, at: r.at, st: r.st, byAt: r.byAt, m: r.m || {}, bank: acadBank_(r.acad), sub: parentSub_(r.id) } : null; }
/* 학원이 이 신청을 담아 낸 접수 (11-15 사용자: 추가레슨 · 마스터클래스는 학원이 넣으니, 학부모에게 확정 금액 · 추가 비용을 보여 줌) */
function parentSub_(id, all) {
  try {
    const sb = (all || loadSubs_()).find(x => x.form && Array.isArray(x.form.preq) && x.form.preq.includes(id)); if (!sb) return null;
    const info = (sb.form && sb.form.info) || {};
    const ppl = sb.ppl.filter(p => p.status === '정상' || p.status === '취소요청').map(p => { const k = String(p.id).slice(String(sb.no).length + 1), i = info[k] || {};
      return { name: p.name, type: p.type || '', fee: +p.fee || 0, lesson: +p.lesson || 0, dues: +p.dues || 0, room: +p.room || 0, les: +i.lessons || 0, mc: Array.isArray(i.mc) ? i.mc.length : 0, st: p.status }; });
    return { no: sb.no, round: sb.round || '', ppl, total: ppl.reduce((t, p) => t + p.fee + p.lesson + p.dues + p.room, 0) };
  } catch (e) { return null; }
}
function parentLogin(name, phone, acad, consent) {
  const C = camp_(); if (C.base.member === false) return { ok: false, msg: '지금은 학원 접수를 받지 않아요.' };
  const nm = String(name || '').trim().replace(/\s+/g, ' '), ph = String(phone || '').replace(/\D/g, ''), ac = String(acad || '').trim();
  if (nm.length < 2 || nm.length > 20 || /[()|,]/.test(nm)) return { ok: false, msg: '보호자 이름을 2~20자로 넣어 주세요.' };
  if (!/^01\d{8,9}$/.test(ph)) return { ok: false, msg: '휴대전화를 확인해 주세요.' };
  if (!parentAcads_().includes(ac)) return { ok: false, msg: '다니는 학원을 목록에서 골라 주세요.' };
  const ce = consentErr_(consent); if (ce) return { ok: false, msg: ce };
  const Ca = CacheService.getScriptCache(), k = 'ptf_' + ph, n = +(Ca.get(k) || 0);
  if (n >= 10) return { ok: false, msg: '잠시 뒤 다시 해 주세요 (15분).' };
  const had = parentRows_().find(r => r.phone === ph && r.acad === ac);
  if (had && had.name !== nm) { Ca.put(k, String(n + 1), 900); return { ok: false, msg: '이 휴대전화로 「' + maskName_(had.name) + '」 님이 이미 신청했어요. 처음에 넣은 보호자 이름으로 넣어 주세요.' }; }
  consentLog_('학부모 신청', nm, ph, consent);
  const tok = Utilities.getUuid(); Ca.put('pt_' + tok, JSON.stringify({ nm, ph, ac }), 21600);
  log_(nm + '(' + ph.slice(-4) + ')', '학부모 신청 들어옴', ac);
  return { ok: true, token: tok, me: { name: nm, acad: ac, p4: ph.slice(-4) }, req: parentOut_(had) };
}
function parentClean_(d) {
  d = d || {}; const t = (v, n) => String(v == null ? '' : v).replace(/[\r|]/g, ' ').trim().slice(0, n);
  const yr = v => { const y = String(v || '').replace(/\D/g, '').slice(0, 6); return y; };
  const g = v => (v === '남' || v === '여') ? v : '';
  const kids = (Array.isArray(d.kids) ? d.kids : []).slice(0, 8).map(x => { const a = parseInt(String(x.age == null ? '' : x.age).replace(/\D/g, ''), 10); const by = String(x.by || '').replace(/\D/g, '').slice(0, 4); return { name: t(x.name, 20), inst: t(x.inst, 10), age: a >= 0 && a <= 30 ? a : '', by: /^(19|20)\d\d$/.test(by) ? by : '', go: ['간다', '안 간다', '모름'].includes(x.go) ? x.go : '간다' }; }).filter(x => x.name);
  const fam = (Array.isArray(d.fam) ? d.fam : []).slice(0, 12).map(x => ({ type: x.type === '15개월 미만' ? '15개월 미만' : '동반가족', name: t(x.name, 20), gender: g(x.gender), by: yr(x.by) })).filter(x => x.name);
  return { kids, fam, me: { gender: g((d.me || {}).gender), by: yr((d.me || {}).by), go: (d.me || {}).go === false ? false : true }, room: { fam: !!(d.room || {}).fam, note: t((d.room || {}).note, 300) }, memo: t(d.memo, 300) };
}
function parentSave(tok, d) {
  const u = parentWho_(tok), x = parentClean_(d);
  if (!x.kids.length) throw new Error('아이 이름을 1명 이상 넣어 주세요.');
  const lock = lock_();
  let out;
  try {
    const sh = parentSheet_(), L = parentRows_(), had = L.find(r => r.phone === u.ph && r.acad === u.ac);
    const ph = "'" + u.ph.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3'), j = JSON.stringify(x);
    if (had) { sh.getRange(had._row, 2, 1, 7).setValues([[u.ac, u.nm, ph, j, had.at0, stamp_(), had.st === '담음' ? '바뀜' : had.st === '바뀜' ? '바뀜' : '보냄']]); if (had.st === '취소' && had.m && had.m.cx) { delete had.m.cx; sh.getRange(had._row, 12).setValue(JSON.stringify(had.m)); } }   /* 취소한 뒤 다시 보내면 새로 참가 */
    else { const id = 'P' + String(L.reduce((m, r) => Math.max(m, +r.id.slice(1) || 0), 0) + 1).padStart(4, '0'); sh.appendRow([id, u.ac, u.nm, ph, j, stamp_(), stamp_(), '보냄', '', '']); }
    out = parentRows_().find(r => r.phone === u.ph && r.acad === u.ac);
  } finally { lock.releaseLock(); }
  log_(u.nm + '(' + u.ph.slice(-4) + ')', '학부모 신청 저장', u.ac + ' · 아이 ' + x.kids.length + ' · 가족 ' + x.fam.length);
  return { ok: true, req: parentOut_(out) };
}
/* 한 화면 신청 (11-15 사용자: 이름 · 전화 → 학원 → 아이(이름 · 전공 · 나이) → 가요/안 가요/몰라요 → 가족) — 들어가기 없이 보내기 한 번 */
function parentCheck_(name, phone, acad) {
  const nm = String(name || '').trim().replace(/\s+/g, ' '), ph = String(phone || '').replace(/\D/g, ''), ac = String(acad || '').trim();
  if (nm.length < 2 || nm.length > 20 || /[()|,]/.test(nm)) return { err: '보호자 이름을 2~20자로 넣어 주세요.' };
  if (!/^01\d{8,9}$/.test(ph)) return { err: '휴대전화를 확인해 주세요.' };
  if (!parentAcads_().includes(ac)) return { err: '다니는 학원을 목록에서 골라 주세요.' };
  const Ca = CacheService.getScriptCache(), k = 'ptf_' + ph, n = +(Ca.get(k) || 0);
  if (n >= 10) return { err: '잠시 뒤 다시 해 주세요 (15분).' };
  const had = parentRows_().find(r => r.phone === ph && r.acad === ac);
  if (had && had.name !== nm) { Ca.put(k, String(n + 1), 900); return { err: '이 휴대전화로 「' + maskName_(had.name) + '」 님이 이미 신청했어요. 처음에 넣은 보호자 이름으로 넣어 주세요.' }; }
  return { nm, ph, ac, had };
}
function parentLoad(name, phone, acad, pin) {
  const C = camp_(); if (C.base.member === false) return { ok: false, msg: '지금은 학원 접수를 받지 않아요.' };
  const c = parentCheck_(name, phone, acad); if (c.err) return { ok: false, msg: c.err };
  if (!c.had) return { ok: true, req: null };
  if (c.had.pin && c.had.pin !== pinHash_(c.had.id, String(pin || ''))) { const Ca = CacheService.getScriptCache(), k = 'ptf_' + c.ph; Ca.put(k, String(+(Ca.get(k) || 0) + 1), 900); return { ok: false, msg: '비밀번호 4자리가 맞지 않아요.' }; }
  return { ok: true, req: parentOut_(c.had) };
}
function parentSubmit(name, phone, acad, consent, d, pin, email) {
  const C = camp_(); if (C.base.member === false) return { ok: false, msg: '지금은 학원 접수를 받지 않아요.' };
  const c = parentCheck_(name, phone, acad); if (c.err) return { ok: false, msg: c.err };
  pin = String(pin || '');
  if (!/^\d{4}$/.test(pin)) return { ok: false, msg: '비밀번호 숫자 4자리를 넣어 주세요.' };
  if (c.had && c.had.pin && c.had.pin !== pinHash_(c.had.id, pin)) return { ok: false, msg: '비밀번호 4자리가 맞지 않아요. 처음 보낼 때 정한 숫자예요.' };
  const ce = consentErr_(consent); if (ce) return { ok: false, msg: ce };
  if (!c.had) consentLog_('학부모 신청', c.nm, c.ph, consent);
  const tok = Utilities.getUuid(); CacheService.getScriptCache().put('pt_' + tok, JSON.stringify({ nm: c.nm, ph: c.ph, ac: c.ac }), 600);
  email = String(email || '').trim().toLowerCase().slice(0, 80);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, msg: '이메일 주소를 확인해 주세요.' };
  const res = parentSave(tok, d);
  try { const r = parentRows_().find(x => x.id === res.req.id); if (r) { if (!r.pin) parentSheet_().getRange(r._row, 11).setValue(pinHash_(r.id, pin)); if (email) parentSheet_().getRange(r._row, 13).setValue(email); } } catch (e) {}
  try { const r = parentRows_().find(x => x.id === res.req.id); parentMail_(r, '캠프 신청을 학원에 보냈어요', ['학원: ' + r.acad, '학생: ' + (r.d.kids || []).map(k => k.name).join(', '), '같이 가는 가족: ' + ([(r.d.me || {}).go === false ? '' : r.name].concat((r.d.fam || []).map(f => f.name + '(' + f.type + ')')).filter(Boolean).join(', ') || '없음'), '', '학원 선생님이 권수 · 곡을 넣어 접수하면 확정 금액을 다시 알려 드려요.', '추가 개인레슨 · 마스터클래스는 학원이 넣고, 넣으면 비용이 더해져요.']); } catch (e) {}
  return res;
}
/* 첫 단계 (11-15 사용자: 이름 · 휴대전화 · 이메일 · 비밀번호 → 확인 → 다음 화면): 이 휴대전화로 낸 신청을 찾아 줌 */
function parentLookup(name, phone, pin) {
  const C = camp_(); if (C.base.member === false) return { ok: false, msg: '지금은 학원 접수를 받지 않아요.' };
  const nm = String(name || '').trim().replace(/\s+/g, ' '), ph = String(phone || '').replace(/\D/g, '');
  if (nm.length < 2 || nm.length > 20 || /[()|,]/.test(nm)) return { ok: false, msg: '보호자 이름을 2~20자로 넣어 주세요.' };
  if (!/^01\d{8,9}$/.test(ph)) return { ok: false, msg: '휴대전화를 확인해 주세요.' };
  if (!/^\d{4}$/.test(String(pin || ''))) return { ok: false, msg: '비밀번호 숫자 4자리를 넣어 주세요.' };
  const Ca = CacheService.getScriptCache(), k = 'ptf_' + ph, n = +(Ca.get(k) || 0);
  if (n >= 10) return { ok: false, msg: '잠시 뒤 다시 해 주세요 (15분).' };
  const L = parentRows_().filter(r => r.phone === ph);
  if (L.some(r => r.name !== nm)) { Ca.put(k, String(n + 1), 900); return { ok: false, msg: '이 휴대전화로 「' + maskName_(L[0].name) + '」 님이 이미 신청했어요. 처음에 넣은 보호자 이름으로 넣어 주세요.' }; }
  if (L.some(r => r.pin && r.pin !== pinHash_(r.id, String(pin)))) { Ca.put(k, String(n + 1), 900); return { ok: false, msg: '비밀번호 4자리가 맞지 않아요. 처음 보낼 때 정한 숫자예요.' }; }
  return { ok: true, reqs: L.map(parentOut_) };
}
/* 학부모 메일 (11-15): 이메일을 넣은 학부모에게 신청 · 접수 금액 · 입금 · 취소 소식 */
function parentMail_(r, title, lines) {
  if (!r || !r.email) return false;
  try { const C = camp_(), url = 'https:\/\/app.suzukimusickorea.org/camp/parent.html' + (String(setting_('테스트 로그인') || '').trim() ? '?test' : '');
    MailApp.sendEmail({ to: r.email, subject: '[' + C.base.name + '] ' + title, name: '한국스즈키음악협회', body: r.name + '님,\n\n' + title + '.\n\n' + lines.join('\n') + '\n\n내 신청 보기 · 입금 신고 · 취소: ' + url + '\n(이름 · 휴대전화 · 비밀번호 4자리로 들어와요)\n\n궁금한 점은 다니는 학원 선생님께 여쭤 주세요.' }); return true; } catch (e) { try { log_('시스템', '학부모 메일 실패', String(e)); } catch (x) {} return false; }
}
/* 학원이 학부모 신청을 담아 접수를 저장하면: 확정 금액이 바뀌었을 때만 메일 (추가레슨 · 마스터클래스 넣거나 바꿨을 때 포함) */
function parentNotifySubs_(nos) {
  try {
    const all = loadSubs_(), rows = parentRows_();
    all.filter(sb => nos.includes(sb.no) && sb.form && Array.isArray(sb.form.preq)).forEach(sb => sb.form.preq.forEach(id => {
      const r = rows.find(x => x.id === id); if (!r) return; const sub = parentSub_(id, all); if (!sub) return;
      const m = r.m || {}; if (m.lastTotal === sub.total) return;
      if (m.lastTotal != null) m.prevTotal = m.lastTotal; m.lastTotal = sub.total; m.totalAt = stamp_();
      if (!r.email) { parentMoneySet_(r, m); return; }
      const paid = (m.reps || []).filter(x => x.st === '확인').reduce((t, x) => t + x.amt, 0), ex = sub.ppl.reduce((t, p) => t + p.lesson, 0), bk = acadBank_(r.acad);
      parentMail_(r, (m.prevTotal == null ? '학원이 캠프 접수를 마쳤어요' : '캠프 접수 금액이 바뀌었어요') + ' (' + sub.no + ')', (m.prevTotal != null ? ['금액이 ' + (+m.prevTotal).toLocaleString('ko-KR') + '원에서 ' + sub.total.toLocaleString('ko-KR') + '원으로 바뀌었어요.', ''] : []).concat(sub.ppl.map(p => '- ' + p.name + ' ' + (p.fee + p.lesson + p.dues + p.room).toLocaleString('ko-KR') + '원' + (p.lesson ? ' (추가레슨 · 마스터클래스 ' + p.lesson.toLocaleString('ko-KR') + '원 포함)' : '')).concat(['', '확정 금액: ' + sub.total.toLocaleString('ko-KR') + '원' + (ex ? ' (추가레슨 · 마스터클래스 ' + ex.toLocaleString('ko-KR') + '원 포함)' : ''), '입금 확인: ' + paid.toLocaleString('ko-KR') + '원', sub.total > paid ? '더 보내 주실 금액: ' + (sub.total - paid).toLocaleString('ko-KR') + '원' : '다 내셨어요.', bk ? '학원 통장: ' + bk.bank + ' ' + bk.acct + ' (' + bk.holder + ')' : ''])));
      parentMoneySet_(r, m);
    }));
  } catch (e) { try { log_('시스템', '학부모 접수 메일 실패', String(e)); } catch (x) {} }
}

/* ---------- 학부모 ↔ 학원 돈 (11-15 사용자: 학원 통장 · 입금 신고 · 취소 · 환불 요청, 처리는 그 학원 원장 · 선생님) ----------
 * 학원 통장은 원장이 선생님 화면에서 넣음(시트 「학원 통장」). 학부모 비밀번호 4자리(처음 보낼 때 정함, 해시로 저장). 돈 기록은 「학부모 신청」 시트 「돈」 칸 JSON:
 * { reps:[{at, nm(입금자명), date, amt, st:'신고'|'확인'|'반려', why, by, byAt}], cx:{at, why, bank, acct, holder, st:'요청'|'처리'|'반려'|'취소', amt, note, by, byAt} } */
const ABANK_SH = '학원 통장', ABANK_HEAD = ['학원', '은행', '계좌번호', '예금주', '고친 사람', '고친 때'];
function acadBank_(acad) { try { const r = rows_(ABANK_SH).find(x => String(x['학원']) === acad); return r ? { bank: String(r['은행'] || ''), acct: String(r['계좌번호'] || ''), holder: String(r['예금주'] || '') } : null; } catch (e) { return null; } }
function acadBankSet(token, acad, b) {
  const u = who_(token); acad = String(acad || '');
  let head = false; try { head = teachers_().some(t => t.name === u.name && t.role === '원장' && (t.acads || []).includes(acad)); } catch (e) {}
  if (!head) throw new Error('학원 통장은 그 학원 원장님만 넣을 수 있어요.');
  const t = (v, n) => String(v == null ? '' : v).replace(/[|\r\n]/g, ' ').trim().slice(0, n);
  b = b || {}; const bank = t(b.bank, 20), acct = t(b.acct, 30).replace(/[^\d-]/g, ''), holder = t(b.holder, 20);
  if (!bank || !acct || !holder) throw new Error('은행 · 계좌번호 · 예금주를 모두 넣어 주세요.');
  const lock = lock_();
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(ABANK_SH);
    if (!sh) { sh = ss.insertSheet(ABANK_SH); sh.getRange(1, 1, 1, ABANK_HEAD.length).setValues([ABANK_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('A:F').setNumberFormat('@'); }
    const r = rows_(ABANK_SH).find(x => String(x['학원']) === acad), row = [acad, bank, "'" + acct, holder, u.name, stamp_()];
    if (r) sh.getRange(r._row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  } finally { lock.releaseLock(); }
  log_(u.name, '학원 통장', acad);
  return { ok: true, pbank: acadBanks_(u.acads || []) };
}
function acadBanks_(acads) { const o = {}; acads.forEach(a => { const b = acadBank_(a); if (b) o[a] = b; }); return o; }
const pinHash_ = (id, pin) => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'suzuki-parent|' + id + '|' + pin));
function parentAuth_(name, phone, acad, pin) {
  const c = parentCheck_(name, phone, acad); if (c.err) return c;
  if (!c.had) return { err: '보낸 신청이 없어요. 먼저 신청을 보내 주세요.' };
  if (c.had.pin && c.had.pin !== pinHash_(c.had.id, String(pin || ''))) { const Ca = CacheService.getScriptCache(), k = 'ptf_' + c.ph; Ca.put(k, String(+(Ca.get(k) || 0) + 1), 900); return { err: '비밀번호 4자리가 맞지 않아요.' }; }
  return c;
}
function parentMoneySet_(row, m, st) { const sh = parentSheet_(); sh.getRange(row._row, 12).setValue(JSON.stringify(m)); if (st) sh.getRange(row._row, 8).setValue(st); }
function parentPay(name, phone, acad, pin, p) {
  const c = parentAuth_(name, phone, acad, pin); if (c.err) return { ok: false, msg: c.err };
  p = p || {};
  /* 입금 신고 고치기 · 지우기 (11-15): 학원이 확인하기 전(신고 · 반려)만 */
  if (p.i !== undefined && p.i !== null && p.i !== '') {
    const lk = lock_(); let o2, what = '';
    try { const r = parentRows_().find(x => x.id === c.had.id), m = r.m || {}, L = m.reps || [], i = +p.i, x = L[i];
      if (!x) return { ok: false, msg: '그 입금 신고를 찾지 못했어요. 새로 열어 주세요.' };
      if (x.st === '확인') return { ok: false, msg: '학원이 이미 확인한 신고는 고치거나 지울 수 없어요. 학원 선생님께 말씀해 주세요.' };
      if (p.del) { L.splice(i, 1); what = '지움 ' + x.amt; }
      else { const n2 = String(p.nm || '').trim().slice(0, 20), d2 = String(p.date || '').slice(0, 10), a2 = Math.max(0, Math.min(50000000, +String(p.amt || '').replace(/[^\d]/g, '') || 0));
        if (!n2) return { ok: false, msg: '입금자명을 넣어 주세요.' }; if (!/^\d{4}-\d{2}-\d{2}$/.test(d2)) return { ok: false, msg: '입금일을 골라 주세요.' }; if (!a2) return { ok: false, msg: '금액을 넣어 주세요.' };
        L[i] = { at: stamp_(), nm: n2, date: d2, amt: a2, st: '신고', ed: (x.ed || 0) + 1 }; what = '고침 ' + x.amt + '→' + a2; }
      m.reps = L; parentMoneySet_(r, m); o2 = parentRows_().find(y => y.id === c.had.id); } finally { lk.releaseLock(); }
    log_(c.nm + '(' + c.ph.slice(-4) + ')', '학부모 입금 신고 ' + (p.del ? '지움' : '고침'), c.ac + ' · ' + what);
    return { ok: true, req: parentOut_(o2) };
  }
  const nm = String(p.nm || '').trim().slice(0, 20), date = String(p.date || '').slice(0, 10), amt = Math.max(0, Math.min(50000000, +String(p.amt || '').replace(/[^\d]/g, '') || 0));
  if (!nm) return { ok: false, msg: '입금자명을 넣어 주세요.' }; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, msg: '입금일을 골라 주세요.' }; if (!amt) return { ok: false, msg: '금액을 넣어 주세요.' };
  const lock = lock_(); let out;
  try { const r = parentRows_().find(x => x.id === c.had.id), m = r.m || {}; m.reps = (m.reps || []).concat([{ at: stamp_(), nm, date, amt, st: '신고' }]).slice(-20); parentMoneySet_(r, m); out = parentRows_().find(x => x.id === c.had.id); } finally { lock.releaseLock(); }
  log_(c.nm + '(' + c.ph.slice(-4) + ')', '학부모 입금 신고', c.ac + ' · ' + amt);
  return { ok: true, req: parentOut_(out) };
}
function parentCancel(name, phone, acad, pin, x) {
  const c = parentAuth_(name, phone, acad, pin); if (c.err) return { ok: false, msg: c.err };
  x = x || {}; const t = (v, n) => String(v == null ? '' : v).replace(/[|\r]/g, ' ').trim().slice(0, n);
  const lock = lock_(); let out, now = false;
  try {
    const r = parentRows_().find(y => y.id === c.had.id), m = r.m || {}, paid = (m.reps || []).some(y => y.st === '확인' || y.st === '신고');
    if (x.undo) { if (m.cx && m.cx.st === '요청') delete m.cx; parentMoneySet_(r, m); }
    else {
      const why = t(x.why, 200); if (!why) return { ok: false, msg: '취소 사유를 넣어 주세요.' };
      if (paid && (!t(x.bank, 20) || !t(x.acct, 30) || !t(x.holder, 20))) return { ok: false, msg: '환불 받을 은행 · 계좌번호 · 예금주를 넣어 주세요.' };
      now = !paid && r.st === '보냄';   /* 학원이 아직 담지 않았고 돈도 안 냈으면 바로 취소 */
      m.cx = { at: stamp_(), why, bank: t(x.bank, 20), acct: t(x.acct, 30).replace(/[^\d-]/g, ''), holder: t(x.holder, 20), st: now ? '취소' : '요청' };
      parentMoneySet_(r, m, now ? '취소' : '');
    }
    out = parentRows_().find(y => y.id === c.had.id);
  } finally { lock.releaseLock(); }
  try { if (!x.undo) parentMail_(out, now ? '캠프 신청을 취소했어요' : '취소 · 환불 요청을 학원에 보냈어요', ['사유: ' + String(x.why || '').slice(0, 200), now ? '' : '학원이 확인한 뒤 환불액을 알려 드려요.']); } catch (e) {}
  log_(c.nm + '(' + c.ph.slice(-4) + ')', x.undo ? '학부모 취소 요청 거둠' : now ? '학부모 신청 취소' : '학부모 취소 · 환불 요청', c.ac);
  return { ok: true, req: parentOut_(out) };
}
/* 학원(그 학원 선생님 · 원장): 입금 확인 · 반려, 취소 · 환불 처리 · 반려 */
function parentPayDo(token, id, i, ok, why) {
  const u = who_(token), r = parentRows_().find(x => x.id === String(id));
  if (!r || !(u.acads || []).includes(r.acad)) throw new Error('신청을 찾지 못했어요.');
  const lock = lock_();
  try { const m = r.m || {}, rp = (m.reps || [])[+i]; if (!rp) throw new Error('입금 신고를 찾지 못했어요.'); rp.st = ok ? '확인' : '반려'; rp.why = ok ? '' : String(why || '').slice(0, 100); rp.by = u.name; rp.byAt = stamp_(); parentMoneySet_(r, m); } finally { lock.releaseLock(); }
  try { const rp = (r.m.reps || [])[+i]; parentMail_(r, ok ? '학원이 입금을 확인했어요' : '입금 신고가 반려됐어요', [rp.date + ' · ' + rp.nm + ' · ' + (+rp.amt).toLocaleString('ko-KR') + '원', ok ? '' : '사유: ' + (rp.why || '-') + ' · 확인 후 다시 신고해 주세요.']); } catch (e) {}
  log_(u.name, ok ? '학부모 입금 확인' : '학부모 입금 반려', r.acad + ' · ' + r.name);
  return { ok: true, preq: parentFor_(u.acads || []) };
}
function parentCxDo(token, id, act, amt, note) {
  const u = who_(token), r = parentRows_().find(x => x.id === String(id));
  if (!r || !(u.acads || []).includes(r.acad)) throw new Error('신청을 찾지 못했어요.');
  const lock = lock_();
  try { const m = r.m || {}; if (!m.cx) throw new Error('취소 요청이 없어요.'); m.cx.st = act === '처리' ? '처리' : '반려'; m.cx.amt = Math.max(0, +String(amt || '').replace(/[^\d]/g, '') || 0); m.cx.note = String(note || '').slice(0, 200); m.cx.by = u.name; m.cx.byAt = stamp_(); parentMoneySet_(r, m, act === '처리' ? '취소' : ''); } finally { lock.releaseLock(); }
  try { const cx = r.m.cx; parentMail_(r, act === '처리' ? '취소 · 환불을 처리했어요' : '취소 요청이 반려됐어요', [act === '처리' ? '환불액: ' + (+cx.amt || 0).toLocaleString('ko-KR') + '원' + (cx.acct ? ' · 받으실 계좌 ' + cx.bank + ' ****' + String(cx.acct).replace(/\D/g, '').slice(-4) : '') : '참가는 그대로예요.', cx.note ? '학원 메모: ' + cx.note : '']); } catch (e) {}
  log_(u.name, act === '처리' ? '학부모 취소 · 환불 처리' : '학부모 취소 요청 반려', r.acad + ' · ' + r.name);
  return { ok: true, preq: parentFor_(u.acads || []) };
}
/* 선생님 화면에 보내는 학부모 신청 (그 학원 것만, 휴대전화는 그 학원 선생님에게만) */
function parentFor_(acads) { try { const L = parentRows_().filter(r => acads.includes(r.acad)); const all = L.length ? loadSubs_() : []; return L.map(r => ({ id: r.id, acad: r.acad, name: r.name, phone: r.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3'), d: r.d, at: r.at, st: r.st, by: r.by, byAt: r.byAt, m: r.m || {}, sub: parentSub_(r.id, all) })); } catch (e) { return []; } }
function parentMark(token, id) {
  const u = who_(token), r = parentRows_().find(x => x.id === String(id));
  if (!r || !(u.acads || []).includes(r.acad)) throw new Error('신청을 찾지 못했어요.');
  const lock = lock_();
  try { parentSheet_().getRange(r._row, 8, 1, 3).setValues([['담음', u.name, stamp_()]]); } finally { lock.releaseLock(); }
  return { ok: true, preq: parentFor_(u.acads || []) };
}

/* ---------------- 접수 읽고 쓰기 ---------------- */
function loadSubs_() {
  const admin = adminMap_();
  return rows_(SH.SUB).filter(r => r['접수번호']).map(r => {
    const js = ['JSON_1', 'JSON_2', 'JSON_3', 'JSON_4'].map(k => String(r[k] || '')).join('');
    let sb; try { sb = JSON.parse(retype_(js)); } catch (e) { return null; }
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

function writeSub_(sb, isNew) { writeSubRow_(sb, isNew); writePeople_(sb, isNew); try { staffProfs_(sb); } catch (e) { Logger.log('교수진 자동 추가: ' + e.message); } }
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
  /* 새 접수는 같은 번호가 없으니 시트를 다시 읽지 않고 바로 붙임 (속도 11-13) */
  const found = isNew === 'append' ? null : rows_(SH.SUB).find(r => String(r['접수번호']) === sb.no);
  if (found) { row[1] = found['접수일시'] instanceof Date ? Utilities.formatDate(found['접수일시'], TZ, 'yyyy-MM-dd HH:mm:ss') : found['접수일시']; sh.getRange(found._row, 1, 1, row.length).setValues([row]); }
  else sh.appendRow(row);
}

/** 참가자 시트: 그 접수의 줄을 다시 씀. 운영진 칸은 참가자ID 기준으로 지킴 */
function writePeople_(sb, isNew) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.P);
  const old = isNew === 'append' ? [] : rows_(SH.P).filter(r => String(r['접수번호']) === sb.no);
  const keep = {}; old.forEach(r => keep[String(r['참가자ID'])] = ADMIN_COLS.map(k => r[k]));
  old.map(r => r._row).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
  const f = sb.form || {}, info = f.info || {};
  const rows = sb.ppl.map(p => {
    const key = p.id.slice(sb.no.length + 1), i = info[key] || {};
    const r = p.rep && p.rep.rows && p.rep.rows[p.id] || (p.rep && p.rep.ids ? { name: p.rep.name, date: p.rep.date, a: p.rep.amt } : {});
    const vals = {
      '참가자ID': p.id, '접수번호': sb.no, '차수': p.rndN || sb.round, '학원': sb.acad, '접수 교사': sb.owner, '들어온 차례': (p.batch || 1) === 1 ? '처음 접수' : '추가 ' + ((p.batch || 1) - 1),
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
  const M = RC_MEMO || {}, CC = camp_(), FEES = CC.fees, OPT = CC.opt, ADJ = M.adj || adjMap_();
  if (sb.form) { delete sb.form.red; if (sb.form.note != null) sb.form.note = String(sb.form.note || '').trim().slice(0, 100) || null; }
  if (sb.form) {   /* 방 요청 (11-14): 일반 방 rnote · 가족방 rreq[대표] — 글자 수만 자름 */
    const F = sb.form; if (F.rnote != null) F.rnote = String(F.rnote || '').trim().slice(0, 300) || null;
    if (F.preq != null) F.preq = (Array.isArray(F.preq) ? F.preq : []).map(x => String(x).replace(/[^\w]/g, '').slice(0, 10)).filter(Boolean).slice(0, 20);   /* 학부모 신청에서 담은 것 (11-15) */
    if (F.rreq && typeof F.rreq === 'object') { const o = {}; Object.keys(F.rreq).slice(0, 30).forEach(k => { const v = String(F.rreq[k] || '').trim().slice(0, 300); if (v) o[String(k).slice(0, 40)] = v; }); F.rreq = Object.keys(o).length ? o : null; } else if (F.rreq != null) F.rreq = null;
  }
  const f = sb.form || {}, info = f.info || {}, ri = Math.max(0, Math.min(CC.rounds.length - 1, +f.ri || 0));
  sb.round = CC.rounds[ri].n;
  const guest = sb.acad === GUEST_ACAD;   // 비회원: 연회비 없음 · 비회원 참가비
  const staff = sb.acad === STAFF_ACAD;
  const intl = !!sb.intl;   // 해외 단체: 연회비 없음 · 해외 참가비   // 관계자: 연회비 없음 · 본인은 역할 참가비 · 가족은 회원 가족 참가비
  const tPaid = {}; (M.t || teachers_()).forEach(t => tPaid['t_' + t.id] = !!t.paidDate);
  const sPaid = {}; (M.s || rows_(SH.S)).forEach(r => sPaid[String(r['ID'])] = !!dstr_(r['회비 납부일']));
  const viaCamp = M.via || duesViaCamp_();   /* 이 캠프에서 받은 연회비는 회원관리에 납부로 남아도 그대로 청구 (10-31) */
  const key = p => p.id.slice(sb.no.length + 1);
  /* 사람별 차수 (11-04): 입금해야 그 차수 — 차수 = 늦은 쪽(접수에 들어온 날의 차수, 입금일의 차수). 입금 확인 = 운영진이 확인한 실제 입금일 · 조금이라도 내면 그 차수.
     아직 확인 전이면 입금 신고한 날짜(운영진 확인 중, 반려되면 풀림) · 신고도 없으면 오늘 차수 → 마감이 지나면 다음 차수 금액 (매일 새로 셈: repriceTick_) */
  const RD = CC.rounds, rix = d => { const v = String(d || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return -1; const j = RD.findIndex(r => v <= String(r.to || '9999')); return j < 0 ? RD.length - 1 : j; };
  const AM = M.am || adminMap_(), tdR = curRound_(CC);
  const rOf = p => { const add = rix(p.addAt) >= 0 ? rix(p.addAt) : ri, a = AM[p.id];
    const pay = a && a.amt > 0 ? (rix(a.date) >= 0 ? rix(a.date) : add) : (p.pay === '신고' && p.rep && rix(p.rep.date) >= 0 ? rix(p.rep.date) : tdR);
    return Math.max(add, pay); };
  const live = sb.ppl.filter(p => p.status !== '취소');
  const liveKeys = live.map(key);
  // 가족방: 대표 + 같은 방 형제 + 그 가족
  const roomBy = {};
  Object.keys(f.room || {}).filter(k => f.room[k] && liveKeys.includes(k)).forEach(k => {
    const heads = [k].concat(Object.keys(f.join || {}).filter(j => f.join[j] === k && liveKeys.includes(j)));
    const fam = (f.fam || []).filter(x => heads.includes(x.link) && liveKeys.includes(x.id)).length;
    roomBy[k] = Math.max(0, OPT.roomCap - (heads.length + fam)) * OPT.roomEmptyFee;
  });
  if (intl) {   /* 해외: 「Family room」 이름이 같은 사람끼리 한 방 · 맨 앞 사람(대표)에 빈 자리 금액 (10-31) */
    Object.keys(roomBy).forEach(k => delete roomBy[k]); const gr = {};
    sb.ppl.forEach(p => { if (p.status === '취소') return; const k = p.id.slice(sb.no.length + 1), t = String(((info[k] || {}).room) || '').trim().toLowerCase(); if (t) (gr[t] = gr[t] || []).push(k); });
    sb.form.room = {}; Object.keys(gr).forEach(t => { const L = gr[t]; if (L.length > OPT.roomCap) throw new Error('Family room "' + t + '": up to ' + OPT.roomCap + ' people per room.'); const rt = +OPT.usdRate || 1450; roomBy[L[0]] = Math.max(0, OPT.roomCap - L.length) * Math.round((+OPT.roomEmptyFee || 0) / rt) * rt; sb.form.room[L[0]] = true; });   /* 빈 자리 금액도 USD 로 맞춤 */
  }
  sb.ppl.forEach(p => {
    const k = key(p), i = info[k];
    if (!i) return;                                   // 입금돼서 남겨 둔 사람(명단에서 뺀 사람)은 그대로
    if (!FEES[i.type]) throw new Error(p.name + '의 참가 구분(' + i.type + ')을 확인해 주세요.');
    const plays = PLAYS.includes(i.type);
    const les = plays ? Math.max(0, Math.min(OPT.lessonMax, +i.lessons || 0)) : 0;
    const mc = plays ? (i.mc || []).reduce((t, n) => t + ((mcList_().find(m => m.n === n) || {}).fee || 0), 0) : 0;
    if (intl !== INTL_TYPES.includes(i.type)) throw new Error(p.name + ': ' + (intl ? 'Overseas registration uses overseas types only.' : '해외 참가 구분은 해외 단체 접수에서만 쓸 수 있어요.'));
    if (staff && !(STAFF_TYPES.includes(i.type) || STAFF_FAM.includes(i.type))) throw new Error(p.name + ': 관계자 접수는 역할(초빙교수 · 반주자 …)이나 동반 가족만 넣을 수 있어요.');
    if (!staff && STAFF_TYPES.includes(i.type)) throw new Error(p.name + '의 참가 구분(' + i.type + ')은 관계자 접수에서만 쓸 수 있어요.');
    if (guest !== isGuestType_(i.type)) throw new Error(p.name + '의 참가 구분(' + i.type + ')을 확인해 주세요. ' + (guest ? '비회원 접수는 비회원 참가비로만 접수해요.' : ''));
    if (p.status !== '취소' && ['학생', '회원의 악기하는 자녀', '비회원 학생'].includes(i.type) && !String(i.prog || '').trim()) throw new Error(p.name + '의 권수(현재 진도)를 골라 주세요.');
    if (p.status !== '취소' && plays && String(i.video || '').trim() && !/^https?:\S{6,}$/i.test(String(i.video || '').trim())) throw new Error(p.name + ': 음원 주소는 https 로 시작하게 넣어 주세요. (나중에 「내 접수」에서 넣어도 돼요)');
    const isT = /^t_|^me_/.test(k), isFam = (f.fam || []).some(x => x.id === k);
    const paid = viaCamp[p.id] ? false : guest || staff || intl ? true : isFam ? true : isT ? (k.indexOf('me_') === 0 ? true : !!tPaid[k]) : !!sPaid[k];
    const pr = p.status === '취소' ? (p.rnd != null ? +p.rnd : ri) : rOf(p); p.rnd = pr; p.rndN = RD[pr].n;
    p.type = i.type; p.fee = FEES[i.type][pr];
    if (intl) { p.usd = +FEES[i.type][pr] || 0; p.fee = Math.round(p.usd * (+OPT.usdRate || 1450)); }   /* 해외: 참가비표 값 = USD, 원화 청구액 = USD × 환율 */ p.lesson = les * OPT.lessonFee + mc;
    p.dues = paid ? 0 : (isT ? OPT.teacherDues : OPT.studentDues);
    p.room = roomBy[k] !== undefined ? Math.max(0, roomBy[k] - (+(((f.roomCredit || {})[k]) || {}).amt || 0)) : ((f.room || {})[k] ? 0 : (+((f.roomPen || {})[k]) || 0));   /* 넘겨받은 가족방 금액만큼 덜 냄 (11-11) */   /* 가족방만 취소한 대표: 남은 취소 수수료 (11-11) */
    const aj = ADJ[p.id]; if (aj) { if (aj.fee !== '') p.fee = +aj.fee; if (aj.room !== '') p.room = +aj.room; p.adj = aj.memo || '운영진 조정'; } else delete p.adj;   /* 운영진 청구 조정 (11-01) */
  });
  return sb;
}
/** 하루 한 번(5분 트리거 안에서 날짜가 바뀐 첫 번째): 모든 접수 금액을 다시 셈 → 입금 안 한 사람은 차수 마감이 지나면 다음 차수 금액 (11-04) */
let RC_MEMO = null;
function repriceTick_(force) {
  const P = PropertiesService.getScriptProperties(), d = today_(); if (!force && P.getProperty('repriceDay') === d) return { skip: true };
  const lock = lock_(); let n = 0, more = false;
  try { RC_MEMO = { adj: adjMap_(), t: teachers_(), s: rows_(SH.S), via: duesViaCamp_(), am: adminMap_() };
    loadSubs_().forEach(sb => { if (more || !sb.form || !sb.ppl.some(p => p.status !== '취소')) return; const sig = () => JSON.stringify(sb.ppl.map(p => [p.fee, p.lesson, p.dues, p.room, p.rnd])), before = sig();
      try { recalc_(sb); } catch (e) { return; } if (sig() !== before) { if (n >= 40) { more = true; return; } writeSub_(sb); n++; } });   /* 한 번에 40건까지 · 남으면 다음 5분 트리거에서 이어서 */
    if (!more) P.setProperty('repriceDay', d); if (n) log_('자동', '차수 금액 다시 셈', n + '건' + (more ? ' (이어서 함)' : '')); } finally { RC_MEMO = null; lock.releaseLock(); }
  return { n, more };
}
/* ---------- 운영진 청구 조정 (11-01): 사람마다 참가비 · 가족방비를 직접 정함 (관계자 가족 무료 등 그때그때) ---------- */
const ADJ_SH = '청구조정', ADJ_HEAD = ['참가자ID', '참가비', '가족방비', '메모', '수정일', '수정자'];
function adjMap_() { const m = {}; rows_(ADJ_SH).forEach(r => { const id = String(r['참가자ID'] || ''); if (id) m[id] = { fee: String(r['참가비'] === '' || r['참가비'] == null ? '' : r['참가비']), room: String(r['가족방비'] === '' || r['가족방비'] == null ? '' : r['가족방비']), memo: String(r['메모'] || '') }; }); return m; }
function adminAdjust(token, pid, fee, room, memo) {
  const a = adm_(token); need_(a, ['subs']); pid = String(pid || '');
  const num = v => v === '' || v == null ? '' : Math.max(0, +String(v).replace(/[^\d]/g, '') || 0);
  const lock = lock_();
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(ADJ_SH);
    if (!sh) { sh = ss.insertSheet(ADJ_SH); sh.getRange(1, 1, 1, ADJ_HEAD.length).setValues([ADJ_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
    const row = [pid, num(fee), num(room), String(memo || '').slice(0, 100), stamp_(), a.name], clear = row[1] === '' && row[2] === '';
    const r = rows_(ADJ_SH).find(x => String(x['참가자ID']) === pid);
    if (r) { if (clear) sh.deleteRow(r._row); else sh.getRange(r._row, 1, 1, ADJ_HEAD.length).setValues([row]); } else if (!clear) sh.appendRow(row);
    const sb = loadSubs_().find(x => x.ppl.some(p => p.id === pid)); if (!sb) throw new Error('참가자를 찾지 못했어요.');
    recalc_(sb); writeSub_(sb);
    log_('관리자 ' + a.name, '청구 조정', pid + (clear ? ' · 원래대로' : ' · 참가비 ' + row[1] + ' · 가족방 ' + row[2] + (row[3] ? ' · ' + row[3] : '')));
  } finally { lock.releaseLock(); }
  return adminData(token);
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
  const u = who_(token); regGate_();
  if (!u.acads.includes(sb.acad)) throw new Error('이 학원으로 접수할 수 없어요.');
  /* 속도 (11-13 몰림 시험: 10명 동시에 4명이 BUSY): 잠그기 전에 읽고 검사 · 잠근 동안은 번호만 받고 바로 붙여 씀 · 메일은 잠금 밖 */
  const C = CacheService.getScriptCache();
  if (sb.reqId) { const d = C.get('req_' + sb.reqId); if (d) return Object.assign({ ok: true, no: d, again: true }, bundle_(u.acads, u.name)); }
  const all = loadSubs_();
  if (sb.reqId) { const done = all.find(x => x.reqId === sb.reqId); if (done) return Object.assign({ ok: true, no: done.no, again: true }, bundle_(u.acads, u.name)); }
  stuDup_(all, sb, null);
  const tmp = sb.no;
  sb.owner = u.name;
  if (u.guest) sb.contact = String(u.phone || '').replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');   // 비회원 보호자 연락처 (관리자 화면 · 시트에만)
  sb.rev = 1;
  RC_MEMO = { adj: adjMap_(), t: teachers_(), s: rows_(SH.S), via: duesViaCamp_(), am: adminMap_() };   /* 금액 계산에 쓰는 시트도 잠그기 전에 읽어 둠 */
  const lock = lock_();
  try {
    if (sb.reqId && C.get('req_' + sb.reqId)) { lock.releaseLock(); const d = C.get('req_' + sb.reqId); return Object.assign({ ok: true, no: d, again: true }, bundle_(u.acads, u.name)); }
    const no = subNoNext_();
    sb.no = no; sb.createdAt = stamp_();
    sb.ppl.forEach(p => { p.id = no + p.id.slice(tmp.length); p.pay = '전'; p.paidAmt = 0; delete p.rep; });
    recalc_(sb); checkEns_(sb, all);
    teacherDup_(all, sb);
    writeSub_(sb, 'append');
    if (sb.reqId) C.put('req_' + sb.reqId, no, 21600);
    if (sb.form && sb.form.ens && (sb.form.ens.on || sb.form.ens.member)) { all.push(sb); writeTeams_(all); }
  } finally { RC_MEMO = null; lock.releaseLock(); }
  log_(u.name, '새 접수', sb.no + ' · ' + sb.ppl.length + '명');
  try { mail_(sb, u); } catch (e) { Logger.log('메일: ' + e.message); }
  try { if (sb.form && Array.isArray(sb.form.preq) && sb.form.preq.length) parentNotifySubs_([sb.no]); } catch (e) {}
  return Object.assign({ ok: true, no: sb.no }, bundle_(u.acads, u.name));
}
/** 다음 접수번호: 접수 시트 「접수번호」 칸만 읽음 (잠근 안에서 부름) */
function subNoNext_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.SUB), lr = sh.getLastRow();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), c = head.indexOf('접수번호') + 1;
  const v = lr > 1 && c > 0 ? sh.getRange(2, c, lr - 1, 1).getValues() : [];
  const n = v.reduce((m, r) => Math.max(m, +String(r[0]).split('-')[1] || 0), 0) + 1;
  return camp_().base.id + '-' + String(n).padStart(3, '0');
}

/** 가족방만 취소 (11-11): 참가는 그대로인 대표의 가족방을 빼면, 입금된 경우 오늘 환불 규정(진단서 미제출)만큼 돌려주고 나머지는 취소 수수료로 남김.
 *  form.roomPen[대표] = 남는 금액 · 화면이 보낸 값은 믿지 않고 서버가 지난 값 + 이번에 뺀 방으로 다시 계산 */
function roomPen_(cur, sb) {
  const nf = sb.form = sb.form || {}, of = cur.form || {}, op = of.roomPen || {}, pen = {}, nr = nf.room || {};
  const R = camp_().refund || {}, td = today_(), rule = (R.rules || []).find(r => td <= r.until) || R.after || {}, rate = Math.max(0, Math.min(100, +rule.rate || 0));
  Object.keys(op).forEach(k => { if (!nr[k]) pen[k] = +op[k] || 0; });
  Object.keys(of.room || {}).forEach(k => {
    if (!of.room[k] || nr[k]) return;
    const id = cur.no + '_' + k, c = cur.ppl.find(p => p.id === id), n = sb.ppl.find(p => p.id === id);
    if (!c || !n || n.status !== '정상' || !(+c.paidAmt > 0) || !(+c.room > 0)) return;
    pen[k] = (+c.room) - Math.floor((+c.room) * rate / 100 / 100) * 100;
  });
  Object.keys(pen).forEach(k => { if (!(pen[k] > 0)) delete pen[k]; });
  if (Object.keys(pen).length) nf.roomPen = pen; else delete nf.roomPen;
}

/** 가족방 대표가 빠지고 새 대표(교사 · 학생)가 이어 쓸 때 (11-11): 빠지는 대표가 이미 낸 가족방 금액은 새 대표에게 넘어가고,
 *  새 대표는 추가분만 냄. form.roomCredit[새 대표] = { from: 빠진 대표, amt } · 화면 값은 믿지 않고 지난 값 + 이번 넘김으로 다시 계산 */
function roomCredit_(cur, sb) {
  const nf = sb.form = sb.form || {}, of = cur.form || {}, oc = of.roomCredit || {}, cr = {}, nr = nf.room || {}, orr = of.room || {}, nj = nf.join || {};
  Object.keys(oc).forEach(k => { if (nr[k]) cr[k] = oc[k]; });
  Object.keys(orr).forEach(o => {
    if (!orr[o] || nr[o]) return; const n = nj[o]; if (!n || !nr[n] || orr[n]) return;
    const c = cur.ppl.find(p => p.id === cur.no + '_' + o), s = sb.ppl.find(p => p.id === cur.no + '_' + o);
    if (!c || !s || s.status === '정상' || !(+c.paidAmt > 0)) return;
    const amt = (+c.room || 0) + (+((oc[o] || {}).amt) || 0); if (amt > 0) cr[n] = { from: o, amt };
  });
  if (Object.keys(cr).length) nf.roomCredit = cr; else delete nf.roomCredit;
}

/** 내 접수 저장 (인원 추가·정보 수정·입금 신고·신고 수정·취소) — 내가 낸 접수만 */
function saveSubs(token, subs) {
  const u = who_(token);
  const lock = lock_();
  try {
    const all = loadSubs_();
    // 다른 화면(원장님 PC·폰 등)에서 그 사이 먼저 고쳤으면 덮어쓰지 않고 새로 불러오게 함
    const stale = (subs || []).filter(sb => { const cur = all.find(x => x.no === sb.no); return cur && (+cur.rev || 0) !== (+sb.rev || 0); });
    if (stale.length) { lock.releaseLock(); return Object.assign({ ok: false, conflict: true, msg: stale.map(x => x.no).join(', ') + ' 접수를 다른 화면에서 먼저 고쳤어요. 최신 내용으로 다시 불러왔으니 한 번 더 해 주세요.' }, bundle_(u.acads, u.name)); }
    (subs || []).forEach(sb => {
      const cur = all.find(x => x.no === sb.no);
      if (!cur) throw new Error(sb.no + ' 접수를 찾지 못했어요.');
      if (!canEdit_(u, cur)) throw new Error(sb.no + '는 ' + cur.owner + ' 선생님이 낸 접수라 고칠 수 없어요.');
      sb.acad = cur.acad; sb.owner = cur.owner; if (cur.contact) sb.contact = cur.contact; else delete sb.contact; sb.createdAt = cur.createdAt; sb.no = cur.no; sb.reqId = cur.reqId; sb.rev = (+cur.rev || 0) + 1;
      roomPen_(cur, sb); roomCredit_(cur, sb);
      recalc_(sb);
      teacherDup_(all, sb, sb.ppl.filter(p => !cur.ppl.some(c => c.id === p.id)).map(p => p.id));
      stuDup_(all, sb, sb.ppl.filter(p => !cur.ppl.some(c => c.id === p.id)).map(p => p.id));
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
  try { parentNotifySubs_((subs || []).filter(x => x.form && Array.isArray(x.form.preq) && x.form.preq.length).map(x => x.no)); } catch (e) {}
  return Object.assign({ ok: true }, bundle_(u.acads, u.name));
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
    if (!canEdit_(u, sb) || !u.acads.includes(sb.acad)) throw new Error('이 접수의 환불을 요청할 수 없어요.');
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
  return Object.assign({ ok: true }, bundle_(u.acads, u.name));
}

/** 환불 요청: 계좌·진단서는 「환불요청」 시트와 드라이브 폴더에만 (접수 내용 JSON에는 넣지 않음) */
function cancelReq(token, req) {
  const u = who_(token);
  const lock = lock_();
  try {
  const sb = loadSubs_().find(x => x.no === req.no);
  if (!canEdit_(u, sb) || !u.acads.includes(sb.acad)) throw new Error('이 접수의 환불을 요청할 수 없어요.');
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
    const it = DriveApp.getFoldersByName('캠프 진단서 ' + camp_().base.id);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder('캠프 진단서 ' + camp_().base.id);
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
/** 화면 열 때는 6시간에 한 번만 설정 줄을 확인 (속도 11-13 · 매번 하면 1.4초) */
function ensureSettingsLazy_() { const C = CacheService.getScriptCache(); if (C.get('setEns')) return; ensureSettings_(); C.put('setEns', '1', 21600); }
function ensureSettings_() { setMemoClear_();
  const sh = setupAdmin_();
  sh.getRange('B:B').setNumberFormat('@');   // 값 칸은 글자 그대로 (날짜·계좌번호가 바뀌지 않게)
  const have = rows_('설정').map(r => String(r['항목']));
  SETTINGS.forEach(r => { if (!have.includes(r[0])) sh.appendRow(r); });
}
/** 입금 안내 계좌: 설정 「입금 은행 · 입금 계좌번호 · 예금주」가 있으면 그것, 비어 있으면 회원관리 › 통장 › 설정에 등록한 통장
 *  (이 캠프 행사에 이은 통장 → 없으면 「사용」 중인 첫 통장). 10분 저장 (11-01) */
function bankInfo_() {
  let bank = setting_('입금 은행'), acct = setting_('입금 계좌번호'), holder = setting_('예금주');
  if (!acct) {
    const C = CacheService.getScriptCache(); let j = C.get('bankAcct');
    if (!j) {
      let o = {};
      try {
        const ss = bankBook_(), A = ss && bankTab_(ss, '통장목록'), P = ss && bankTab_(ss, '프로젝트');
        if (A) {
          const id = camp_().base.id; let want = '';
          if (P && P.c('캠프ID') >= 0) { const r = P.v.find(x => x[P.c('캠프ID')] === id); if (r) want = String(r[P.c('통장ID')] || '').split(',')[0].trim(); }
          const rows = A.v.filter(x => x[A.c('사용')] !== '안씀' && x[A.c('계좌번호')]), r = rows.find(x => x[A.c('통장ID')] === want) || rows[0];
          if (r) o = { bank: r[A.c('은행')], acct: r[A.c('계좌번호')], holder: r[A.c('예금주')] };
        }
      } catch (e) { }
      j = JSON.stringify(o); C.put('bankAcct', j, 600);
    }
    const o = JSON.parse(j); bank = bank || o.bank || ''; acct = o.acct || ''; holder = holder || o.holder || '';
  }
  return { bank, acct, holder, from: setting_('입금 시작일') || '2026-10-01' };
}
/* 설정 한 줄 읽기 — 한 번의 요청 안에서는 시트를 한 번만 읽음 (캠프 페이지가 느리던 것, 11-03). 설정을 쓰기 전 ensureSettings_ 가 지움 */
let SET_MEMO = null;
/* 속도 (11-13): 설정 탭 값을 30초 기억 (화면 열 때 시트를 안 열게). 설정을 바꾸는 곳은 ensureSettings_ 를 먼저 부르므로 거기서 지움 */
function setMemoClear_() { SET_MEMO = null; try { CacheService.getScriptCache().remove('setMemoJ'); } catch (e) {} }
function setting_(k) {
  if (!SET_MEMO) {
    try { const j = CacheService.getScriptCache().get('setMemoJ'); if (j) SET_MEMO = JSON.parse(j); } catch (e) {}
    if (!SET_MEMO) { SET_MEMO = {}; rows_('설정').forEach(x => { const n = String(x['항목']); if (!(n in SET_MEMO)) SET_MEMO[n] = dstr_(x['값']).trim(); });
      try { const j = JSON.stringify(SET_MEMO); if (j.length < 95000) CacheService.getScriptCache().put('setMemoJ', j, 30); } catch (e) {} }
  }
  return SET_MEMO[k] || '';
}
function ensureHead_(name, head) {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), head.length).setNumberFormat('@'); return; }   /* 없는 탭은 머리글과 함께 만듦 (11-04: 「음원」) */
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
/** 관리자 로그인 확인 → { name, sup(총관리자), perms } · 담당자 권한은 매번 「담당자」 시트에서 다시 읽음 (권한을 거두면 바로 막힘) */
function adm_(token) {
  const v = CacheService.getScriptCache().get('adm_' + token);
  if (!v) throw new Error('관리자 로그인이 끝났어요. 새로 고쳐 다시 로그인해 주세요.');
  const a = JSON.parse(v);
  if (!a.staff) { a.sup = true; a.perms = {}; ADMIN_TABS.forEach(t => a.perms[t[0]] = '편집'); return a; }
  const s = staff_().find(x => x.tid === a.tid && x.on);
  if (!s) throw new Error('담당자 권한이 없어졌어요. 총관리자에게 문의해 주세요.');
  a.sup = false; a.perms = s.perms; return a;
}
/* ---------------- 캠프 설정 (「캠프설정」 시트 · 총관리자만 바꿈) ----------------
 * 시트 한 줄 = 한 묶음(기본 · 차수 · 참가비 · 옵션 · 환불), 값은 JSON. 시트가 없으면 아래 기본값을 씀 */
const CAMPCFG = '캠프설정';
const FEE_TYPES = ['교사', '연수생', '소속없는 중급연수생', '학생', '회원의 악기하는 자녀', '회원의 첫번째 보호자', '회원의 그외 악기 안하는 동반가족', '동반가족 중 15개월 미만', '비회원 학생', '비회원 보호자', '비회원 동반가족', '비회원 15개월 미만',
  '초빙교수', '반주자', '지휘자', '통역', '초청강사', '스태프', '기타 관계자',
  '해외 학생', '해외 교사', '해외 보호자', '해외 동반가족', '해외 15개월 미만'];
const CAMP_DEF = {
  base: { id: CAMP_ID, name: CAMP_NAME, start: '2027-01-11', end: '2027-01-15', place: '추후 안내', open: '2026-12-01', close: '2026-12-28', cur: 'auto', guest: true, staff: true, member: true, intl: true },
  rounds: [{ n: '1차', from: '2026-12-01', to: '2026-12-10' }, { n: '2차', from: '2026-12-11', to: '2026-12-20' }, { n: '3차', from: '2026-12-21', to: '2026-12-28' }],
  fees: FEES,
  opt: { lessonFee: OPT.lessonFee, lessonMax: OPT.lessonMax, mcFee: 150000, studentDues: OPT.studentDues, teacherDues: OPT.teacherDues, roomCap: OPT.roomCap, roomEmptyFee: OPT.roomEmptyFee, usdRate: 1450 },
  /* 환불: rate = 진단서 미제출 환불 %, drate = 전염병 · 팔·손 골절 진단서 제출 시 환불 % (null = rate 와 같음) · 11-11 규정 */
  refund: { rules: [{ until: '2026-12-31', label: '수수료 없음', rate: 100, drate: null, doc: false }, { until: '2027-01-04', label: '수수료 10%', rate: 90, drate: 100, doc: false }, { until: '2027-01-08', label: '수수료 20%', rate: 80, drate: 90, doc: false }],
    after: { label: '환불 불가', rate: 0, drate: 50, doc: false, allow: true }, duesRefund: false },
  /* 식사 시간: 교사 일정 모든 날짜에 식사 줄로 들어감 · first/last = 첫날 · 마지막 날에도 넣을지 */
  meals: [{ k: '아침', t: 'Breakfast 아침 식사', s: '07:20', e: '08:50', on: true, first: false, last: true },
    { k: '점심', t: 'Lunch 점심 식사', s: '11:30', e: '13:20', on: true, first: false, last: true },
    { k: '저녁', t: 'Dinner 저녁 식사', s: '17:30', e: '19:20', on: true, first: true, last: false }],
  /* 음원 제출 (11-04): 음악회마다 받을지 · 마감일(비우면 캠프 시작 전날까지). 결과 공개는 설정 「음원 결과 공개」 (심사 화면에서) */
  cons: ['오후', '트와일라잇', '이브닝'],   /* 음악회 이름 목록 (11-12): 캠프 관리자 설정에서 추가 · 빼기 */
  aud: { '오후': { on: false, due: '' }, '트와일라잇': { on: true, due: '' }, '이브닝': { on: true, due: '' } },
  /* 공문 (11-04): 캠프 안내 공문 = 캠프의 시작. 글 속 {기간}·{장소}·[[참가비표]] 같은 표시는 위 캠프 설정 값으로 채워져서, 공문과 접수 화면 금액·날짜가 어긋나지 않음 */
  doc: { no: '', date: '', to: '', ref: '', title: '{캠프이름} 안내', num: '1.', t1: '14시', t2: '12시', sign: true, mg: { t: 13, b: 15, l: 16, r: 16 }, rnote: ['(*입금 확인 후 신청 등록 완료)', '', ''],
    intro: '(사)한국스즈키음악협회 {캠프이름}가 다음과 같이 열리오니 많은 참여 바랍니다.',
    sec: [
      { id: 'when', t: '기간', on: true, body: '{기간}' },
      { id: 'place', t: '장소', on: true, body: '{장소}' },
      { id: 'prof', t: '초청교수', on: true, body: '황경익 회장 외 다수 국내외 유명 교수진' },
      { id: 'class', t: '수업내용', on: true, body: '그룹레슨, 오케스트라, 각종 음악회, 교사연수, 교수레슨 30분 1회 (추가 가능)\n*추가 레슨 신청은 30분당 {추가레슨} (교수님에 따라 다를 수 있음)' },
      { id: 'fee', t: '참가비', on: true, body: '참가비에는 기본 숙박, 식사, 수업료, 음악회 참가비가 포함되어 있습니다. (이브닝 연주비 · 각종 추가 비용 제외)\n스즈키 회비를 낸 회원만 스즈키 회원가로 캠프에 참여하실 수 있습니다.\n*회원의 가족 혹은 지인인 비회원: 등록금액 +{비회원추가}, 그 밖에 외부인은 참가 불가합니다.\n[[참가비표]]' },
      { id: 'room', t: '가족방', on: true, body: '**숙소는 5~6인 1실 사용을 전제로 합니다.**\n가족일 경우 4인 1실로 가족방을 구성하고, 가족이 아닐 경우 5인 1실로 구성합니다.\n가족방으로 신청한 사람만 가족방으로 배정되며 4인입니다.\n가족방은 최대 {가족방정원}인까지 함께 사용할 수 있으며 {가족방요금} 추가 비용이 발생합니다. (전 일정 기준)\n*캠프비를 내지 않은 가족은 수업이나 음악회에 참여하실 수 없습니다.\n*비숙박 당일 방문자 · 보호자는 본부에서 식권(1인 12,000원) · 음악회 입장권(1인 20,000원)을 구입한 뒤 입장해 주세요. (1인당 2장 이상의 연속된 식사 식권 구입은 불가합니다)\n*한 클래스 신청자에 성별이 섞여 같은 방을 쓰기 어려우면, 미리 다른 학원과 인원을 모아 같은 성별끼리 신청하시거나 본부에서 남학생은 남학생 방으로 배정할 수 있습니다. (보통 1객실 2방)' },
      { id: 'apply', t: '신청서 작성 및 제출', on: true, body: '신청 링크로만 신청서를 제출할 수 있습니다. {접수시작}에 협회 단톡방 · 홈페이지에 게시합니다.\n신청 주소: {신청주소}\n\n**[입금계좌 안내]**\n음악제 참가비 · 스즈키 회비 입금: {계좌}' },
      { id: 'concert', t: '음악회 신청', on: true, body: '**a. 이브닝 콘서트**\n오디션 음원은 !!12월 1일 도착분!!까지 심사됩니다. 이브닝 콘서트는 오케스트라 협연으로 구성됩니다.\n(*오케스트라 협연에 합격하면 1/n로 나누어 추가 비용이 발생하니 참고하시어 신청 바랍니다. 대략 50만원 내외)\n음원 제출 날짜를 지키지 않은 신청자는 심사 대상에서 제외됩니다.\n해당 인원이 많을 경우, 1년 이내 협연한 이력이 있으면 우선순위에서 밀릴 수 있습니다.\n- 접수 방법: 캠프 신청서에 이브닝을 신청하고 유튜브 링크를 함께 제출\n!!*졸업연주에 교사와 학생이 참가하지 않았을 경우, 주요 연주에는 선발되지 않습니다.!!\n\n**b. 오후음악회, 앙상블**\n*오후음악회 곡명을 신청서에 쓰지 않으시면 참가 의사가 없는 것으로 간주합니다.\n10권 이하는 오후음악회 리스트에 있는 스즈키 곡만 연주할 수 있습니다. 1~4권은 리허설 없이 연주가 진행될 수 있으므로 느리지 않게 CD 템포에 맞춰 오세요. 스즈키 책 외 반주 악보는 본인이 가져옵니다.\n*앙상블\n1. 신청팀은 곡명을 원어로 정확히 써 주세요.\n2. 단일팀인지 연합팀인지 확실하게 쓰시고, 연합일 경우 함께하는 교실 명단을 적어 주세요.\n3. 8명 이하 단일팀은 앙상블 콘서트에 나갈 수 없고 오후음악회로 배정됩니다.\n4. 앙상블 콘서트는 대중음악만 연주하는 것을 지양해 주세요. 클래식을 하나라도 포함하는 것을 추천합니다. !!앰프 반주는 사용할 수 없습니다.!!' },
      { id: 'refund', t: '취소 및 환불 규정', on: true, body: '{환불규정}\n(*원활한 진행을 위하여 증액 · 환불 규정이 엄격하게 적용되오니 협조 부탁드립니다)\n- 단순 질병 취소일 경우 취소 수수료는 같습니다.\n- Covid-19 등 전염병, 팔/손 골절일 경우 수수료를 줄여 드립니다. (단, 진단서 제출 필수)' },
      { id: 'ask', t: '문의', on: true, body: '카카오톡 또는 메일로 문의 바랍니다.\n(카카오톡: suzukimusickorea / suzukimusickorea1995@gmail.com)' }
    ] },
  consent: { ver: '2026-10-24', items: [
    { id: 'collect', title: '개인정보 수집·이용 동의', req: true, on: true, body: '수집 항목\n- 접수하는 분: 이름, 휴대전화, 이메일\n- 참가자: 이름, 성별, 출생연도, 악기·현재 진도, 담당 선생님, 레슨·음악회·가족방 신청 내용\n- 입금·환불: 입금자명, 입금일, 금액, 환불 받을 계좌(은행·계좌번호·예금주)\n\n이용 목적\n캠프 접수 확인, 반·레슨·숙소 배정, 일정 안내와 연락, 참가비 입금 확인과 환불\n\n보유 기간\n캠프가 끝나고 1년 동안 보관한 뒤 지워요. 회계 기록은 관련 법령이 정한 기간만큼 보관해요.\n\n동의하지 않을 수 있지만, 동의하지 않으면 캠프 접수를 할 수 없어요.' },
    { id: 'third', title: '개인정보 제3자 제공 동의', req: true, on: true, body: '제공받는 곳: 캠프 숙소(리조트)\n제공 항목: 참가자 이름, 성별, 학원(소속)\n제공 목적: 객실 배정과 투숙 관리\n보유 기간: 캠프가 끝나면 숙소의 방침에 따라 지워요.\n\n동의하지 않을 수 있지만, 동의하지 않으면 숙소 배정이 필요한 캠프 접수를 할 수 없어요.' },
    { id: 'minor', title: '만 14세 미만 참가자 보호자 동의', req: true, on: true, body: '만 14세 미만 참가자의 개인정보는 법정대리인(보호자)의 동의를 받아야 해요.\n- 선생님이 접수할 때: 접수하는 만 14세 미만 학생의 보호자에게 위 수집·이용, 제3자 제공 내용을 알리고 동의를 받았어요.\n- 보호자가 직접 접수할 때: 나는 접수하는 만 14세 미만 참가자의 법정대리인(보호자)이며 위 내용에 동의해요.' },
    { id: 'refund', title: '취소·환불 규정 확인', req: true, on: true, body: '' },
    { id: 'photo', title: '사진·영상 촬영과 홍보 활용 동의 (선택)', req: false, on: false, body: '캠프 중 찍은 사진·영상(참가자 모습 포함)을 협회 홈페이지, SNS, 소식지 같은 홍보에 쓸 수 있어요.\n보유 기간: 게시물을 내려 달라고 요청할 때까지\n\n동의하지 않아도 접수할 수 있어요. 동의하지 않으면 홍보물에 쓰지 않아요.' }
  ] },
};
const CAMP_KEYS = [['base', '기본'], ['rounds', '차수'], ['fees', '참가비'], ['opt', '옵션'], ['refund', '환불'], ['consent', '동의'], ['meals', '식사'], ['doc', '공문'], ['aud', '음원'], ['cons', '음악회']];
const CON_DEF = ['오후', '트와일라잇', '이브닝'];
function consClean_(a) { const o = []; (Array.isArray(a) ? a : []).forEach(x => { const n = String(x == null ? '' : x).replace(/[|,]/g, ' ').trim().slice(0, 12); if (n && n !== '없음' && o.indexOf(n) < 0 && o.length < 8) o.push(n); }); return o.length ? o : CON_DEF.slice(); }
let CAMP_CACHE = null;
/* 참가 구분 이름 바뀜 (11-11): 「돌전아기」 → 「15개월 미만」 · 예전에 저장된 접수 · 캠프설정도 읽을 때 새 이름으로 */
function retype_(s) { return String(s).replace(/돌전아기/g, '15개월 미만'); }
/* 속도 (11-13): 캠프설정 시트를 2분 동안 기억 (화면 열 때마다 시트를 읽지 않게). 저장할 때 지움 · 저장 전 번호 확인은 늘 시트에서 */
let CAMP_NOCC = false;
function campCacheClear_() { try { CacheService.getScriptCache().remove('campCfgJ'); } catch (e) {} }
function camp_() {
  if (CAMP_CACHE) return CAMP_CACHE;
  if (!CAMP_NOCC) { try { const j = CacheService.getScriptCache().get('campCfgJ'); if (j) return (CAMP_CACHE = JSON.parse(j)); } catch (e) {} }
  const c = JSON.parse(JSON.stringify(CAMP_DEF)); c.rev = 0;
  rows_(CAMPCFG).forEach(r => {
    const k = (CAMP_KEYS.find(x => x[1] === String(r['항목'])) || [])[0], v = String(r['값'] || '');
    if (String(r['항목']) === 'rev') { c.rev = +v || 0; return; }
    if (!k || !v) return;
    try { const o = JSON.parse(retype_(v)); c[k] = Array.isArray(o) ? o : Object.assign(c[k], o); } catch (x) {}
  });
  /* 참가비표 칸 수 = 차수 수 (새로 생긴 참가자격·차수는 마지막 금액으로 채움) */
  c.cons = consClean_(c.cons);
  FEE_TYPES.forEach(t => { const a = (c.fees[t] || []).slice(0, c.rounds.length); while (a.length < c.rounds.length) a.push(a.length ? a[a.length - 1] : 0); c.fees[t] = a; });
  try { const j = JSON.stringify(c); if (j.length < 95000) CacheService.getScriptCache().put('campCfgJ', j, 120); } catch (e) {}
  return (CAMP_CACHE = c);
}
/** 지금 차수: 「현재 차수」를 정해 두면 그것, 자동이면 오늘 날짜가 든 차수 (마감 뒤면 마지막 차수) */
function curRound_(c) {
  c = c || camp_(); const n = c.rounds.length;
  if (c.base.cur !== 'auto' && c.base.cur !== '' && !isNaN(+c.base.cur)) return Math.max(0, Math.min(n - 1, +c.base.cur));
  const d = today_(), i = c.rounds.findIndex(r => d <= r.to);
  return i < 0 ? n - 1 : i;
}
/** 선생님 화면에 보내는 설정 (+ 지금 차수) */
/** 접수 시작 전이면 시작일(yyyy-mm-dd), 아니면 ''. 시작일 = 캠프 설정 「접수 시작」, 없으면 1차 시작일. STG(설정 「테스트 로그인」 있음)는 언제나 열림 */
function regPre_(c) { c = c || camp_(); try { if (String(setting_('테스트 로그인') || '').trim()) return ''; } catch (e) { } const o = String(c.base.open || (c.rounds[0] || {}).from || ''); return /^\d{4}-\d{2}-\d{2}$/.test(o) && today_() < o ? o : ''; }
function regGate_() { const o = regPre_(); if (o) throw new Error('접수는 ' + (+o.slice(5, 7)) + '월 ' + (+o.slice(8, 10)) + '일부터 받아요. 그때 다시 와 주세요.'); }
function campPublic_() { const c = camp_(); return Object.assign({}, c, { ri: curRound_(c), pre: regPre_(c) }); }
function campGet(token) { const a = adm_(token); needSup_(a); return { camp: campPublic_(), subs: rows_(SH.SUB).filter(r => r['접수번호']).length }; }
/** 공문 값 정리 (캠프 설정 저장 때) — 글자 수를 자르고, 한 칸(5만 자) 안에 들어가는지 확인 */
function docClean_(d, nr) {
  d = d || {}; const t = (v, n) => String(v == null ? '' : v).replace(/\r/g, '').slice(0, n), D = CAMP_DEF.doc;
  const sec = (Array.isArray(d.sec) ? d.sec : D.sec).slice(0, 30).map((x, i) => ({ id: t(x.id, 20).replace(/[^\w-]/g, '') || ('x' + i), t: t(x.t, 40).trim(), on: x.on !== false, body: t(x.body, 8000) }));
  const o = { no: t(d.no, 40).trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : '', to: t(d.to, 120).trim(), ref: t(d.ref, 120).trim(), title: t(d.title, 120).trim(), num: d.num === '1)' ? '1)' : '1.',
    t1: t(d.t1, 20).trim(), t2: t(d.t2, 20).trim(), sign: d.sign !== false, sdom: d.sdom !== false, wtop: d.wtop === true, inc: Array.from({ length: nr }, (_, i) => { const v = (d.inc || [])[i]; return i && v != null && v !== '' && isFinite(+v) ? Math.round(+v) : null; }), mg: (() => { const m = d.mg || {}, o = {}; [['t', 13], ['b', 15], ['l', 16], ['r', 16]].forEach(([k, v]) => { const x = +m[k]; o[k] = m[k] !== '' && m[k] != null && isFinite(x) ? Math.max(0, Math.min(40, Math.round(x * 10) / 10)) : v; }); return o; })(), intro: t(d.intro, 3000), rnote: Array.from({ length: nr }, (_, i) => t((d.rnote || [])[i], 80)), sec };
  /* 참가비표 자동 채우기 규칙 (11-11): 기준 자격 · 줄마다 기준보다 + · 차수마다 1차보다 + (금액 또는 n%) */
  const fa = v => { const s = String(v == null ? '' : v).replace(/[,\s원+]/g, ''); return /^-?\d+(\.\d+)?%?$/.test(s) ? s.slice(0, 12) : ''; };
  if (d.ed) o.ed = t(d.ed, 30000).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
  /* 제목 글씨 pt · 로고 너비 mm (11-12 공통 공문 규칙): 왼쪽에서 − + */
  /* 항목 제목 글씨 · 본문 글씨 pt (11-13) */
  const pt_ = (v, lo, hi) => v !== '' && v != null && isFinite(+v) && +v >= lo && +v <= hi ? Math.round(+v * 2) / 2 : 12.5; o.hs = pt_(d.hs, 10, 20); o.bs = pt_(d.bs, 10, 16);
  o.ts = isFinite(+d.ts) && +d.ts >= 12 && +d.ts <= 40 ? Math.round(+d.ts) : 22; o.lw = isFinite(+d.lw) && +d.lw >= 20 && +d.lw <= 140 ? Math.round(+d.lw) : 60;
  o.fit = [0, 1, 2].indexOf(+d.fit) >= 0 ? +d.fit : 0; o.fitK = isFinite(+d.fitK) && +d.fitK >= 0.3 && +d.fitK <= 1 ? Math.round(+d.fitK * 1000) / 1000 : 1;
  o.rbase = FEE_TYPES.indexOf(d.rbase) >= 0 ? d.rbase : '학생';
  o.radd = {}; Object.keys(d.radd || {}).forEach(k => { if (FEE_TYPES.indexOf(k) >= 0 && k !== o.rbase && fa(d.radd[k])) o.radd[k] = fa(d.radd[k]); });
  o.cadd = Array.from({ length: nr }, (_, i) => i ? fa((d.cadd || [])[i]) : '');
  if (JSON.stringify(o).length > 45000) throw new Error('공문 글이 너무 길어요. 항목 글을 조금 줄여 주세요.');
  return o;
}
function campDocLink_(b, doc, who) {
  const mid = memberSheetId_(); if (!mid) return '';
  const sh = SpreadsheetApp.openById(mid).getSheetByName('공문'); if (!sh) return '';
  const all = sh.getDataRange().getDisplayValues(), h = (all.shift() || []).map(String), ci = k => h.indexOf(k);
  if (ci('공문ID') < 0) return '';
  const title = String(doc.title || '{캠프이름} 안내').replace(/\{캠프이름\}/g, b.name || '').replace(/\{년도\}/g, String(b.start || '').slice(0, 4)).slice(0, 120) || (b.name + ' 안내');
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  const upd = { '구분': '캠프', '행사': b.name || '', '제목': title, '시행일': doc.date || '', '수신': doc.to || '', '참조': doc.ref || '' };
  if (doc.gm) { const r = all.findIndex(x => x[ci('공문ID')] === doc.gm); if (r >= 0) {
    if (all[r][ci('상태')] !== '발행') Object.keys(upd).forEach(k => { if (ci(k) >= 0 && k !== '구분') sh.getRange(r + 2, ci(k) + 1).setNumberFormat('@').setValue(upd[k]); });
    return doc.gm; } }
  /* 연결이 비어 있어도 같은 캠프의 작성 중 줄이 있으면 그 줄을 씀 (겹쳐 생기지 않게) */
  const same = all.findIndex(x => x[ci('구분')] === '캠프' && x[ci('상태')] !== '발행' && (() => { try { return JSON.parse(x[ci('내용')] || '{}').camp === b.id; } catch (e) { return false; } })());
  if (same >= 0) { doc.gm = all[same][ci('공문ID')]; return campDocLink_(b, doc, who); }
  let m = 0; all.forEach(x => { const v = String(x[ci('공문ID')]); if (v.charAt(0) === 'G') m = Math.max(m, +v.replace(/\D/g, '') || 0); });
  const id = 'G' + String(m + 1).padStart(4, '0');
  const o = Object.assign({ '공문ID': id, '문서번호': '', '상태': '작성 중', '내용': JSON.stringify({ camp: b.id }), '수정일': now, '수정자': String(who || '캠프') + ' (캠프)' }, upd);
  sh.getRange(all.length + 2, 1, 1, h.length).setNumberFormat('@').setValues([h.map(k => o[k] == null ? '' : String(o[k]))]);
  return id;
}
function campSave(token, c, rev) {
  const a = adm_(token); needSup_(a);
  const ok = /^\d{4}-\d{2}-\d{2}$/, num = v => Math.max(0, Math.round(+v || 0));
  const b = c.base || {};
  if (!/^[0-9A-Za-z]{2,8}$/.test(String(b.id || ''))) throw new Error('캠프 코드는 영문·숫자 2~8자로 적어 주세요 (예: 27W).');
  if (!String(b.name || '').trim()) throw new Error('캠프 이름을 적어 주세요.');
  ['start', 'end', 'open', 'close'].forEach(k => { if (!ok.test(b[k] || '')) throw new Error('날짜를 2027-01-11 꼴로 적어 주세요.'); });
  if (b.end < b.start) throw new Error('캠프 끝나는 날이 시작일보다 앞서요.');
  const rounds = (c.rounds || []).map(r => ({ n: String(r.n || '').trim(), from: String(r.from || ''), to: String(r.to || '') }));
  if (!rounds.length || rounds.length > 6) throw new Error('차수는 1~6개로 정해 주세요.');
  rounds.forEach((r, i) => { if (!r.n || !ok.test(r.from) || !ok.test(r.to) || r.to < r.from) throw new Error((i + 1) + '번째 차수의 이름·기간을 확인해 주세요.'); if (i && r.from <= rounds[i - 1].to) throw new Error(r.n + ' 기간이 앞 차수와 겹쳐요.'); });
  const fees = {}; FEE_TYPES.forEach(t => { fees[t] = rounds.map((_, i) => num(((c.fees || {})[t] || [])[i])); });
  const o = c.opt || {}, opt = {}; Object.keys(CAMP_DEF.opt).forEach(k => opt[k] = num(o[k]));
  if (!opt.roomCap) throw new Error('가족방 정원을 적어 주세요.');
  const rf = c.refund || {}, pc = v => Math.max(0, Math.min(100, Math.round(+v || 0))), dr = v => v === null || v === undefined || v === '' ? null : pc(v),
    rules = (rf.rules || []).map(r => ({ until: String(r.until || ''), label: String(r.label || '').trim(), rate: pc(r.rate), drate: dr(r.drate), doc: !!r.doc }));
  rules.forEach((r, i) => { if (!ok.test(r.until) || !r.label) throw new Error((i + 1) + '번째 환불 규정의 날짜·이름을 확인해 주세요.'); if (i && r.until <= rules[i - 1].until) throw new Error('환불 규정은 날짜 순서대로 적어 주세요.'); });
  const af = rf.after || {}, refund = { rules, after: { label: String(af.label || '캠프 시작 후'), rate: pc(af.rate), drate: dr(af.drate), doc: !!af.doc, allow: !!af.allow }, duesRefund: !!rf.duesRefund };
  const cur = b.cur === 'auto' || b.cur === '' || b.cur == null ? 'auto' : String(Math.max(0, Math.min(rounds.length - 1, +b.cur || 0)));
  const oc = (c.consent && c.consent.items) || [], dc = CAMP_DEF.consent.items;
  const consent = { ver: today_(), items: dc.map(d => { const x = oc.find(y => y.id === d.id) || d; const fixed = d.id === 'collect';
    return { id: d.id, title: String(x.title || d.title).trim().slice(0, 60) || d.title, req: fixed ? true : !!x.req, on: fixed ? true : !!x.on, body: String(x.body == null ? d.body : x.body).slice(0, 4000) }; }) };
  { const old = camp_().consent; if (JSON.stringify(old.items) === JSON.stringify(consent.items)) consent.ver = old.ver; }
  const meals = (Array.isArray(c.meals) ? c.meals : []).slice(0, 6).map(m => ({ k: String(m.k || '').trim().slice(0, 10), t: String(m.t || '').trim().slice(0, 120), s: String(m.s || ''), e: String(m.e || ''), on: m.on !== false, first: !!m.first, last: !!m.last, days: Array.isArray(m.days) ? m.days.map(Number).filter((x, j, a) => x >= 0 && x < 40 && a.indexOf(x) === j).sort((x, y) => x - y) : undefined }));
  meals.forEach((m, i) => { if (!m.k) throw new Error((i + 1) + '번째 식사 이름을 적어 주세요.'); if (!/^\d{2}:\d{2}$/.test(m.s) || !/^\d{2}:\d{2}$/.test(m.e) || m.e <= m.s) throw new Error(m.k + ' 시간을 07:20 ~ 08:50 꼴로 확인해 주세요.'); if (!m.t) m.t = m.k + ' 식사'; });
  /* 화면이 그 값을 모르면(옛 화면에서 저장) 지금 값을 그대로 둠 — 공문 · 음원 설정이 꺼지거나 기본값으로 덮이지 않게 (11-04) */
  const prev = camp_(), doc = c.doc ? docClean_(c.doc, rounds.length) : Object.assign({}, prev.doc, { rnote: (prev.doc.rnote || []).slice(0, rounds.length), inc: (prev.doc.inc || []).slice(0, rounds.length) });
  /* 문서번호 · 대장 연결은 회원관리 공문 대장이 시트에 직접 씀 → 화면 값으로 덮지 않음 (11-11) */
  doc.no = String((prev.doc || {}).no || ''); doc.gm = String((prev.doc || {}).gm || '');
  /* 거꾸로 (11-11): 캠프에서 공문을 저장하면 회원관리 공문 대장에 저절로 한 줄(구분 캠프 · 작성 중). 이미 있으면 제목 · 시행일 · 수신 · 참조만 맞춤 */
  let linkMsg = '';
  const cons = c.cons ? consClean_(c.cons) : consClean_(prev.cons);
  const aud = {}; cons.forEach(k => { const x = c.aud ? ((c.aud[k]) || {}) : ((prev.aud || {})[k] || {}); aud[k] = { on: !!x.on, pre: !!x.on && !!x.pre, due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || '') ? x.due : '' }; });
  const nc = { meals, base: { id: String(b.id).trim(), name: String(b.name).trim(), start: b.start, end: b.end, place: String(b.place || '').trim(), open: b.open, close: b.close, cur, guest: b.guest !== false, staff: b.staff !== false, member: b.member !== false, intl: b.intl !== false }, rounds, fees, opt, refund, consent, doc, aud, cons };
  const lock = lock_();
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(CAMPCFG);
    if (!sh) { sh = ss.insertSheet(CAMPCFG); sh.getRange(1, 1, 1, 3).setValues([['항목', '값', '설명']]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('B:B').setNumberFormat('@'); }
    CAMP_CACHE = null; CAMP_NOCC = true; campCacheClear_(); const old = camp_(); CAMP_CACHE = null;
    if ((+rev || 0) !== (old.rev || 0)) throw new Error('다른 분이 먼저 캠프 설정을 바꿨어요. 새로 고친 뒤 다시 해 주세요.');
    /* 저장이 확실할 때(번호 확인 뒤)만 공문 대장에 올림 — 저장 실패로 대장 줄만 늘어나지 않게 */
    try { const g = campDocLink_(nc.base, nc.doc, a.name); if (g) nc.doc.gm = g; else linkMsg = '회원관리 시트(설정 「회원관리 시트」)나 그 시트의 「공문」 탭을 찾지 못해 공문 대장에 올리지 못했어요.'; } catch (e) { linkMsg = '공문 대장에 올리지 못했어요: ' + e.message; }
    const desc = { base: '캠프 코드 · 이름 · 날짜 · 장소 · 접수 기간 · 비회원 접수', rounds: '차수 이름과 기간', fees: '참가자격 × 차수 참가비', opt: '추가 레슨 · 마스터클래스 · 회비 · 가족방', refund: '취소·환불 규정', cons: '음악회 이름 목록 (설정에서 추가 · 빼기)', meals: '식사 시간 (교사 일정 모든 날짜의 식사 줄)', doc: '캠프 안내 공문 (문서 정보 · 머리말 · 항목별 글)', aud: '음악회별 음원 제출 받기 · 마감일', consent: '개인정보 동의 문구 (바꾸면 버전 날짜가 바뀜)' };
    const ex = rows_(CAMPCFG).reduce((o, r) => { o[String(r['항목'])] = String(r['값'] || ''); return o; }, {});
    const vals = CAMP_KEYS.map(k => [k[1], JSON.stringify(nc[k[0]]), desc[k[0]]]).concat([['rev', String((old.rev || 0) + 1), '바꾼 횟수 (건드리지 마세요)'],
      ['공문HTML', c.docHtml != null ? String(c.docHtml).slice(0, 48000) : (ex['공문HTML'] || ''), '회원관리 공문 대장이 읽는 공문 그림 (저장할 때 저절로)'], ['공문CSS', c.docCss != null ? String(c.docCss).slice(0, 20000) : (ex['공문CSS'] || ''), '공문 그림 모양']]);
    sh.getRange(2, 1, Math.max(sh.getLastRow(), vals.length + 1), 3).clearContent();
    sh.getRange(2, 1, vals.length, 3).setValues(vals);
    CAMP_CACHE = null; campCacheClear_();
    if (JSON.stringify(old.meals || []) !== JSON.stringify(meals) || c.mealsApply) nc.mealsDays = mealsApply_(meals);
    log_(a.name, '캠프 설정 저장', nc.base.id + ' · ' + nc.base.start + '~' + nc.base.end);
  } finally { lock.releaseLock(); }
  return { ok: true, camp: campPublic_(), mealsDays: nc.mealsDays, gm: nc.doc && nc.doc.gm, linkMsg: linkMsg };
}
/** 캠프 설정의 식사 시간 → 교사 일정(일정설정 meals) 모든 날짜에 다시 넣기
 *  예전 식사 줄(표시 k가 있거나 아침·점심·저녁 / Breakfast·Lunch·Dinner 글이 든 줄)은 바꾸고, 그 밖의 줄(간식 등)은 그대로 둠 → 바꾼 날짜 수 */
const MEAL_RX = /아침|점심|저녁|breakfast|lunch|dinner/i;
function mealGen_(meals, n) { const L = []; for (let d = 0; d < n; d++) (meals || []).forEach(m => { if (m.on === false) return; if (Array.isArray(m.days)) { if (m.days.indexOf(d) < 0) return; } else { if (d === 0 && !m.first && n > 1) return; if (d === n - 1 && !m.last && n > 1) return; } L.push({ d, s: m.s, e: m.e, t: m.t, k: m.k }); }); return L; }
function mealsApply_(meals) {
  const sh = actSheets_(), c = actCfg_(), n = (c.days || []).length; if (!n) return 0;
  const keep = (Array.isArray(c.meals) ? c.meals : []).filter(m => !m.k && !MEAL_RX.test(String(m.t || '')));
  const L = keep.concat(mealGen_(meals, n)).sort((x, y) => x.d - y.d || String(x.s).localeCompare(String(y.s)));
  const put = (k, v) => { const r = rows_(SH.ACTCFG).find(x => String(x['항목']) === k); if (r) sh.cfg.getRange(r._row, 2).setValues([[JSON.stringify(v)]]); else sh.cfg.appendRow([k, JSON.stringify(v)]); };
  put('meals', L); put('rev', (+c.rev || 0) + 1);   // 열려 있는 교사 일정 화면은 다음 저장 때 새로 불러옴
  return n;
}


/* ---------------- 비회원(학부모) 접수 · 동의 ----------------
 * 비회원 = 보호자가 자기 아이(와 가족)를 직접 접수. 학원 = 「비회원」, 접수자 = 이름(휴대전화 뒤 4자리)
 * 휴대전화 전체는 「비회원」 시트에만 (같은 이름·뒷번호를 다른 사람이 쓰지 못하게) */
const GUEST_ACAD = '비회원';
const GUEST_SH = '비회원';
const CONSENT_SH = '동의기록';
const isGuestType_ = t => /^비회원 /.test(String(t || ''));
/** 동의 확인: 쓰는 항목 중 필수는 모두 true 여야 함 → 빠졌으면 안내 문구 */
function consentErr_(c) {
  const items = (camp_().consent.items || []).filter(x => x.on);
  const miss = items.filter(x => x.req && !(c && c[x.id] === true));
  return miss.length ? '필수 동의 항목에 동의해 주세요: ' + miss.map(x => x.title).join(', ') : '';
}
function consentLog_(kind, name, ph, c) {
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(CONSENT_SH);
    const head = ['일시', '캠프', '구분', '이름', '휴대전화 뒤 4자리', '동의 문구 버전', '동의 항목'];
    if (!sh) { sh = ss.insertSheet(CONSENT_SH); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
    const C = camp_(), items = (C.consent.items || []).filter(x => x.on);
    sh.appendRow([stamp_(), C.base.id, kind, name, "'" + String(ph).slice(-4), C.consent.ver, items.map(x => x.title + ': ' + (c && c[x.id] === true ? '동의' : '안 함')).join(' / ')]);
  } catch (x) {}
}
/** 동의 전에 먼저: 이름·휴대전화로 누구인지, 이미 접수했는지 확인 (아무것도 저장하지 않음)
 *  kind = 'member' | 'guest' → { ok, name, subs:[접수번호…], fresh } */
function authCheck(kind, name, phone) {
  const ph = String(phone || '').replace(/\D/g, '');
  if (kind === 'guest') {
    const C = camp_();
    if (!C.base.guest) return { ok: false, msg: '지금은 비회원 접수를 받지 않아요. 다니는 학원 선생님께 접수를 부탁해 주세요.' };
    const nm = String(name || '').trim().replace(/\s+/g, ' ');
    if (nm.length < 2 || nm.length > 20 || /[()]/.test(nm)) return { ok: false, msg: '보호자 이름을 2~20자로 넣어 주세요.' };
    if (!/^01\d{8,9}$/.test(ph)) return { ok: false, msg: '휴대전화를 확인해 주세요.' };
    const g = guestByPhone_(ph);
    if (g && g.name !== nm) return { ok: false, taken: true, msg: '이 휴대전화로 이미 「' + maskName_(g.name) + '」 님이 신청했어요. 처음 신청할 때 넣은 보호자 이름으로 넣어 주세요.' };
    const owner = g ? g.owner : nm + '(' + ph.slice(-4) + ')';
    const subs = loadSubs_().filter(x => x.acad === GUEST_ACAD && x.owner === owner);
    return { ok: true, name: nm, subs: subs.map(x => x.no), fresh: !g };
  }
  if (pwMode_()) return { ok: false, msg: '이메일 · 비밀번호로 로그인해 주세요. 화면을 새로 고쳐 주세요.' };
  const nm = bare_(name);
  if (!nm || ph.length < 10) return { ok: false, msg: '이름과 휴대전화를 모두 넣어 주세요.' };
  const t = teachers_().find(x => bare_(x.name) === nm && x.p4 && ph.endsWith(x.p4));
  if (!t) return { ok: false, msg: '회원 명단의 이름·휴대전화와 맞지 않아요.' + (guestByPhone_(ph) ? ' 이 번호는 비회원(학부모)으로 신청한 번호예요. 처음 화면에서 「비회원」을 골라 주세요.' : '') };
  if (t.state === '대기') return { ok: false, msg: '승인 대기 중이에요. 협회가 확인하면 이메일로 알려 드려요.' };
  const subs = loadSubs_().filter(x => x.owner === t.name);
  return { ok: true, name: t.name, subs: subs.map(x => x.no), fresh: !subs.length };
}
const maskName_ = n => { n = String(n || ''); return n.length <= 1 ? n : n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]; };
function guestByPhone_(ph) {
  const r = rows_(GUEST_SH).find(x => String(x['휴대전화']).replace(/\D/g, '') === ph);
  return r ? { owner: String(r['접수자']), name: String(r['이름']), _row: r._row } : null;
}
function guestLogin(name, phone, consent) {
  const C = camp_();
  if (!C.base.guest) return { ok: false, msg: '지금은 비회원 접수를 받지 않아요. 다니는 학원 선생님께 접수를 부탁해 주세요.' };
  const nm = String(name || '').trim().replace(/\s+/g, ' '), ph = String(phone || '').replace(/\D/g, '');
  if (nm.length < 2 || nm.length > 20 || /[()]/.test(nm)) return { ok: false, msg: '보호자 이름을 2~20자로 넣어 주세요.' };
  if (!/^01\d{8,9}$/.test(ph)) return { ok: false, msg: '휴대전화를 확인해 주세요.' };
  const ce = consentErr_(consent); if (ce) return { ok: false, msg: ce };
  let owner = nm + '(' + ph.slice(-4) + ')';
  const lock = lock_();
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(GUEST_SH);
    const head = ['접수자', '이름', '휴대전화', '처음', '마지막'];
    if (!sh) { sh = ss.insertSheet(GUEST_SH); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('C:C').setNumberFormat('@'); }
    const g = guestByPhone_(ph);
    if (g && g.name !== nm) return { ok: false, msg: '이 휴대전화로 이미 「' + maskName_(g.name) + '」 님이 신청했어요. 처음 신청할 때 넣은 보호자 이름으로 넣어 주세요.' };
    if (g) owner = g.owner;
    else if (rows_(GUEST_SH).some(x => String(x['접수자']) === owner)) owner = nm + '(' + ph.slice(-4) + '-' + ph.slice(-8, -4) + ')';   // 이름·뒷번호가 같은 다른 사람
    const r = g ? { _row: g._row } : null;
    if (r) sh.getRange(r._row, 5).setValues([[stamp_()]]);
    else sh.appendRow([owner, nm, "'" + ph.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3'), stamp_(), stamp_()]);
  } finally { lock.releaseLock(); }
  consentLog_('비회원(보호자)', nm, ph, consent);
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ name: owner, acads: [GUEST_ACAD], guest: true, phone: ph }), 21600);
  log_(owner, '비회원 로그인', '');
  return Object.assign({ ok: true, token, today: today_(), teacher: { id: '', name: owner, real: nm, role: '보호자', inst: '', acads: [GUEST_ACAD], home: [GUEST_ACAD], p4: ph.slice(-4), guest: true }, myAcct: myAcct_(owner) }, bundle_([GUEST_ACAD], owner));
}


/* ---------------- 장학금 (운영관리 › 장학금) ----------------
 * 기준 = 「설정」 탭 「장학금 기준」 (JSON [[최소 인원, 금액], …]) · 학원별 지급 = 「장학금」 시트 */
const SCHOL_SH = '장학금';
const SCHOL_HEAD = ['학원', '학생 수(저장 때)', '기준 금액', '조정 금액', '상태', '지급일', '메모', '바꾼 날'];
const SCHOL_DEF = '[[30,1200000],[20,800000],[10,400000]]';   /* 26 여름 「추가 지급사항」: 30명↑ 120만 · 20명↑ 80만 · 10명↑ 40만 */
function scholTiers_() { try { const v = JSON.parse(setting_('장학금 기준') || SCHOL_DEF); return Array.isArray(v) ? v.filter(x => +x[0] > 0).map(x => [+x[0], +x[1] || 0]).sort((a, b) => b[0] - a[0]) : []; } catch (x) { return []; } }
function scholRows_() { return rows_(SCHOL_SH).filter(r => r['학원']).map(r => ({ acad: String(r['학원']), n: +r['학생 수(저장 때)'] || 0, base: +r['기준 금액'] || 0, amt: r['조정 금액'] === '' ? '' : +r['조정 금액'], state: String(r['상태'] || '예정'), date: dstr_(r['지급일']), memo: String(r['메모'] || '') })); }
function scholData(token) { adm_(token); return { tiers: scholTiers_(), rows: scholRows_() }; }
function scholSave(token, b) {
  const a = adm_(token); need_(a, 'schol');
  const tiers = (b.tiers || []).map(x => [Math.round(+x[0] || 0), Math.round(+x[1] || 0)]).filter(x => x[0] > 0 && x[1] >= 0).sort((p, q) => q[0] - p[0]);
  if (new Set(tiers.map(x => x[0])).size !== tiers.length) throw new Error('같은 인원 기준이 두 번 있어요.');
  const okD = /^\d{4}-\d{2}-\d{2}$/;
  const rows = (b.rows || []).filter(r => r && String(r.acad || '').trim()).map(r => {
    const st = ['예정', '지급 완료', '보류', '해당 없음'].includes(r.state) ? r.state : '예정';
    if (st === '지급 완료' && !okD.test(r.date || '')) throw new Error(r.acad + ': 지급 완료면 지급일을 넣어 주세요.');
    return [String(r.acad).trim(), Math.max(0, +r.n || 0), Math.max(0, +r.base || 0), r.amt === '' || r.amt == null ? '' : Math.max(0, Math.round(+r.amt || 0)), st, okD.test(r.date || '') ? "'" + r.date : '', String(r.memo || '').slice(0, 200), today_()];
  });
  const lock = lock_();
  try {
    ensureSettings_(); const ss = SpreadsheetApp.getActive(), st = ss.getSheetByName('설정');
    const r = rows_('설정').find(x => String(x['항목']) === '장학금 기준');
    if (r) st.getRange(r._row, 2).setValues([[JSON.stringify(tiers)]]); else st.appendRow(['장학금 기준', JSON.stringify(tiers), '학원별 학생 수(학생 + 악기하는 교사자녀) 기준 장학금 [[최소 인원, 금액], …] — 관리자 장학금 메뉴에서 바꿈']);
    let sh = ss.getSheetByName(SCHOL_SH);
    if (!sh) { sh = ss.insertSheet(SCHOL_SH); sh.getRange(1, 1, 1, SCHOL_HEAD.length).setValues([SCHOL_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SCHOL_HEAD.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, SCHOL_HEAD.length).setValues(rows);
    log_(a.name, '장학금 저장', '기준 ' + tiers.length + '단계 · 학원 ' + rows.length);
  } finally { lock.releaseLock(); }
  return { ok: true, tiers: scholTiers_(), rows: scholRows_() };
}
/** 동의서 기록 (설정 › 동의서, 총관리자) — 최근 순 */
function consentData(token) {
  const a = adm_(token); needSup_(a);
  const L = rows_(CONSENT_SH).filter(r => r['일시']).map(r => ({ at: String(r['일시']), camp: String(r['캠프']), kind: String(r['구분']), name: String(r['이름']), p4: String(r['휴대전화 뒤 4자리']), ver: String(r['동의 문구 버전']), items: String(r['동의 항목']) }));
  return { rows: L.reverse().slice(0, 1000), total: L.length };
}


/* ---------------- 프로그램표 → 구글 시트 (교사 일정 › 「구글 시트로 보내기」) ----------------
 * 따로 만든 스프레드시트(설정 「프로그램표 시트」에 ID)에 날짜마다 탭 하나 + 「참가교사」 탭. 보낼 때마다 덮어씀 */
const ACT_BOOKDESC = { Vn: { 'Pre': ['프리 트윙클', 'Pre-Twinkle'], '1A': ['~ 무궁동', '~ Perpetual Motion'], '1B': ['알레그레토 ~', 'Allegretto ~'], '2A': ['~ 헨델 부레', '~ Handel Bourrée'], '2B': ['두 사람의 척탄병 ~', 'Two Grenadiers ~'], '3A': ['~ 유모레스크', '~ Humoresque'], '3B': ['베커 가보트 ~', 'Becker Gavotte ~'], '4A': ['~ 자이츠 5번 3악장', "~ Seitz No.5 3rd mov't"], '4B': ['비발디 가단조 ~', 'Vivaldi in A minor ~'] }, Vc: { 'Pre': ['프리 트윙클', 'Pre-Twinkle'] }, Fl: { 'Pre': ['프리 트윙클', 'Pre-Twinkle'] } };
const ACT_EN = { '공연': 'Concert', '레슨': 'Lesson', '업무': 'Duty', '본공연': '', '리허설': 'Rehearsal', '무대 세팅': 'Stage Setting', '그룹레슨': 'Group Lesson', '교사연수': 'Teacher Training', '마스터클래스': 'Master Class', '식당': 'Dining' };
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MON_EN = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
const ord_ = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
/** 대상 토큰 → 글: 1 · 1A · 4B+ · 7+ (이어진 권 전체 3개 이상은 1~3) */
function tgTok_(L) {
  const BK = ['Pre', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const P = (L || []).map(t => { const m = String(t).match(/^(Pre|\d+)([AB]*)(\+?)$/); return m ? { bk: m[1], pt: m[2], up: !!m[3] } : null; }).filter(Boolean).sort((a, b) => BK.indexOf(a.bk) - BK.indexOf(b.bk));
  const lab = o => o.bk + (o.pt || '') + (o.up ? ' 이상' : '');
  const out = []; let run = [];
  const flush = () => { if (run.length > 2) out.push(run[0].bk + '~' + run[run.length - 1].bk); else run.forEach(o => out.push(lab(o))); run = []; };
  P.forEach(o => { const plain = !o.pt && !o.up && o.bk !== 'Pre'; if (plain && run.length && +o.bk === +run[run.length - 1].bk + 1) run.push(o); else { flush(); if (plain) run.push(o); else out.push(lab(o)); } });
  flush(); return { txt: out.join(', '), one: P.length === 1 ? P[0] : null };
}
/** 미리보기 · 시트에서 숨길 것 (일정설정 pvHide): f = 칸 안 항목(en 영어 · tg 대상 · sub 세부 · desc 설명 · note 안내 글 · meal 식사 줄) · r = 「구분:역할」 · t = 탭(t 참가교사 · o 오케 명단 · c 음악회) */
const pvHide_ = c => { const h = c.pvHide || {}; return { f: new Set(h.f || []), r: new Set(h.r || []), t: new Set(h.t || []) }; };
function progCell_(e, c, nameOf) {
  const H = pvHide_(c), en = H.f.has('en') ? {} : Object.assign({}, ACT_EN, c.en || {}), BD = c.bookDesc || ACT_BOOKDESC, short = c.roleShort || {};
  const L = [], tg = H.f.has('tg') ? {} : (e.tg || {}), insts = ['Vn', 'Vc', 'Fl'].filter(k => tg[k] && ((tg[k].b || []).length || (tg[k].x || []).length || (tg[k].s || []).length || tg[k].m));
  const stage = e.stage && e.stage !== '본공연' ? e.stage : '';
  if (insts.length) {
    if (e.cat !== '레슨' || (e.title && e.title !== '그룹레슨')) L.push(e.title + (stage ? ' ' + stage : '') + (en[e.title] ? ' / ' + en[e.title] + (stage && en[stage] ? ' ' + en[stage] : '') : ''));
    const ko = [], eng = [];
    insts.forEach(k => {
      const t = tg[k], r = tgTok_(t.b), d = r.one ? ((BD[k] || {})[r.one.bk + r.one.pt] || null) : null;
      ko.push([k + (r.txt ? ' ' + r.txt : ''), ...(t.x || [])].join(' ') + (d && d[0] ? '(' + d[0] + ')' : ''));
      if (d && d[1] && !H.f.has('en')) eng.push(d[1]);
      if ((t.s || []).length || t.m) ko.push([...(t.s || []), t.m || ''].filter(Boolean).join(', '));
    });
    L.push(...ko); if (eng.length) L.push(eng.join(' / '));
  } else {
    L.push(e.title + (stage ? ' ' + stage : ''));
    const E = [en[e.title] || '', stage ? (en[stage] || '') : ''].filter(Boolean).join(' / ');
    if (E) L.push(E);
  }
  if (e.sub && !H.f.has('sub')) L.push(e.sub);
  if (!H.f.has('desc')) (e.desc || []).forEach(x => L.push(x));
  const ppl = e.ppl.filter(p => !H.r.has(e.cat + ':' + p.r));
  const order = ((c.roleSets || {})[e.cat] || []).slice(); ppl.forEach(p => { if (!order.includes(p.r)) order.push(p.r); });
  const G = order.map(r => ({ r, n: ppl.filter(p => p.r === r).map(p => nameOf(p.n)) })).filter(g => g.n.length);
  G.forEach((g, i) => { if (i === 0 && (e.cat === '레슨')) g.n.forEach(n => L.push(n)); else L.push((short[g.r] || g.r) + ': ' + g.n.join(', ')); });
  return L.join('\n');
}
/** 책자 시간표 칸 하나를 항목으로 (11-05): t 시각(시간대와 다를 때만) · h 반 · 행사 이름 · b 내용 줄 · l 담당 · a 보조 · en 영문 · k 종류 */
function progCellS_(e, c, nameOf, t0, e0) {
  const H = pvHide_(c), en = H.f.has('en') ? {} : Object.assign({}, ACT_EN, c.en || {}), BD = c.bookDesc || ACT_BOOKDESC;
  const tg = H.f.has('tg') ? {} : (e.tg || {}), insts = ['Vn', 'Vc', 'Fl'].filter(k => tg[k] && ((tg[k].b || []).length || (tg[k].x || []).length || (tg[k].s || []).length || tg[k].m));
  const stage = e.stage && e.stage !== '본공연' ? e.stage : '', ttl = e.title + (stage ? ' ' + stage : '');
  const o = { k: e.cat || '', t: (e.s !== t0 || e.e !== e0) ? e.s + '~' + e.e : '', h: [], b: [], l: '', a: [], en: '' }, EN = [];
  if (insts.length) {
    insts.forEach(k => { const x = tg[k], r = tgTok_(x.b), d = r.one ? ((BD[k] || {})[r.one.bk + r.one.pt] || null) : null;
      o.h.push([k + (r.txt ? ' ' + r.txt : ''), ...(x.x || [])].join(' ')); if (d && d[0]) o.b.push(d[0]); if (d && d[1]) EN.push(d[1]);
      if ((x.s || []).length || x.m) o.b.push([...(x.s || []), x.m || ''].filter(Boolean).join(', ')); });
    if (e.cat !== '레슨' || (e.title && e.title !== '그룹레슨')) { o.b.unshift(ttl); if (en[e.title]) EN.unshift(en[e.title] + (stage && en[stage] ? ' ' + en[stage] : '')); }
  } else { o.h.push(ttl); const E = [en[e.title] || '', stage ? (en[stage] || '') : ''].filter(Boolean).join(' '); if (E) EN.push(E); }
  if (e.sub && !H.f.has('sub')) o.b.push(e.sub);
  if (!H.f.has('desc')) (e.desc || []).forEach(x => o.b.push(x));
  const ppl = e.ppl.filter(p => !H.r.has(e.cat + ':' + p.r)), order = ((c.roleSets || {})[e.cat] || []).slice(); ppl.forEach(p => { if (!order.includes(p.r)) order.push(p.r); });
  const G = order.map(r => ({ r, n: ppl.filter(p => p.r === r).map(p => nameOf(p.n)) })).filter(g => g.n.length);
  if (G.length) { o.l = G[0].n.join(', '); G.slice(1).forEach(g => o.a.push(...g.n)); }
  if (!H.f.has('en')) o.en = EN.join(' / ');
  return o;
}
/** 오케스트라 파트 역할 (지휘 · 악장 · Vln 1 …) — 이 역할이 들어간 공연은 「오케 명단」에 나옴 */
const ORCH_PARTS = ['지휘', '악장', 'Vln 1', 'Vln 2', 'Vla', 'Vc', 'D.B', '악보계'];
const isPart_ = r => /^(악장|vln?\s*\d|vn\s*\d|vla|va|vc|d\.?\s*b|cb|fl\s*\d?)$/i.test(String(r || '').trim());
/** 프로그램표 만들기 (미리보기 · 구글 시트 공통) → 날짜별 칸 값 V · 칸 색 F · 식사 줄 · 참가교사 · 오케 명단 */
function progBuild_(opt) {
  const c = actCfg_(), C = camp_(); const evs = actEvents_().map(e => Object.assign(e, { cat: ['공연', '레슨', '업무'].includes(e.type) ? e.type : ({ 오케스트라: '공연', 오후음악회: '공연', 음악회: '공연', 리허설: '공연', 대기: '업무' })[e.type] || '레슨' }));
  const ppl = actPeople_(c.people); const nm = {}; ppl.forEach(p => nm[p.id] = p.n); const nameOf = id => nm[id] || String(id).replace(/^[CP]:/, '');
  const days = c.days || [], out = [];
  const start = String(C.base.start || ''), dt0 = /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(start + 'T00:00:00+09:00') : null;
  const tabName = s => String(s).replace(/[\/\\?*:\[\]]/g, '.').slice(0, 90);
  const dayDate = d => dt0 ? new Date(dt0.getTime() + d * 864e5) : null;
  const mm = t => { const m = String(t).match(/^(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : 0; };
  days.forEach((dl, d) => {
    const rooms = (c.rooms || {})[d] || [], E = evs.filter(e => e.d === d), M = pvHide_(c).f.has('meal') ? [] : (c.meals || []).filter(m => m.d === d);
    const starts = [...new Set([...E.map(e => e.s), ...M.map(m => m.s)])].sort((x, y) => mm(x) - mm(y));
    const W = Math.max(2, rooms.length + 1), V = [], F = [], SV = [];   // SV: 책자용 칸 구조 (11-05)
    const HH = pvHide_(c), dt = dayDate(d), note = HH.f.has('note') ? '' : (c.dayNotes || [])[d] || '';
    V.push([note].concat(Array(W - 1).fill(''))); F.push(Array(W).fill(null));
    V.push([dt ? `${dt.getMonth() + 1}월 ${dt.getDate()}일 스케쥴     ${MON_EN[dt.getMonth()]} ${ord_(dt.getDate())} ${WD_EN[dt.getDay()]} Schedule` : dl + ' 스케쥴'].concat(Array(W - 1).fill(''))); F.push(Array(W).fill(null));
    V.push([''].concat(rooms.map(r => r[0]), Array(W - 1 - rooms.length).fill(''))); F.push(Array(W).fill('#e8eef0'));
    V.push([''].concat(rooms.map(r => r[1] || ''), Array(W - 1 - rooms.length).fill(''))); F.push(Array(W).fill('#e8eef0'));
    const meals = [];
    starts.forEach(t => {
      M.filter(m => m.s === t).forEach(m => { meals.push(V.length); V.push([m.s + '-' + m.e, m.t].concat(Array(W - 2).fill(''))); F.push(Array(W).fill('#f1f1f1')); SV[V.length - 1] = null; });
      const here = E.filter(e => e.s === t); if (!here.length) return;
      const endMain = here.map(e => e.e).sort()[0];
      const row = [t + '-' + endMain], col = [null];
      rooms.forEach(r => { const xs = here.filter(e => e.room === r[0]); row.push(xs.map(e => (e.e !== endMain ? e.s + '-' + e.e + '\n' : '') + progCell_(e, c, nameOf)).join('\n\n')); col.push(xs.length ? ({ 공연: '#fdf3e1', 레슨: '#e9f4f5', 업무: '#f3f3f3' })[xs[0].cat] : null); });
      while (row.length < W) { row.push(''); col.push(null); }
      SV[V.length] = [null].concat(rooms.map(r => here.filter(e => e.room === r[0]).map(e => progCellS_(e, c, nameOf, t, endMain))));
      V.push(row); F.push(col);
    });
    out.push({ name: tabName(dl + ' 프로그램'), label: dl, V, F, meals, W, S: SV });
  });
  // 참가교사 (학원 · 악기 · 교사)
  const TT = ['교사', '연수생', '소속없는 중급연수생'], T = {};
  loadSubs_().forEach(sb => sb.ppl.forEach(p => { if (p.status === '취소' || !TT.includes(p.type)) return; const k = sb.acad + '|' + (p.inst || ''); (T[k] = T[k] || []).push(p.name); }));
  const teachers = [['학원', '악기', '교사']].concat(Object.keys(T).sort((x, y) => x.localeCompare(y, 'ko')).map(k => { const [ac, ins] = k.split('|'); return [ac, ({ 바이올린: 'Vn', 첼로: 'Vc', 플루트: 'Fl', 비올라: 'Va' })[ins] || ins, T[k].join(', ')]; }));
  // 오케 명단: 파트 역할(악장 · Vln 1 …)이 들어간 공연을 종류(이름)별로 → 본공연 시각 · 리허설 시각 · 역할마다 이름
  const G = {}; evs.filter(e => e.cat === '공연').forEach(e => { (G[e.title] = G[e.title] || []).push(e); });
  const when = e => (days[e.d] || (e.d + 1) + '일') + ' ' + e.s + '-' + e.e;
  const orch = [];
  Object.keys(G).filter(k => G[k].some(e => e.ppl.some(p => isPart_(p.r)))).sort((x, y) => { const f = k => Math.min(...G[k].map(e => e.d * 1440 + mm(e.s))); return f(x) - f(y); }).forEach(k => {
    const L = G[k].slice().sort((x, y) => x.d * 1440 + mm(x.s) - (y.d * 1440 + mm(y.s)));
    const main = L.filter(e => !e.stage || e.stage === '본공연'), reh = L.filter(e => e.stage === '리허설');
    orch.push({ k: 'h', v: [k + (main.length ? ' (' + main.map(when).join(', ') + ')' : '')] });
    if (reh.length) orch.push({ k: 'r', v: ['리허설'].concat([...new Set(reh.map(when))]) });
    const byMain = main.concat(L.filter(e => !main.includes(e)));   // 이름 순서: 본공연에 넣은 순서 먼저
    const order = ORCH_PARTS.slice(); ((c.roleSets || {})['공연'] || []).forEach(r => { if (isPart_(r) && !order.includes(r)) order.push(r); });
    L.forEach(e => e.ppl.forEach(p => { if (!order.includes(p.r)) order.push(p.r); }));
    order.forEach(r => { const N = []; byMain.forEach(e => e.ppl.forEach(p => { if (p.r === r) { const n = nameOf(p.n); if (!N.includes(n)) N.push(n); } })); if (N.length) orch.push({ k: 'p', v: [r].concat(N) }); });
    orch.push({ k: 'b', v: [''] });
  });
  // 책자 「오케스트라 리허설 대기 및 진행 시간」(11-05): Orch 종류마다 대상(권) · 대기(단계 「대기」) · 리허설 · 담당 교사(대기 일정 사람, 없으면 리허설의 파트 · 지휘가 아닌 역할)
  const orchReh = Object.keys(G).filter(k => /^orch/i.test(k)).sort((x, y) => x.localeCompare(y)).map(k => {
    const L = G[k].slice().sort((x, y) => x.d * 1440 + mm(x.s) - (y.d * 1440 + mm(y.s))), reh = L.filter(e => e.stage === '리허설'), wait = L.filter(e => e.stage === '대기');
    const anyT = reh.concat(wait, L).find(e => e.tg && Object.keys(e.tg).length), tgt = anyT ? progCellS_(anyT, c, nameOf, anyT.s, anyT.e).h.filter(h => h !== k && !/^Orch/i.test(h)).join(' · ') : '';
    const who = (wait.length ? wait : reh).flatMap(e => e.ppl.filter(p => wait.length || (!isPart_(p.r) && !/지휘/.test(p.r))).map(p => nameOf(p.n)));
    return { k, tgt, wait: wait.map(e => ({ d: e.d, s: e.s })), reh: reh.map(e => ({ d: e.d, s: e.s, e: e.e, room: e.room })), who: [...new Set(who)] };
  }).filter(x => x.reh.length || x.wait.length);
  // 책자 오케스트라 명단 · 보조교사(11-05): 공연 종류마다 세부(어느 음악회) · 본공연 · 리허설(장소) · 역할별 이름 (역할 순서 = 오케 파트 순서 → 설정 → 나머지)
  const orchBook = Object.keys(G).filter(k => /^orch/i.test(k) || G[k].some(e => e.ppl.some(p => isPart_(p.r)))).map(k => {
    const L = G[k].slice().sort((x, y) => x.d * 1440 + mm(x.s) - (y.d * 1440 + mm(y.s))), main = L.filter(e => !e.stage || e.stage === '본공연'), reh = L.filter(e => e.stage === '리허설');
    const order = ORCH_PARTS.slice(); ((c.roleSets || {})['공연'] || []).forEach(r => { if (!order.includes(r)) order.push(r); }); L.forEach(e => e.ppl.forEach(p => { if (!order.includes(p.r)) order.push(p.r); }));
    const by = main.concat(L.filter(e => !main.includes(e))), roles = order.map(r => { const N = []; by.forEach(e => e.ppl.forEach(p => { if (p.r === r) { const n = nameOf(p.n); if (!N.includes(n)) N.push(n); } })); return [r, N]; }).filter(x => x[1].length);
    const anyT = L.find(e => e.tg && Object.keys(e.tg).length);
    return { k, sub: ((main[0] || L[0]) || {}).sub || '', tgt: anyT ? progCellS_(anyT, c, nameOf, anyT.s, anyT.e).h.filter(h => h !== k && !/^Orch/i.test(h)).join(' · ') : '', main: main.map(e => ({ d: e.d, s: e.s, e: e.e, room: e.room })), reh: reh.map(e => ({ d: e.d, s: e.s, e: e.e, room: e.room })), roles };
  });
  // 책자 「오프닝 리허설 대기시간」(11-05): 이름에 「오프닝 · Opening」이 든 일정 — 그룹 = 같은 본공연(가져온 일정ID) 또는 일정 하나. 대기 · 리허설 단계 시각, 대상 권, 곡(세부 · 설명), 리더(첫 역할)
  const OG = {}; evs.filter(e => /오프닝|opening/i.test(e.title)).forEach(e => { const k = e.main || e.id; (OG[k] = OG[k] || []).push(e); });
  const openReh = Object.keys(OG).map(k => { const L = OG[k], reh = L.filter(e => e.stage === '리허설'), wait = L.filter(e => e.stage === '대기'), base = reh[0] || L.find(e => !e.stage || e.stage === '본공연') || L[0];
    const o = progCellS_(base, c, nameOf, base.s, base.e), bk = o.h.filter(h => !/오프닝|opening/i.test(h)).join(' · '), song = o.b.filter(b => !/오프닝|opening/i.test(b)).join(' · ');
    return { d: base.d, wait: wait.map(e => e.s).sort()[0] || '', reh: reh.map(e => e.s).sort()[0] || (base.stage === '리허설' ? base.s : ''), bk, song, lead: o.l };
  }).filter(x => x.reh || x.wait).sort((x, y) => x.d - y.d || (x.reh || x.wait).localeCompare(y.reh || y.wait));
  const HT = opt && opt.all ? new Set() : pvHide_(c).t;   // 책자(11-05)는 탭 숨기기와 상관없이 모두 받음
  return { title: C.base.name, days: out, teachers: HT.has('t') ? null : teachers, orch: HT.has('o') ? null : orch, orchReh, openReh, orchBook, concerts: HT.has('c') ? [] : progConcerts_(c, C, evs, nameOf, dayDate), hide: c.pvHide || { f: [], r: [], t: [] }, roleSets: Object.assign({}, ACT_ROLESETS, c.roleSets || {}), used: [...new Set(evs.flatMap(e => e.ppl.map(p => e.cat + ':' + p.r)))] };
}
/** 음악회 프로그램 (오후음악회 · 이브닝 …): 「오후음악회」 탭의 연주 순서 그대로 · 같은 곡이 이어지면 한 번호로 묶고 학원별로 이름을 모음
 *  곡 이름: 목록 곡 「V01-14 미뉴에트 2번 (바흐)」 → 「바흐 미뉴에트 2번」, 직접 입력은 작곡가 + 곡명 · 영어 곡명은 설정 songEn(관리자가 미리보기에서 입력) */
const INST_PF = { 바이올린: 'Vln.', 첼로: 'Vc.', 플루트: 'Fl.', 비올라: 'Vla.', 피아노: 'Pf.' };
/** 곡 이름을 [작곡가, 곡명]으로 (여름 모양 「작곡가 - 곡명」, 11-05) — 목록 곡 「V01-14 미뉴에트 2번 (바흐)」 → ['바흐', '미뉴에트 2번'] */
function songKoParts_(i) {
  if (i.other) return [String(i.oc || '').trim(), String(i.ot || '').trim()];
  const m = String(i.song || '').replace(/^[A-Z]\d+-\d+\s*/, '').match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m ? [m[2] || '스즈키', m[1]] : ['', String(i.song || '').replace(/^[A-Z]\d+-\d+\s*/, '')];
}
function songKo_(i) {
  if (i.other) return [i.oc, i.ot].map(x => String(x || '').trim()).filter(Boolean).join(' ');
  const m = String(i.song || '').replace(/^[A-Z]\d+-\d+\s*/, '').match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m ? (m[2] && m[2] !== '스즈키' ? m[2] + ' ' : '스즈키 ') + m[1] : String(i.song || '').replace(/^[A-Z]\d+-\d+\s*/, '');
}
function progConcerts_(c, C, evs, nameOf, dayDate) {
  const linked = (Array.isArray(c.kinds) ? c.kinds : ACT_KINDS).filter(k => k.link).map(k => k.n);
  const concerts = Array.isArray(c.concerts) ? c.concerts : evs.filter(e => e.type === '오후음악회' || (linked.includes(e.title) && (!e.stage || e.stage === '본공연'))).sort((a, b) => a.d - b.d || a.s.localeCompare(b.s) || a.room.localeCompare(b.room))
    .map(e => ({ id: 'c' + e.id, name: evName_(e) + ' ' + String((c.days || [])[e.d] || '').replace(/\(.\)/, ''), d: e.d, cs: e.s, room: e.room }));
  const order = c.conorder || {}, EN = c.songEn || {}, info = {};
  loadSubs_().forEach(sb => sb.ppl.forEach(p => { const k = p.id.slice(sb.no.length + 1); info[p.id] = { p, sb, i: (sb.form && sb.form.info && sb.form.info[k]) || {} }; }));
  const WD = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'];
  const ampm = t => { const m = String(t || '').match(/^(\d+):(\d+)/); if (!m) return ''; const h = +m[1]; return ((h + 11) % 12 + 1) + ':' + m[2] + (h < 12 ? ' AM' : ' PM'); };
  return concerts.map(x => {
    const ev = evs.find(e => 'c' + e.id === x.id), dt = dayDate(x.d);
    const room = ((c.rooms || {})[x.d] || []).find(r => r[0] === x.room);
    const mc = ev ? [...new Set(ev.ppl.filter(p => /사회|진행/.test(p.r)).map(p => nameOf(p.n)))] : [];
    const L = (order[x.id] || []).map(pid => info[pid]).filter(s => s && s.p.status !== '취소');
    const items = []; L.forEach(s => { const ko = songKo_(s.i) || '(곡 미정)'; let it = items[items.length - 1]; if (!it || it.ko !== ko) items.push(it = { ko, en: EN[ko] || '', kp: songKoParts_(s.i), P: [] }); it.P.push({ n: s.p.name, a: s.sb.acad, ins: s.p.inst || s.i.inst || '' }); });
    const rows = [{ k: 'f', v: ['', C.base.name] }, { k: 't', v: ['', x.name] }];
    rows.push({ k: 'm', v: ['', '일시: ' + (dt ? `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일(${WD[dt.getDay()]}) ` : (c.days || [])[x.d] + ' ') + ampm(x.cs)] });
    rows.push({ k: 'm', v: ['', '장소: ' + (x.room || '') + (room && room[1] ? ' (' + room[1] + ')' : '')] });
    if (mc.length) rows.push({ k: 'm', v: ['', '사회 및 진행: ' + mc.join(', ') + ' 선생님'] });
    rows.push({ k: 'b', v: [''] });
    const linesOf = it => { const G = []; it.P.forEach(p => { let g = G[G.length - 1]; if (!g || g.a !== p.a || g.ins !== p.ins) G.push(g = { a: p.a, ins: p.ins, N: [] }); g.N.push(p.n); });
      return G.map((g, k) => (k === 0 || g.ins !== G[k - 1].ins ? (INST_PF[g.ins] || '') : '') + g.N.join(',') + (g.a ? '(' + g.a + ')' : '')); };
    items.forEach((it, n) => {
      const lines = linesOf(it);
      const left = [it.ko, it.en];
      for (let k = 0; k < Math.max(2, lines.length); k++) rows.push({ k: k === 0 ? 'i' : 'j', v: [k === 0 ? (n + 1) + '.' : '', left[k] || '', lines[k] || ''] });
      rows.push({ k: 'b', v: [''] });
    });
    if (!items.length) rows.push({ k: 'j', v: ['', '(연주 순서가 아직 없어요 · 오후음악회 탭에서 순서를 정하면 나와요)', ''] });
    /* 프로그램북(B5) 화면용 (11-04): 같은 내용을 줄 대신 묶음으로 */
    const book = { id: x.id, camp: C.base.name, name: x.name, when: rows.filter(r => r.k === 'm').map(r => r.v[1]), items: items.map((it, n) => ({ no: n + 1, ko: it.ko, en: it.en, kc: it.kp[0], kt: it.kp[1], lines: linesOf(it) })),
      meta: { date: dt ? Utilities.formatDate(dt, TZ, 'yyyy-MM-dd') : '', t: x.cs || '', room: x.room || '', loc: room && room[1] || '', en: room && room[3] || '', mc } };   // 여름 모양(11-05): 한글 · 영어 일시 · 장소 줄
    return { id: x.id, name: x.name, rows, songs: items.map(it => it.ko), book };
  });
}
/** 오후음악회 › 프로그램북 (B5 인쇄, 11-04): 「연주 순서」 그대로 · 같은 곡은 한 번호 · 영어 곡명은 songEn */
function conBook(token) {
  const a = adm_(token); if (!a.sup && !['보기', '편집'].includes(a.perms.con)) throw new Error('오후음악회 권한이 있어야 볼 수 있어요.');
  const c = actCfg_(), C = camp_(), evs = actEvents_();
  const nm = {}; actPeople_(c.people).forEach(p => nm[p.id] = p.n); const nameOf = id => nm[id] || String(id).replace(/^[CP]:/, '');
  const start = String(C.base.start || ''), dt0 = /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(start + 'T00:00:00+09:00') : null, dayDate = d => dt0 ? new Date(dt0.getTime() + d * 864e5) : null;
  return { books: progConcerts_(c, C, evs, nameOf, dayDate).map(x => x.book) };
}
/** 영어 곡명 저장 (미리보기 › 음악회 탭) — { 한글 곡명: 영어 } 합쳐서 저장, 빈 값은 지움 */
function songEnSave(token, map) {
  const a = adm_(token); need_(a, ['act', 'con']);
  const lock = lock_();
  try {
    const sh = actSheets_(), c = actCfg_(), o = Object.assign({}, c.songEn || {});
    Object.keys(map || {}).slice(0, 300).forEach(k => { const v = String(map[k] || '').trim().slice(0, 120), kk = String(k).slice(0, 120); if (v) o[kk] = v; else delete o[kk]; });
    const v = JSON.stringify(o); if (v.length > 45000) throw new Error('영어 곡명이 너무 많아요.');
    const r = rows_(SH.ACTCFG).find(x => String(x['항목']) === 'songEn'); if (r) sh.cfg.getRange(r._row, 2).setValues([[v]]); else sh.cfg.appendRow(['songEn', v]);
    log_(a.name, '영어 곡명 저장', Object.keys(map || {}).length + '곡');
  } finally { lock.releaseLock(); }
  return { ok: true };
}
/* ================= 행사 책자 (11-05) =================
 * 공문이 캠프의 시작이면 책자는 준비의 마지막. A5 책자 한 권을 쪽 목록으로 만듦.
 * 자동 쪽(표지 · 날짜별 시간표 · 음악회 프로그램 · 오케 명단 · 참가 교사)은 그때그때 데이터에서 만들고(화면이 그림),
 * 「고쳐 쓰기」로 손질한 쪽은 그 HTML 을 그대로 고정 저장 + 고칠 때의 원본 지문(src) → 원본이 바뀌면 화면이 알려 줌.
 * 시트 「책자」: 키(cover · sched:0 · con:c12 · orch · tch · text:abc · _set · _rev) · 순서 · 사용 · 제목 · 내용(고친 HTML / _set 은 설정 JSON) · 원본 · 수정일 · 수정자 */
const BOOK_SH = '책자', BOOK_HEAD = ['키', '순서', '사용', '제목', '내용', '원본', '수정일', '수정자'];
function bookSh_() {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(BOOK_SH);
  if (!sh) { sh = ss.insertSheet(BOOK_SH); sh.getRange(1, 1, 1, BOOK_HEAD.length).setValues([BOOK_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('A:H').setNumberFormat('@'); sh.setColumnWidth(5, 420); }
  return sh;
}
function bookPerm_(a, edit) { if (a.sup) return; const p = a.perms.book; if (edit ? p !== '편집' : !['보기', '편집'].includes(p)) throw new Error(edit ? '행사 책자 「편집」 권한이 있어야 해요.' : '행사 책자 권한이 있어야 볼 수 있어요.'); }
function bookRows_() { bookSh_(); return rows_(BOOK_SH).filter(r => String(r['키'] || '')).map(r => ({ _row: r._row, k: String(r['키']), ord: +r['순서'] || 0, on: String(r['사용'] || '예') !== '아니오', t: String(r['제목'] || ''), h: String(r['내용'] || ''), src: String(r['원본'] || ''), at: r['수정일'] instanceof Date ? Utilities.formatDate(r['수정일'], TZ, 'yyyy-MM-dd HH:mm:ss') : String(r['수정일'] || ''), by: String(r['수정자'] || '') })); }
function bookPages_() { const R = bookRows_(), rev = R.find(r => r.k === '_rev'), set = R.find(r => r.k === '_set');
  let S = {}; try { S = set ? JSON.parse(set.h || '{}') : {}; } catch (x) { S = {}; }
  return { rev: rev ? +rev.h || 0 : 0, set: S, pages: R.filter(r => r.k[0] !== '_').map(r => ({ k: r.k, ord: r.ord, on: r.on, t: r.t, h: r.h, src: r.src, at: r.at, by: r.by })) }; }
/** 책자 화면: 자동 쪽 재료 + 저장된 쪽 목록 */
function bookData(token) {
  const a = adm_(token); bookPerm_(a, false);
  const C = camp_(), P = progBuild_({ all: true });
  const st = String(C.base.start || ''), ok = /^\d{4}-\d{2}-\d{2}$/.test(st);
  const ymd = d => { if (!ok) return ''; const [y, m, dd] = st.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); };
  let exec = ''; try { exec = ScriptApp.getService().getUrl(); } catch (x) {}
  return Object.assign({ ok: true, edit: a.sup || a.perms.book === '편집', exec,
    camp: { id: C.base.id, name: C.base.name, start: C.base.start, end: C.base.end, place: C.base.place },
    days: P.days.map((D, i) => ({ i, label: D.label, date: ymd(i), V: D.V, W: D.W, meals: D.meals, S: D.S })),
    concerts: (P.concerts || []).map(x => x.book), teachers: P.teachers || [], orch: P.orch || [], tchBook: bookTch_(), orchReh: P.orchReh || [], openReh: P.openReh || [], orchBook: P.orchBook || [], mc: (() => { try { const c = actCfg_(), A = mcApps_(), PR = profs_(); return { s: ((c.mcOrder || {}).s || []), pf: PR.filter(p => p.mc).map(p => ({ n: p.name, i: p.inst, en: p.en })), napp: Object.keys(A).reduce((o, k) => (o[k] = A[k].length, o), {}) }; } catch (x) { return { s: [], pf: [], napp: {} }; } })(), fac: profs_().map(p => ({ n: p.name, i: p.inst, b: p.book, g: p.bgrp, en: p.en, ti: p.title, bio: p.bio, o: p.bord })) }, bookPages_());
}
/* ---------------- 마스터클래스 순서 (11-05) ----------------
 * 교수별 세션(날짜 · 시작 · 장소 · 1인 시간) + 줄(신청자 · 곡 / 휴식 / 안내). 신청자 = 접수에서 그 교수 마스터클래스를 고른 사람(취소 빼고).
 * 교사 일정 설정 시트(ACTCFG)의 「mcOrder」 칸에 JSON. 시각은 화면 · 책자가 시작 + 1인 시간으로 셈. */
function mcApps_() {
  const A = {}; loadSubs_().forEach(sb => (sb.ppl || []).forEach(p => { if (p.status === '취소') return; const k = String(p.id).slice(String(sb.no).length + 1), i = ((sb.form || {}).info || {})[k] || {};
    (i.mc || []).forEach(n => { (A[n] = A[n] || []).push({ pid: p.id, n: p.name, a: sb.acad, ins: p.inst || i.inst || '', by: i.by || '' }); }); }));
  return A;
}
function mcData(token) {
  const a = adm_(token); if (!a.sup && !['mcs', 'book'].some(k => ['보기', '편집'].includes(a.perms[k]))) throw new Error('마스터클래스 권한이 있어야 볼 수 있어요.');
  const c = actCfg_(), C = camp_();
  return { ok: true, edit: a.sup || a.perms.mcs === '편집', profs: profs_().filter(p => p.mc).map(p => ({ n: p.name, i: p.inst, min: p.min || 0, room: p.room || '', en: p.en || '', on: p.on })),
    apps: mcApps_(), order: c.mcOrder || { s: [] }, days: c.days || [], start: C.base.start || '' };
}
function mcSave(token, order) {
  const a = adm_(token); need_(a, 'mcs');
  const t = (x, n) => String(x == null ? '' : x).trim().slice(0, n);
  const S2 = (order && Array.isArray(order.s) ? order.s : []).slice(0, 60).map(x => ({ id: t(x.id, 20) || ('m' + Date.now().toString(36)), prof: t(x.prof, 40), d: Math.max(0, Math.min(30, +x.d || 0)), s: /^\d{2}:\d{2}$/.test(String(x.s)) ? String(x.s) : '13:00', room: t(x.room, 60), min: Math.max(5, Math.min(180, +x.min || 30)), title: t(x.title, 80),
    rows: (Array.isArray(x.rows) ? x.rows : []).slice(0, 40).map(r => ({ t: ['p', 'b', 'n'].includes(r.t) ? r.t : 'p', pid: t(r.pid, 40), n: t(r.n, 40), song: t(r.song, 160), min: r.min ? Math.max(0, Math.min(180, +r.min || 0)) : 0, text: t(r.text, 160) })) }));
  const v = JSON.stringify({ s: S2 }); if (v.length > 45000) throw new Error('마스터클래스 순서가 너무 길어요.');
  const lock = lock_();
  try { const sh = actSheets_(); const r = rows_(SH.ACTCFG).find(x => String(x['항목']) === 'mcOrder'); if (r) sh.cfg.getRange(r._row, 2).setValues([[v]]); else sh.cfg.appendRow(['mcOrder', v]); log_(a.name, '마스터클래스 순서 저장', S2.length + '세션'); }
  finally { lock.releaseLock(); }
  return mcData(token);
}
/** 책자 「참가 교실 · 교사 명단」 재료 (11-05): 교사는 학원 · 악기별, 연수생(연수생 · 소속없는 중급연수생)은 따로 악기별 → 「연수교사 Vn」 줄 */
function bookTch_() {
  const T = {}, R = {}, AB = { 바이올린: 'Vn', 첼로: 'Vc', 플루트: 'Fl', 비올라: 'Va', 피아노: 'Pf' };
  loadSubs_().forEach(sb => (sb.ppl || []).forEach(p => { if (p.status === '취소') return; const ins = AB[p.inst] || p.inst || '';
    if (p.type === '교사') { const k = sb.acad + '|' + ins; (T[k] = T[k] || []).push(p.name); }
    else if (p.type === '연수생' || p.type === '소속없는 중급연수생') (R[ins] = R[ins] || []).push(p.name); }));
  return { t: Object.keys(T).map(k => { const [a, i] = k.split('|'); return [a, i, T[k].join(', ')]; }), r: Object.keys(R).map(i => [i, R[i].join(', ')]) };
}
/** 책자 저장: rows = 바뀐 쪽만 [{k, ord, on, t, h, src}], del = 지울 키(글 쪽 · 원본 없는 쪽), set = 설정(있을 때만) · rev 가 다르면 막음 */
function bookSave(token, rev, rows, del, set) {
  const a = adm_(token); bookPerm_(a, true);
  const okKey = k => /^(cover|orch|oreh|open|tch|fac|mcp|oasst|sched:\d{1,2}|con:[\w-]{1,40}|text:[\w-]{1,40})$/.test(k);
  const L = (Array.isArray(rows) ? rows : []).slice(0, 200).map(r => {
    const k = String(r && r.k || ''); if (!okKey(k)) throw new Error('쪽 이름이 맞지 않아요: ' + k);
    const h = r.h == null ? null : String(r.h); if (h && h.length > 48000) throw new Error((r.t || k) + ': 내용이 너무 길어요. 두 쪽으로 나눠 주세요.');
    return { k, ord: Math.round(+r.ord || 0), on: r.on !== false, t: String(r.t || '').slice(0, 80), h, src: r.h == null ? null : String(r.src || '').slice(0, 24) };   // h 가 없으면 순서 · 사용만 (고친 내용은 그대로)
  });
  const D = (Array.isArray(del) ? del : []).map(String).filter(okKey).slice(0, 100);
  let setJ = null; if (set && typeof set === 'object') { setJ = JSON.stringify(set); if (setJ.length > 9000) throw new Error('설정이 너무 길어요.'); }
  const lock = lock_();
  try {
    const sh = bookSh_(), R = bookRows_(), cur = R.find(r => r.k === '_rev'), now = +(cur && cur.h) || 0;
    if ((+rev || 0) !== now) throw new Error('다른 분이 먼저 책자를 고쳤어요. 「새로 만들기」로 다시 불러온 뒤 해 주세요.');
    const by = {}; R.forEach(r => by[r.k] = r);
    const put = (k, vals) => { const r = by[k]; if (r) sh.getRange(r._row, 1, 1, BOOK_HEAD.length).setValues([vals]); else { sh.appendRow(vals); by[k] = { _row: sh.getLastRow(), k }; } };
    const t = stamp_();
    L.forEach(r => { const o = by[r.k] || {}; put(r.k, [r.k, String(r.ord), r.on ? '예' : '아니오', r.t, r.h == null ? (o.h || '') : r.h, r.src == null ? (o.src || '') : r.src, r.h == null && o.at ? o.at : t, r.h == null && o.by ? o.by : a.name]); });
    if (setJ != null) put('_set', ['_set', '', '', '설정', setJ, '', t, a.name]);
    put('_rev', ['_rev', '', '', '', String(now + 1), '', t, a.name]);
    D.map(k => by[k] && by[k]._row).filter(Boolean).sort((x, y) => y - x).forEach(n => sh.deleteRow(n));
    if (L.some(r => r.h != null) || D.length) log_(a.name, '행사 책자 저장', L.filter(r => r.h != null).map(r => (r.t || r.k) + (r.h ? '' : ' (원본으로)')).join(', ') + (D.length ? ' · 지움 ' + D.join(', ') : ''));
  } finally { lock.releaseLock(); }
  return bookPages_();
}
/** 책자 그림 (11-05): 드라이브 폴더 「캠프 책자 이미지 {캠프코드}」에 저장 · 시트에는 파일 ID만 (<img data-fid>) */
function bookImgFolder_() { const n = '캠프 책자 이미지 ' + camp_().base.id, it = DriveApp.getFoldersByName(n); return it.hasNext() ? it.next() : DriveApp.createFolder(n); }
function bookImgPut(token, dataUrl, name) {
  const a = adm_(token); bookPerm_(a, true);
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) throw new Error('그림 파일만 올릴 수 있어요.');
  if (m[2].length > 9000000) throw new Error('그림이 너무 커요(6MB까지).');
  const nm = Utilities.formatDate(new Date(), TZ, 'MMdd-HHmmss') + '-' + String(name || '그림').replace(/[^\w가-힣.\- ]/g, '').slice(0, 40);
  const f = bookImgFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nm));
  log_(a.name, '책자 그림 올림', nm);
  return { ok: true, id: f.getId() };
}
/** 책자 그림 받기: 이 캠프 책자 폴더 안 파일만 (다른 드라이브 파일은 막음) */
function bookImgs(token, ids) {
  const a = adm_(token); bookPerm_(a, false);
  const fid = bookImgFolder_().getId(), out = {};
  (Array.isArray(ids) ? ids : []).map(String).filter(x => /^[\w-]{10,80}$/.test(x)).slice(0, 30).forEach(id => {
    try { const f = DriveApp.getFileById(id); const ps = f.getParents(); let ok = false; while (ps.hasNext()) if (ps.next().getId() === fid) ok = true;
      if (!ok) return; const b = f.getBlob(); out[id] = 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()); } catch (e) {}
  });
  return out;
}
/** 책자 검사 재료 (11-05): 접수 참가자 · 교사 · 교수진의 이름 · 학원 · 악기 · 출생연도 — 화면에서 책자 글과 대조만 (저장 안 함) */
function bookCheckData(token) {
  const a = adm_(token); bookPerm_(a, false);
  const P = []; loadSubs_().forEach(sb => (sb.ppl || []).forEach(p => { if (p.status === '취소') return; const k = String(p.id || '').slice(String(sb.no || '').length + 1), i = ((sb.form || {}).info || {})[k] || {};
    P.push([String(p.name || '').trim(), String(sb.acad || ''), String(p.inst || i.inst || ''), String(i.by || ''), String(p.type || p.kind || '')]); }));
  const T = teachers_().map(t => [String(t.name || '').trim(), t.acads.join(','), t.inst]);
  const F = profs_().map(f => [f.name, f.org, f.inst]);
  // 곡 → 권: 신청서(App1) 곡 목록 「V04-04 협주곡 가단조 1악장 (비발디)」 = 바이올린 4권
  let G = []; try { const h = HtmlService.createHtmlOutputFromFile('App1').getContent(); const rx = /'([VC])(\d\d)-(\d\d) ([^']{2,80})'/g; let m; while ((m = rx.exec(h))) G.push([m[1], +m[2], m[4]]); } catch (x) {}
  const C = camp_(); return { ok: true, year: +String(C.base.start || '').slice(0, 4) || new Date().getFullYear(), P, T, F, G };
}
/* ---------------- 책자 ↔ 구글 시트 (11-05) ----------------
 * 캠프 하나에 스프레드시트 하나(「{캠프 이름} 책자」), 책자 쪽마다 탭 하나 (방배정 도면처럼 시트에서 고치고 「시트에서 적용」).
 * 「스프레드로 가져가기」: 관리자 화면이 그린 쪽 모양을 칸 격자로 바꿔 보냄 — 글자 · 굵게 · 크기 · 색 · 글꼴 · 정렬 · 선 · 칸 합치기 · 칸 폭 · 줄 높이.
 * 「시트에서 적용」: 탭을 읽어 A5 쪽 HTML(표)로 바꿔 「책자」 시트에 저장. 한 탭 안에서 쪽 나누기 = 첫 칸에 [쪽 나눔].
 * 시트는 책자의 1.5배 크기(글자 · 칸) — 화면에서 고치기 편하게. 시트 15pt = 책자 10pt.
 * 칸마다 부르면 느려서 Sheets REST(v4)로 한 번에 읽고 씀 · 토큰은 이 앱이 이미 가진 스프레드시트 권한. */
const BOOK_TABS_MAX = 60;
function bookApi_(id, path, body) {
  const o = { method: body ? 'post' : 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/' + id + (path || ''), o), c = r.getResponseCode();
  if (c >= 300) throw new Error('구글 시트에 쓰거나 읽지 못했어요 (' + c + ') ' + r.getContentText().slice(0, 160));
  return JSON.parse(r.getContentText() || '{}');
}
function bookSheetUrl_(id) { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; }
/** _set 만 고침 (rev + 1) — 잠금 안에서 부름 */
function bookSetPatch_(a, fn) {
  const sh = bookSh_(), R = bookRows_(), set = R.find(r => r.k === '_set'), rv = R.find(r => r.k === '_rev'), now = +(rv && rv.h) || 0;
  let S = {}; try { S = set ? JSON.parse(set.h || '{}') : {}; } catch (x) { S = {}; }
  fn(S); const j = JSON.stringify(S); if (j.length > 9000) throw new Error('책자 설정이 너무 길어요(시트 탭이 너무 많아요).');
  const t = stamp_(), put = (r, vals) => { if (r) sh.getRange(r._row, 1, 1, BOOK_HEAD.length).setValues([vals]); else sh.appendRow(vals); };
  put(set, ['_set', '', '', '설정', j, '', t, a.name]); put(rv, ['_rev', '', '', '', String(now + 1), '', t, a.name]);
}
function bookRgb_(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return null; const n = parseInt(m[1], 16); return { red: (n >> 16 & 255) / 255, green: (n >> 8 & 255) / 255, blue: (n & 255) / 255 }; }
function bookHex_(c) { if (!c) return ''; const v = x => ('0' + Math.round((+x || 0) * 255).toString(16)).slice(-2); return '#' + v(c.red) + v(c.green) + v(c.blue); }
function bookTf_(s) { const o = { bold: !!s.b, italic: !!s.i, underline: !!s.u }; if (s.ff) o.fontFamily = String(s.ff).slice(0, 40); if (+s.fs) o.fontSize = Math.max(1, Math.min(200, Math.round(+s.fs))); const c = bookRgb_(s.fc); if (c) o.foregroundColor = c; return o; }
function bookBd_(x) { if (!Array.isArray(x)) return null; const st = x[1] === 'dotted' ? 'DOTTED' : x[1] === 'dashed' ? 'DASHED' : x[1] === 'double' ? 'DOUBLE' : +x[0] >= 3 ? 'SOLID_THICK' : +x[0] >= 2 ? 'SOLID_MEDIUM' : 'SOLID'; return { style: st, color: bookRgb_(x[2]) || { red: 0, green: 0, blue: 0 } }; }
/* REST 를 못 쓰는 프로젝트(Sheets API 꺼짐)용 대체: 같은 요청을 SpreadsheetApp 으로 (느리지만 같은 결과) */
function bookWriteSA_(ss, req) {
  const byG = {}; ss.getSheets().forEach(s => byG[s.getSheetId()] = s);
  const SB = SpreadsheetApp.BorderStyle, bst = s => ({ DOTTED: SB.DOTTED, DASHED: SB.DASHED, DOUBLE: SB.DOUBLE, SOLID_THICK: SB.SOLID_THICK, SOLID_MEDIUM: SB.SOLID_MEDIUM })[s] || SB.SOLID;
  req.forEach(R => { const k = Object.keys(R)[0], v = R[k], sh = byG[(v.range || v.start || v.properties || {}).sheetId]; if (!sh) return;
    if (k === 'unmergeCells') sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
    else if (k === 'updateCells' && v.range) { sh.clear(); }
    else if (k === 'updateSheetProperties') { const g = v.properties.gridProperties; if (g) { sh.setFrozenRows(0); sh.setFrozenColumns(0);
        const mr = sh.getMaxRows(), mc = sh.getMaxColumns(); if (g.rowCount > mr) sh.insertRowsAfter(mr, g.rowCount - mr); else if (g.rowCount < mr) sh.deleteRows(g.rowCount + 1, mr - g.rowCount);
        if (g.columnCount > mc) sh.insertColumnsAfter(mc, g.columnCount - mc); else if (g.columnCount < mc) sh.deleteColumns(g.columnCount + 1, mc - g.columnCount); }
      if (v.properties.index != null) { ss.setActiveSheet(sh); ss.moveActiveSheet(v.properties.index + 1); } }
    else if (k === 'updateDimensionProperties') { const r = v.range; if (r.dimension === 'COLUMNS') sh.setColumnWidth(r.startIndex + 1, v.properties.pixelSize); else sh.setRowHeight(r.startIndex + 1, v.properties.pixelSize); }
    else if (k === 'mergeCells') { const r = v.range; sh.getRange(r.startRowIndex + 1, r.startColumnIndex + 1, r.endRowIndex - r.startRowIndex, r.endColumnIndex - r.startColumnIndex).merge(); }
    else if (k === 'updateCells') {
      const rows = v.rows || [], nr = rows.length, nc = Math.max(1, ...rows.map(r => (r.values || []).length)); if (!nr) return;
      const rg = sh.getRange(1, 1, nr, nc), A = f => rows.map(r => Array.from({ length: nc }, (_, j) => f((r.values || [])[j] || {})));
      const hex = c => c ? bookHex_(c) : null, tf = c => ((c.userEnteredFormat || {}).textFormat) || {};
      rg.setNumberFormat('@');
      rg.setRichTextValues(A(c => { const t = (c.userEnteredValue || {}).stringValue || '', b = SpreadsheetApp.newRichTextValue().setText(t);
        (c.textFormatRuns || []).forEach((q, i, L) => { const e = i + 1 < L.length ? L[i + 1].startIndex : t.length; if (e <= q.startIndex) return; const f = q.format || {}, s = SpreadsheetApp.newTextStyle().setBold(!!f.bold).setItalic(!!f.italic).setUnderline(!!f.underline);
          if (f.fontSize) s.setFontSize(f.fontSize); if (f.fontFamily) s.setFontFamily(f.fontFamily); if (f.foregroundColor) s.setForegroundColor(hex(f.foregroundColor)); b.setTextStyle(q.startIndex, e, s.build()); });
        return b.build(); }));
      rg.setBackgrounds(A(c => hex((c.userEnteredFormat || {}).backgroundColor)));
      rg.setFontWeights(A(c => tf(c).bold ? 'bold' : 'normal')); rg.setFontStyles(A(c => tf(c).italic ? 'italic' : 'normal')); rg.setFontLines(A(c => tf(c).underline ? 'underline' : 'none'));
      rg.setFontSizes(A(c => tf(c).fontSize || 10)); rg.setFontFamilies(A(c => tf(c).fontFamily || 'Noto Sans KR')); rg.setFontColors(A(c => hex(tf(c).foregroundColor) || '#000000'));
      rg.setHorizontalAlignments(A(c => String((c.userEnteredFormat || {}).horizontalAlignment || 'LEFT').toLowerCase())); rg.setVerticalAlignments(A(c => String((c.userEnteredFormat || {}).verticalAlignment || 'MIDDLE').toLowerCase()));
      rg.setWrapStrategies(A(c => (c.userEnteredFormat || {}).wrapStrategy === 'OVERFLOW_CELL' ? SpreadsheetApp.WrapStrategy.OVERFLOW : SpreadsheetApp.WrapStrategy.WRAP));
      rows.forEach((r, i) => (r.values || []).forEach((c, j) => { const B = (c.userEnteredFormat || {}).borders; if (!B) return; const cell = sh.getRange(i + 1, j + 1);
        [['top', [true, null, null, null]], ['left', [null, true, null, null]], ['bottom', [null, null, true, null]], ['right', [null, null, null, true]]].forEach(([s, f]) => { if (B[s]) cell.setBorder(f[0], f[1], f[2], f[3], null, null, hex(B[s].color) || '#000000', bst(B[s].style)); }); }));
    }
  });
}
/** 읽기 대체: REST 응답과 같은 모양으로 (선은 칸마다 읽어서 느림 · 2000칸까지) */
function bookReadSA_(ss) {
  let budget = 2000, canB = true;
  const col = h => { const m = /^#?([0-9a-f]{6})/i.exec(String(h || '')); return m ? bookRgb_(m[1]) : null; };
  const bst = b => { if (!b) return null; let st = ''; try { st = String(b.getBorderStyle()); } catch (e) { return null; } if (!st || /NONE/.test(st)) return null; let c = '#000000'; try { c = b.getColor().asRgbColor().asHexString(); } catch (e) {}
    return { style: /DOTTED/.test(st) ? 'DOTTED' : /DASHED/.test(st) ? 'DASHED' : /DOUBLE/.test(st) ? 'DOUBLE' : /THICK/.test(st) ? 'SOLID_THICK' : /MEDIUM/.test(st) ? 'SOLID_MEDIUM' : 'SOLID', color: col(c) }; };
  return { sheets: ss.getSheets().map(sh => {
    const lr = Math.min(Math.max(sh.getLastRow(), 1), 400), lc = Math.min(Math.max(sh.getLastColumn(), 1), 60), rg = sh.getRange(1, 1, lr, lc);
    const RT = rg.getRichTextValues(), DV = rg.getDisplayValues(), BG = rg.getBackgrounds(), HA = rg.getHorizontalAlignments(), VA = rg.getVerticalAlignments(), WR = rg.getWrapStrategies();
    const FF = rg.getFontFamilies(), FS = rg.getFontSizes(), FC = rg.getFontColors(), FW = rg.getFontWeights(), FT = rg.getFontStyles(), FL = rg.getFontLines();
    const rowData = DV.map((row, i) => ({ values: row.map((v, j) => {
      const ef = { backgroundColor: col(BG[i][j]) || { red: 1, green: 1, blue: 1 }, horizontalAlignment: /center/i.test(HA[i][j]) ? 'CENTER' : /right/i.test(HA[i][j]) ? 'RIGHT' : 'LEFT', verticalAlignment: /top/i.test(VA[i][j]) ? 'TOP' : /middle/i.test(VA[i][j]) ? 'MIDDLE' : 'BOTTOM',
        wrapStrategy: String(WR[i][j]) === 'WRAP' ? 'WRAP' : 'OVERFLOW_CELL', textFormat: { fontFamily: FF[i][j], fontSize: FS[i][j], bold: FW[i][j] === 'bold', italic: FT[i][j] === 'italic', underline: FL[i][j] === 'underline', foregroundColor: col(FC[i][j]) } };
      if (canB && budget > 0) { budget--; try { const b = sh.getRange(i + 1, j + 1).getBorder(); if (b) ef.borders = { top: bst(b.getTop()), right: bst(b.getRight()), bottom: bst(b.getBottom()), left: bst(b.getLeft()) }; } catch (e) { canB = false; } }
      const o = { formattedValue: v, effectiveFormat: ef }, rt = RT[i][j];
      if (rt && v) { try { const runs = rt.getRuns(); if (runs.length > 1) o.textFormatRuns = runs.map(q => { const s = q.getTextStyle(); return { startIndex: q.getStartIndex(), format: { bold: s.isBold(), italic: s.isItalic(), underline: s.isUnderline(), fontSize: s.getFontSize(), fontFamily: s.getFontFamily(), foregroundColor: col(s.getForegroundColor()) } }; }); } catch (e) {} }
      return o; }) }));
    const merges = rg.getMergedRanges().map(m => ({ startRowIndex: m.getRow() - 1, endRowIndex: m.getRow() - 1 + m.getNumRows(), startColumnIndex: m.getColumn() - 1, endColumnIndex: m.getColumn() - 1 + m.getNumColumns() }));
    const cm = [], rm = []; for (let j = 0; j < lc; j++) cm.push({ pixelSize: sh.getColumnWidth(j + 1) }); for (let i = 0; i < lr; i++) rm.push({ pixelSize: sh.getRowHeight(i + 1) });
    return { properties: { sheetId: sh.getSheetId(), title: sh.getName(), index: sh.getIndex() - 1, hidden: sh.isSheetHidden() }, merges, data: [{ rowData, rowMetadata: rm, columnMetadata: cm }] };
  }) };
}
/** 쪽 탭으로 보내기: tabs = [{k, name, cw:[px], rh:[px], cells:[[r,c,rs,cs,v,f,runs]]}] (한 번에 12탭까지 — 클라이언트가 나눠 부름) */
function bookSheetPut(token, tabs) {
  const a = adm_(token); bookPerm_(a, true);
  const okKey = k => /^(cover|orch|oreh|open|tch|fac|mcp|oasst|sched:\d{1,2}|con:[\w-]{1,40}|text:[\w-]{1,40})$/.test(k);
  const T = (Array.isArray(tabs) ? tabs : []).slice(0, 12);
  const lock = lock_(); let ss = null; const out = {};
  try {
    const P = bookPages_();
    if (P.set.sheet) { try { ss = SpreadsheetApp.openById(String(P.set.sheet)); } catch (x) { ss = null; } }
    const made = !ss;
    if (made) {
      ss = SpreadsheetApp.create(camp_().base.name + ' 책자');
      try { DriveApp.getFileById(ss.getId()).moveTo(bookImgFolder_()); } catch (x) {}
      const rd = ss.getSheets()[0]; rd.setName('_읽어 주세요');
      rd.getRange(1, 1, 7, 1).setValues([['이 파일은 캠프 관리자 › 인쇄물 › 행사 책자에서 만든 책자 원고예요. 탭 하나 = 책자 쪽 하나.'], ['고친 뒤 관리자 화면에서 「시트에서 적용」을 누르면 미리보기 · 인쇄에 들어가요.'],
        ['• 시트는 책자의 1.5배 크기예요 — 시트 15pt = 책자 10pt, 칸 폭도 1.5배.'], ['• 한 탭에서 다음 쪽으로 넘기려면 A열 칸에 [쪽 나눔] 이라고 쓴 줄을 두세요.'],
        ['• 새 탭을 만들면 새 글 쪽이 돼요 (탭 이름 = 쪽 이름). 이름이 _ 로 시작하는 탭은 읽지 않아요.'], ['• 줄 높이 · 칸 폭 · 칸 합치기 · 선 · 글자 모양이 그대로 쪽 모양이 돼요. 그림은 [그림 …] 칸을 그대로 두세요.'], ['• 다른 분이 고치려면 오른쪽 위 「공유」로 그분 구글 계정을 넣어 주세요.']]);
      rd.setColumnWidth(1, 760); rd.getRange(1, 1).setFontWeight('bold');
    }
    const id = ss.getId(), map = Object.assign({}, made ? {} : (P.set.tabs || {}));
    const sheets = () => ss.getSheets();
    const req = [];
    T.forEach(tb => {
      const k = String(tb && tb.k || ''); if (!okKey(k)) throw new Error('쪽 이름이 맞지 않아요: ' + k);
      const cw = (tb.cw || []).slice(0, 60).map(x => Math.max(2, Math.min(1200, Math.round(+x || 20)))), rh = (tb.rh || []).slice(0, 400).map(x => Math.max(2, Math.min(800, Math.round(+x || 21))));
      const nc = Math.max(1, cw.length), nr = Math.max(1, rh.length);
      let nm = String(tb.name || k).replace(/[\[\]*?:\/\\]/g, ' ').replace(/^_+/, '').trim().slice(0, 90) || k;
      let sh = map[k] != null ? sheets().find(s => s.getSheetId() === +map[k]) : null;
      const taken = n => sheets().some(s => s.getName() === n && (!sh || s.getSheetId() !== sh.getSheetId()));
      for (let i = 2; taken(nm) && i < 50; i++) nm = String(tb.name || k).slice(0, 84) + ' (' + i + ')';
      if (!sh) sh = ss.insertSheet(nm, sheets().length); else if (sh.getName() !== nm) sh.setName(nm);
      const g = sh.getSheetId(); map[k] = g; out[k] = g;
      req.push({ unmergeCells: { range: { sheetId: g } } }, { updateCells: { range: { sheetId: g }, fields: '*' } },
        { updateSheetProperties: { properties: { sheetId: g, gridProperties: { rowCount: nr + 20, columnCount: nc + 1, frozenRowCount: 0, frozenColumnCount: 0 } }, fields: 'gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)' } });
      cw.forEach((w, j) => req.push({ updateDimensionProperties: { range: { sheetId: g, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: w }, fields: 'pixelSize' } }));
      req.push({ updateDimensionProperties: { range: { sheetId: g, dimension: 'COLUMNS', startIndex: nc, endIndex: nc + 1 }, properties: { pixelSize: 60 }, fields: 'pixelSize' } });
      rh.forEach((h, i) => req.push({ updateDimensionProperties: { range: { sheetId: g, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: h }, fields: 'pixelSize' } }));
      // 칸 격자 만들기 (합친 칸: 바탕은 전체, 선은 가장자리에)
      const G = []; for (let i = 0; i < nr; i++) { G.push([]); for (let j = 0; j < nc; j++) G[i].push({}); }
      const fmt = (i, j) => { const c = G[i] && G[i][j]; if (!c) return null; c.userEnteredFormat = c.userEnteredFormat || { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', textFormat: { fontFamily: 'Noto Sans KR' } }; return c.userEnteredFormat; };
      (tb.cells || []).slice(0, 6000).forEach(x => {
        const r = +x[0] | 0, c = +x[1] | 0; if (r < 0 || c < 0 || r >= nr || c >= nc) return;
        const rs = Math.max(1, Math.min(nr - r, +x[2] | 0)), cs = Math.max(1, Math.min(nc - c, +x[3] | 0)), v = String(x[4] == null ? '' : x[4]).slice(0, 5000), f = x[5] || {}, bd = f.bd || [];
        for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) { const F = fmt(i, j); const bg = bookRgb_(f.bg); if (bg) F.backgroundColor = bg;
          const B = {}; if (i === r && bookBd_(bd[0])) B.top = bookBd_(bd[0]); if (j === c + cs - 1 && bookBd_(bd[1])) B.right = bookBd_(bd[1]); if (i === r + rs - 1 && bookBd_(bd[2])) B.bottom = bookBd_(bd[2]); if (j === c && bookBd_(bd[3])) B.left = bookBd_(bd[3]);
          if (Object.keys(B).length) F.borders = Object.assign(F.borders || {}, B); }
        const F = fmt(r, c); F.textFormat = Object.assign({ fontFamily: 'Noto Sans KR' }, bookTf_(f));
        F.wrapStrategy = f.w === 0 ? 'OVERFLOW_CELL' : 'WRAP'; F.horizontalAlignment = f.ha === 'C' ? 'CENTER' : f.ha === 'R' ? 'RIGHT' : 'LEFT'; F.verticalAlignment = f.va === 'T' ? 'TOP' : f.va === 'B' ? 'BOTTOM' : 'MIDDLE';
        if (v !== '') { G[r][c].userEnteredValue = { stringValue: v };
          const runs = (Array.isArray(x[6]) ? x[6] : []).filter(q => Array.isArray(q) && +q[0] >= 0 && +q[0] < v.length).slice(0, 200);
          if (runs.length) { if (+runs[0][0] !== 0) runs.unshift([0, f]); G[r][c].textFormatRuns = runs.map(q => ({ startIndex: +q[0] | 0, format: Object.assign({ fontFamily: 'Noto Sans KR' }, bookTf_(q[1] || {})) })); } }
        if (rs > 1 || cs > 1) req.push({ mergeCells: { range: { sheetId: g, startRowIndex: r, endRowIndex: r + rs, startColumnIndex: c, endColumnIndex: c + cs }, mergeType: 'MERGE_ALL' } });
      });
      req.push({ updateCells: { start: { sheetId: g, rowIndex: 0, columnIndex: 0 }, rows: G.map(row => ({ values: row })), fields: 'userEnteredValue,userEnteredFormat,textFormatRuns' } });
    });
    let rest = true; if (req.length) { try { bookApi_(id, ':batchUpdate', { requests: req }); } catch (e) { rest = false; bookWriteSA_(ss, req); } }
    // 탭 순서 = 이름 앞 번호 순 (_읽어 주세요 는 맨 앞)
    const ord = sheets().map(s => ({ g: s.getSheetId(), n: s.getName() })).sort((x, y) => (x.n[0] === '_' ? 0 : 1) - (y.n[0] === '_' ? 0 : 1) || x.n.localeCompare(y.n, 'ko', { numeric: true }));
    const oq = ord.map((s, i) => ({ updateSheetProperties: { properties: { sheetId: s.g, index: i }, fields: 'index' } })); if (rest) { try { bookApi_(id, ':batchUpdate', { requests: oq }); } catch (e) { bookWriteSA_(ss, oq); } } else bookWriteSA_(ss, oq);
    const live = new Set(sheets().map(s => String(s.getSheetId()))); Object.keys(map).forEach(k => { if (!live.has(String(map[k]))) delete map[k]; });
    bookSetPatch_(a, S => { S.sheet = id; S.tabs = map; });
    log_(a.name, '책자 → 시트', T.map(t => t.name || t.k).join(', ').slice(0, 300));
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true, url: bookSheetUrl_(ss.getId()), gids: out }, bookPages_());
}
/** 시트 읽기: 탭마다 {gid, title, index, cw, rh, cells:[[r,c,rs,cs,v,f,runs]]} · f = {b,i,u,fs,fc,ff,bg,ha,va,bd:[t,r,b,l]} */
function bookSheetGet(token) {
  const a = adm_(token); bookPerm_(a, false);
  const P = bookPages_(), id = String(P.set.sheet || '');
  if (!id) throw new Error('아직 책자 시트가 없어요 · 「스프레드로 가져가기」를 먼저 해 주세요.');
  const fl = 'sheets(properties(sheetId,title,index,hidden),merges,data(rowMetadata(pixelSize),columnMetadata(pixelSize),rowData(values(formattedValue,effectiveFormat(backgroundColor,borders,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat),textFormatRuns))))';
  let J; try { J = bookApi_(id, '?includeGridData=true&fields=' + encodeURIComponent(fl)); } catch (x) {
    let ss; try { ss = SpreadsheetApp.openById(id); } catch (y) { throw new Error('책자 시트를 읽지 못했어요 · 파일이 지워졌거나 권한이 없어요.'); }
    J = bookReadSA_(ss); }
  const col = c => c ? bookHex_(c.rgbColor || c) : '';
  const tf = (t, base) => { t = t || {}; const o = Object.assign({}, base || {});
    if (t.bold != null) o.b = t.bold ? 1 : 0; if (t.italic != null) o.i = t.italic ? 1 : 0; if (t.underline != null) o.u = t.underline ? 1 : 0;
    if (t.fontSize != null) o.fs = t.fontSize; if (t.fontFamily) o.ff = t.fontFamily; const fc = t.foregroundColorStyle ? col(t.foregroundColorStyle) : t.foregroundColor ? bookHex_(t.foregroundColor) : ''; if (fc) o.fc = fc; return o; };
  const bw = b => { if (!b || !b.style || b.style === 'NONE') return null; const w = /THICK/.test(b.style) ? 3 : /MEDIUM|DOUBLE/.test(b.style) ? 2 : 1;
    return [w, b.style === 'DOTTED' ? 'dotted' : b.style === 'DASHED' ? 'dashed' : b.style === 'DOUBLE' ? 'double' : 'solid', (b.colorStyle ? col(b.colorStyle) : bookHex_(b.color)) || '#000000']; };
  const tabs = [];
  (J.sheets || []).forEach(sh => {
    const pr = sh.properties || {}, title = String(pr.title || ''); if (pr.hidden || /^_/.test(title)) return;
    const D = (sh.data || [])[0] || {}, RD = (D.rowData || []).slice(0, 400);
    const cell = (i, j) => ((RD[i] || {}).values || [])[j] || {};
    const M = (sh.merges || []).map(m => [m.startRowIndex || 0, m.startColumnIndex || 0, (m.endRowIndex || 0) - (m.startRowIndex || 0), (m.endColumnIndex || 0) - (m.startColumnIndex || 0)]);
    const anc = {}, cov = {}; M.forEach(([r, c, rs, cs]) => { anc[r + ',' + c] = [rs, cs]; for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) if (i !== r || j !== c) cov[i + ',' + j] = 1; });
    const white = c => !c || bookHex_(c) === '#ffffff';
    let R1 = 0, C1 = 0;
    RD.forEach((row, i) => (row.values || []).forEach((v, j) => { const ef = v.effectiveFormat || {}, b = ef.borders || {};
      if ((v.formattedValue || '') !== '' || !white(ef.backgroundColor) || ['top', 'right', 'bottom', 'left'].some(s => bw(b[s]))) { R1 = Math.max(R1, i + 1); C1 = Math.max(C1, j + 1); } }));
    M.forEach(([r, c, rs, cs]) => { if (r < 400) { R1 = Math.max(R1, Math.min(400, r + rs)); C1 = Math.max(C1, c + cs); } });
    C1 = Math.min(C1, 60);
    const cells = [];
    for (let i = 0; i < R1; i++) for (let j = 0; j < C1; j++) {
      if (cov[i + ',' + j]) continue;
      const [rs, cs] = anc[i + ',' + j] || [1, 1], v = cell(i, j), ef = v.effectiveFormat || {};
      const bT = bw((ef.borders || {}).top), bL = bw((ef.borders || {}).left), bR = bw(((cell(i, j + cs - 1).effectiveFormat || {}).borders || {}).right), bB = bw(((cell(i + rs - 1, j).effectiveFormat || {}).borders || {}).bottom);
      const val = String(v.formattedValue == null ? '' : v.formattedValue), bg = white(ef.backgroundColor) ? '' : bookHex_(ef.backgroundColor);
      if (val === '' && !bg && !bT && !bL && !bR && !bB && rs === 1 && cs === 1) continue;
      const base = tf(ef.textFormat, {}), f = Object.assign({}, base, { bg, ha: ef.horizontalAlignment === 'CENTER' ? 'C' : ef.horizontalAlignment === 'RIGHT' ? 'R' : 'L', va: ef.verticalAlignment === 'TOP' ? 'T' : ef.verticalAlignment === 'MIDDLE' ? 'M' : 'B', w: ef.wrapStrategy === 'WRAP' ? 1 : 0, bd: [bT, bR, bB, bL] });
      const runs = (v.textFormatRuns || []).map(q => [q.startIndex || 0, tf(q.format, base)]);
      cells.push([i, j, Math.min(rs, R1 - i), Math.min(cs, C1 - j), val, f, runs.length > 1 || (runs.length === 1 && runs[0][0] > 0) ? runs : null]);
    }
    const cw = [], rh = []; for (let j = 0; j < C1; j++) cw.push(((D.columnMetadata || [])[j] || {}).pixelSize || 100); for (let i = 0; i < R1; i++) rh.push(((D.rowMetadata || [])[i] || {}).pixelSize || 21);
    tabs.push({ gid: pr.sheetId, title, index: pr.index || 0, cw, rh, cells });
  });
  tabs.sort((x, y) => x.index - y.index);
  return { ok: true, url: bookSheetUrl_(id), tabs: tabs.slice(0, BOOK_TABS_MAX) };
}
/** 미리보기 · 시트에서 숨길 항목 저장 */
function pvHideSave(token, h) {
  const a = adm_(token); need_(a, 'act');
  const cl = (L, n) => [...new Set((Array.isArray(L) ? L : []).map(x => String(x).slice(0, 40)))].slice(0, n);
  const v = { f: cl(h && h.f, 10).filter(x => ['en', 'tg', 'sub', 'desc', 'note', 'meal'].includes(x)), r: cl(h && h.r, 80), t: cl(h && h.t, 3).filter(x => ['t', 'o', 'c'].includes(x)) };
  const lock = lock_();
  try { const sh = actSheets_(); const r = rows_(SH.ACTCFG).find(x => String(x['항목']) === 'pvHide'); if (r) sh.cfg.getRange(r._row, 2).setValues([[JSON.stringify(v)]]); else sh.cfg.appendRow(['pvHide', JSON.stringify(v)]); log_(a.name, '프로그램북 숨길 항목', JSON.stringify(v)); } finally { lock.releaseLock(); }
  return progBuild_();
}
/** 미리보기 (교사 일정 › 프로그램표 › 미리보기) — 시트에 쓰지 않음 */
function progPreview(token) {
  const a = adm_(token); if (!a.sup && !a.perms.act) throw new Error('교사 일정 권한이 있어야 볼 수 있어요.');
  return progBuild_();
}
function exportProgram(token) {
  const a = adm_(token); if (!a.sup && !a.perms.act) throw new Error('교사 일정 권한이 있어야 보낼 수 있어요.');
  const P = progBuild_(), C = camp_();
  let ss = null, id = setting_('프로그램표 시트');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(C.base.name + ' 프로그램표 (관리자에서 보내면 덮어씀)');
    ensureSettings_(); const st = SpreadsheetApp.getActive().getSheetByName('설정'); const r = rows_('설정').find(x => String(x['항목']) === '프로그램표 시트');
    if (r) st.getRange(r._row, 2).setValues([[ss.getId()]]); else st.appendRow(['프로그램표 시트', ss.getId(), '교사 일정 › 구글 시트로 보내기 결과 파일 (지우면 새로 만듦)']);
  }
  const tabs = [];
  const fresh = name => { let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name); else { sh.clear(); try { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); } catch (x) {} } tabs.push(name); return sh; };
  P.days.forEach(D => {
    const { V, F, W } = D, sh = fresh(D.name);
    sh.getRange(1, 1, V.length, W).setValues(V);
    sh.getRange(1, 1, V.length, W).setWrap(true).setVerticalAlignment('top').setFontSize(10);
    sh.getRange(1, 1, 1, W).merge().setFontColor('#b4423a'); sh.getRange(2, 1, 1, W).merge().setFontWeight('bold').setFontSize(13);
    sh.getRange(3, 1, 2, W).setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(3, 1, V.length - 2, W).setBorder(true, true, true, true, true, true, '#c9d3d7', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(5, 1, Math.max(1, V.length - 4), 1).setFontWeight('bold');
    sh.getRange(1, 1, V.length, W).setBackgrounds(F.map(r => r.map(x => x || '#ffffff')));
    D.meals.forEach(r => sh.getRange(r + 1, 2, 1, W - 1).merge().setHorizontalAlignment('center'));
    sh.setColumnWidth(1, 90); for (let k = 2; k <= W; k++) sh.setColumnWidth(k, 150);
    sh.setFrozenRows(4); sh.setFrozenColumns(1);
  });
  const TV = P.teachers, ts = TV ? fresh('참가교사') : null;
  if (ts) ts.getRange(1, 1, TV.length, 3).setValues(TV); if (ts) { ts.getRange(1, 1, 1, 3).setFontWeight('bold'); ts.setColumnWidth(1, 160); ts.setColumnWidth(3, 420); ts.setFrozenRows(1); }
  if (P.orch && P.orch.length) {
    const OW = Math.max(2, ...P.orch.map(r => r.v.length)), OV = P.orch.map(r => r.v.concat(Array(OW - r.v.length).fill(''))), os = fresh('오케 명단');
    os.getRange(1, 1, OV.length, OW).setValues(OV);
    P.orch.forEach((r, i) => { if (r.k === 'h') os.getRange(i + 1, 1, 1, OW).merge().setFontWeight('bold').setFontSize(12).setBackground('#fdf3e1'); if (r.k !== 'b') os.getRange(i + 1, 1).setFontWeight('bold'); });
    os.setColumnWidth(1, 110); for (let k = 2; k <= OW; k++) os.setColumnWidth(k, 100);
  }
  (P.concerts || []).forEach(K => {
    const R = K.rows, sh = fresh(String('음악회 ' + K.name).replace(/[\/\\?*:\[\]]/g, '.').slice(0, 90));
    sh.getRange(1, 1, R.length, 3).setValues(R.map(r => r.v.concat(['', '', '']).slice(0, 3)));
    sh.getRange(1, 1, R.length, 3).setWrap(true).setVerticalAlignment('top').setFontSize(10);
    R.forEach((r, i) => { if (r.k === 't') sh.getRange(i + 1, 2).setFontWeight('bold').setFontSize(14); if (r.k === 'i') sh.getRange(i + 1, 1, 1, 2).setFontWeight('bold'); if (r.k === 'j' && R[i - 1] && R[i - 1].k === 'i') sh.getRange(i + 1, 2).setFontColor('#555555'); });
    sh.setColumnWidth(1, 40); sh.setColumnWidth(2, 340); sh.setColumnWidth(3, 340);
  });
  // 처음 만들 때 생긴 빈 「시트1」 · 숨기기로 바꾼 탭(참가교사 · 오케 명단 · 음악회) 지우기
  ss.getSheets().forEach(s => { const n = s.getName(); if (tabs.includes(n) || ss.getSheets().length <= 1) return; if (s.getLastRow() === 0 || n === '참가교사' || n === '오케 명단' || /^음악회 /.test(n)) ss.deleteSheet(s); });
  log_(a.name, '프로그램표 보냄', tabs.length + '탭');
  return { ok: true, url: ss.getUrl(), tabs };
}

/* ---------------- 담당자 · 권한 (「담당자」 시트) ----------------
 * 관리자 아이디·비밀번호 = 총관리자 (모든 메뉴 + 캠프 설정 + 담당자)
 * 담당자 = 교사 회원 중에서 골라 메뉴마다 편집 / 보기 / 없음 → 관리자 화면에 이름 + 휴대전화로 로그인 */
const STAFF = '담당자';
const STAFF_HEAD = ['교사ID', '이름', '학원', '권한', '사용', '메모', '바꾼 날'];
const ADMIN_TABS = [['home', '한눈에'], ['subs', '접수 · 입금 확인'], ['rp', '입금 신고'], ['cx', '취소 · 환불'], ['ens', '앙상블'], ['aud', '음원 심사'], ['prof', '교수진'], ['act', '교사 일정'], ['tt', '개인레슨'], ['room', '방 배정'], ['con', '오후음악회'], ['mcs', '마스터클래스'], ['meal', '식권'], ['book', '행사 책자'], ['stat', '통계'], ['q', '게시판'], ['ntc', '공지사항'], ['schol', '장학금'], ['mem', '회원 명단'], ['bplan', '예산 계획'], ['bset', '결산']];
function staff_() {
  return rows_(STAFF).filter(r => r['교사ID']).map(r => { let p = {}; try { p = JSON.parse(String(r['권한'] || '{}')); } catch (x) {}
    return { tid: String(r['교사ID']), name: String(r['이름']), acad: String(r['학원'] || ''), perms: p, on: String(r['사용'] || '예') !== '아니오', memo: String(r['메모'] || '') }; });
}
function needSup_(a) { if (!a.sup) throw new Error('총관리자만 할 수 있어요.'); }
/** 그 메뉴를 「편집」할 수 있는지 (여러 메뉴 중 하나라도 되면 통과) */
function need_(a, tabs) {
  if (a.sup) return;
  if (![].concat(tabs).some(t => a.perms[t] === '편집')) throw new Error('이 메뉴는 보기만 할 수 있어요. 바꾸려면 총관리자에게 「편집」 권한을 받아 주세요.');
}
/** 담당 선생님 로그인 (10-31): 첫 칸에 이메일(@)이 오면 회원관리 계정(이메일 · 비밀번호), 아니면 이름 + 휴대전화(로그인 방식이 「회원관리 계정」이면 막음) */
function staffMode() { return { pw: !!memberSheetId_(), phone: !pwMode_() }; }
function staffLogin(name, phone) {
  const C = CacheService.getScriptCache(), fails = +C.get('stf_fail') || 0;
  if (fails >= 15) return { ok: false, msg: '여러 번 틀려서 5분 동안 잠겼어요. 잠시 뒤 다시 해 주세요.' };
  let t;
  if (String(name || '').indexOf('@') > 0) {
    if (!memberSheetId_()) return { ok: false, msg: '회원관리 계정 로그인이 아직 꺼져 있어요(설정 「회원관리 시트」). 이름 + 휴대전화로 들어와 주세요.' };
    try { t = acctCheck_(name, phone); } catch (e) { C.put('stf_fail', String(fails + 1), 300); return { ok: false, msg: e.message }; }
  } else {
    if (pwMode_()) return { ok: false, msg: '회원관리 이메일 · 비밀번호로 들어와 주세요.' };
    const ph = String(phone || '').replace(/\D/g, ''), nm = bare_(name);
    if (!nm || ph.length < 10) return { ok: false, msg: '이름과 휴대전화를 모두 넣어 주세요.' };
    t = teachers_().find(x => bare_(x.name) === nm && x.p4 && ph.endsWith(x.p4));
  }
  const s = t && staff_().find(x => x.tid === t.id && x.on);
  if (!s) { C.put('stf_fail', String(fails + 1), 300); Utilities.sleep(600); return { ok: false, msg: t ? '담당자로 등록되지 않았어요. 총관리자에게 문의해 주세요.' : '회원 명단의 이름·휴대전화와 맞지 않아요.' }; }
  C.remove('stf_fail');
  const token = Utilities.getUuid();
  C.put('adm_' + token, JSON.stringify({ name: t.name, staff: true, tid: t.id }), 21600);
  log_('담당자 ' + t.name, '관리자 화면 로그인', '');
  return Object.assign({ ok: true, token }, adminData(token));
}
function me_(a) { return { name: a.name, sup: !!a.sup, perms: a.perms }; }
function staffData(token) {
  const a = adm_(token); needSup_(a);
  return { staff: staff_(), teachers: teachers_().filter(t => t.state !== '대기').map(t => ({ id: t.id, name: t.name, acad: t.acads.join(', '), inst: t.inst, role: t.role })), tabs: ADMIN_TABS };
}
function staffSave(token, list) {
  const a = adm_(token); needSup_(a);
  const ts = {}; teachers_().forEach(t => ts[t.id] = t);
  const keys = ADMIN_TABS.map(t => t[0]), seen = {};
  const rows = (list || []).filter(s => s && ts[s.tid] && !seen[s.tid] && (seen[s.tid] = 1)).map(s => {
    const p = {}; keys.forEach(k => { const v = (s.perms || {})[k]; if (v === '편집' || v === '보기') p[k] = v; });
    return [s.tid, ts[s.tid].name, ts[s.tid].acads.join(', '), JSON.stringify(p), s.on === false ? '아니오' : '예', String(s.memo || '').slice(0, 200), today_()];
  });
  const lock = lock_();
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(STAFF);
    if (!sh) { sh = ss.insertSheet(STAFF); sh.getRange(1, 1, 1, STAFF_HEAD.length).setValues([STAFF_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('A:A').setNumberFormat('@'); }
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, STAFF_HEAD.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, STAFF_HEAD.length).setValues(rows);
    log_(a.name, '담당자 저장', rows.length + '명');
  } finally { lock.releaseLock(); }
  return { ok: true, staff: staff_() };
}

/* ---------------- 회원관리 연동 (10-28) ----------------
 * 회원관리 「행사용 명단」 파일(학원 · 교사 · 학생 · 갱신)을 읽어 명단_교사 · 명단_학생을 통째로 다시 씀. 나머지 캠프 코드는 그대로.
 * 학생 「회비 납부일」 = 회원 자격이 유효 · 시작 전이면 그 해 납부일(없으면 자격 시작월 1일). 회원관리에 입금 신고 · 확인 대기면 「확인 중」(회원처럼 연회비 없음, 10-31). 만료 · 없음은 빈칸(→ 접수 때 연회비 추가).
 * 교사 「회비 납부일」 = 올해 납부면 납부일, 면제면 「면제」. 퇴원 학생 · 탈퇴 교사는 넣지 않음. */
function memberSrcId_() { const v = setting_('회원 명단 파일'); const m = v.match(/\/d\/([a-zA-Z0-9_-]{20,})/); return m ? m[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(v) ? v : ''); }
function memberSync_(force) {
  const id = memberSrcId_(); if (!id) return { skip: true, msg: '설정 「회원 명단 파일」이 비어 있어요.' };
  const f = SpreadsheetApp.openById(id), get = n => { const sh = f.getSheetByName(n); if (!sh || sh.getLastRow() < 1) return []; const v = sh.getDataRange().getDisplayValues(), h = v[0]; return v.slice(1).map(r => { const o = {}; h.forEach((k, j) => o[k] = r[j]); return o; }); };
  const stamp = (get('갱신')[0] || {})['만든 때'] || '', P = PropertiesService.getScriptProperties();
  if (!force && stamp && stamp === P.getProperty('memberStamp')) return { same: true, at: stamp };
  const an = {}; get('학원').forEach(a => an[a['학원ID']] = a['학원명']);
  const T = get('교사').filter(t => t['교사ID'] && t['상태'] !== '탈퇴').map(t => {
    const paid = t['올해회비'] === '면제' ? '면제' : t['올해회비'] === '납부' ? (t['올해납부일'] || '납부') : '';
    return [t['교사ID'], t['이름'], t['회원구분'] === '외부인' || /^X/.test(String(t['교사ID'])) ? '관계자' : (t['직급'] || '강사'), t['전공'] || '', String(t['휴대전화'] || '').replace(/\D/g, '').slice(-4), ['학원1', '학원2', '학원3'].map(k => an[t[k]] || '').filter(Boolean).join(', '), paid, +t['올해부과'] || 0, '승인', t['회원구분'] || '', t['계좌'] || '', t['주민번호'] || '', t['소득구분'] || ''];
  });
  const S = get('학생').filter(s => s['학생ID'] && s['학원명'] && s['상태'] !== '퇴원').map(s => {
    const ok = s['자격상태'] === '유효' || s['자격상태'] === '시작 전', wait = !ok && s['회비확인대기'] === '예';   /* 확인 대기 = 회원처럼 접수 (10-31) */
    return [s['학생ID'], s['학생ID'], s['이름'], s['구분글자'] || '', s['학원명'], s['전공'] || '', s['출생연도'] || '', s['담당교사명'] || '', ok ? (s['올해납부일'] || (s['자격시작'] ? s['자격시작'] + '-01' : '납부')) : wait ? '확인 중' + (s['회비신고일'] ? ' ' + s['회비신고일'] : '') : ''];
  });
  const ss = SpreadsheetApp.getActive();
  const put = (name, head, rows) => {
    let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
    if (!P.getProperty('memberBackup_' + name) && sh.getLastRow() > 1) { const b = sh.copyTo(ss); b.setName(name + '_이전(' + Utilities.formatDate(new Date(), TZ, 'MMdd') + ')'); P.setProperty('memberBackup_' + name, b.getName()); }
    sh.clearContents(); const data = [head].concat(rows); sh.getRange(1, 1, data.length, head.length).setNumberFormat('@').setValues(data); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  };
  const lock = lock_();
  try {
    put(SH.T, ['ID', '이름', '직급', '악기', '휴대전화 뒤 4자리', '소속 학원', '회비 납부일', '연회비', '상태', '회원구분', '계좌', '주민번호', '소득구분'], T);
    put(SH.S, ['ID', '고유번호', '이름', '구분 표시', '학원', '악기', '출생연도', '담당 교사', '회비 납부일'], S);
  } finally { lock.releaseLock(); }
  P.setProperty('memberStamp', stamp); P.setProperty('memberSyncAt', stamp_());
  log_('회원관리 연동', '명단 맞춤', '교사 ' + T.length + ' · 학생 ' + S.length + ' · 회원관리 ' + stamp);
  return { ok: true, at: stamp, t: T.length, s: S.length };
}
function memberSyncTick() { try { repriceTick_(); } catch (e) { Logger.log('차수 다시 셈: ' + e.message); } try { memberSync_(false); } catch (e) { Logger.log('회원관리 연동: ' + e.message); } try { memberReport_(); } catch (e) { Logger.log('회원관리 보고: ' + e.message); } try { campRegister_(); } catch (e) { Logger.log('회원관리 캠프 등록: ' + e.message); } }
/** 회원관리 설정 「캠프 시트」에 이 캠프 접수 시트를 적어 둠 (11-01) → 회원관리 통장 탭이 캠프 행사(27W)를 저절로 연결. 바뀐 때만 씀 */
function campRegister_() {
  const mid = memberSheetId_(); if (!mid) return { skip: true };
  const sh = SpreadsheetApp.openById(mid).getSheetByName('설정'); if (!sh) return { skip: true };
  const me = SpreadsheetApp.getActive().getId(), v = sh.getDataRange().getDisplayValues(), i = v.findIndex(r => String(r[0]).trim() === '캠프 시트');
  if (i >= 0 && String(v[i][1]).trim() === me) return { same: true };
  if (i >= 0) sh.getRange(i + 1, 2).setValue(me); else sh.appendRow(['캠프 시트', me, '캠프 접수 시트 ID — 캠프가 회원관리와 연동할 때 저절로 적음 (통장 › 캠프 입금 맞추기)']);
  return { set: me };
}
/** 관리자(총관리자): 지금 불러오기 + 5분마다 자동 켜기 */
function memberSyncNow(token) {
  const a = adm_(token); needSup_(a);
  try { if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'memberSyncTick')) ScriptApp.newTrigger('memberSyncTick').timeBased().everyMinutes(5).create(); } catch (e) { }
  const r = memberSync_(true); if (r.skip) throw new Error(r.msg);
  try { r.report = memberReport_(); } catch (e) { r.report = { err: e.message }; }
  try { r.camp = campRegister_(); } catch (e) { r.camp = { err: e.message }; }
  return Object.assign({ ok: true }, r, memberData(token));
}
function memberInfo_() { const P = PropertiesService.getScriptProperties(); return { src: !!memberSrcId_(), stamp: P.getProperty('memberStamp') || '', at: P.getProperty('memberSyncAt') || '', rep: !!memberSheetId_(), repAt: P.getProperty('memberRepAt') || '', repN: +(P.getProperty('memberRepN') || 0) }; }
/* ---------------- 캠프 → 회원관리 보고 (10-31) ----------------
 * 5분마다(memberSyncTick) 이번 캠프의 참가 · 연회비 입금 확인을 회원관리 시트 「행사보고」 탭에 줄로 보냄. 회원관리는 그 줄을 읽어
 * 「참가이력」 · 「연회비」에 반영함(행사 앱은 회원관리 표를 직접 고치지 않음). 보낸 내용은 이 시트 「회원관리보고」에 남겨 두고, 바뀐 것만 다시 보냄.
 *  - 참가: 회원 번호가 있는 사람(교사 T · 외부인 X · 학생 S)만. 상태 = 참가 · 취소 요청 · 취소 · 빠짐(접수에서 지움)
 *  - 회비: 연회비가 붙은 사람의 입금이 확인되면(입금확인액 > 0) 그 연회비 금액 · 입금일. 확인을 지우면 「취소」로 다시 보냄.
 *  - 캠프에서 받은 연회비는 회원관리에 납부로 남아도 이 접수의 청구액에서 빼지 않음(recalc_ 가 이 표를 봄 → 차액 환불이 생기지 않게). */
const REP_SH = '회원관리보고', REP_HEAD = ['키', '종류', '대상', 'ID', '이름', '값', '보낸 때'];
const INBOX = '행사보고', INBOX_HEAD = ['보고ID', '보낸때', '보낸곳', '종류', '대상', 'ID', '이름', '값', '처리', '처리일', '처리메모'];
function memKey_(k) { let m = String(k || '').match(/^t_([TX]\d{4,})$/); if (m) return { t: '교사', id: m[1] }; m = String(k || '').match(/^(S\d{4,})$/); return m ? { t: '학생', id: m[1] } : null; }
function repSent_() {
  const o = {}; rows_(REP_SH).forEach(r => { const k = String(r['키'] || ''); if (k) o[k] = { kind: String(r['종류']), t: String(r['대상']), id: String(r['ID']), name: String(r['이름']), val: String(r['값'] || ''), at: String(r['보낸 때'] || ''), row: r._row }; });
  return o;
}
/** 캠프가 받은 연회비(회원관리에 보낸 것) — 참가자ID 목록. recalc_ 에서 이 사람은 회원관리에 납부로 보여도 연회비를 그대로 둠 */
function duesViaCamp_() { const o = {}; try { Object.values(repSent_()).forEach(x => { if (x.kind !== '회비') return; try { const v = JSON.parse(x.val); if (!v.취소 && v.참가자ID) o[v.참가자ID] = 1; } catch (e) { } }); } catch (e) { } return o; }
function repWant_() {
  const c = camp_(), ev = (c.base.name || CAMP_NAME) + ' (' + (c.base.id || CAMP_ID) + ')', yr = String(c.base.start || '').slice(0, 4), per = c.base.start + '~' + c.base.end, out = {};
  loadSubs_().forEach(sb => { if (sb.fake || sb.acad === GUEST_ACAD) return; (sb.ppl || []).forEach(p => {
    const m = memKey_(p.id.slice(sb.no.length + 1)); if (!m) return;
    const st = p.status === '취소' ? '취소' : p.status === '취소요청' ? '취소 요청' : '참가', pk = '참가|' + m.t + '|' + m.id, cur = out[pk];
    if (!cur || (cur.v.상태 !== '참가' && st === '참가')) out[pk] = { kind: '참가', t: m.t, id: m.id, name: p.name, v: { 행사: ev, 년도: yr, 기간: per, 역할: p.type || '', 상태: st, 메모: sb.no + ' · ' + sb.acad } };
    if ((+p.dues || 0) > 0 && (+p.paidAmt || 0) > 0) out['회비|' + m.t + '|' + m.id] = { kind: '회비', t: m.t, id: m.id, name: p.name, v: { 행사: ev, 금액: +p.dues, 입금일: (p.rep && p.rep.ok) || today_(), 접수번호: sb.no, 참가자ID: p.id } };
  }); });
  return out;
}
function memberReport_() {
  const mid = memberSheetId_(); if (!mid) return { skip: true };
  const lock = lock_();
  try {
    const want = repWant_(), sent = repSent_(), send = [];
    Object.keys(want).forEach(k => { const w = want[k], val = JSON.stringify(w.v); if (!sent[k] || sent[k].val !== val) send.push({ k, kind: w.kind, t: w.t, id: w.id, name: w.name, val }); });
    Object.keys(sent).forEach(k => { if (want[k]) return; const x = sent[k]; let v = {}; try { v = JSON.parse(x.val); } catch (e) { }
      if (x.kind === '회비') { if (v.취소) return; v.취소 = true; } else { if (v.상태 === '빠짐') return; v.상태 = '빠짐'; }
      send.push({ k, kind: x.kind, t: x.t, id: x.id, name: x.name, val: JSON.stringify(v) }); });
    if (!send.length) return { n: 0 };
    const at = stamp_(), from = '캠프 ' + (camp_().base.id || CAMP_ID);
    const mf = SpreadsheetApp.openById(mid); let ib = mf.getSheetByName(INBOX);
    if (!ib) { ib = mf.insertSheet(INBOX); ib.getRange(1, 1, 1, INBOX_HEAD.length).setValues([INBOX_HEAD]).setFontWeight('bold').setBackground('#e9eef0'); ib.setFrozenRows(1); }
    const rows = send.map((x, i) => ['R' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + String(Math.floor(Math.random() * 900) + 100) + String(i).padStart(3, '0'), at, from, x.kind, x.t, x.id, x.name, x.val, '', '', '']);
    ib.getRange(ib.getLastRow() + 1, 1, rows.length, INBOX_HEAD.length).setNumberFormat('@').setValues(rows);
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(REP_SH);
    if (!sh) { sh = ss.insertSheet(REP_SH); sh.getRange(1, 1, 1, REP_HEAD.length).setValues([REP_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
    const add = [];
    send.forEach(x => { const r = [x.k, x.kind, x.t, x.id, x.name, x.val, at]; if (sent[x.k]) sh.getRange(sent[x.k].row, 1, 1, REP_HEAD.length).setNumberFormat('@').setValues([r]); else add.push(r); });
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, REP_HEAD.length).setNumberFormat('@').setValues(add);
    const P = PropertiesService.getScriptProperties(); P.setProperty('memberRepAt', at); P.setProperty('memberRepN', String(Object.keys(want).length));
    log_('회원관리 보고', '보냄', send.length + '줄 (참가 ' + send.filter(x => x.kind === '참가').length + ' · 회비 ' + send.filter(x => x.kind === '회비').length + ')');
    return { n: send.length };
  } finally { lock.releaseLock(); }
}
/** 설정 › 회원 명단: 명단_교사 · 명단_학생 전체 + 이번 캠프 접수 여부 (취소 뺌). 휴대전화 · 생일 같은 건 보내지 않음 */
function memberData(token) {
  const a = adm_(token); if (!a.sup && !a.perms.mem) throw new Error('회원 명단을 볼 권한이 없어요.');
  const on = {}; loadSubs_().forEach(sb => sb.ppl.forEach(p => { if (p.status === '취소') return; const k = p.id.slice(sb.no.length + 1); on[k] = on[k] || { no: sb.no, type: p.type || '', acad: sb.acad }; }));
  const T = teachers_().map(t => ({ id: t.id, name: t.name, acad: t.acads.join(', '), inst: t.inst, role: t.role, state: t.state, on: on['t_' + t.id] || null }));
  const S_ = rows_(SH.S).filter(r => r['ID']).map(r => ({ id: String(r['ID']), name: String(r['이름']), acad: String(r['학원'] || ''), inst: String(r['악기'] || ''), teacher: String(r['담당 교사'] || ''), on: on[String(r['ID'])] || null }));
  return { teachers: T, students: S_, sync: memberInfo_() };
}
/* ---------------- 테스트용 가상 접수 (총관리자 · 캠프 설정 맨 아래 버튼) ----------------
 * 「가상○○스즈키」 학원으로 교사 · 학생 접수를 만듦. 이름은 무작위 조합(실제 회원 아님) · 입금 전 · 연회비 없음. sb.fake = true
 * 지우기: fake 표시가 있는 접수와 그 참가자 줄만 지움 (진짜 접수는 건드리지 않음) */
function devFakeSubs(token, nT, nS) {
  const a = adm_(token); needSup_(a);
  nT = Math.max(0, Math.min(200, +nT || 0)); nS = Math.max(0, Math.min(600, +nS || 0));
  const NA = ['하늘', '바다', '숲', '별', '달', '구름', '나무', '강', '산', '들', '해', '빛', '꽃', '봄', '솔', '샘', '물', '돌', '길', '섬'];
  const per = 3, nA = Math.max(1, Math.ceil(nT / per));
  let seed = Date.now() % 2147483647; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647; const pick = L => L[Math.floor(rnd() * L.length)];
  const SUR = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배'.split(''), G = '가나다라마바사아자서민지수현준윤하은도예시유채소연태주우진건희아린결온솔별빛봄'.split('');
  const used = {}; const nm = () => { for (let i = 0; i < 500; i++) { const n = pick(SUR) + pick(G) + pick(G); if (!used[n]) { used[n] = 1; return n; } } return '가상' + Date.now(); };
  const INST = ['바이올린', '바이올린', '바이올린', '첼로', '플루트'];
  const PROG = { 바이올린: ['Pre-Twinkle', '1권A 작은별 변주곡 ~ 무궁동', '1권B 알레그레토 ~', '2권A 요정의 춤 ~', '2권B 미뇽의 가보트 ~', '3권', '4권A ~ 자이츠 5번 3악장', '4권B 비발디 협주곡 가단조 ~', '5권', '6권', '7권', '8권 전체', '9권', '10권 이상'], 첼로: ['1권', '2권', '3권', '4권', '5권', '6권 이상'], 플루트: ['1권', '2권', '3권', '4권 이상'] };
  const prof = profs_().filter(p => p.on && p.lesson);
  const lock = lock_(); const made = [];
  try {
    const all = loadSubs_(); let n = all.reduce((m, x) => Math.max(m, +String(x.no).split('-')[1] || 0), 0);
    let tLeft = nT, sLeft = nS;
    for (let ai = 0; ai < nA; ai++) {
      const acad = '가상' + NA[ai % NA.length] + (ai >= NA.length ? Math.floor(ai / NA.length) + 1 : '') + '스즈키';
      const tc = Math.min(per, tLeft), sc = ai === nA - 1 ? sLeft : Math.min(sLeft, Math.ceil(nS / nA)); tLeft -= tc; sLeft -= sc;
      if (!tc && !sc) continue;
      n++; const no = camp_().base.id + '-' + String(n).padStart(3, '0'), at = stamp_();
      const info = {}, picked = {}, ppl = [];
      const T = []; for (let k = 0; k < Math.max(1, tc); k++) T.push({ n: nm(), inst: k === 0 ? '바이올린' : pick(INST) });
      if (tc) T.forEach((t, k) => { const key = 't_fk' + n + '_' + k; picked[key] = true; info[key] = { type: '교사', gender: rnd() < .8 ? '여' : '남', concert: '없음' };
        ppl.push({ id: no + '_' + key, name: t.n, kind: '교사', type: '교사', inst: t.inst, status: '정상', addAt: at, batch: 1 }); });
      for (let k = 0; k < sc; k++) { const t = T[k % T.length], key = 'fk' + n + '_' + k, P = PROG[t.inst] || PROG['바이올린'];
        const pp = prof.filter(p => p.inst === t.inst).map(p => p.name), les = pp.length && rnd() < .45 ? 1 + Math.floor(rnd() * 3) : 0;
        picked[key] = true; info[key] = { type: '학생', gender: rnd() < .5 ? '여' : '남', by: String(2012 + Math.floor(rnd() * 9)), teacher: t.n, prog: pick(P), lessons: les, p1: les ? pick(pp) : '', p2: les && rnd() < .5 ? pick(pp) : '', concert: rnd() < .25 ? '오후' : '없음' };
        ppl.push({ id: no + '_' + key, name: nm(), kind: '학생', type: '학생', inst: t.inst, status: '정상', addAt: at, batch: 1 }); }
      const sb = { no, acad, owner: T[0].n, fake: true, createdAt: at, date: at.slice(0, 10), email: '', rev: 1, form: { ri: 0, picked, info, extra: [], fam: [], room: {}, join: {}, ens: { on: false } }, ppl };
      sb.ppl.forEach(p => { p.pay = '전'; p.paidAmt = 0; });
      recalc_(sb); sb.ppl.forEach(p => p.dues = 0);   /* 가상 회원은 연회비 없음 */
      writeSub_(sb, true); made.push(no);
    }
    log_(a.name, '가상 접수 만듦', made.join(', '));
  } finally { lock.releaseLock(); }
  return { ok: true, made, adm: adminData(token) };
}
/** STG 예시 (11-14): 가상 접수(fake)에 방 요청 예시를 넣음 — 일반 방 요청(rnote) 절반쯤 · 가족방이 있으면 가족방 요청(rreq) 절반쯤. 진짜 접수는 건드리지 않음 */
function devFakeRoomReq(token) {
  const a = adm_(token); needSup_(a);
  let seed = Date.now() % 2147483647; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647; const pick = L => L[Math.floor(rnd() * L.length)];
  const GEN = ['{A}와 같은 층으로 붙여 주세요', '침대방 꼭 부탁드려요. 저학년이 많아요', '남학생 3명은 남학생끼리 방 주세요', '{A} 선생님들과 옆방이면 좋겠어요', '선생님 방은 학생 방 가까이 반드시 붙여 주세요',
    '엘리베이터 가까운 낮은 층이면 좋겠어요', '조용한 방 부탁드립니다', '작년처럼 {A}와 같이 쓰고 싶어요', '여학생 방은 온돌방이면 좋겠어요', '{A}와 꼭 같은 층 부탁드려요. 연습을 같이 해요'];
  const FAM = ['아기 침대 꼭 필요해요', '{A} 가족과 같은 층이면 좋겠어요', '할머니가 다리가 불편하셔서 낮은 층 반드시 부탁드려요', '침대방 원해요', '유모차 때문에 엘리베이터 가까운 방이면 좋겠어요',
    '15개월 아기가 있어서 조용한 방 부탁드려요', '{A} 가족과 옆방 꼭 부탁드려요', '온돌방이면 좋겠어요'];
  const lock = lock_(); let nG = 0, nF = 0;
  try {
    const all = loadSubs_(), fk = all.filter(sb => sb.fake && sb.ppl.some(p => p.status !== '취소'));
    if (!fk.length) return { ok: false, msg: '가상 접수가 없어요. 설정 › 시험 도구에서 「여름캠프 규모로 가상 접수」를 먼저 만들어 주세요 (가족방도 같이 생겨요).' };
    const acads = [...new Set(fk.map(sb => sb.acad))];
    const other = me => { const L = acads.filter(x => x !== me); return L.length ? pick(L) : me; };
    fk.forEach(sb => {
      const f = sb.form = sb.form || {}; let ch = false;
      if (rnd() < 0.55) { f.rnote = pick(GEN).replace('{A}', other(sb.acad)); nG++; ch = true; }
      const rooms = Object.keys(f.room || {}).filter(k => f.room[k]);
      if (rooms.length) { f.rreq = f.rreq || {}; rooms.forEach(k => { if (rnd() < 0.6) { f.rreq[k] = pick(FAM).replace('{A}', other(sb.acad)); nF++; ch = true; } }); }
      if (ch) { sb.rev = (+sb.rev || 0) + 1; recalc_(sb); writeSubRow_(sb, false); }
    });
    log_(a.name, '방 요청 예시 넣음', '일반 ' + nG + ' · 가족방 ' + nF);
  } finally { lock.releaseLock(); }
  return { ok: true, nG, nF, adm: adminData(token) };
}
function devFakeClear(token) {
  const a = adm_(token); needSup_(a);
  const lock = lock_(); let k = 0;
  try {
    const fk = loadSubs_().filter(sb => sb.fake).map(sb => sb.no); if (!fk.length) return { ok: true, n: 0, adm: adminData(token) };
    const ss = SpreadsheetApp.getActive();
    [[SH.SUB, '접수번호'], [SH.P, '접수번호']].forEach(([name, col]) => { const sh = ss.getSheetByName(name); rows_(name).filter(r => fk.includes(String(r[col]))).map(r => r._row).sort((x, y) => y - x).forEach(r => { sh.deleteRow(r); k++; }); });
    log_(a.name, '가상 접수 지움', fk.join(', '));
  } finally { lock.releaseLock(); }
  return { ok: true, n: k, adm: adminData(token) };
}
/** 여름캠프 규모 가상 접수 (11-03, STG 시험용): 2026 여름캠프 입금확인 자료의 학원 수 · 학원별 인원 · 비율을 따라
 *  가상 학원 68곳 · 약 530명(교사 23% · 학생 59% · 가족 18%)을 만듦. 악기 · 진도 · 음악회 · 레슨 · 마스터클래스 · 가족방 · 차수 · 입금(확인 · 신고 · 전) · 취소를 섞음.
 *  모두 가상 표시(sb.fake · sb.summer) → 「가상 접수 모두 지우기」로 지움. 이름은 무작위(실제 회원 아님) */
function devSummer(token) {
  const a = adm_(token); needSup_(a);
  if (!String(setting_('테스트 로그인') || '').trim()) throw new Error('여름캠프 규모 가상 접수는 STG(설정 「테스트 로그인」이 있는 곳)에서만 만들 수 있어요.');
  if (loadSubs_().some(sb => sb.summer)) throw new Error('여름캠프 규모 가상 접수가 이미 있어요. 「가상 접수 모두 지우기」 뒤 다시 만들어 주세요.');
  const SIZES = [54, 42, 30, 25, 22, 22, 18, 18, 13, 13, 13, 13, 12, 12, 12, 11, 9, 9, 9, 9, 9, 8, 8, 8, 7, 7, 7, 6, 6, 6, 6, 6, 5, 5, 5, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const NA = ['하늘', '바다', '숲', '별', '달', '구름', '나무', '강', '산', '들', '해', '빛', '꽃', '봄', '솔', '샘', '물', '돌', '길', '섬', '노을', '바람', '이슬', '여름'];
  let seed = 20260704; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647, pick = L => L[Math.floor(rnd() * L.length)];
  const SUR = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배'.split(''), G = '가나다라마바사아자서민지수현준윤하은도예시유채소연태주우진건희아린결온솔별빛봄'.split('');
  const used = {}; const nm = () => { for (let i = 0; i < 800; i++) { const n = pick(SUR) + pick(G) + pick(G); if (!used[n]) { used[n] = 1; return n; } } return '가상' + Math.floor(rnd() * 1e6); };
  const PROG = { 바이올린: ['Pre-Twinkle', '1권A 작은별 변주곡 ~ 무궁동', '1권B 알레그레토 ~', '2권A 요정의 춤 ~', '2권B 미뇽의 가보트 ~', '3권', '4권A ~ 자이츠 5번 3악장', '4권B 비발디 협주곡 가단조 ~', '4권A ~ 자이츠 5번 3악장', '5권', '6권', '7권', '8권 전체', '10권 이상'], 첼로: ['1권', '2권', '3권', '4권', '5권', '6권'], 플루트: ['1권', '2권', '3권', '4권'] };
  const instOf = () => { const r = rnd(); return r < .8 ? '바이올린' : r < .95 ? '첼로' : '플루트'; };
  const prof = profs_().filter(p => p.on && p.lesson), mcs = mcList_(), C = camp_(), nR = (C.rounds || []).length || 1;
  const days = ['2026-10-0', '2026-10-1', '2026-10-2'], dt = () => { const d = 1 + Math.floor(rnd() * 31); return d <= 31 ? '2026-10-' + String(d).padStart(2, '0') : '2026-11-01'; };
  const chg = p => (+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0);
  const lock = lock_(); const made = [], conf = {}; let nPeople = 0;
  try {
    const all = loadSubs_(); let n = all.reduce((m, x) => Math.max(m, +String(x.no).split('-')[1] || 0), 0);
    SIZES.forEach((N, ai) => {
      const acad = '가상' + NA[ai % NA.length] + (ai >= NA.length ? String(Math.floor(ai / NA.length) + 1) : '') + '스즈키';
      const tN = Math.max(1, Math.round(N * .23)), fN = N >= 4 ? Math.round(N * .18) : 0, sN = Math.max(0, N - tN - fN);
      const T = []; for (let k = 0; k < tN; k++) T.push({ name: nm(), inst: k === 0 ? '바이올린' : instOf(), type: rnd() < .17 ? '연수생' : '교사' });
      /* 교사마다 한 접수: 그 교사 + 맡은 학생 + 그 학생 가족 */
      const groups = T.map(t => ({ t, st: [] })); for (let k = 0; k < sN; k++) groups[k % groups.length].st.push(k);
      let famLeft = fN;
      groups.forEach((g, gi) => {
        n++; const no = C.base.id + '-' + String(n).padStart(3, '0'), date = dt(), at = date + ' ' + String(9 + Math.floor(rnd() * 12)).padStart(2, '0') + ':' + String(Math.floor(rnd() * 60)).padStart(2, '0') + ':00';
        const info = {}, picked = {}, ppl = [], fam = [], room = {};
        const tk = 't_sm' + n; picked[tk] = true; info[tk] = { type: g.t.type, gender: rnd() < .85 ? '여' : '남', concert: '없음', inst: g.t.inst };
        ppl.push({ id: no + '_' + tk, name: g.t.name, kind: '교사', type: g.t.type, inst: g.t.inst, status: '정상', addAt: at, batch: 1 });
        g.st.forEach((k, j) => {
          const key = 'sm' + n + '_' + j, inst = rnd() < .7 ? g.t.inst : instOf(), pp = prof.filter(p => p.inst === inst).map(p => p.name);
          const les = pp.length && rnd() < .1 ? 1 + Math.floor(rnd() * 3) : 0, cr = rnd(), con = cr < .6 ? '오후' : cr < .64 ? '이브닝' : cr < .68 ? '트와일라잇' : '없음';
          picked[key] = true; info[key] = { type: '학생', gender: rnd() < .55 ? '여' : '남', by: String(2012 + Math.floor(rnd() * 10)), teacher: g.t.name, prog: pick(PROG[inst] || PROG['바이올린']), lessons: les, p1: les ? pick(pp) : '', p2: les && rnd() < .4 ? pick(pp) : '', mc: inst === '바이올린' && mcs.length && rnd() < .04 ? [pick(mcs).n] : [], concert: con, inst };
          const sname = nm(); ppl.push({ id: no + '_' + key, name: sname, kind: '학생', type: '학생', inst, status: '정상', addAt: at, batch: 1 });
          /* 가족: 학생 하나에 보호자(+동반가족 · 아기), 절반은 가족방 */
          if (famLeft > 0 && rnd() < .5) { const sur = sname[0], list = [['회원의 첫번째 보호자', sur + pick(G) + pick(G)]];
            if (famLeft > 1 && rnd() < .35) list.push(['회원의 그외 악기 안하는 동반가족', sur + pick(G) + pick(G)]);
            if (famLeft > 2 && rnd() < .05) list.push(['동반가족 중 15개월 미만', sur + pick(G) + pick(G)]);
            list.forEach(([type, fname], fi) => { const fk = 'fs' + n + '_' + j + '_' + fi; fam.push({ id: fk, type, name: fname, link: key }); info[fk] = { type, gender: fi === 0 ? '여' : pick(['여', '남']) };
              ppl.push({ id: no + '_' + fk, name: fname, kind: '가족', type, inst: '', status: '정상', addAt: at, batch: 1 }); famLeft--; });
            if (rnd() < .5) room[key] = true; }
        });
        const ri = rnd() < .87 ? 0 : rnd() < .75 ? Math.min(1, nR - 1) : Math.min(2, nR - 1);
        const sb = { no, acad, owner: g.t.name, fake: true, summer: true, createdAt: at, date, email: '', rev: 1, ppl, form: { ri, picked, info, extra: [], fam, room, join: {}, ens: { on: false } } };
        sb.ppl.forEach(p => { p.pay = '전'; p.paidAmt = 0; });
        recalc_(sb); sb.ppl.forEach(p => { if (p.kind !== '가족') p.dues = 0; });   /* 가상 회원은 연회비 없음 */
        /* 취소 4% (입금 전) */
        sb.ppl.forEach(p => { if (p.kind === '학생' && rnd() < .04) { p.status = '취소'; p.cxAt = at; } });
        recalc_(sb); sb.ppl.forEach(p => { if (p.kind !== '가족') p.dues = 0; });
        const live = sb.ppl.filter(p => p.status === '정상'), pr = rnd(), who = rnd() < .5 ? g.t.name : acad, rdate = date;
        if (pr < .8 && live.length) { const rows = {}; let sum = 0; live.forEach(p => { rows[p.id] = { name: who, date: rdate, a: chg(p) }; sum += chg(p); });
          const r = { id: 'R' + (Date.now() + Math.floor(rnd() * 1e6)).toString(36) + n, name: who, date: rdate, amt: sum, memo: '', ids: live.map(p => p.id), rows }; live.forEach(p => { p.pay = '신고'; p.rep = r; });
          if (pr < .65) live.forEach(p => conf[p.id] = [rdate, chg(p), '가상 (여름 규모)']); }
        writeSub_(sb, true); made.push(no); nPeople += sb.ppl.length;
      });
    });
    /* 입금 확인은 한 번에 씀 */
    const sh = SpreadsheetApp.getActive().getSheetByName(SH.P), R = rows_(SH.P), c0 = P_HEAD.indexOf(ADMIN_COLS[0]) + 1, ci = P_HEAD.indexOf('입금 상태') + 1;
    if (R.length) { const last = R[R.length - 1]._row, A = sh.getRange(2, c0, last - 1, 3).getValues(), B = ci > 0 ? sh.getRange(2, ci, last - 1, 1).getValues() : null;
      R.forEach(r => { const v = conf[String(r['참가자ID'])]; if (!v) return; A[r._row - 2] = v; if (B) B[r._row - 2] = ['확인']; });
      sh.getRange(2, c0, last - 1, 3).setValues(A); if (B) sh.getRange(2, ci, last - 1, 1).setValues(B); }
    const subs = loadSubs_(); subs.filter(x => x.summer).forEach(x => writeSubRow_(x));
    log_(a.name, '여름캠프 규모 가상 접수', made.length + '건 · ' + nPeople + '명');
  } finally { lock.releaseLock(); }
  return { ok: true, made, n: nPeople, adm: adminData(token) };
}
/** 가상스즈키 연습 접수 30건 (11-01, STG 연습용): 회원관리에서 만든 「가상스즈키」 명단으로 회원 접수 22 · 비회원 5 · 관계자 3.
 *  입금 신고 · 확인 · 부족 · 과납 · 취소 · 환불 · 이름 다름 · 날짜 다름 · 나눠 입금 · 신고 없는 입금 등을 섞고, 맞춰 볼 통장 내역을 새 구글시트로 만듦 */
const VACAD = '가상스즈키';
function devScenario(token) {
  const a = adm_(token); needSup_(a);
  if (!String(setting_('테스트 로그인') || '').trim()) throw new Error('연습 접수는 STG(설정 「테스트 로그인」이 있는 곳)에서만 만들 수 있어요.');
  const T = rows_(SH.T).filter(r => String(r['소속 학원'] || '').split(',').map(s => s.trim()).includes(VACAD)).sort((x, y) => String(x['ID']).localeCompare(String(y['ID'])));
  const ST = rows_(SH.S).filter(r => String(r['학원']) === VACAD).sort((x, y) => String(x['ID']).localeCompare(String(y['ID'])));
  if (T.length < 6 || ST.length < 60) throw new Error('캠프 명단에 가상스즈키가 아직 없어요 (교사 ' + T.length + ' · 학생 ' + ST.length + '). 회원관리 STG 「설정 › 가상스즈키 만들기」 뒤 「회원 명단 › 회원관리에서 지금 가져오기」를 눌러 주세요.');
  if (loadSubs_().some(sb => sb.vscen)) throw new Error('가상스즈키 연습 접수가 이미 있어요. 「가상 접수 모두 지우기」 뒤 다시 만들어 주세요.');
  const ok = setting_('접수 가능 학원'); if (ok !== '전체' && ok.split(',').map(s => s.trim()).indexOf(VACAD) < 0) { const sh = SpreadsheetApp.getActive().getSheetByName('설정'), r = rows_('설정').find(x => String(x['항목']) === '접수 가능 학원'); if (r) sh.getRange(r._row, 2).setValues([[ok ? ok + ', ' + VACAD : VACAD]]); }
  const PROG = { 바이올린: ['1권A 작은별 변주곡 ~ 무궁동', '2권A 요정의 춤 ~', '3권', '4권A ~ 자이츠 5번 3악장', '5권'], 첼로: ['1권', '2권', '3권'], 플루트: ['1권', '2권', '3권'] };
  const prof = profs_().filter(p => p.on && p.lesson), mcs = mcList_();
  const at = stamp_(), C = camp_(), ri = curRound_(C), bank = [], made = [], conf = [];
  const tN = i => String(T[i]['이름']), tid = i => 't_' + String(T[i]['ID']);
  const lock = lock_();
  try {
    const all = loadSubs_(); let n = all.reduce((m, x) => Math.max(m, +String(x.no).split('-')[1] || 0), 0);
    const mk = (acad, owner, list, extra) => {
      n++; const no = C.base.id + '-' + String(n).padStart(3, '0'), info = {}, picked = {}, ppl = [], fam = [], room = {};
      list.forEach((x, j) => {
        const key = x.key, inst = x.inst || '';
        info[key] = Object.assign({ type: x.type, gender: x.g || (j % 2 ? '남' : '여'), by: x.by || '', teacher: x.teacher || '', prog: x.prog || '', lessons: x.les || 0, p1: '', p2: '', mc: x.mc || [], concert: '없음', inst }, x.info || {});
        if (x.les) { const pp = prof.filter(p => p.inst === (inst || '바이올린')); info[key].p1 = pp.length ? pp[0].name : ''; if (!pp.length) info[key].lessons = 0; }
        if (x.fam) fam.push({ id: key, type: x.type, name: x.name, link: x.fam }); else picked[key] = true;
        if (x.room) room[key] = true;
        ppl.push({ id: no + '_' + key, name: x.name, dtag: '', inst, kind: x.fam ? '가족' : (/^t_|^me_/.test(key) ? '교사' : '학생'), type: x.type, status: '정상', pay: '전', paidAmt: 0, batch: 1, addAt: at });
      });
      const sb = Object.assign({ no, acad, owner, vscen: true, fake: true, createdAt: at, date: at.slice(0, 10), rev: 1, ppl, form: { ri, picked, info, extra: [], fam, room, join: {}, ens: { on: false } } }, extra || {});
      recalc_(sb); return sb;
    };
    const chg = p => (+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0);
    const rep = (sb, ps, name, date, adj) => { const rows = {}; let sum = 0; ps.forEach((p, j) => { const v = chg(p) + (j === 0 ? (adj || 0) : 0); rows[p.id] = { name, date, a: v }; sum += v; });
      const r = { id: 'R' + (Date.now() + Math.floor(Math.random() * 1e6)).toString(36), name, date, amt: sum, memo: adj ? (adj < 0 ? '일부만 먼저 보냄 (가상)' : '더 보냄 (가상)') : '', ids: ps.map(p => p.id), rows };
      ps.forEach(p => { p.pay = '신고'; p.rep = r; }); return sum; };
    const dep = (date, time, who, amt) => bank.push([date + ' ' + time + ':00', who, '', amt]);
    const out = (date, time, who, amt) => bank.push([date + ' ' + time + ':00', who, amt, '']);
    const S = i => { const r = ST[i]; return { key: String(r['ID']), name: String(r['이름']), type: '학생', inst: String(r['악기'] || '바이올린'), by: String(r['출생연도'] || '2015'), teacher: String(r['담당 교사'] || ''), prog: (PROG[String(r['악기'])] || PROG['바이올린'])[i % 3] }; };
    const Ss = (a0, a1) => { const L = []; for (let i = a0; i <= a1; i++) L.push(S(i)); return L; };
    const TT = (i, type) => ({ key: tid(i), name: tN(i), type: type || '교사', inst: String(T[i]['악기'] || '바이올린') });
    const save = (sb, note) => { writeSub_(sb, true); all.push(sb); made.push(sb.no + ' ' + note); return sb; };
    const live = sb => sb.ppl.filter(p => p.status !== '취소');
    let sb, s;
    // 1 원장 + 6명: 신고 → 통장 같음 → 캠프 확인까지 끝
    sb = mk(VACAD, tN(0), [TT(0)].concat(Ss(0, 5))); s = rep(sb, sb.ppl, VACAD, '2026-10-05'); dep('2026-10-05', '10:12', VACAD, s); save(sb, '신고 · 입금 · 확인 끝'); sb.ppl.forEach(p => conf.push([p.id, '2026-10-05', chg(p)]));
    // 2 서이든 + 4명: 신고 · 입금 같음 · 확인 전
    sb = mk(VACAD, tN(1), [TT(1)].concat(Ss(6, 9))); s = rep(sb, sb.ppl, tN(1), '2026-10-06'); dep('2026-10-06', '14:30', tN(1), s); save(sb, '신고 · 입금 같음 · 확인 전');
    // 3 문하율(첼로) + 3명: 같은 날 학생회비 2명(회원관리 신고 10-08)과 같이 입금
    sb = mk(VACAD, tN(2), [TT(2)].concat(Ss(10, 12))); s = rep(sb, sb.ppl, tN(2), '2026-10-08'); dep('2026-10-08', '09:41', tN(2), s + 60000); save(sb, '캠프 + 학생회비 2명 섞어 입금');
    // 4 배시온(플루트, 교사 회비 미납 → 교사 회비 같이 청구) + 2명
    sb = mk(VACAD, tN(3), [TT(3)].concat(Ss(13, 14))); s = rep(sb, sb.ppl, tN(3), '2026-10-10'); dep('2026-10-10', '11:05', tN(3), s); save(sb, '교사 회비 포함 청구');
    // 5 윤채아 10명 신청 · 5명 신고 · 6명분 입금
    sb = mk(VACAD, tN(4), Ss(15, 24)); s = rep(sb, sb.ppl.slice(0, 5), tN(4), '2026-10-12'); dep('2026-10-12', '16:20', tN(4), s + chg(sb.ppl[5])); save(sb, '10명 · 5명 신고 · 6명분 입금');
    // 6 원장: 학생 2 + 가족(보호자 · 동반가족 · 15개월 미만) + 가족방, 보호자 이름으로 신고 · 입금
    const k25 = String(ST[25]['ID']);
    sb = mk(VACAD, tN(0), Ss(25, 26).map((x, j) => j === 0 ? Object.assign(x, { room: true }) : x).concat([{ key: 'fv1', name: '가부모', type: '회원의 첫번째 보호자', fam: k25 }, { key: 'fv2', name: '가동생', type: '회원의 그외 악기 안하는 동반가족', fam: k25 }, { key: 'fv3', name: '가아기', type: '동반가족 중 15개월 미만', fam: k25 }]));
    s = rep(sb, sb.ppl, '가부모', '2026-10-14'); dep('2026-10-14', '20:03', '가부모', s); save(sb, '가족 · 가족방 · 보호자 이름 입금');
    // 7 서이든: 개인레슨 3번 + 마스터클래스
    sb = mk(VACAD, tN(1), [Object.assign(S(27), { les: 3, mc: mcs.length ? [mcs[0].n] : [] })]); s = rep(sb, sb.ppl, tN(1), '2026-10-15'); dep('2026-10-15', '13:15', tN(1), s); save(sb, '레슨 · 마스터클래스');
    // 8 문하율: 부족 신고(5만 원 덜)
    sb = mk(VACAD, tN(2), [S(28)]); s = rep(sb, sb.ppl, tN(2), '2026-10-16', -50000); dep('2026-10-16', '10:00', tN(2), s); save(sb, '부족 입금');
    // 9 오다인(연수생) 본인: 신고 · 입금 · 확인
    sb = mk(VACAD, tN(5), [TT(5, '연수생')]); s = rep(sb, sb.ppl, tN(5), '2026-10-17'); dep('2026-10-17', '12:40', tN(5), s); save(sb, '연수생 · 확인 끝'); sb.ppl.forEach(p => conf.push([p.id, '2026-10-17', chg(p)]));
    // 10 윤채아: 과납(2만 원 더)
    sb = mk(VACAD, tN(4), Ss(29, 30)); s = rep(sb, sb.ppl, tN(4), '2026-10-18', 20000); dep('2026-10-18', '15:55', tN(4), s); save(sb, '과납');
    // 11 원장: 신고 없이 학원 이름으로 입금 (주인 모르는 입금)
    sb = mk(VACAD, tN(0), Ss(31, 33)); dep('2026-10-19', '09:20', VACAD, live(sb).reduce((t, p) => t + chg(p), 0)); save(sb, '신고 없이 입금');
    // 12 서이든: 신고일 10-20, 통장은 10-21
    sb = mk(VACAD, tN(1), [S(34)]); s = rep(sb, sb.ppl, tN(1), '2026-10-20'); dep('2026-10-21', '08:30', tN(1), s); save(sb, '신고일과 입금일 다름');
    // 13 문하율: 신고 입금자명 「하율맘」, 통장에는 「김하율」
    sb = mk(VACAD, tN(2), Ss(35, 36)); s = rep(sb, sb.ppl, '하율맘', '2026-10-21'); dep('2026-10-21', '19:10', '김하율', s); save(sb, '입금자명 다름');
    // 14 배시온: 캠프에서 확인했는데 통장에 없음
    sb = mk(VACAD, tN(3), [S(37)]); s = rep(sb, sb.ppl, tN(3), '2026-10-22'); save(sb, '확인됐는데 통장 없음'); sb.ppl.forEach(p => conf.push([p.id, '2026-10-22', chg(p)]));
    // 15 윤채아: 1명은 입금 전 취소, 1명 신고 · 입금
    sb = mk(VACAD, tN(4), Ss(38, 39)); sb.ppl[1].status = '취소'; sb.ppl[1].cxAt = at; recalc_(sb); s = rep(sb, [sb.ppl[0]], tN(4), '2026-10-22'); dep('2026-10-22', '17:45', tN(4), s); save(sb, '1명 입금 전 취소');
    // 16 원장: 입금 · 확인 뒤 취소 요청 (환불 대기)
    sb = mk(VACAD, tN(0), [S(40)]); s = rep(sb, sb.ppl, VACAD, '2026-10-23'); dep('2026-10-23', '10:50', VACAD, s); sb.ppl[0].status = '취소요청'; sb.ppl[0].cxAt = at; sb.ppl[0].cxWhy = '독감 (가상)'; save(sb, '입금 뒤 취소 요청'); conf.push([sb.ppl[0].id, '2026-10-23', s]);
    cxRow_(sb, sb.ppl[0], '독감 (가상)', s, '');
    // 17 서이든: 입금 · 확인 뒤 취소 · 환불 끝 (통장 출금)
    sb = mk(VACAD, tN(1), [S(41)]); s = rep(sb, sb.ppl, tN(1), '2026-10-24'); dep('2026-10-24', '11:11', tN(1), s); const rf = Math.round(s * 0.9 / 1000) * 1000;
    sb.ppl[0].status = '취소'; sb.ppl[0].refund = { amt: rf, okAt: '2026-10-27', date: '2026-10-28' }; save(sb, '취소 · 환불 끝'); conf.push([sb.ppl[0].id, '2026-10-24', s]); out('2026-10-28', '14:00', tN(1) + ' 환불', rf);
    cxRow_(sb, sb.ppl[0], '이사 (가상)', rf, '환불 완료');
    // 18 문하율: 3명 미입금
    sb = mk(VACAD, tN(2), Ss(42, 44)); save(sb, '미입금');
    // 19 윤채아: 신고 한 번, 통장은 두 번에 나눠 입금
    sb = mk(VACAD, tN(4), Ss(45, 46)); s = rep(sb, sb.ppl, tN(4), '2026-10-26'); dep('2026-10-26', '09:00', tN(4), chg(sb.ppl[0])); dep('2026-10-26', '09:02', tN(4), s - chg(sb.ppl[0])); save(sb, '두 번에 나눠 입금');
    // 20 원장: 평범 (맞는 것 모두 잇기용)
    sb = mk(VACAD, tN(0), Ss(47, 48)); s = rep(sb, sb.ppl, VACAD, '2026-10-27'); dep('2026-10-27', '13:33', VACAD, s); save(sb, '평범');
    // 21 오다인: 회비 없는 학생 3명 (캠프에서 연회비 같이 청구)
    sb = mk(VACAD, tN(5), Ss(54, 56)); s = rep(sb, sb.ppl, tN(5), '2026-10-28'); dep('2026-10-28', '10:10', tN(5), s); save(sb, '연회비 같이 청구');
    // 22 서이든: 회비 없는 학생 3명, 신고만 (입금 아직)
    sb = mk(VACAD, tN(1), Ss(57, 59)); rep(sb, sb.ppl, tN(1), '2026-10-29'); save(sb, '신고만 · 입금 아직');
    // 비회원(학부모) 5건
    const G = (nm, ph, list, f) => { const g = mk(GUEST_ACAD, nm + '(' + ph + ')', list, { contact: '010-0000-' + ph }); f && f(g); return g; };
    const gs = (k, nm, inst) => ({ key: k, name: nm, type: '비회원 학생', inst: inst || '바이올린', by: '2016', prog: PROG['바이올린'][0] });
    const gp = (k, nm, link) => ({ key: k, name: nm, type: '비회원 보호자', fam: link });
    sb = G('가보호', '9001', [gs('gv1', '가손님'), gp('gp1', '가보호', 'gv1')]); s = rep(sb, sb.ppl, '가보호', '2026-10-09'); dep('2026-10-09', '21:00', '가보호', s); save(sb, '비회원 · 신고 · 입금');
    sb = G('나보호', '9002', [gs('gv2', '나손님'), gs('gv3', '나동생', '첼로'), gp('gp2', '나보호', 'gv2')]); dep('2026-10-13', '07:50', '나보호', live(sb).reduce((t, p) => t + chg(p), 0)); save(sb, '비회원 · 신고 없이 입금');
    sb = G('다보호', '9003', [gs('gv4', '다손님')]); s = rep(sb, sb.ppl, '다보호', '2026-10-16'); dep('2026-10-16', '18:18', '다손님', s); save(sb, '비회원 · 아이 이름으로 입금');
    sb = G('라보호', '9004', [gs('gv5', '라손님'), gp('gp4', '라보호', 'gv5')]); save(sb, '비회원 · 미입금');
    sb = G('마보호', '9005', [gs('gv6', '마손님')]); s = rep(sb, sb.ppl, '마보호', '2026-10-25', -100000); dep('2026-10-25', '12:00', '마보호', s); save(sb, '비회원 · 부족 입금');
    // 관계자 3건 (운영진 대신 등록)
    const R = (list, memo) => mk(STAFF_ACAD, '운영진', list, { proxy: a.name, memo });
    sb = R([{ key: 'me_v1', name: '가반주', type: '반주자', inst: '피아노' }], '가상 반주자'); save(sb, '관계자 · 반주자');
    sb = R([{ key: 'me_v2', name: '가교수', type: '초빙교수', inst: '바이올린' }, { key: 'fsv20', name: '가교수가족', type: STAFF_FAM[0], fam: 'me_v2' }], '가상 초빙교수 + 가족');
    s = live(sb).reduce((t, p) => t + chg(p), 0); if (s) dep('2026-10-20', '15:00', '가교수', s); save(sb, '관계자 · 초빙교수 + 가족');
    sb = R([{ key: 'me_v3', name: '가스텝', type: '스태프', inst: '' }], '가상 스태프'); save(sb, '관계자 · 스태프');
    /* 섞인 거래: 카드 · 공과금 · 학생회비 따로 입금(회원관리 신고 10-30) · 강사료 */
    dep('2026-10-30', '10:00', VACAD, 30000); out('2026-10-05', '00:10', 'KB카드출금', 532190); out('2026-10-10', '20:59', '건강보험연금', 171570); out('2026-10-31', '17:00', tN(1) + ' 강사료', 290100);
    conf.forEach(c => setAdminCols_(c[0], [c[1], c[2], '가상 연습']));
    const subs = loadSubs_(); subs.filter(x => x.vscen).forEach(x => writeSubRow_(x));
    writeTeams_(subs);
    log_(a.name, '가상스즈키 연습 접수', made.length + '건');
  } finally { lock.releaseLock(); }
  bank.sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  const ss = SpreadsheetApp.create('[STG] 가상스즈키 연습 통장 ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd HHmm'));
  const sh0 = ss.getSheets()[0], sh = sh0 || ss.insertSheet('가상 통장'); if (sh0) sh.setName('가상 통장');
  const rows = [['거래일시', '보낸분/받는분', '출금액', '입금액', '잔액', '내통장표시', '적요', '처리점']].concat(bank.map(r => [r[0], r[1], r[2], r[3], '', '', '전자금융', '가상']));
  sh.getRange(1, 1, rows.length, 8).setNumberFormat('@').setValues(rows.map(r => r.map(x => String(x))));
  return { ok: true, made, bankUrl: ss.getUrl(), bankN: bank.length, adm: adminData(token) };
}
function cxRow_(sb, p, why, amt, st) {
  ensureHead_(SH.CX, CX_HEAD); const sh = SpreadsheetApp.getActive().getSheetByName(SH.CX);
  const o = { '요청 일시': stamp_(), '접수번호': sb.no, '학원': sb.acad, '요청 교사': sb.owner, '참가자': p.name, '사유': why, '환불 예정액': amt, '처리': st, '처리일': st ? '2026-10-28' : '', '메모': '가상 연습', '참가자ID': p.id, '신청액': (+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0), '입금액': amt, '적용 규정': '', '접수일': sb.date };
  sh.appendRow(CX_HEAD.map(k => o[k] == null ? '' : o[k]));
}
/** 관리자 화면에 필요한 것: 모든 접수 · 운영진 칸 · 환불 요청 · 앙상블 팀 */
/* ====== 통장 잇기 (11-01): 회원관리 정산 파일의 「통장」(입금) · 「통장상세」 · 「프로젝트」를 읽고, 입금 확인 때 그 입금을 사람별 줄로 이음 ======
 * 회원관리 설정 「정산 정보 시트」 → 그 파일. 캠프 시트와 같은 계정이어야 열림. 못 열면 통장 표시 없이 지금처럼 확인만 */
function bankBook_() {
  const mid = memberSheetId_(); if (!mid) return null;
  try { const v = SpreadsheetApp.openById(mid).getSheetByName('설정').getDataRange().getDisplayValues(), r = v.find(x => String(x[0]).trim() === '정산 정보 시트'), id = r ? String(r[1]).trim() : '';
    return id ? SpreadsheetApp.openById(id) : null; } catch (e) { return null; }
}
function bankTab_(ss, name) { const sh = ss.getSheetByName(name); if (!sh) return null; const v = sh.getDataRange().getDisplayValues(), h = (v.shift() || []).map(String); return { sh, h, v: v.filter(r => r.some(x => x !== '')), c: k => h.indexOf(k) }; }
function bankNum_(x) { return +String(x || '').replace(/[^\d]/g, '') || 0; }
/** 관리자 입금 신고 화면: 캠프 입금 기간의 통장 입금 (이미 사람별로 이어진 것 포함) */
function adminBank(token) {
  adm_(token); const ss = bankBook_(); if (!ss) return { ok: true, none: true };
  const B = bankTab_(ss, '통장'); if (!B) return { ok: true, none: true };
  const D = bankTab_(ss, '통장상세'), K = bankTab_(ss, '통장목록'), C = camp_(), from = setting_('입금 시작일') || '2026-10-01';
  const to = (() => { const m = String(C.base.end || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 60)).toISOString().slice(0, 10) : '9999'; })();
  const lines = {}; if (D) D.v.forEach(r => { const id = r[D.c('거래ID')]; (lines[id] = lines[id] || []).push({ t: r[D.c('대상')], id: r[D.c('ID')], a: bankNum_(r[D.c('금액')]) }); });
  const an = {}; if (K) K.v.forEach(r => an[r[0]] = r[1]);
  const tx = []; B.v.forEach(r => { const at = String(r[B.c('거래일시')] || ''), d = at.slice(0, 10), inn = bankNum_(r[B.c('입금')]); if (!inn || d < from || d > to) return;
    const id = r[B.c('거래ID')], L = lines[id] || []; tx.push({ id, at: at.slice(0, 16), who: String(r[B.c('보낸분받는분')] || ''), amt: inn, k: String(r[B.c('구분')] || ''), ac: an[r[B.c('통장ID')]] || '', used: L.reduce((t, x) => t + x.a, 0), pids: L.filter(x => x.t === '캠프').map(x => x.id) }); });
  return { ok: true, tx: tx.slice(-2000) };
}
/** 입금 확인한 사람들을 그 통장 입금에 사람별 줄로 이음 (확인 취소면 그 사람 줄을 뺌) */
function bankLinkCamp_(byTx, unlink, who) {
  const ss = bankBook_(); if (!ss) return { skip: true };
  const B = bankTab_(ss, '통장'), D = bankTab_(ss, '통장상세'), P = bankTab_(ss, '프로젝트'); if (!B || !D) return { skip: true };
  const stamp = stamp_(), C = camp_(), pid = P && P.c('캠프ID') >= 0 ? ((P.v.find(r => r[P.c('캠프ID')] === C.base.id) || [])[0] || '') : '';
  const drop = {}; Object.keys(byTx).forEach(t => byTx[t].forEach(x => drop[t + '|' + x.pid] = 1)); (unlink || []).forEach(p => drop['*|' + p] = 1);
  const keep = D.v.filter(r => { const t = r[D.c('거래ID')], id = r[D.c('ID')]; return !(r[D.c('대상')] === '캠프' && (drop[t + '|' + id] || drop['*|' + id])); });
  const mk = o => D.h.map(k => o[k] == null ? '' : String(o[k]));
  Object.keys(byTx).forEach(t => { let n = keep.filter(r => r[D.c('거래ID')] === t).length;
    byTx[t].forEach(x => keep.push(mk({ '거래ID': t, '순번': ++n, '대상': '캠프', 'ID': x.pid, '이름': x.name, '금액': x.amt, '메모': x.no, '수정일': stamp, '수정자': who, '구분': '스즈키캠프 › 참가비' }))); });
  if (D.v.length) D.sh.getRange(2, 1, D.v.length, D.h.length).clearContent();
  if (keep.length) D.sh.getRange(2, 1, keep.length, D.h.length).setNumberFormat('@').setValues(keep);
  Object.keys(byTx).forEach(t => { const i = B.v.findIndex(r => r[B.c('거래ID')] === t); if (i < 0) return; const row = B.v[i].slice(), set = (k, v) => { const c = B.c(k); if (c >= 0) row[c] = v; };
    if (!/^스즈키캠프/.test(row[B.c('구분')] || '')) set('구분', '스즈키캠프 › 참가비'); if (pid) set('프로젝트ID', pid); if (row[B.c('상태')] !== '연결') set('상태', '확정'); set('수정일', stamp); set('수정자', who + ' (캠프 입금 확인)');
    B.sh.getRange(i + 2, 1, 1, B.h.length).setValues([row]); });
  return { ok: true };
}
function adminData(token) {
  const me = adm_(token);
  const subs = loadSubs_();
  const admin = adminMap_();
  ensureHead_(SH.CX, CX_HEAD);
  const cx = rows_(SH.CX).filter(r => r['접수번호']).map(r => ({ row: r._row, at: String(r['요청 일시']), no: String(r['접수번호']), acad: String(r['학원']), by: String(r['요청 교사']),
    names: String(r['참가자']), why: String(r['사유']), amt: +r['환불 예정액'] || 0, bank: String(r['은행'] || ''), acct: String(r['계좌번호'] || ''), holder: String(r['예금주'] || ''),
    doc: String(r['진단서'] || ''), state: String(r['처리'] || '요청'), done: dstr_(r['처리일']), memo: String(r['메모'] || ''), ids: String(r['참가자ID'] || '').split(',').filter(Boolean), base: +r['신청액'] || 0, paid: +r['입금액'] || 0, rule: String(r['적용 규정'] || ''), okAt: dstr_(r['접수일']) }));
  // 통계용: 예전 접수라 사람마다 악기가 비어 있으면 명단에서 채워서 보냄 (시트에는 안 씀)
  const inst = {}; teachers_().forEach(t => inst['t_' + t.id] = t.inst); rows_(SH.S).forEach(r => inst[String(r['ID'])] = String(r['악기'] || ''));
  subs.forEach(sb => sb.ppl.forEach(p => { if (!p.inst) { const k = p.id.slice(sb.no.length + 1), i = (sb.form && sb.form.info && sb.form.info[k]) || {}; p.inst = i.inst || inst[k] || ''; } }));
  return { today: today_(), subs, admin, cx, teams: teams_(subs), issues: issues_(), profs: profs_(), me: me_(me), camp: campPublic_(), scholar: scholTiers_() };
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
  const a = adm_(token); need_(a, ['subs', 'rp']); items = items || [];
  const lock = lock_();
  try {
    items.forEach(it => {
      if (it.amt > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(it.date || '')) throw new Error('입금일을 선택해 주세요.');
      setAdminCols_(it.pid, it.amt > 0 ? [it.date, it.amt, it.memo || ''] : ['', '', it.memo || '']);
      log_('관리자 ' + a.name, it.amt > 0 ? '입금 확인' : '입금 확인 취소', it.pid + (it.amt > 0 ? ' · ' + it.date + ' · ' + it.amt : '') + (it.tx ? ' · 통장 ' + it.tx : ''));
    });
    /* 통장 잇기: 고른 통장 입금에 사람별 줄로 (확인 취소면 그 사람 줄을 뺌) */
    const byTx = {}, un = [];
    if (items.some(it => it.tx || !(it.amt > 0))) {
      const nm = {}; loadSubs_().forEach(sb => sb.ppl.forEach(p => nm[p.id] = { name: p.name, no: sb.no }));
      items.forEach(it => { if (it.amt > 0 && it.tx) (byTx[it.tx] = byTx[it.tx] || []).push({ pid: it.pid, amt: it.repAmt || it.amt, name: (nm[it.pid] || {}).name || it.pid, no: (nm[it.pid] || {}).no || '' }); else if (!(it.amt > 0)) un.push(it.pid); });
      try { bankLinkCamp_(byTx, un, a.name); } catch (e) { log_('관리자 ' + a.name, '통장 잇기 실패', e.message); }
    }
    // 접수 탭 합계 다시 쓰기
    const subs = loadSubs_(); const nos = [...new Set(items.map(it => it.pid.split('_')[0]))];
    subs.filter(sb => nos.includes(sb.no)).forEach(sb => { try { recalc_(sb); writeSub_(sb); } catch (e) { writeSubRow_(sb); } });   /* 입금일로 차수가 정해지므로 금액 다시 셈 (11-04) */
  } finally { lock.releaseLock(); }
  return adminData(token);
}
/** 입금 신고 반려: 그 사람은 다시 「입금 전」, 선생님 화면에 사유 표시 */
/** 입금 신고 반려 (한 명 또는 여러 명: pid 자리에 배열) */
function adminRejectReport(token, pid, reason) {
  const a = adm_(token); need_(a, ['rp', 'subs']);
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
    touched.forEach(sb => { try { recalc_(sb); } catch (e) { } writeSub_(sb, false); });   /* 반려 = 그 날짜 차수가 풀림 → 지금 차수 금액 (11-04) */
  } finally { lock.releaseLock(); }
  return adminData(token);
}
/** 관리자: 앙상블 팀 정보 고치기 (팀 이름·함께하는 학원·곡·시간·운영진 메모) */
function adminSaveEns(token, no, patch) {
  const a = adm_(token); need_(a, 'ens');
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
/** 관리자: 교수진 목록 저장 (전체를 새로 씀) */
function adminSaveProfs(token, list) {
  const a = adm_(token); need_(a, 'prof');
  const t = (s, n) => String(s == null ? '' : s).trim().slice(0, n || 60);
  const L = (list || []).map(p => ({ name: t(p.name, 40), inst: t(p.inst, 20), lesson: !!p.lesson, mc: !!p.mc, min: Math.max(0, Math.min(240, +p.min || 0)), fee: Math.max(0, Math.min(5000000, +String(p.fee || 0).replace(/[^\d]/g, '') || 0)), org: t(p.org, 40), on: p.on !== false, memo: t(p.memo, 200), room: t(p.room, 30),
    book: ['협회', '초청'].includes(String(p.book || '')) ? String(p.book) : '', bgrp: t(p.bgrp, 40), en: t(p.en, 80), title: t(p.title, 60), bio: String(p.bio == null ? '' : p.bio).trim().slice(0, 2000), bord: Math.max(0, Math.min(999, Math.round(+p.bord || 0))) })).filter(p => p.name);
  const seen = {};
  L.forEach(p => {
    if (!p.inst) throw new Error(p.name + ': 악기를 골라 주세요.');
    p.inst = p.inst.replace(/[|,]/g, ' ').trim().slice(0, 12);
    const k = p.name + '|' + p.inst; if (seen[k]) throw new Error(p.name + '(' + p.inst + ')이(가) 두 번 있어요.'); seen[k] = 1;
    if (p.mc && !p.fee) throw new Error(p.name + ': 마스터클래스 금액을 넣어 주세요.');
    if (!p.lesson && !p.mc && !p.book) throw new Error(p.name + ': 레슨 · 마스터클래스 · 책자(협회/초청) 중 하나는 골라 주세요.');
  });
  const lock = lock_();
  try {
    const sh = profSheet_(); const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, PROF_HEAD.length).clearContent();
    if (L.length) sh.getRange(2, 1, L.length, PROF_HEAD.length).setValues(L.map(p => [p.name, p.inst, p.lesson ? '예' : '아니오', p.mc ? '예' : '아니오', p.mc ? (p.min || '') : '', p.mc ? p.fee : '', p.org, p.on ? '예' : '아니오', p.memo, p.room, p.book, p.bgrp, p.en, p.title, p.bio, p.bord || '']));
    PROF_CACHE = null;
    log_('관리자 ' + a.name, '교수진 저장', L.length + '명');
  } finally { lock.releaseLock(); }
  return adminData(token);
}
/** 다른 캠프(지난 캠프) DB 시트의 「교수진」에서 책자 프로필(책자 · 묶음 · 영문 · 직함 · 약력 · 순서) 읽기 — 화면이 이름으로 맞춰 넣고 「저장」은 사람이 (11-05) */
function adminProfImport(token, url) {
  const a = adm_(token); need_(a, 'prof');
  const m = String(url || '').match(/[-\w]{25,}/); if (!m) throw new Error('지난 캠프 시트 주소를 넣어 주세요.');
  let sh; try { sh = SpreadsheetApp.openById(m[0]).getSheetByName(SH.PROF); } catch (x) { throw new Error('그 시트를 열지 못했어요 · 주소와 공유를 확인해 주세요.'); }
  if (!sh) throw new Error('그 시트에 「교수진」 탭이 없어요.');
  const v = sh.getDataRange().getDisplayValues(), h = v[0].map(String), ix = k => h.indexOf(k);
  const out = v.slice(1).filter(r => String(r[ix('이름')] || '').trim()).map(r => { const g = k => ix(k) >= 0 ? String(r[ix(k)] || '') : '';
    return { name: g('이름').trim(), inst: g('악기').trim(), book: g('책자').trim(), bgrp: g('책자 묶음').trim(), en: g('영문 이름').trim(), title: g('직함').trim(), bio: g('약력'), bord: +g('책자 순서') || 0, org: g('소속') }; });
  log_('관리자 ' + a.name, '교수진 약력 가져오기', out.length + '명');
  return { ok: true, list: out };
}
/** 환불 요청 처리: 완료(환불한 날 필수) / 반려 */
/** 환불 처리는 두 단계: ① 접수(승인) — 참가 취소·환불 예정 금액 확정  ② 환불 완료 — 실제로 돈을 보낸 날짜(필수)
 *  action: '접수' | '완료' | '반려'   (환불액 0원이면 '접수' = 취소 확정, 송금 단계 없음) */
function adminRefund(token, row, action, date, memo, amt) {
  const a = adm_(token); need_(a, 'cx');
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
    const body = `${camp_().base.name} 접수가 완료되었어요.\n\n접수번호: ${sb.no}\n학원: ${sb.acad}\n접수 교사: ${u.name}\n차수: ${sb.round}\n인원: ${live.length}명\n입금하실 금액: ${bill.toLocaleString('ko-KR')}원\n\n` +
      live.map(p => `- ${p.name} (${p.type}) ${((+p.fee || 0) + (+p.lesson || 0) + (+p.dues || 0) + (+p.room || 0)).toLocaleString('ko-KR')}원`).join('\n') +
      `\n\n입금한 뒤 접수 화면의 「내 접수」에서 사람별로 입금 신고를 해 주세요.`;
    if (sb.email) MailApp.sendEmail(sb.email, `[${camp_().base.name}] 접수 완료 ${sb.no}`, body);
    if (ADMIN_EMAIL) MailApp.sendEmail(ADMIN_EMAIL, `[캠프 접수] ${sb.acad} ${sb.no} · ${live.length}명`, body);
  } catch (e) { log_('시스템', '메일 실패', String(e)); }
}
/* ---------------- 게시판 게시판 (「문의」 시트) ----------------
   글은 시트 한 줄(칸 13개)이라 용량 걱정 없음. 사진은 드라이브 「캠프 문의 사진」 폴더에(5MB까지). */
const ISS = '문의';
const ISS_HEAD = ['번호', '일시', '이름', '연락처 뒤4자리', '학원', '화면', '내용', '사진', '상태', '답변', '처리일', '처리자', '환경', '교사ID'];   // 교사ID (11-11): 회원 계정으로 로그인해 쓴 글 → 회원관리 문의와 연결
const ISS_STATES = ['미해결', '해결 중', '해결'];
function issSheet_() {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(ISS);
  if (!sh) { sh = ss.insertSheet(ISS); sh.appendRow(ISS_HEAD); sh.setFrozenRows(1); sh.getRange('A:A').setNumberFormat('@'); }
  else { const h = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String); if (h.indexOf('교사ID') < 0) sh.getRange(1, h.filter(String).length + 1).setValue('교사ID'); }
  return sh;
}
function issues_() {
  issSheet_();
  return rows_(ISS).filter(r => r['번호']).map(r => ({ row: r._row, no: String(r['번호']), at: String(r['일시']), name: String(r['이름']), p4: String(r['연락처 뒤4자리'] || ''), acad: String(r['학원'] || ''),
    where: String(r['화면'] || ''), text: String(r['내용'] || ''), pic: String(r['사진'] || ''), state: String(r['상태'] || '미해결'), reply: String(r['답변'] || ''),
    done: dstr_(r['처리일']), by: String(r['처리자'] || ''), env: String(r['환경'] || ''), tid: String(r['교사ID'] || '') }));
}
/** 선생님: 글 쓰기 — 로그인한 사람만 (11-11 사용자 결정. 로그인이 안 되는 경우는 카카오톡 채널로) */
function submitIssue(token, d) {
  d = d || {};
  let u = null; try { if (token) u = who_(token); } catch (e) {}
  const name = String(u ? u.name : d.name || '').trim().slice(0, 20);
  const p4 = String(d.phone || '').replace(/\D/g, '').slice(-4);
  const text = String(d.text || '').trim();
  if (!u) throw new Error('로그인한 뒤 남길 수 있어요. 로그인이 안 되면 카카오톡 채널 「suzukimusickorea」로 알려 주세요.');   /* 11-11: 로그인한 사람만 (누가 썼는지 알 수 있게) */
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
    const it = DriveApp.getFoldersByName('캠프 문의 사진 ' + camp_().base.id);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder('캠프 문의 사진 ' + camp_().base.id);
    pic = folder.createFile(Utilities.newBlob(Utilities.base64Decode(d.file.data), d.file.type, Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss') + '-' + name + '-' + String(d.file.name || 'pic').slice(-40))).getUrl();
  }
  const lock = lock_();
  let no;
  try {
    const sh = issSheet_();
    const n = rows_(ISS).reduce((m, r) => Math.max(m, +String(r['번호']).replace(/\D/g, '') || 0), 0) + 1;
    no = 'Q' + String(n).padStart(3, '0');
    const acad = u ? (u.acads || []).join(', ') : String(d.acad || '').slice(0, 40);
    const H = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), row = new Array(H.length).fill('');
    const put = (k, v) => { const j = H.indexOf(k); if (j >= 0) row[j] = v; };
    put('번호', no); put('일시', stamp_()); put('이름', name); put('연락처 뒤4자리', p4 ? "'" + p4 : ''); put('학원', acad); put('화면', String(d.where || '').slice(0, 40)); put('내용', text); put('사진', pic); put('상태', '미해결'); put('환경', String(d.env || '').slice(0, 300)); put('교사ID', u && u.tid ? u.tid : '');
    sh.appendRow(row);
    C.put(k, '1', 60);
  } finally { lock.releaseLock(); }
  log_(name, '문의', no);
  return { ok: true, no, mine: u ? myIssues_(u) : [] };
}
function myIssues_(u) { return issues_().filter(x => x.tid && u.tid ? x.tid === u.tid : x.name === u.name)   /* 교사ID 있으면 교사ID로, 예전 글 · 비회원은 이름으로 */.reverse().map(x => ({ no: x.no, at: x.at, where: x.where, text: x.text, pic: !!x.pic, state: x.state, reply: x.reply, done: x.done })); }
function myIssues(token) { const u = who_(token); return { ok: true, mine: myIssues_(u) }; }
/** 관리자: 상태·답변 */
function adminSetIssue(token, row, state, reply) {
  const a = adm_(token); need_(a, ['q', 'room']);   // 가족방 요청 글은 방 배정 담당도 답할 수 있음
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

/* ================= 교사 일정 =================
 * 「교사일정」: 한 줄 = 일정 하나 (ID · 날짜(0부터) · 시작 · 끝 · 장소 · 이름 · 종류 · 설명 · 사람(JSON) · 사람(이름, 보기용))
 * 「일정설정」: 항목 · 값(JSON) — days · rooms · meals · rows · people · unav · req · target · rev
 * 「일정기록」: 일시 · 관리자 · 내용 */
const ACT_HEAD = ['ID', '날짜', '시작', '끝', '장소', '이름', '종류', '설명', '사람', '사람(이름)', '세부', '대상', '단계', '가져온 일정ID'];   // 본공연이 어느 리허설에서 가져왔는지   // 이름 = 행사 종류(관리자 목록), 세부 = 반 이름 등
/** 행사 구분 = 공연 · 레슨 · 업무 (고정) → 종류(관리자 입력) → 공연은 단계(본공연·리허설·무대 세팅 …, 관리자 입력) → 사람마다 역할(구분별 목록, 관리자 입력)
 *  link = 학생이 연주하는 음악회 → 오후음악회 탭(연주 순서·리허설)에 이어짐 */
const ACT_CATS = ['공연', '레슨', '업무'];
const ACT_KINDS = [['Orch A', '공연'], ['Orch B', '공연'], ['Orch C', '공연'], ['Orch D', '공연'], ['Welcome Concert', '공연'], ['Ensemble Concert', '공연'], ['Evening Concert', '공연', 1], ['Afternoon Concert', '공연', 1], ['Twilight Concert', '공연', 1],
  ['그룹레슨', '레슨'], ['교사연수', '레슨'], ['마스터클래스', '레슨'], ['식당', '업무']].map(([n, c, l]) => ({ n, c, link: !!l }));
const ACT_STAGES = ['본공연', '리허설', '대기', '무대 세팅'];   // 대기 (11-05): 오케 · 그룹 리허설 전 대기 자리 — 책자 「리허설 대기 및 진행」
const ACT_ROLESETS = { '공연': ['지휘', '악장', 'Vln 1', 'Vln 2', 'Vla', 'Vc', 'D.B', '악보계', '반주자', '통역', '객석정리', '무대', '연주', '세팅', '진행', '사회'], '레슨': ['수업', '보조', '통역'], '업무': ['문지기', '배식', '안내'] };
/** 대상 칩 { Vn:{b:[권], x:[지정학생…], m:메모}, Vc, Fl } → 시트에는 JSON (빈 악기는 뺌) */
function tgClean_(tg) { const o = {}; ['Vn', 'Vc', 'Fl'].forEach(k => { const v = (tg || {})[k]; if (!v) return; const b = (v.b || []).map(x => String(x).slice(0, 6)).filter(x => /^(Pre|\d{1,2})[AB]{0,2}\+?$/.test(x)).slice(0, 20), x = (v.x || []).map(y => String(y).slice(0, 10)).slice(0, 6), m = String(v.m || '').slice(0, 60), sg = (v.s || []).map(y => String(y).slice(0, 40)).slice(0, 12); if (b.length || x.length || m || sg.length) o[k] = { b, x, m, s: sg }; }); return Object.keys(o).length ? JSON.stringify(o) : ''; }
const evName_ = e => e.title + (e.stage && e.stage !== '본공연' ? ' ' + e.stage : '') + (e.sub ? ' · ' + e.sub : '');
const ACT_KEYS = ['days', 'rooms', 'meals', 'rows', 'people', 'unav', 'req', 'target', 'kinds', 'stages', 'roleSets', 'tgSongs', 'en', 'bookDesc', 'dayNotes', 'roleShort', 'orchParts', 'rev'];
function actSheets_() {
  const ss = SpreadsheetApp.getActive();
  const mk = (n, h) => { let sh = ss.getSheetByName(n); if (!sh) { sh = ss.insertSheet(n); sh.appendRow(h); } return sh; };
  return { ev: mk(SH.ACT, ACT_HEAD), cfg: mk(SH.ACTCFG, ['항목', '값']), log: mk(SH.ACTLOG, ['일시', '관리자', '내용']) };
}
function actCfg_() {
  actSheets_(); const o = {};
  rows_(SH.ACTCFG).forEach(r => { const k = String(r['항목'] || ''); if (!k) return; try { o[k] = JSON.parse(String(r['값'] || 'null')); } catch (x) { o[k] = null; } });
  return o;
}
const hm_ = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : (/^\d{1,2}:\d{2}/.test(String(v)) ? String(v).replace(/^(\d):/, '0$1:').slice(0, 5) : String(v || ''));
function actEvents_() {
  actSheets_();
  return rows_(SH.ACT).filter(r => String(r['ID'] || '')).map(r => {
    let ppl = []; try { ppl = JSON.parse(String(r['사람'] || '[]')); } catch (x) {}
    return { id: String(r['ID']), d: +r['날짜'] || 0, s: hm_(r['시작']), e: hm_(r['끝']), room: String(r['장소'] || ''), title: String(r['이름'] || ''), sub: String(r['세부'] || ''), stage: String(r['단계'] || ''), main: String(r['가져온 일정ID'] || r['본공연ID'] || ''), tg: (() => { try { return JSON.parse(String(r['대상'] || '{}')) || {}; } catch (x) { return {}; } })(), type: String(r['종류'] || '레슨'),
      desc: String(r['설명'] || '').split('\n').map(x => x.trim()).filter(Boolean), ppl: Array.isArray(ppl) ? ppl : [] };
  });
}
/** 일정에 넣을 수 있는 사람 = 캠프에 접수한 교사(교사·연수생·소속없는 중급연수생) + 교수진(사용 중)
 *  접수 취소(환불 접수 · 입금 전 바로 취소)된 교사는 cx=true → 화면에서 이름 흐리게 「(취소)」, 횟수·통계에서 빠짐
 *  예전에 넣었는데 지금은 명단에 없는 사람은 out=true 로 남겨 둠 (일정 칸에 이미 들어 있으면 보이게) */
function actPeople_(saved) {
  const nm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
  const TT = ['교사', '연수생', '소속없는 중급연수생'];
  const M = {};
  loadSubs_().forEach(sb => sb.ppl.forEach(p => {
    const k = p.id.slice(sb.no.length + 1); const i = (sb.form && sb.form.info && sb.form.info[k]) || {};
    const type = p.type || i.type || ''; if (!TT.includes(type)) return;
    const id = 'C:' + k; const cx = p.status === '취소';
    if (M[id] && !M[id].cx) return;   // 다른 접수에서 살아 있으면 그쪽
    M[id] = { id, n: p.name, acad: sb.acad, inst: p.inst || i.inst || '', kind: type === '교사' ? '교사' : '연수생', tid: /^t_/.test(k) ? k.slice(2) : '', cx };
  }));
  const L = Object.values(M);
  try { profs_().filter(p => p.on).forEach(p => {
    const same = L.find(x => nm(x.n) === nm(p.name));
    if (same) { same.kind = '교수'; same.cx = false; if (!same.inst) same.inst = p.inst; return; }   // 교수로 등록된 분은 접수 취소와 상관없이 넣을 수 있음
    L.push({ id: 'P:' + p.name, n: p.name, acad: p.org || '교수진', inst: p.inst, kind: '교수' });
  }); } catch (x) {}
  const have = new Set(L.map(p => p.id));
  (saved || []).forEach(p => { if (!have.has(p.id)) L.push(Object.assign({}, p, { out: true })); });
  return L;
}
/** 예전에 저장한 공연 역할 목록에 오케 파트를 한 번만 넣어 줌 (그다음 저장부터는 관리자가 지우면 그대로) */
function orchMerge_(rs, done) {
  if (done) return rs; const o = Object.assign({}, rs), L = (o['공연'] || []).slice(), at = Math.max(0, L.indexOf('지휘') + 1);
  ORCH_PARTS.filter(r => !L.includes(r)).reverse().forEach(r => L.splice(r === '지휘' ? 0 : at, 0, r)); o['공연'] = L; return o;
}
function schedData(token) {
  adm_(token);
  const c = actCfg_();
  const log = rows_(SH.ACTLOG).slice(-300).reverse().map(r => ({ at: String(r['일시'] instanceof Date ? Utilities.formatDate(r['일시'], TZ, 'M/d HH:mm') : r['일시']).replace(/^\d{4}-0?(\d+)-0?(\d+)/, '$1/$2'), t: (r['관리자'] ? r['관리자'] + ' · ' : '') + String(r['내용'] || '') }));
  return { days: c.days || [], rooms: c.rooms || {}, meals: Array.isArray(c.meals) ? c.meals : mealGen_(camp_().meals, (c.days || []).length), rows: c.rows || {}, people: actPeople_(c.people), unav: c.unav || {}, req: c.req || {}, target: c.target || { min: 2, max: 6 }, kinds: Array.isArray(c.kinds) && c.kinds.length ? c.kinds : ACT_KINDS, stages: Array.isArray(c.stages) && c.stages.length ? c.stages : ACT_STAGES, roleSets: c.roleSets && typeof c.roleSets === 'object' ? orchMerge_(c.roleSets, c.orchParts) : ACT_ROLESETS, tgSongs: c.tgSongs && typeof c.tgSongs === 'object' ? c.tgSongs : null, en: c.en || ACT_EN, bookDesc: c.bookDesc || ACT_BOOKDESC, dayNotes: c.dayNotes || [], roleShort: c.roleShort || {}, rev: +c.rev || 0, events: actEvents_(), log, lessons: (() => { try { return lessons_().map(x => ({ d: x.d, t: x.t, pr: x.pr })); } catch (e) { return []; } })() };
}
function schedSave(token, b) {
  const a = adm_(token); need_(a, 'act');
  if (!b || !Array.isArray(b.events) || !Array.isArray(b.days)) throw new Error('보낸 내용이 비어 있어요. 새로 불러와 주세요.');
  if (b.events.length > 3000) throw new Error('일정이 너무 많아요.');
  const lock = lock_();
  try {
    const sh = actSheets_(); const c = actCfg_();
    if ((+c.rev || 0) !== (+b.rev || 0)) { lock.releaseLock(); return Object.assign({ conflict: true, msg: '다른 관리자 화면에서 먼저 고쳤어요. 최신 내용으로 다시 불러왔어요. 방금 고친 것은 한 번 더 해 주세요.' }, schedData(token)); }
    const t = (s, n) => String(s == null ? '' : s).slice(0, n || 200);
    const okT = s => /^\d{2}:\d{2}$/.test(String(s));
    const P = {}; (b.people || []).forEach(p => P[p.id] = p);
    const rows = b.events.map(e => {
      if (!okT(e.s) || !okT(e.e)) throw new Error('시간 형식이 잘못된 일정이 있어요: ' + t(e.title, 30));
      const ppl = (e.ppl || []).map(p => ({ n: t(p.n, 40), r: t(p.r, 12) })).filter(p => p.n);
      return [t(e.id, 40), +e.d || 0, "'" + e.s, "'" + e.e, t(e.room, 60), t(e.title, 120), t(e.type, 20), (e.desc || []).map(x => t(x, 200)).join('\n'), JSON.stringify(ppl), ppl.map(p => ((P[p.n] || {}).n || p.n) + '(' + p.r + ')').join(', '), t(e.sub, 120), tgClean_(e.tg), t(e.stage, 20), t(e.main, 40)];
    });
    const last = sh.ev.getLastRow();
    sh.ev.getRange(1, 1, 1, ACT_HEAD.length).setValues([ACT_HEAD]);   // 머리줄 (「세부」 칸이 없던 시트도 맞춤)
    if (last > 1) sh.ev.getRange(2, 1, last - 1, ACT_HEAD.length).clearContent();
    if (rows.length) sh.ev.getRange(2, 1, rows.length, ACT_HEAD.length).setValues(rows);
    const val = { days: b.days.map(x => t(x, 30)), rooms: b.rooms || {}, meals: b.meals || [], rows: b.rows || {}, people: (b.people || []).map(p => ({ id: t(p.id, 40), n: t(p.n, 60), acad: t(p.acad, 120), inst: t(p.inst, 20), kind: t(p.kind, 10), tid: p.tid ? t(p.tid, 20) : undefined })), unav: b.unav || {}, req: b.req || {}, target: b.target || { min: 2, max: 6 }, en: (() => { const o = {}; Object.keys(b.en || {}).slice(0, 300).forEach(k => { o[t(k, 40)] = t(b.en[k], 80); }); return o; })(), bookDesc: (() => { const o = {}; ['Vn', 'Vc', 'Fl'].forEach(k => { o[k] = {}; Object.keys((b.bookDesc || {})[k] || {}).slice(0, 40).forEach(x => { const v = b.bookDesc[k][x]; if (Array.isArray(v)) o[k][t(x, 6)] = [t(v[0], 60), t(v[1], 80)]; }); }); return o; })(), dayNotes: (b.dayNotes || []).map(x => t(x, 300)).slice(0, 20), roleShort: (() => { const o = {}; Object.keys(b.roleShort || {}).slice(0, 100).forEach(k => { const v = t(b.roleShort[k], 6).trim(); if (v) o[t(k, 12)] = v; }); return o; })(), meals: (b.meals || []).map(m => Object.assign({ d: +m.d || 0, s: t(m.s, 5), e: t(m.e, 5), t: t(m.t, 200) }, m.k ? { k: t(m.k, 10) } : {})).filter(m => /^\d{2}:\d{2}$/.test(m.s)).slice(0, 80), tgSongs: (() => { const o = {}; ['Vn', 'Vc', 'Fl'].forEach(k => { const L = (b.tgSongs || {})[k]; o[k] = (Array.isArray(L) ? L : []).map(x => t(x, 40).trim()).filter(Boolean).slice(0, 40); }); return o; })(), stages: (Array.isArray(b.stages) && b.stages.length ? b.stages : ACT_STAGES).map(x => t(x, 20).trim()).filter(Boolean).slice(0, 20), roleSets: (() => { const o = {}; ACT_CATS.forEach(c => { const L = ((b.roleSets || {})[c] || ACT_ROLESETS[c]); o[c] = (Array.isArray(L) ? L : []).map(x => t(x, 12).trim()).filter(Boolean).slice(0, 40); }); return o; })(), kinds: (Array.isArray(b.kinds) ? b.kinds : ACT_KINDS).map(k => ({ n: t(k.n, 40).trim(), c: ACT_CATS.includes(k.c) ? k.c : '레슨', link: !!k.link })).filter(k => k.n).slice(0, 80), orchParts: 1, rev: (+c.rev || 0) + 1 };
    const cur = rows_(SH.ACTCFG);
    ACT_KEYS.forEach(k => {
      const s = JSON.stringify(val[k]); if (s.length > 45000) throw new Error(k + ' 내용이 너무 길어요.');
      const r = cur.find(x => String(x['항목']) === k);
      if (r) sh.cfg.getRange(r._row, 2).setValues([[s]]); else sh.cfg.appendRow([k, s]);
    });
    (b.log || []).slice(0, 50).forEach(x => sh.log.appendRow([stamp_(), a.name, t(x, 300)]));
    return { ok: true, rev: val.rev };
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

/* ================= 개인레슨 시간표 =================
 * 「개인레슨」: 한 줄 = 30분 칸 하나 (날짜(0부터) · 시간 · 교수 · 참가자ID · 학생 · 학원 · 접수번호 · 악기 · 배정 일시 · 관리자)
 * 날짜는 「일정설정」 days(교사 일정과 같은 날짜), 교수는 「교수진」에서 레슨 교수 */
const LES_HEAD = ['날짜', '시간', '교수', '참가자ID', '학생', '학원', '접수번호', '악기', '배정 일시', '관리자'];
function lesSheet_() { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(SH.LES); if (!sh) { sh = ss.insertSheet(SH.LES); sh.appendRow(LES_HEAD); } return sh; }
function lessons_() { lesSheet_(); return rows_(SH.LES).filter(r => String(r['교수'] || '') && String(r['참가자ID'] || '')).map(r => ({ d: +r['날짜'] || 0, t: hm_(r['시간']), pr: String(r['교수']), pid: String(r['참가자ID']), _row: r._row })); }
function lessonData(token) {
  adm_(token);
  let days = []; try { days = actCfg_().days || []; } catch (x) {}
  let acts = []; try { acts = actEvents_().map(e => ({ d: e.d, s: e.s, e: e.e, room: e.room, title: e.title + (e.stage && e.stage !== '본공연' ? ' ' + e.stage : ''), ppl: e.ppl }));   /* 개인레슨 칸에는 활동(이름 · 단계)과 장소만 — 곡명(세부)은 뺌 */ } catch (x) {}
  let people = []; try { people = actPeople_(actCfg_().people).map(p => ({ id: p.id, n: p.n })); } catch (x) {}
  let open = false; try { open = setting_('시간표 공개') === '예'; } catch (x) {}
  return { days, rows: lessons_().map(x => ({ d: x.d, t: x.t, pr: x.pr, pid: x.pid })), acts, people, open };
}
/** 칸 하나 배정/비우기: op = {d, t, pr, pid(빈 값이면 비우기)} */
function lessonSet(token, op) {
  const a = adm_(token); need_(a, 'tt');
  if (!op || !/^\d{2}:\d{2}$/.test(String(op.t)) || !op.pr) throw new Error('칸 정보가 잘못됐어요. 새로 불러와 주세요.');
  const lock = lock_();
  try {
    const sh = lesSheet_(); const L = lessons_();
    const d = +op.d || 0, t = String(op.t), pr = String(op.pr);
    const cur = L.find(x => x.d === d && x.t === t && x.pr === pr);
    if (op.pid) {
      const other = L.find(x => x.d === d && x.t === t && x.pid === op.pid && x.pr !== pr);
      if (other) throw new Error('이 학생은 같은 시간에 ' + other.pr + ' 교수 레슨이 있어요.');
      { const c = actCfg_(), ppl = actPeople_(c.people), nm = {}; ppl.forEach(p => nm[p.id] = p.n); const mm = v => { const q = String(v).split(':'); return +q[0] * 60 + +q[1]; };
        const ev = actEvents_().find(e => e.d === d && e.ppl.some(p => (nm[p.n] || String(p.n).replace(/^[CP]:/, '')) === pr) && mm(e.s) < mm(t) + 30 && mm(t) < mm(e.e));
        if (ev) throw new Error(pr + ' 교수님은 이 시간에 교사 일정 「' + ev.title + (ev.stage && ev.stage !== '본공연' ? ' ' + ev.stage : '') + '」 ' + ev.s + '~' + ev.e + ' ' + ev.room + '이(가) 있어서 레슨을 넣을 수 없어요.'); }
      let info = { name: '', acad: '', no: '', inst: '' };
      const sb = loadSubs_().find(x => String(op.pid).indexOf(x.no + '_') === 0);
      const p = sb && sb.ppl.find(q => q.id === op.pid);
      if (!p || p.status === '취소') throw new Error('참가자를 찾지 못했거나 취소된 사람이에요. 새로 불러와 주세요.');
      info = { name: p.name, acad: sb.acad, no: sb.no, inst: p.inst || '' };
      { const k = p.id.slice(sb.no.length + 1), req = +(((sb.form || {}).info || {})[k] || {}).lessons || 0;
        const have = L.filter(x => x.pid === op.pid && !(x.d === d && x.t === t && x.pr === pr)).length;
        if (!req) throw new Error(p.name + ' 학생은 추가레슨을 신청하지 않았어요.');
        if (have >= req) throw new Error(p.name + ' 학생은 신청한 ' + req + '회를 이미 다 배정했어요.'); }
      const row = [d, "'" + t, pr, op.pid, info.name, info.acad, info.no, info.inst, stamp_(), a.name];
      if (cur) sh.getRange(cur._row, 1, 1, LES_HEAD.length).setValues([row]); else sh.appendRow(row);
      log_('관리자 ' + a.name, '개인레슨 배정', d + '일 ' + t + ' ' + pr + ' · ' + info.name);
    } else if (cur) {
      sh.deleteRow(cur._row);
      log_('관리자 ' + a.name, '개인레슨 비움', d + '일 ' + t + ' ' + pr);
    }
  } finally { lock.releaseLock(); }
  return { ok: true, rows: lessons_().map(x => ({ d: x.d, t: x.t, pr: x.pr, pid: x.pid })) };
}

/* ================= 선생님 「내 시간표」 =================
 * 설정 「시간표 공개」 = 예 일 때만: 내 일정(교사 일정) + (교수면) 내 개인레슨 + 우리 학생 레슨 */
/* 그룹레슨 (11-03): 교사 일정의 「그룹레슨」 반 대상 권수(예: Vn 4B · 7+)와 학생 진도를 맞춰 자동으로 찾음. groupsOf(악기, 진도) → [{d, s, e, room, sub}] */
function grpMatch_() {
const GL = actEvents_().filter(e => e.title === '그룹레슨');
const INS = { '바이올린': 'Vn', '첼로': 'Vc', '플루트': 'Fl' };
const ordOf = (bk, pt) => (bk === 'Pre' ? 0 : +bk * 2 - 1) + (pt === 'B' ? 1 : 0);
const stuBk = prog => { const g = String(prog || ''); if (/^pre/i.test(g)) return { bk: 'Pre', pt: '' }; const m = g.match(/(\d+)\s*권\s*([AB])?/); return m ? { bk: String(Math.min(10, +m[1])), pt: m[2] || '' } : null; };
const hit = (tok, sbk) => { const m = String(tok).match(/^(Pre|\d+)([AB]*)(\+?)$/); if (!m) return false;
  if (m[3]) return ordOf(sbk.bk, sbk.pt || 'A') >= ordOf(m[1], m[2] === 'B' ? 'B' : 'A') || (m[1] === sbk.bk && !m[2]);
  return m[1] === sbk.bk && (!m[2] || !sbk.pt || m[2].includes(sbk.pt)); };
const groupsOf = (inst, prog) => { const k = INS[inst], sbk = stuBk(prog); if (!k || !sbk) return [];
  return GL.filter(e => ((e.tg || {})[k] && ((e.tg[k].b) || []).some(t => hit(t, sbk)))).map(e => ({ id: e.id, d: e.d, s: e.s, e: e.e, room: e.room, sub: e.sub || '' })); };
  return groupsOf;
}
/* ---------------- 캠프 일정 찾기 (11-03): 로그인 없이 학생 이름으로 그 아이 일정 (길 잃은 아이를 누구나 찾아 줄 수 있게) ----------------
 * 열리는 때: 설정 「시간표 공개」 = 예 이고, 캠프 시작 하루 전 ~ 끝나는 날. 설정 「일정 찾기」 = 예 이면 늘 열림(시험용), 아니오면 닫힘.
 * 보이는 것: 이름 · 학원 · 악기 · 담당 교사 · 그룹레슨 · 개인레슨 · 음악회 종류. 연락처 · 금액 · 출생연도는 안 보임. */
function findGate_() {
  const C = camp_(), name = String(C.base.name || CAMP_NAME), force = setting_('일정 찾기');
  const today = today_(), st = String(C.base.start || ''), en = String(C.base.end || '');
  const d0 = /^\d{4}-\d{2}-\d{2}$/.test(st) ? Utilities.formatDate(new Date(new Date(st + 'T00:00:00+09:00').getTime() - 86400000), TZ, 'yyyy-MM-dd') : '';
  const inPeriod = force === '예' || (force !== '아니오' && d0 && today >= d0 && (!en || today <= en));
  if (!inPeriod) return { ok: true, open: false, name, msg: '일정 찾기는 캠프 기간에만 열려요' + (st ? ' (' + st + ' ~ ' + en + ')' : '') + '.' };
  if (setting_('시간표 공개') !== '예') return { ok: true, open: false, name, msg: '아직 시간표가 정해지지 않았어요. 조금 뒤에 다시 찾아 주세요.' };
  return { ok: true, open: true, name };
}
/** 캠프 페이지 회원 로그인 (11-03): 회원관리 이메일 · 비밀번호 → 이름 · 번호 뒤 4자리로 같은 열쇠 */
function findLoginPw(email, pw, agree) {
  const G0 = findGate_(); if (!G0.open) return G0;
  if (agree !== true) return { ok: false, msg: '확인 체크를 해 주세요.' };
  let t; try { t = acctCheck_(email, pw); } catch (e) { return { ok: false, msg: e.message }; }
  const tok = Utilities.getUuid(); CacheService.getScriptCache().put('fk_' + tok, t.name + '|' + (t.p4 || '0000') + '|T', 21600);
  log_(t.name + ' (회원)', '캠프 페이지 들어감', '');
  return Object.assign(G0, { tok, who: t.name, teacher: true });
}
/* 일정 찾기 들어가기 (11-03): 이름 · 휴대전화 · 확인 체크 → 「기록」에 남기고 6시간 쓰는 열쇠를 줌 */
function findAccess(name, phone, agree) {
  const G0 = findGate_(); if (!G0.open) return G0;
  const nm = String(name || '').trim().slice(0, 20), ph = String(phone || '').replace(/\D/g, '');
  if (!nm || ph.length < 10) return { ok: false, msg: '이름과 휴대전화를 넣어 주세요.' };
  if (agree !== true) return { ok: false, msg: '확인 체크를 해 주세요.' };
  const C = CacheService.getScriptCache(), lk = 'fa_' + ph; const n = +(C.get(lk) || 0); if (n > 30) return { ok: false, msg: '잠시 뒤 다시 해 주세요.' }; C.put(lk, String(n + 1), 3600);
  const tok = Utilities.getUuid(); C.put('fk_' + tok, nm + '|' + ph.slice(-4), 21600);
  log_(nm + ' (' + ph.slice(-4) + ')', '일정 찾기 들어감', '');
  return Object.assign(G0, { tok });
}
function findTok_(tok) { const v = tok && CacheService.getScriptCache().get('fk_' + tok); if (!v) throw new Error('NEEDIN'); return v; }
/* 학원 방 (일정 찾기용): 공개된 방만, 비밀번호 · 다른 사람 이름은 빼고 */
function acadRooms_(acad) {
  try { const cfg = roomCfg_(), live = roomPubNow_(cfg); let days = []; try { days = actCfg_().days || []; } catch (x) {}
    return rooms_().filter(r => (live || r.pub) && r.occ.some(o => (o.k === 'acad' || o.k === 'fam') && (o.a || o.v) === acad)).map(r => ({ no: r.no, bld: r.bld, fl: r.fl, type: r.type,
      days: (r.days.length ? r.days : days.map((_, i) => i)).map(d => days[d] || (d + 1) + '일') })); } catch (x) { return []; }
}
/* 학생 명단 (일정 찾기용): 이름 · 학원 · 악기 · 담당 · 진도 · 음악회 */
function findStudents_() { const all = [];
  loadSubs_().forEach(sb => sb.ppl.forEach(p => { if (p.status === '취소') return; const k = p.id.slice(sb.no.length + 1), i = (sb.form && sb.form.info && sb.form.info[k]) || {};
    const type = p.type || i.type || ''; if (!['학생', '회원의 악기하는 자녀', '비회원 학생', '해외 학생'].includes(type)) return;
    all.push({ id: p.id, name: p.name, acad: sb.acad, owner: String(sb.owner || ''), by: String(i.by || ''), mc: Array.isArray(i.mc) ? i.mc : [], inst: p.inst || i.inst || '', teacher: i.teacher || '', prog: i.prog || '', concert: i.concert && i.concert !== '없음' ? i.concert : '' }); }));
  return all; }
/* 학생 한 명의 캠프 일정 카드 (일정 찾기 · 우리 아이 공통): 그룹레슨 · 개인레슨 · 마스터클래스 · 음악회 · 학원 방 */
function kidCtx_() { const c = actCfg_(), days = c.days || [], P = profs_(), evs = actEvents_(); const pn = id => ((c.people || []).find(p => p.id === id) || { n: String(id).replace(/^[CP]:/, '') }).n;
  return { days, dl: d => String(days[d] || ''), groupsOf: grpMatch_(), L: lessons_(), roomOf: n => (P.find(p => p.name === n) || {}).room || '',
    mcs: evs.filter(e => e.title === '마스터클래스').map(e => ({ id: e.id, who: [e.sub].concat(e.ppl.map(p => pn(p.n))).filter(Boolean), d: e.d, s: e.s, e: e.e, room: e.room })) }; }
function kidCard_(x, K) {
  const G = {}; K.groupsOf(x.inst, x.prog).forEach(g => { const kk = g.sub + '|' + g.room + '|' + g.s + '|' + g.e; (G[kk] = G[kk] || { id: g.id, sub: g.sub, room: g.room, s: g.s, e: g.e, d: [] }).d.push(g.d); });
  const nz = v => String(v || '').replace(/\s+/g, '');
  const mc = (x.mc || []).map(m => ({ pr: m, at: K.mcs.filter(e => e.who.some(w => nz(w).includes(nz(m)) || nz(m).includes(nz(w)))).map(e => ({ id: e.id, d: e.d, day: K.dl(e.d), t: e.s, e: e.e, room: e.room })) }));
  return { name: x.name, acad: x.acad, inst: x.inst, teacher: x.teacher, by: x.by, prog: x.prog, concert: x.concert, rooms: acadRooms_(x.acad),
    grp: Object.values(G).map(g => ({ id: g.id, sub: g.sub, room: g.room, time: g.s + (g.e ? '~' + g.e : ''), days: g.d.sort((a, b) => a - b).map(K.dl), d: g.d.slice().sort((a, b) => a - b), s: g.s, e: g.e })),
    les: K.L.filter(l => l.pid === x.id).sort((a, b) => a.d - b.d || String(a.t).localeCompare(String(b.t))).map(l => ({ d: l.d, day: K.dl(l.d), t: l.t, pr: l.pr, room: K.roomOf(l.pr) })), mc };
}
function findWho_(tok) { const v = String(findTok_(tok)).split('|'); return { nm: v[0] || '', p4: v[1] || '' }; }
/** 우리 아이: 보호자가 넣은 [{name, by(출생연도)}] + 비회원 보호자로 접수한 아이(이름 · 번호 뒤 4자리가 같으면 자동) */
function findMyKids(list, tok) {
  const G0 = findGate_(); if (!G0.open) return G0; let me; try { me = findWho_(tok); } catch (e) { return { ok: false, needIn: true, msg: '처음 화면에서 이름 · 휴대전화를 넣어 주세요.' }; }
  const nz = v => String(v || '').replace(/\s+/g, ''), all = findStudents_(), K = kidCtx_(), out = [], seen = {}, miss = [];
  const push = (x, how) => { if (seen[x.id]) return; seen[x.id] = 1; out.push(Object.assign(kidCard_(x, K), { how, q: x.q })); };
  all.filter(x => x.acad === GUEST_ACAD && nz(x.owner) === nz(me.nm) + '(' + me.p4 + ')').forEach(x => push(x, 'auto'));
  (Array.isArray(list) ? list : []).slice(0, 8).forEach(q => { const n = nz(q && q.name); if (n.length < 2) return;
    let H = all.filter(x => nz(x.name) === n); if (!H.length) H = all.filter(x => nz(x.name).includes(n)).slice(0, 5);   /* 이름만 (출생연도 안 받음, 11-03) */
    if (!H.length) miss.push({ name: q.name }); H.forEach(x => push(Object.assign({}, x), 'add')); });
  return Object.assign(G0, { ok: true, kids: out, miss });
}
/** 캠프 페이지 첫 화면 정보: 공지 · 식사 · 장소 · 연락처 · 음악회 순서 */
function campHome(tok) {
  const G0 = findGate_(); if (!G0.open) return G0; try { findTok_(tok); } catch (e) { return { ok: false, needIn: true, msg: '처음 화면에서 이름 · 휴대전화를 넣어 주세요.' }; }
  const c = actCfg_(), days = c.days || [];
  const places = {}; Object.keys(c.rooms || {}).forEach(d => (c.rooms[d] || []).forEach(r => { if (r[0] && !places[r[0]]) places[r[0]] = r[1] || ''; }));
  const info = ['운영실', '운영실 연락처', '의무실', '의무실 연락처', '식당', '주차', '와이파이'].map(k => ({ k, v: setting_(k) })).filter(x => x.v);
  const evs = actEvents_(), linked = (Array.isArray(c.kinds) ? c.kinds : ACT_KINDS).filter(k => k.link).map(k => k.n);
  const concerts = Array.isArray(c.concerts) ? c.concerts : evs.filter(e => e.type === '오후음악회' || (linked.includes(e.title) && (!e.stage || e.stage === '본공연'))).map(e => ({ id: 'c' + e.id, name: evName_(e), d: e.d, cs: e.s, room: e.room }));
  const order0 = c.conorder || {}, needInf = concerts.some(x => (order0[x.id] || []).length);
  const inf = {}; if (needInf) loadSubs_().forEach(sb => sb.ppl.forEach(p => { const k = p.id.slice(sb.no.length + 1), i = (sb.form && sb.form.info && sb.form.info[k]) || {}; inf[p.id] = { name: p.name, acad: sb.acad, inst: p.inst || i.inst || '', song: i.other ? String((i.oc || '') + ' ' + (i.ot || '')).trim() : String(i.song || ''), x: p.status === '취소' }; }));
  const order = c.conorder || {};
  /* 공지사항: 시트 「공지사항」(날짜 · 제목 · 내용 · 맨 위) — 운영진이 줄을 더하면 바로 보임, 최근 것 먼저 */
  let notices = []; try { ntcSheet_();
    notices = rows_('공지사항').filter(r => String(r['제목'] || r['내용'] || '').trim()).map(r => ({ at: r['날짜'] instanceof Date ? Utilities.formatDate(r['날짜'], TZ, 'M/d HH:mm') : String(r['날짜'] || ''), title: String(r['제목'] || ''), body: String(r['내용'] || ''), top: /^(예|y|o|1|true)$/i.test(String(r['맨 위'] || '').trim()) })).reverse(); } catch (x) {}
  const share = setting_('공유주소') || 'https:\/\/app.suzukimusickorea.org/camp/';
  return Object.assign(G0, { ok: true, days, notices, notice: setting_('공지'), teacherUrl: share + (setting_('테스트 로그인') ? (share.indexOf('?') < 0 ? '?test' : '&test') : ''), meals: (c.meals || []).map(m => ({ d: m.d, day: String(days[m.d] || ''), s: m.s, e: m.e, t: m.t, k: m.k })), menu: (() => { try { return menuRows_(); } catch (x) { return []; } })(),
    places: Object.keys(places).map(n => ({ name: n, loc: places[n] })), info,
    concerts: concerts.map(x => ({ name: x.name, d: x.d, day: String(days[x.d] || ''), cs: x.cs, room: x.room, list: (order[x.id] || []).map(pid => inf[pid]).filter(v => v && !v.x).map((v, i) => ({ n: i + 1, name: v.name, acad: v.acad, inst: v.inst, song: v.song })) })).filter(x => x.list.length) });
}
/** 캠프 페이지 요청 · 문의: 일정 찾기 이름 · 번호로 글쓰기 / 내 글 보기 */
function findIssue(d, tok) { let me; try { me = findWho_(tok); } catch (e) { return { ok: false, needIn: true, msg: '처음 화면에서 이름 · 휴대전화를 넣어 주세요.' }; }
  d = d || {}; const r = submitIssue('', { name: me.nm, phone: me.p4, text: d.text, where: '캠프 페이지' + (d.where ? ' · ' + String(d.where).slice(0, 20) : ''), file: d.file, acad: d.acad || '' });
  return Object.assign({ ok: true }, r || {}, { mine: findMyIssues_(me) }); }
function findMyIssues_(me) { return issues_().filter(x => x.name === me.nm && x.p4 === me.p4).reverse().map(x => ({ no: x.no, at: x.at, where: x.where, text: x.text, state: x.state, reply: x.reply })); }
function findMyIssues(tok) { let me; try { me = findWho_(tok); } catch (e) { return { ok: false, needIn: true }; } return { ok: true, mine: findMyIssues_(me) }; }
/** 이름으로 찾기: 학생이면 그 아이 일정, 교사 · 교수면 그 사람 스케줄 (누가 누군지 서로 알게, 11-03) */
function findKid(q, tok) {
  const G0 = findGate_(); if (!G0.open) return G0; const name = G0.name; try { findTok_(tok); } catch (e) { return { ok: false, needIn: true, msg: '처음 화면에서 이름 · 휴대전화를 넣어 주세요.' }; }
  const nq = String(q || '').replace(/\s+/g, ''); if (nq.length < 2) return { ok: false, msg: '이름을 두 글자 이상 넣어 주세요.' };
  const c = actCfg_(), days = c.days || [], groupsOf = grpMatch_(), L = lessons_(), P = profs_();
  const roomOf = n => (P.find(p => p.name === n) || {}).room || '';
  const nm = s => String(s || '').replace(/\s+/g, '');
  const pick = arr => { let h = arr.filter(x => nm(x.name) === nq); if (!h.length) h = arr.filter(x => nm(x.name).includes(nq)); return h; };
  const dl = d => String(days[d] || '');
  const all = findStudents_(), hits = pick(all);
  const K = kidCtx_(), kids = hits.slice(0, 20).map(x => kidCard_(x, K));
  /* 교사 · 교수 */
  const ppl = (c.people || []).map(p => ({ id: p.id, name: p.n, acad: p.acad || p.a || '', inst: p.inst || p.i || '' }));
  const sById = {}; all.forEach(s => sById[s.id] = s);
  const evs = actEvents_();
  const staff = pick(ppl).slice(0, 20).map(p => {
    const it = evs.filter(e => e.ppl.some(x => x.n === p.id)).map(e => ({ id: e.id, d: e.d, t: e.s, e: e.e, room: e.room, title: evName_(e), role: (e.ppl.find(x => x.n === p.id) || {}).r || '' }));
    L.filter(l => nm(l.pr) === nm(p.name)).forEach(l => { const s = sById[l.pid]; it.push({ id: 'L|' + l.pr + '|' + l.d, d: l.d, t: l.t, e: '', room: roomOf(l.pr), title: '개인레슨', role: s ? s.name + ' (' + s.acad + ')' : '' }); });
    it.sort((a, b) => a.d - b.d || String(a.t).localeCompare(String(b.t)));
    return { name: p.name, acad: p.acad, inst: p.inst, prof: P.some(x => nm(x.name) === nm(p.name)), items: it.map(x => Object.assign(x, { day: dl(x.d) })) }; });
  /* 학원 이름으로 찾으면 그 학원 방 */
  const acNames = [...new Set(all.map(s => s.acad))]; let ah = acNames.filter(a => nm(a) === nq); if (!ah.length) ah = acNames.filter(a => nm(a).includes(nq));
  const acads = ah.slice(0, 5).map(a => ({ acad: a, n: all.filter(s => s.acad === a).length, rooms: acadRooms_(a) }));
  return { ok: true, open: true, name, more: hits.length > 20, kids, staff, acads };
}
/** 시간표 (교실 · 시간): 날마다 일정 목록. 개인레슨은 교수마다 그날 한 줄로 묶음 */
function campBoard(tok) {
  const G0 = findGate_(); if (!G0.open) return G0; try { findTok_(tok); } catch (e) { return { ok: false, needIn: true, msg: '처음 화면에서 이름 · 휴대전화를 넣어 주세요.' }; }
  return campBoard_(G0);
}
function campBoard_(G0) {
  const c = actCfg_(), days = c.days || [], L = lessons_(), P = profs_();
  const roomOf = n => (P.find(p => p.name === n) || {}).room || '';
  const items = actEvents_().map(e => ({ id: e.id, d: e.d, s: e.s, e: e.e, room: e.room, title: evName_(e), kind: e.title, n: e.ppl.length }));
  const LB = {}; L.forEach(l => { const k = l.pr + '|' + l.d; const o = LB[k] || (LB[k] = { id: 'L|' + k, d: l.d, s: l.t, e: l.t, room: roomOf(l.pr) || '레슨실', title: '개인레슨 · ' + l.pr, kind: '개인레슨', n: 0 }); o.n++; if (String(l.t) < String(o.s)) o.s = l.t; if (String(l.t) > String(o.e)) o.e = l.t; });
  return Object.assign(G0, { days, items: items.concat(Object.values(LB)).sort((a, b) => a.d - b.d || String(a.s).localeCompare(String(b.s)) || String(a.room).localeCompare(String(b.room))) });
}
/** 일정 하나를 누르면: 와야 할 사람 (교사 · 역할, 그룹레슨이면 권수가 맞는 학생, 개인레슨이면 시간별 학생) */
function campEventPeople(id, tok) {
  const G0 = findGate_(); if (!G0.open) return G0; try { findTok_(tok); } catch (e) { return { ok: false, needIn: true, msg: '처음 화면에서 이름 · 휴대전화를 넣어 주세요.' }; }
  return campEventPeople_(id);
}
function campEventPeople_(id) {
  const c = actCfg_(), ppl = (() => { try { return actPeople_(c.people); } catch (x) { return c.people || []; } })(), pn = x => (ppl.find(p => p.id === x) || { n: String(x).replace(/^[CP]:/, '') }).n;
  const all = findStudents_();
  if (/^L\|/.test(String(id))) { const [, pr, d] = String(id).split('|'); const sById = {}; all.forEach(s => sById[s.id] = s);
    return { ok: true, open: true, staff: [{ name: pr, role: '교수' }], students: lessons_().filter(l => l.pr === pr && String(l.d) === d).sort((a, b) => String(a.t).localeCompare(String(b.t))).map(l => { const s = sById[l.pid] || {}; return { name: s.name || '', acad: s.acad || '', note: l.t }; }) }; }
  const e = actEvents_().find(x => x.id === String(id)); if (!e) return { ok: false, msg: '그 일정을 찾지 못했어요. 새로 고쳐 주세요.' };
  const staff = e.ppl.map(x => ({ name: pn(x.n), role: x.r || '' }));
  let students = [];
  const ck = camp_().cons.find(n => String(e.title).indexOf(n) >= 0) || (/afternoon|오후/i.test(e.title) ? '오후' : /twilight|트와일라잇/i.test(e.title) ? '트와일라잇' : /evening|이브닝/i.test(e.title) ? '이브닝' : '');
  if (ck && (!e.stage || e.stage === '본공연')) students = all.filter(s => s.concert === ck).map(s => ({ name: s.name, acad: s.acad, note: s.inst })).sort((a, b) => a.acad.localeCompare(b.acad) || a.name.localeCompare(b.name));
  if (e.title === '그룹레슨') { const groupsOf = grpMatch_(); students = all.filter(s => groupsOf(s.inst, s.prog).some(g => g.id === e.id)).map(s => ({ name: s.name, acad: s.acad, note: s.inst })).sort((a, b) => a.acad.localeCompare(b.acad) || a.name.localeCompare(b.name)); }
  return { ok: true, open: true, staff, students };
}
/** 교사 화면 「시간표 → 전체 일정」: 로그인한 교사, 「시간표 공개」=예일 때 */
function ttBoard(token) { const u = who_(token); if (setting_('시간표 공개') !== '예') return { ok: true, open: false, msg: '아직 시간표가 공개되지 않았어요.' };
  const B = campBoard_({ ok: true, open: true });
  try { const c = actCfg_(), ppl = actPeople_(c.people), T = teachers_().find(t => t.name === u.name && t.acads.some(a => u.acads.includes(a)));
    const nm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    const me = {}; ppl.filter(p => (T && p.tid === T.id) || (!p.tid && nm(p.n) === nm(u.name))).forEach(p => me[p.id] = 1);
    const E = {}; actEvents_().forEach(e => E[e.id] = e);
    B.items.forEach(x => { const e = E[x.id]; if (e) { const r = e.ppl.find(p => me[p.n]); if (r) { x.mine = 1; x.role = r.r || ''; } } else if (/^L\|/.test(x.id) && nm(x.id.split('|')[1]) === nm(u.name)) x.mine = 1; });
    B.rooms = c.rooms || {}; } catch (x) {}
  return B; }
function ttEventPeople(token, id) { who_(token); if (setting_('시간표 공개') !== '예') return { ok: false, msg: '아직 시간표가 공개되지 않았어요.' }; return campEventPeople_(id); }
function myTimetable(token) {
  const u = who_(token);
  if (setting_('시간표 공개') !== '예') return { open: false, rooms: myRooms_(u) };
  const c = actCfg_(); const days = c.days || [];
  const ppl = actPeople_(c.people); const T = teachers_().find(t => t.name === u.name && t.acads.some(a => u.acads.includes(a)));
  const nm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
  const meIds = ppl.filter(p => (T && p.tid === T.id) || (!p.tid && nm(p.n) === nm(u.name))).map(p => p.id);
  const pn = id => (ppl.find(p => p.id === id) || { n: id }).n;
  const roomLoc = (d, r) => (((c.rooms || {})[d] || []).find(x => x[0] === r) || [])[1] || '';
  const mine = [];
  actEvents_().forEach(e => { const me = e.ppl.find(p => meIds.includes(p.n)); if (!me) return;
    mine.push({ d: e.d, t: e.s, e: e.e, what: me.r, title: evName_(e), where: e.room, loc: roomLoc(e.d, e.room), tg: Object.keys(e.tg || {}).map(k => { const x = tgTok_((e.tg[k] || {}).b).txt; return x ? k + ' ' + x : ''; }).filter(Boolean).join(' · '), with: e.ppl.filter(p => !meIds.includes(p.n)).map(p => pn(p.n) + '(' + p.r + ')').join(', ') }); });
  const prof = profs_().find(p => p.on && p.lesson && nm(p.name) === nm(u.name));
  const subs = loadSubs_(); const byPid = {};
  subs.forEach(sb => sb.ppl.forEach(p => { if (p.status !== '취소') { const k = p.id.slice(sb.no.length + 1); byPid[p.id] = { p, sb, i: (sb.form && sb.form.info && sb.form.info[k]) || {} }; } }));
  const L = lessons_(); const roomOf = n => (profs_().find(p => p.name === n) || {}).room || '';
  if (prof) L.filter(x => x.pr === prof.name).forEach(x => { const s = byPid[x.pid]; if (!s) return; mine.push({ d: x.d, t: x.t, e: '', what: '개인레슨', title: '개인레슨', where: prof.room || '레슨실', loc: '', with: s ? s.p.name + ' (' + s.sb.acad + ')' : '' }); });
  const stu = [];
  const groupsOf = grpMatch_();
  Object.keys(byPid).forEach(id => { const s = byPid[id]; const type = s.p.type || s.i.type || '';
    if (!['학생', '회원의 악기하는 자녀', '비회원 학생'].includes(type)) return;
    const mineSub = s.sb.owner === u.name, myPupil = nm(s.i.teacher) === nm(u.name) && u.acads.includes(s.sb.acad), sameAcad = u.acads.includes(s.sb.acad);
    if (!mineSub && !myPupil && !sameAcad) return;
    const inst = s.p.inst || s.i.inst || '';
    stu.push({ name: s.p.name, acad: s.sb.acad, inst, teacher: s.i.teacher || '', req: +s.i.lessons || 0, mine: mineSub || myPupil, prog: s.i.prog || '', mc: Array.isArray(s.i.mc) ? s.i.mc : (s.i.mc ? [String(s.i.mc)] : []), grp: groupsOf(inst, s.i.prog), lessons: L.filter(x => x.pid === id).map(x => ({ d: x.d, t: x.t, pr: x.pr, room: roomOf(x.pr) })) }); });
  stu.sort((a, b) => a.acad.localeCompare(b.acad) || a.name.localeCompare(b.name));
  /* 마스터클래스 일정 (11-03): 교사 일정 종류 「마스터클래스」, 교수 = 그 일정 사람 · 세부 이름 */
  const mcs = actEvents_().filter(e => e.title === '마스터클래스').map(e => ({ who: [e.sub].concat(e.ppl.map(p => pn(p.n))).filter(Boolean), d: e.d, s: e.s, e: e.e, room: e.room }));
  return { open: true, days, mine, prof: prof ? { name: prof.name, room: prof.room } : null, students: stu, rooms: myRooms_(u), mcs };
}
/** 관리자: 설정 한 줄 바꾸기 (시간표 공개 등 허용된 항목만) */
function adminSetSetting(token, key, val) {
  const a = adm_(token); need_(a, key === '시간표 공개' ? 'tt' : ['ntc', 'tt']);
  if (!['시간표 공개', '공지', '운영실', '운영실 연락처', '의무실', '의무실 연락처', '식당', '주차', '와이파이'].includes(key)) throw new Error('바꿀 수 없는 설정이에요.');
  ensureSettings_(); const sh = SpreadsheetApp.getActive().getSheetByName('설정');
  const r = rows_('설정').find(x => String(x['항목']) === key);
  if (r) sh.getRange(r._row, 2).setValues([[String(val)]]); else sh.appendRow([key, String(val), '']);
  log_('관리자 ' + a.name, '설정 바꿈', key + ' = ' + val); setMemoClear_();
  return { ok: true, val: setting_(key) };
}
/** 캠프 설정 › 입금 안내 통장: 회원관리 › 통장에 등록한 통장 목록 + 지금 쓰는 계좌 (11-01) */
function campBankAccts(token) {
  adm_(token); const list = [];
  try { const ss = bankBook_(), A = ss && bankTab_(ss, '통장목록'); if (A) A.v.filter(r => r[A.c('사용')] !== '안씀' && r[A.c('계좌번호')]).forEach(r => list.push({ id: r[A.c('통장ID')], name: r[A.c('이름')], bank: r[A.c('은행')], acct: r[A.c('계좌번호')], holder: r[A.c('예금주')] })); } catch (e) { }
  const b = bankInfo_(); return { list, cur: { bank: b.bank, acct: b.acct, holder: b.holder, auto: !setting_('입금 계좌번호') } };
}
function adminSetBankAcct(token, id) {
  const a = adm_(token); needSup_(a);
  const x = campBankAccts(token).list.find(y => y.id === id); if (!x) throw new Error('통장을 찾지 못했어요. 회원관리 › 통장 › 설정을 확인해 주세요.');
  ensureSettings_(); const sh = SpreadsheetApp.getActive().getSheetByName('설정');
  [['입금 은행', x.bank], ['입금 계좌번호', x.acct], ['예금주', x.holder]].forEach(([k, v]) => { const r = rows_('설정').find(q => String(q['항목']) === k); if (r) sh.getRange(r._row, 2).setNumberFormat('@').setValue(String(v)); else sh.appendRow([k, String(v), '']); });
  CacheService.getScriptCache().remove('bankAcct'); log_('관리자 ' + a.name, '입금 안내 통장', x.name + ' · ' + x.bank + ' ' + x.acct);
  return campBankAccts(token);
}
function adminGetSetting(token, key) { adm_(token); return { val: setting_(key) }; }

/* ================= 방 배정 =================
 * 「방배정」: 한 줄 = 방 하나. 처음 열 때 겨울 숙소 객실 목록(Stay Tower S · Flex Tower P, 406실)으로 채움
 * 정원 기본: 18평 3명 · 23평 4명 · 27평 5명 · 표시 없음 5명 (방마다 고칠 수 있음) */
const ROOM_HEAD = ['방번호', '건물', '층', '타입', '정원', '방종류', '메인학원', '메인 인원', '보조학원', '보조 인원', '비번 수신자', '교수', '메모', '고친 일시', '관리자', '배정', '사용 날짜', '공개', '색', '평수', '침대', '방 특징'];
/* 배정(JSON) = 방을 쓰는 묶음 목록 [{k, v, n, a, days, tm, no}] — 맨 앞이 메인
 *   k: acad 학원 · grp 관리자가 만든 이름(본부방 · 애플방 …) · name 개인(교수 · 연수교사 …) · fam 가족방 신청 가족(no = 접수번호)
 *   n: 그 묶음이 자는 인원 · a: 인원을 셀 학원 · days: 쓰는 날짜(빈 값 = 방 사용 날짜 전부) · tm: 시간 메모(예: 14:00 이후)
 * 사용 날짜 = 방을 쓰는 날짜 번호(교사 일정 날짜), 빈 값 = 모든 날짜 · 공개 = 예면 일괄 공개 전이라도 그 방은 선생님 화면에 보임
 * 메인학원 · 메인 인원 · 보조학원 · 보조 인원 · 교수 칸은 시트에서 보기 쉽게 배정에서 다시 채움 */
const ROOM_KINDS = ['클래스방', '가족방', '교수방', '여교사방', '남교사방', '레슨방', '본부방'];
const ROOM_INV = 'S101:;S102:;S103:;S105:;S106:;S107:;S108:;S109:;S117:;S118:;S119:;S121:;S122:;S123:;S125:;S126:;S127:;S128:;S129:;S130:;S201:;S202:;S203:;S205:;S206:;S207:;S208:;S209:;S210:;S211:;S212:;S213:;S215:;S216:;S217:;S218:;S219:;S220:;S221:;S222:;S223:;S225:;S226:;S227:;S228:;S229:;S230:;S231:;S232:;S233:;S236:;S237:;S238:;S239:;S240:;S241:;S301:;S302:;S303:;S305:;S306:;S307:;S308:;S309:;S310:23C;S311:23C;S312:23C;S313:23C;S315:23C;S316:23C;S317:23C;S318:23C;S319:23C;S320:;S321:;S322:;S323:;S325:;S326:;S327:;S328:;S329:;S330:;S331:;S332:;S333:;S336:;S338:;S339:;S340:;S341:;S401:;S402:;S403:;S405:;S406:;S407:;S408:;S409:;S410:;S411:;S412:;S413:;S415:;S416:;S417:;S418:;S419:;S420:;S421:;S422:;S423:;S425:;S426:;S427:;S428:;S429:;S430:;S431:;S432:;S433:;S435:;S501:27H;S502:27H;S503:27H;S505:27H;S506:27H;S507:27H;S508:27H;S509:18C;S510:;S511:;S512:;S513:;S515:;S516:;S517:;S518:;S519:;S520:27H;S521:18C;S522:;S523:;S525:27H;S526:27H;S527:27H;S528:27H;S529:27H;S530:27H;S531:27H;S532:27H;S533:27H;S535:;S601:27H;S602:27H;S603:27H;S605:27H;S606:27H;S607:27H;S608:27H;S609:18H;S610:;S611:;S612:;S613:;S615:;S616:;S617:;S618:;S619:;S620:27H;S621:18H;S622:18H;S623:18H;S625:;S626:;S627:;S628:;S629:;S630:;S631:;S632:;S633:;S635:;S701:27H;S702:27H;S703:27H;S705:27H;S706:27H;S707:27H;S708:27H;S709:18T;S710:27H;S711:27H;S712:27H;S713:27H;S715:27H;S716:27H;S717:27H;S718:27H;S719:27H;S720:27H;S721:18T;S722:18T;S723:18T;S725:27H;S726:27H;S727:27H;S728:27H;S729:27H;S730:27H;S731:27H;S732:27H;S733:27H;S735:;S801:23H;S802:23H;S803:;S805:;S806:;S807:;S808:;S809:18H;S810:;S811:;S812:;S813:;S815:23H;S816:23H;S817:23H;S818:23H;S819:23H;S820:27H;S821:18H;S822:18H;S823:18H;S825:23H;S826:23H;S827:23H;S828:23H;S829:23H;S830:23H;S831:27H;S833:;S901:23T;S902:23T;S903:23T;S905:23T;S906:23T;S907:23T;S908:23T;S909:18T;S910:23T;S911:23T;S912:23T;S913:23T;S915:23T;S916:23T;S917:23T;S918:23T;S919:23T;S920:27H;S921:18T;S922:18T;S923:18T;S925:23T;S926:23T;S927:23T;S928:23T;S929:23T;S930:23T;S931:27H;P201:;P202:;P203:;P205:;P206:;P207:;P208:;P209:;P210:;P211:;P212:;P213:;P215:;P216:;P217:;P218:;P219:;P301:;P302:;P303:;P305:;P306:;P307:;P308:;P309:;P310:;P311:;P312:;P313:;P315:;P316:;P317:;P318:;P319:;P320:;P321:;P322:;P323:;P325:;P326:;P327:;P401:;P402:;P403:;P405:;P406:;P407:;P408:;P409:;P410:;P411:;P412:;P413:;P415:;P416:;P417:;P418:;P419:;P420:;P421:;P422:;P423:;P425:;P426:;P427:;P501:;P502:;P503:;P505:;P506:;P507:;P508:;P509:;P510:;P511:;P512:;P513:;P515:;P516:;P517:;P518:;P519:;P520:;P601:;P602:;P603:;P605:;P606:;P607:;P608:;P609:;P610:;P611:;P612:;P613:;P615:;P616:;P617:;P618:;P619:;P620:;P701:;P702:;P703:;P705:;P706:;P707:;P708:;P709:;P710:;P711:;P712:;P713:;P715:;P716:;P717:;P718:;P719:;P720:;P801:;P802:;P803:;P805:;P806:;P807:;P808:;P809:;P810:;P811:;P812:;P813:;P815:;P816:;P817:';
function roomSheet_() {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(SH.ROOM);
  if (!sh) {
    sh = ss.insertSheet(SH.ROOM); sh.appendRow(ROOM_HEAD);
    const cap = { '18': 3, '23': 4, '27': 5 };
    const rows = ROOM_INV.split(';').filter(Boolean).map(x => { const [no, type] = x.split(':'); return [no, no[0] === 'S' ? 'Stay Tower' : 'Flex Tower', no.slice(1, -2) + 'F', type || '', cap[String(type || '').slice(0, 2)] || 5, '', '', '', '', '', '', '', '', '', '']; });
    sh.getRange(2, 1, rows.length, ROOM_HEAD.length).setValues(rows.map(r => r.concat(Array(ROOM_HEAD.length).fill('')).slice(0, ROOM_HEAD.length)));
  } else ensureHead_(SH.ROOM, ROOM_HEAD);
  return sh;
}
/** 예전 줄(배정 칸 없음) → 메인 · 보조 · 교수로 배정 목록 만들기 */
function roomOcc_(r) {
  if (r.occ && r.occ.length) return r.occ;
  const L = [];
  if (r.prof) L.push({ k: 'name', v: r.prof, n: 1, a: '교수진', days: [], tm: '' });
  if (r.main && r.main !== r.prof) L.push({ k: ['본부', '교수진'].includes(r.main) ? 'grp' : 'acad', v: r.main, n: r.mn || 0, a: r.main, days: [], tm: '' });
  if (r.sub) L.push({ k: 'acad', v: r.sub, n: r.sn || 0, a: r.sub, days: [], tm: '' });
  return L;
}
function rooms_() {
  roomSheet_();
  return rows_(SH.ROOM).filter(r => String(r['방번호'] || '')).map(r => ({ no: String(r['방번호']), bld: String(r['건물'] || ''), fl: String(r['층'] || ''), type: String(r['타입'] || ''), cap: +r['정원'] || 0,
    kind: String(r['방종류'] || '').replace(/^\d인가족방$/, '가족방'), main: String(r['메인학원'] || ''), mn: +r['메인 인원'] || 0, sub: String(r['보조학원'] || ''), sn: +r['보조 인원'] || 0, pw: String(r['비번 수신자'] || ''), prof: String(r['교수'] || ''), memo: String(r['메모'] || ''), _row: r._row,
    occ: (() => { try { const o = JSON.parse(String(r['배정'] || '[]')); return Array.isArray(o) ? o : []; } catch (x) { return []; } })(),
    days: String(r['사용 날짜'] == null ? '' : r['사용 날짜']).split(',').map(x => x.trim()).filter(x => /^\d+$/.test(x)).map(Number), pub: String(r['공개'] || '') === '예', color: /^#[0-9a-f]{6}$/i.test(String(r['색'] || '')) ? String(r['색']) : '', size: String(r['평수'] || ''), beds: r['침대'] === '' || r['침대'] == null ? '' : +r['침대'], feat: String(r['방 특징'] || '') }))
    .map(r => Object.assign(r, { occ: roomOcc_(r) }));
}
/** 방 설정: 일괄 공개 · 공개 시각 · 메인에 고를 수 있는 이름(본부방 · 애플방 …) */
function roomCfg_() {
  let names = []; try { names = JSON.parse(setting_('방 이름 목록') || '[]'); } catch (x) {}
  if (!Array.isArray(names) || !names.length) names = ['본부방', '교수진'];
  let colors = {}; try { colors = JSON.parse(setting_('방 색') || '{}') || {}; } catch (x) {}
  let tcol = {}; try { tcol = JSON.parse(setting_('방 타입 색') || '{}') || {}; } catch (x) {}
  return { typeColors: tcol, layoutSrc: String(setting_('배치도 시트') || ''), pubAll: setting_('방 공개') === '예', pubAt: String(setting_('방 공개 시각') || '').replace(/^'/, ''), names, colors: { mode: colors.mode === 'main' ? 'main' : 'kind', kind: colors.kind || {}, main: colors.main || {} } };
}
function roomPubNow_(cfg) { if (!cfg.pubAll) return false; if (!cfg.pubAt) return true; const t = new Date(cfg.pubAt.replace(' ', 'T') + ':00+09:00'); return isNaN(t) ? true : Date.now() >= t.getTime(); }
function roomCfgSave(token, b) {
  const a = adm_(token); need_(a, 'room');
  const at = String((b && b.pubAt) || '').trim(); if (at && !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(at)) throw new Error('공개 시각을 2027-01-05 18:00 꼴로 넣어 주세요.');
  const names = [...new Set(((b && b.names) || []).map(x => String(x).trim().slice(0, 30)).filter(Boolean))].slice(0, 30);
  ensureSettings_(); const sh = SpreadsheetApp.getActive().getSheetByName('설정');
  const put = (k, v, d) => { const r = rows_('설정').find(x => String(x['항목']) === k); if (r) sh.getRange(r._row, 2).setValues([[v]]); else sh.appendRow([k, v, d]); };
  put('방 공개', b && b.pubAll ? '예' : '아니오', '「예」면 공개 시각부터 선생님 화면 「우리 방」에 방이 보여요 (방마다 따로 공개도 가능)');
  put('방 공개 시각', at ? "'" + at.replace('T', ' ') : '', '비우면 바로 공개 · 예) 2027-01-05 18:00');
  put('방 이름 목록', JSON.stringify(names), '방배정 메인에 학원 대신 고를 수 있는 이름');
  if (b && b.layoutSrc !== undefined) { const v = String(b.layoutSrc || '').trim(); if (v && !/\/d\/[a-zA-Z0-9_-]{20,}|^[a-zA-Z0-9_-]{20,}$/.test(v)) throw new Error('구글 시트 주소를 그대로 붙여 넣어 주세요 (https://docs.google.com/spreadsheets/d/…).');
    put('배치도 시트', v, '방배정 도면을 그린 구글 시트 주소 (비우면 이 시트 · 주소에 gid가 있으면 그 탭 하나만)'); try { CacheService.getScriptCache().remove('lytabs_' + (layoutSrcId_() || 'here') + '_' + layoutGid_()); } catch (x) {} }
  if (b && b.typeColors) { const o = {}; Object.keys(b.typeColors).slice(0, 40).forEach(k => { if (/^#[0-9a-f]{6}$/i.test(k)) { const v = String(b.typeColors[k] || '').trim().slice(0, 40); if (v) o[k.toLowerCase()] = v; } });
    put('방 타입 색', JSON.stringify(o), '도면 방번호 칸 색 → 방 타입 이름 (배치도 위 범례)'); }
  if (b && b.colors) { const hx = v => /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : ''; const cl = o => { const r = {}; Object.keys(o || {}).slice(0, 200).forEach(k => { const v = hx(o[k]); if (v) r[String(k).slice(0, 40)] = v; }); return r; };
    put('방 색', JSON.stringify({ mode: b.colors.mode === 'main' ? 'main' : 'kind', kind: cl(b.colors.kind), main: cl(b.colors.main) }), '배치도 배정 칸 색: mode = kind(방종류별) · main(메인별)'); }
  log_('관리자 ' + a.name, '방 공개 설정', (b && b.pubAll ? '일괄 공개 ' + (at || '바로') : '일괄 공개 안 함') + ' · 이름 ' + names.join(', '));
  return roomData(token);
}
function roomData(token) {
  adm_(token); let open = false; try { open = setting_('시간표 공개') === '예'; } catch (x) {}
  let days = []; try { days = actCfg_().days || []; } catch (x) {}
  const cfg = roomCfg_();
  return { rooms: rooms_().map(r => { const o = Object.assign({}, r); delete o._row; return o; }), kinds: ROOM_KINDS, open, days, cfg: Object.assign({}, cfg, { live: roomPubNow_(cfg) }), layout: layout_(), layoutTabs: (() => { const T = layoutTabs_(); return Array.isArray(T) ? T : []; })(), layoutErr: (() => { const T = layoutTabs_(); return Array.isArray(T) ? '' : T.err; })() };
}

/* ---------------- 객실배치도 (도면) ----------------
 * 접수 DB 시트에 「배치도 …」로 시작하는 탭을 층마다 하나씩 그림 (예: 배치도 Stay 1F · 배치도 Flex 3F)
 * 관리자 방배정 › 배치도 › 「도면 불러오기」 → 탭마다 칸 크기 · 병합 · 색 · 글자 · 테두리를 읽어 「배치도_데이터」에 저장 (탭 순서 = 층 버튼 순서)
 * 방번호 = S101 · P302 꼴 글자가 든 칸, 그 바로 아래 칸(병합 영역) = 올해 배정이 보이는 칸
 * 도면에 새로 생긴 방은 「방배정」에 줄을 더하고, 도면에서 사라진 방은 지우지 않고 알려 줌 */
const LAYOUT_SH = '배치도_데이터';
const LAYOUT_HEAD = ['탭', '건물', '층', '도면', '방 수', '불러온 일시', '관리자', '원본'];
/* (탭 이름에 「배치도」가 들어 있으면 도면 탭: 배치도 Stay 1F · 객실배치도 · 스테이 2층 배치도 …) */
const ROOM_NO_RX = /^([A-Z]{1,2}\d{3,4})(?![0-9])/;
/** 도면을 그린 스프레드시트: 설정 「배치도 시트」(주소나 ID) · 비우면 이 접수 DB 시트 */
function layoutSrcId_() { const v = String(setting_('배치도 시트') || '').trim(); const m = v.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || v.match(/^([a-zA-Z0-9_-]{20,})$/); return m ? m[1] : ''; }
/** 주소에 gid(탭 번호)가 있으면 그 탭 하나만 읽음 */
function layoutGid_() { const m = String(setting_('배치도 시트') || '').match(/[#&?]gid=(\d+)/); return m ? m[1] : ''; }
function layoutSS_() { const id = layoutSrcId_(); return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive(); }
const isLayoutTab_ = n => n !== LAYOUT_SH && (/배치도/.test(n) || /(stay|flex|스테이|플렉스)\s*\d+\s*(f|층)/i.test(n));
function layoutTabs_(fresh) {
  const C = CacheService.getScriptCache(), key = 'lytabs_' + (layoutSrcId_() || 'here') + '_' + layoutGid_();
  if (!fresh) { const v = C.get(key); if (v) try { return JSON.parse(v); } catch (x) {} }
  const gid = layoutGid_();
  let L = []; try { const SH_ = layoutSS_().getSheets(); L = gid ? SH_.filter(s => String(s.getSheetId()) === gid).map(s => s.getName()) : SH_.filter(s => { try { return !s.isSheetHidden(); } catch (x) { return true; } }).map(s => s.getName()).filter(isLayoutTab_); /* 숨긴 탭은 안 읽음 */ } catch (x) { return { err: '도면 시트를 열지 못했어요 · 주소와 공유(관리자 계정에 보기 권한)를 확인해 주세요.' }; }
  C.put(key, JSON.stringify(L), 600); return L;
}
function layout_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(LAYOUT_SH); if (!sh) return [];
  const T = layoutTabs_(), tabs = Array.isArray(T) ? T : [], src = layoutSrcId_() || 'here';
  return rows_(LAYOUT_SH).filter(r => r['탭'] && String(r['원본'] || 'here') === src && (!Array.isArray(T) || tabs.includes(String(r['탭'])))).map(r => { try { return Object.assign(JSON.parse(String(r['도면'])), { tab: String(r['탭']), bld: String(r['건물']), fl: String(r['층']), at: String(r['불러온 일시'] || '') }); } catch (x) { return null; } })
    .filter(Boolean).sort((a, b) => tabs.indexOf(a.tab) - tabs.indexOf(b.tab));
}
function bldOf_(tab, nos) { const t = tab.replace(/^.*배치도\s*/, '').replace(/\s*\d+\s*F\b.*$/i, '').trim();
  if (/^stay/i.test(t) || /스테이/.test(tab)) return 'Stay Tower'; if (/^flex/i.test(t) || /플렉스/.test(tab)) return 'Flex Tower';
  const p = (nos || []).map(n => n[0]); const S_ = p.filter(x => x === 'S').length, P_ = p.filter(x => x === 'P').length;
  return S_ || P_ ? (S_ >= P_ ? 'Stay Tower' : 'Flex Tower') : (t || '건물'); }
/** 탭 하나 읽기 → { cw, rh, cells: [[r, c, rs, cs, 글, 바탕, 글자색, 굵게, 크기, 테두리(위오아왼 0/1/2/3), 가로, 세로]], rooms: {방번호: [r, c, [아래 칸 r, c]]} } */
function layoutRead_(sh) {
  const lr = Math.min(Math.max(sh.getLastRow(), 1), 120), lc = Math.min(Math.max(sh.getLastColumn(), 1), 80);
  const rg = sh.getRange(1, 1, lr, lc);
  const V = rg.getDisplayValues(), BG = rg.getBackgrounds(), FC = rg.getFontColors(), FW = rg.getFontWeights(), FS = rg.getFontSizes(), HA = rg.getHorizontalAlignments(), VA = rg.getVerticalAlignments();
  const M = rg.getMergedRanges().map(m => [m.getRow() - 1, m.getColumn() - 1, m.getNumRows(), m.getNumColumns()]);
  const anchor = {}, cover = {}; M.forEach(([r, c, rs, cs]) => { anchor[r + ',' + c] = [rs, cs]; for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) if (i !== r || j !== c) cover[i + ',' + j] = 1; });
  // 실제로 그린 범위 (글 · 색 · 병합이 있는 곳)
  let R1 = 0, C1 = 0; const white = x => !x || /^#ffffff$/i.test(x);
  for (let i = 0; i < lr; i++) for (let j = 0; j < lc; j++) if (V[i][j] !== '' || !white(BG[i][j]) || anchor[i + ',' + j]) { R1 = Math.max(R1, i + 1); C1 = Math.max(C1, j + 1); }
  M.forEach(([r, c, rs, cs]) => { R1 = Math.max(R1, r + rs); C1 = Math.max(C1, c + cs); });
  R1 = Math.min(lr, R1 + 1); C1 = Math.min(lc, C1 + 1);
  const bw = st => { const s = String(st || ''); return !s || /NONE/.test(s) ? '0' : /THICK|DOUBLE/.test(s) ? '3' : /MEDIUM/.test(s) ? '2' : '1'; };
  let canB = true; const bd = (i, j) => { if (!canB) return null; try { const b = sh.getRange(i + 1, j + 1).getBorder(); if (!b) return '0000'; const one = x => { try { return x ? bw(x.getBorderStyle()) : '0'; } catch (e) { return '0'; } }; return one(b.getTop()) + one(b.getRight()) + one(b.getBottom()) + one(b.getLeft()); } catch (e) { canB = false; return null; } };
  const cells = [];
  for (let i = 0; i < R1; i++) for (let j = 0; j < C1; j++) {
    if (cover[i + ',' + j]) continue;
    const a = anchor[i + ',' + j] || [1, 1], has = V[i][j] !== '' || !white(BG[i][j]) || anchor[i + ',' + j];
    let b = bd(i, j); if (b == null) b = has ? '1111' : '0000';
    if (!has && b === '0000') continue;
    const ha = String(HA[i][j] || ''), va = String(VA[i][j] || '');
    cells.push([i, j, a[0], a[1], V[i][j], white(BG[i][j]) ? '' : BG[i][j], FC[i][j] || '', FW[i][j] === 'bold' ? 1 : 0, +FS[i][j] || 10, b, /center/.test(ha) ? 'C' : /right/.test(ha) ? 'R' : 'L', /top/.test(va) ? 'T' : /bottom/.test(va) ? 'B' : 'M']);
  }
  const rooms = {};
  cells.forEach(x => { const m = String(x[4]).trim().match(ROOM_NO_RX); if (!m) return; const below = x[0] + x[2];
    const lab = cells.find(y => y[0] === below && y[1] === x[1] && !ROOM_NO_RX.test(String(y[4]).trim())); rooms[m[1]] = [x[0], x[1], lab ? [lab[0], lab[1]] : (below < R1 ? [below, x[1]] : null)]; });
  // 아래 칸이 비어 있어 cells에 없으면 빈 칸으로 넣어 줌 (배정이 보일 자리)
  Object.values(rooms).forEach(v => { if (v[2] && !cells.some(y => y[0] === v[2][0] && y[1] === v[2][1])) cells.push([v[2][0], v[2][1], 1, 1, '', '', '', 0, 10, '1111', 'C', 'M']); });
  const cw = [], rh = []; for (let j = 0; j < C1; j++) cw.push(sh.getColumnWidth(j + 1)); for (let i = 0; i < R1; i++) rh.push(sh.getRowHeight(i + 1));
  return { cw, rh, cells, rooms, borders: canB ? 'sheet' : 'guess' };
}
/** 도면 불러오기 (탭 하나씩 — 클라이언트가 탭마다 부름) */
function layoutImport(token, tab) {
  const a = adm_(token); need_(a, 'room');
  const ss = SpreadsheetApp.getActive(); let src; try { src = layoutSS_(); } catch (x) { throw new Error('도면 시트를 열지 못했어요 · 주소와 공유를 확인해 주세요.'); }
  const sh = src.getSheetByName(String(tab || ''));
  if (!sh || !(isLayoutTab_(sh.getName()) || (layoutGid_() && String(sh.getSheetId()) === layoutGid_()))) throw new Error('도면 탭을 찾지 못했어요: ' + tab);
  const L = layoutRead_(sh), name = sh.getName(); const nos = Object.keys(L.rooms), bld = bldOf_(name, nos);
  const flm = name.match(/(\d+)\s*F\b/i) || name.match(/(\d+)\s*층/);
  const fl = flm ? flm[1] + 'F' : (nos[0] ? nos[0].replace(/^[A-Z]+/, '').slice(0, -2) + 'F' : '');
  const lock = lock_();
  let added = [], missing = [];
  try {
    let ls = ss.getSheetByName(LAYOUT_SH); if (!ls) { ls = ss.insertSheet(LAYOUT_SH); ls.appendRow(LAYOUT_HEAD); try { ls.hideSheet(); } catch (x) {} }
    const json = JSON.stringify({ cw: L.cw, rh: L.rh, cells: L.cells, rooms: L.rooms, borders: L.borders });
    if (json.length > 49000) throw new Error(name + ' 도면이 너무 커요. 쓰지 않는 칸을 지우거나 층을 나눠 주세요.');
    ensureHead_(LAYOUT_SH, LAYOUT_HEAD); const srcKey = layoutSrcId_() || 'here';
    const ex = rows_(LAYOUT_SH).find(r => String(r['탭']) === name && String(r['원본'] || 'here') === srcKey), row = [name, bld, fl, json, nos.length, stamp_(), a.name, srcKey];
    if (ex) ls.getRange(ex._row, 1, 1, LAYOUT_HEAD.length).setValues([row]); else ls.appendRow(row);
    // 방 목록 맞추기
    const rs = roomSheet_(), have = rooms_(), H = ROOM_HEAD.length;
    added = nos.filter(n => !have.some(r => r.no === n));
    if (added.length) rs.getRange(rs.getLastRow() + 1, 1, added.length, H).setValues(added.map(n => [n, bld, fl, '', 5].concat(Array(H - 5).fill(''))));
    missing = have.filter(r => r.bld === bld && r.fl === fl && !nos.includes(r.no)).map(r => ({ no: r.no, used: r.occ.length > 0 }));
    log_('관리자 ' + a.name, '도면 불러오기', name + ' · 방 ' + nos.length + (added.length ? ' · 새 방 ' + added.join(',') : ''));
  } finally { lock.releaseLock(); }
  return { ok: true, tab: name, rooms: nos.length, added, missing, borders: L.borders };
}
/** 방번호를 바꿨을 때: from 방의 배정을 to(빈 방)로 옮김 */
function roomMove(token, from, to) {
  const a = adm_(token); need_(a, 'room');
  const lock = lock_();
  try {
    const sh = roomSheet_(), L = rooms_(), f = L.find(r => r.no === String(from)), t = L.find(r => r.no === String(to));
    if (!f || !t) throw new Error('방을 찾지 못했어요.'); if (t.occ.length) throw new Error(t.no + ' 방에 이미 배정이 있어요. 먼저 비워 주세요.');
    const H = ROOM_HEAD, fr = sh.getRange(f._row, 1, 1, H.length).getValues()[0], tr = sh.getRange(t._row, 1, 1, H.length).getValues()[0];
    const keep = ['방번호', '건물', '층', '타입', '정원', '평수', '침대', '방 특징'];
    const nr = H.map((h, i) => keep.includes(h) ? tr[i] : h === '고친 일시' ? stamp_() : h === '관리자' ? a.name : fr[i]);
    const er = H.map((h, i) => keep.includes(h) ? fr[i] : h === '고친 일시' ? stamp_() : h === '관리자' ? a.name : '');
    sh.getRange(t._row, 1, 1, H.length).setValues([nr]); sh.getRange(f._row, 1, 1, H.length).setValues([er]);
    log_('관리자 ' + a.name, '방 배정 옮김', f.no + ' → ' + t.no);
  } finally { lock.releaseLock(); }
  return roomData(token);
}
/** 방 하나 저장: 배정 목록(occ)이 비면 방을 비움 · 날짜마다 인원 합계가 정원을 넘으면 막음 */
function roomSave(token, x) {
  const a = adm_(token); need_(a, 'room');
  const t = (s, n) => String(s == null ? '' : s).trim().slice(0, n || 60);
  const n = v => Math.max(0, Math.min(30, Math.floor(+v || 0)));
  const lock = lock_();
  try {
    const sh = roomSheet_(); const r = rooms_().find(y => y.no === t(x.no, 10));
    if (!r) throw new Error('방을 찾지 못했어요: ' + x.no);
    let kind = t(x.kind, 20).replace(/^\d인가족방$/, '가족방'); if (kind && !ROOM_KINDS.includes(kind)) throw new Error('방종류를 골라 주세요.');
    let nd = 0; try { nd = (actCfg_().days || []).length; } catch (e) {}
    const dl = L => [...new Set((Array.isArray(L) ? L : []).map(Number).filter(d => d >= 0 && d < Math.max(nd, 1) && Number.isInteger(d)))].sort((p, q) => p - q);
    if ((!Array.isArray(x.occ) || !x.occ.length) && (x.main || x.prof || x.sub)) x.occ = roomOcc_({ main: t(x.main, 40), mn: +x.mn || 0, sub: t(x.sub, 40), sn: +x.sn || 0, prof: t(x.prof, 40) });   // 예전 방식(메인 · 보조 · 교수)으로 보낸 것
    const occ = (Array.isArray(x.occ) ? x.occ : []).slice(0, 12).map(o => Object.assign({ k: ['acad', 'grp', 'name', 'fam'].includes(o.k) ? o.k : 'name', v: t(o.v, 40), n: n(o.n), a: t(o.a, 40), days: dl(o.days), tm: t(o.tm, 30), no: t(o.no, 20) }, Array.isArray(o.names) && o.names.length ? { names: o.names.slice(0, 10).map(y => t(y, 30)) } : {})).filter(o => o.v);
    const days = dl(x.days), cap = n(x.cap) || r.cap, clear = !occ.length;
    if (occ.some(o => o.k === 'fam') && occ.some(o => o.k !== 'fam')) throw new Error(r.no + ' 방: 가족방에는 학원 · 사람 · 이름을 같이 넣을 수 없어요.');
    if (occ.some(o => o.k === 'fam')) kind = '가족방'; /* 가족을 넣은 방은 방종류 = 가족방 */
    const all = nd ? [...Array(nd).keys()] : [0], use = days.length ? days : all;
    use.forEach(d => { const sum = occ.filter(o => !o.days.length || o.days.includes(d)).reduce((s2, o) => s2 + o.n, 0); if (sum > cap) throw new Error(`${r.no} 방: ${d + 1}번째 날 인원 ${sum}명이 정원 ${cap}명보다 많아요.`); });
    const m = occ[0] || {}, sub = occ.slice(1).find(o => o.k === 'acad' || o.k === 'grp'), pr = occ.find(o => o.k === 'name' && kind === '교수방');
    const row = [r.no, r.bld, r.fl, t(x.type, 10) || r.type, cap, clear ? '' : kind, clear ? '' : (m.v || ''), clear ? '' : m.n, clear ? '' : (sub ? sub.v : ''), clear ? '' : (sub ? sub.n : ''), clear ? '' : t(x.pw, 40), clear ? '' : (pr ? pr.v : ''), t(x.memo, 200), stamp_(), a.name,
      clear ? '' : JSON.stringify(occ), days.length && days.length < all.length ? days.join(',') : '', x.pub && !clear ? '예' : '', /^#[0-9a-f]{6}$/i.test(String(x.color || '')) && !clear ? String(x.color) : '', t(x.size, 12), x.beds === '' || x.beds == null ? '' : n(x.beds), t(x.feat, 40)];
    sh.getRange(r._row, 1, 1, ROOM_HEAD.length).setValues([row]);
    log_('관리자 ' + a.name, clear ? '방 비움' : '방 배정', r.no + (clear ? '' : ' · ' + occ.map(o => o.v + ' ' + o.n).join(', ') + ' ' + kind));
  } finally { lock.releaseLock(); }
  return roomData(token);
}
/** 선생님 「내 시간표」에 보일 우리 학원 방 */
function myRooms_(u) {
  try {
    const cfg = roomCfg_(), live = roomPubNow_(cfg); let days = []; try { days = actCfg_().days || []; } catch (x) {}
    const nm = s => String(s || '').replace(/\s+/g, '');
    const mine = o => (o.k === 'acad' || o.k === 'fam') && u.acads.includes(o.a || o.v) || (o.k === 'name' && nm(o.v) === nm(u.name)) || (o.k === 'acad' && u.acads.includes(o.v));
    return rooms_().filter(r => (live || r.pub) && r.occ.some(mine)).map(r => ({ no: r.no, bld: r.bld, fl: r.fl, type: r.type, kind: r.kind, pw: r.pw,
      days: (r.days.length ? r.days : days.map((_, i) => i)).map(d => days[d] || (d + 1) + '일'),
      occ: r.occ.map(o => ({ v: mine(o) ? o.v : (o.k === 'name' ? '다른 분' : o.v), n: o.n, mine: !!mine(o), days: o.days.map(d => days[d] || (d + 1) + '일'), tm: o.tm })),
      main: r.main, sub: r.sub, mn: r.mn, sn: r.sn, prof: r.prof }));
  } catch (x) { return []; }
}

/* ================= 오후음악회 연주 순서 · 리허설 =================
 * 「일정설정」 concerts = [{id, name, d, cs(공연 시작), rs(리허설 시작), room(리허설 장소), min(1인 리허설 분)}], conorder = {공연id: [참가자ID…]}, conrev
 * 「음악회순서」: 보기용 (공연 · 순서 · 리허설 · 이름 · 학원 · 악기 · 진도 · 곡) — 저장할 때마다 새로 씀 */
const CON_HEAD = ['공연', '날짜', '공연 시작', '순서', '리허설', '리허설 장소', '참가자ID', '이름', '학원', '악기', '진도', '곡'];
/* ---------------- 음원 제출 · 심사 (11-04) ----------------
 * 신청자: 「내 접수」에서 음원 주소를 추가만 함(고치기 · 지우기 없음), 음악회마다 「음원 받기」가 켜져 있고 마감일까지.
 * 관리자(스케줄관리 › 음원 심사): 주소를 눌러 듣고 승인 · 비승인 · 보류. 결과는 「결과 공개」를 켠 음악회만 신청자에게 보임(그 전엔 「심사 중」).
 * 접수 때 넣은 주소(form.info.video)는 시트에 없으면 「접수 때 넣은 주소」로 같이 보여 주고, 심사하면 그때 시트에 줄이 생김. */
const AUD = '음원';
const AUD_HEAD = ['음원ID', '제출일시', '접수번호', '참가자ID', '이름', '학원', '음악회', '주소', '제출자', '상태', '심사자', '심사일', '메모', '학생ID', '작곡가', '곡명', '악기'];   /* 뒤 4칸 = 접수 전 「음원 먼저 내기」 (11-12) */
/* 음악회 목록은 캠프 설정 cons (11-12) */
const AUD_ST = ['심사 전', '승인', '비승인', '보류'];
const audUrlOk_ = u => /^https?:\/\/\S{4,}$/i.test(u) && u.length <= 500;
function audCfg_() {
  const c = camp_(), A = c.aud || {}, pub = String(setting_('음원 결과 공개') || '').split(',').map(x => x.trim()).filter(Boolean), o = {};
  const lastDay = c.base && c.base.start ? (() => { const d = new Date(c.base.start + 'T00:00:00'); d.setDate(d.getDate() - 1); return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); })() : '';
  camp_().cons.forEach(k => { const x = A[k] || {}; o[k] = { on: !!x.on, pre: !!x.on && !!x.pre, due: x.due || '', end: x.due || lastDay, pub: pub.includes(k) }; });
  return o;
}
function audRows_() {
  return rows_(AUD).filter(r => r['음원ID']).map(r => ({ id: String(r['음원ID']), at: dstr_(r['제출일시']).slice(0, 16) || String(r['제출일시']).slice(0, 16), no: String(r['접수번호']), pid: String(r['참가자ID']),
    name: String(r['이름']), acad: String(r['학원']), con: String(r['음악회']), url: String(r['주소']).replace(/^'/, '').trim(), by: String(r['제출자']), st: String(r['상태'] || '심사 전'),
    rv: String(r['심사자'] || ''), rd: dstr_(r['심사일']), memo: String(r['메모'] || ''), sid: String(r['학생ID'] || ''), comp: String(r['작곡가'] || ''), title: String(r['곡명'] || ''), rinst: String(r['악기'] || ''), _row: r._row }));
}
/** 접수 → 음원 목록 (시트 줄 + 접수 때 넣은 주소). 정상 참가자 · 받는 음악회만 */
function audAll_(subs, acads) {
  const C = audCfg_(), R0 = audRows_(), PRE = R0.filter(r => !r.pid && r.sid), R = R0.filter(r => r.pid || !r.sid), out = [], used = {};
  subs.forEach(sb => { const info = ((sb.form || {}).info) || {};
    sb.ppl.forEach(p => { if (p.status === '취소') return; const k = p.id.slice(sb.no.length + 1), i = info[k] || {}, con = String(i.concert || '');
      const k0 = p.id.slice(sb.no.length + 1), pre = PRE.filter(r => (r.sid === k0 || (r.sid === 'N:' + p.name && !used[r.id])) && r.acad === sb.acad);   /* 접수 전에 낸 음원(학생ID) → 이 참가자에게 붙임 */
      pre.forEach(r => used[r.id] = 1);
      if (!C[con] || !C[con].on) { pre.forEach(r => out.push(Object.assign({}, r, { pid: p.id, no: sb.no, early: true, owner: sb.owner, inst: String(p.inst || i.inst || r.rinst), prog: String(i.prog || ''), song: (r.comp + ' ' + r.title).trim() }))); return; }
      const mine = R.filter(r => r.pid === p.id).concat(pre.map(r => Object.assign({}, r, { pid: p.id, no: sb.no, early: true }))), v = String(i.video || '').trim();
      if (v && !mine.some(r => r.url === v)) out.push({ id: 'V:' + p.id, at: '', no: sb.no, pid: p.id, name: p.name, acad: sb.acad, owner: sb.owner, con, url: v, by: sb.owner, st: '심사 전', rv: '', rd: '', memo: '', first: true, inst: String(p.inst || i.inst || ''), prog: String(i.prog || ''), song: i.other ? (String(i.oc || '') + ' ' + String(i.ot || '')).trim() : String(i.song || '') });
      mine.forEach(r => out.push(Object.assign({}, r, { owner: sb.owner, con, inst: String(p.inst || i.inst || ''), prog: String(i.prog || ''), song: i.other ? (String(i.oc || '') + ' ' + String(i.ot || '')).trim() : String(i.song || '') })));
      if (!v && !mine.length) out.push({ id: '', no: sb.no, pid: p.id, name: p.name, acad: sb.acad, owner: sb.owner, con, url: '', st: '', none: true, inst: String(p.inst || i.inst || ''), prog: String(i.prog || ''), song: i.other ? (String(i.oc || '') + ' ' + String(i.ot || '')).trim() : String(i.song || '') });
    }); });
  PRE.forEach(r => { if (used[r.id] || (acads && !acads.includes(r.acad))) return; out.push(Object.assign({}, r, { no: '', pid: '', owner: r.by, pre: true, early: true, inst: r.rinst, prog: '', song: (r.comp + ' ' + r.title).trim() })); });
  return out;
}
/** 신청자 화면용: 참가자ID → [{at, url, st}] · 결과 공개 전이면 st = 「심사 중」 */
function audMine_(subs) {
  const C = audCfg_(), M = {};
  audAll_(subs, []).forEach(x => { if (x.none) { M[x.pid] = M[x.pid] || []; return; } (M[x.pid] = M[x.pid] || []).push({ at: x.at, url: x.url, first: !!x.first, st: C[x.con] && C[x.con].pub ? x.st : '심사 중' }); });   /* 결과 공개 뒤: 접수한 선생님 · 직접 접수한 비회원 보호자가 봄 (11-04 사용자 확인) */
  return { cfg: C, today: today_(), list: M };
}
/* ===== 접수 전 「음원 먼저 내기」 (11-12): 회원 선생님이 우리 학원 학생(회원 명단)을 골라 음악회 · 곡 · 주소만 냄.
   음악회마다 「접수 전에도 받기」(aud.k.pre)를 켠 곳만. 12/1 접수에서 그 학생을 담으면 같은 학생ID로 이 음원이 붙고, 신청서에 음악회 · 곡 · 주소가 미리 채워짐 ===== */
function audPreMap_(acads) {
  const M = {}; audRows_().filter(r => !r.pid && r.sid && acads.includes(r.acad)).forEach(r => { M[r.sid] = { con: r.con, comp: r.comp, title: r.title, url: r.url, at: r.at }; }); return M;
}
function audPreList(token) {
  const u = who_(token), C = audCfg_(), cons = Object.keys(C).filter(k => C[k].pre), td = today_();
  const stu = rows_(SH.S).filter(r => r['ID'] && u.acads.includes(String(r['학원']))).map(r => ({ id: String(r['ID']), name: String(r['이름']), acad: String(r['학원']), inst: String(r['악기'] || ''), tag: String(r['구분 표시'] || '') }));
  const rows = audRows_().filter(r => !r.pid && r.sid && u.acads.includes(r.acad)).map(r => ({ id: r.id, at: r.at, sid: r.sid, name: r.name, acad: r.acad, con: r.con, url: r.url, comp: r.comp, title: r.title, inst: r.rinst, by: r.by, st: C[r.con] && C[r.con].pub ? r.st : '심사 중', ed: audPreCanEdit_(r, C, td) }));
  return { ok: true, today: td, acads: u.acads, cons: cons.map(k => ({ name: k, end: C[k].end, open: !C[k].end || td <= C[k].end })), stu, rows };
}
/** 고치기 · 지우기 (11-12): 우리 학원 줄 · 음악회 마감 전 · 아직 심사 전(심사자 없음)일 때만 */
function audPreCanEdit_(r, C, td) { const c = C[r.con]; return !!(c && (!c.end || td <= c.end) && !r.rv && (r.st === '심사 전' || !r.st)); }
function audPreFind_(u, id) {
  const r = audRows_().find(x => x.id === String(id || '') && !x.pid && x.sid);
  if (!r || !u.acads.includes(r.acad)) throw new Error('고칠 음원을 찾지 못했어요. 화면을 새로 고쳐 주세요.');
  if (!audPreCanEdit_(r, audCfg_(), today_())) throw new Error('마감이 지났거나 심사가 시작돼서 고칠 수 없어요. 협회에 문의해 주세요.');
  return r;
}
function audPreEdit(token, id, o) {
  const u = who_(token); o = o || {}; const url = String(o.url || '').trim(), con = String(o.con || ''), comp = String(o.comp || '').trim().slice(0, 60), title = String(o.title || '').trim().slice(0, 120);
  if (!audUrlOk_(url)) throw new Error('주소를 https:' + '//' + ' 로 시작하게 넣어 주세요.');
  if (!title) throw new Error('곡명을 넣어 주세요.');
  const C = audCfg_()[con]; if (!C || !C.pre) throw new Error((con || '그') + ' 음악회는 지금 음원을 받지 않아요.');
  if (C.end && today_() > C.end) throw new Error(con + ' 음원 마감(' + C.end + ')이 지났어요.');
  const lock = lock_();
  try {
    const r = audPreFind_(u, id), sh = SpreadsheetApp.getActive().getSheetByName(AUD), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const set = (h, v) => { const c = head.indexOf(h); if (c >= 0) sh.getRange(r._row, c + 1).setValue(v); };
    set('음악회', con); set('주소', "'" + url); set('작곡가', comp); set('곡명', title); set('메모', ('고침 ' + stamp_() + ' ' + u.name + ' ' + (r.memo || '')).slice(0, 300));
    log_(u.name, '음원 먼저 내기 고침', r.name + ' · ' + r.id);
  } finally { lock.releaseLock(); }
  return audPreList(token);
}
function audPreDel(token, id) {
  const u = who_(token), lock = lock_();
  try {
    const r = audPreFind_(u, id); SpreadsheetApp.getActive().getSheetByName(AUD).deleteRow(r._row);
    log_(u.name, '음원 먼저 내기 지움', r.name + ' · ' + r.con + ' · ' + r.id);
  } finally { lock.releaseLock(); }
  return audPreList(token);
}
function audPreAdd(token, o) { return audPreAddMany(token, [o]); }
/** 여러 학생 한꺼번에 (11-12). 명단에 없는 학생은 o.nw = {name, inst, acad} → 학생ID 'N:이름' (캠프 접수 때 같은 학원 · 같은 이름에 붙음). 하나라도 틀리면 아무것도 안 냄 */
function audPreAddMany(token, items) {
  const u = who_(token); items = (Array.isArray(items) ? items : []).slice(0, 40);
  if (!items.length) throw new Error('낼 음원이 없어요.');
  const CF = audCfg_(), td = today_(), S0 = rows_(SH.S), out = [];
  items.forEach((o, n) => { o = o || {};
    const url = String(o.url || '').trim(), con = String(o.con || ''), comp = String(o.comp || '').trim().slice(0, 60), title = String(o.title || '').trim().slice(0, 120);
    let sid = String(o.sid || ''), name, acad, inst;
    if (o.nw) {
      name = String(o.nw.name || '').trim().replace(/\s+/g, ' '); acad = String(o.nw.acad || u.acads[0] || ''); inst = String(o.nw.inst || '').slice(0, 20);
      if (name.length < 2 || name.length > 20) throw new Error((n + 1) + '번째: 학생 이름을 2~20자로 넣어 주세요.');
      if (!u.acads.includes(acad)) throw new Error(name + ': 우리 학원만 고를 수 있어요.');
      const same = S0.find(r => String(r['이름']) === name && String(r['학원']) === acad);
      sid = same ? String(same['ID']) : 'N:' + name; if (same) inst = String(same['악기'] || inst);
    } else {
      const st = S0.find(r => String(r['ID']) === sid && u.acads.includes(String(r['학원'])));
      if (!st) throw new Error('우리 학원 명단에 있는 학생만 낼 수 있어요.');
      name = String(st['이름']); acad = String(st['학원']); inst = String(st['악기'] || '');
    }
    const who = name + ': ';
    if (!audUrlOk_(url)) throw new Error(who + '주소를 https:// 로 시작하게 넣어 주세요 (유튜브 「일부 공개」 링크 등).');
    if (!title) throw new Error(who + '곡명을 넣어 주세요.');
    const C = CF[con]; if (!C || !C.pre) throw new Error(who + (con || '그') + ' 음악회는 지금 음원을 받지 않아요.');
    if (C.end && td > C.end) throw new Error(who + con + ' 음원 마감(' + C.end + ')이 지났어요.');
    out.push({ sid, name, acad, inst, con, url, comp, title });
  });
  const lock = lock_();
  try {
    const R0 = audRows_().filter(r => !r.pid && r.sid);
    out.forEach(x => { const R = R0.filter(r => r.sid === x.sid && r.acad === x.acad);
      if (R.some(r => r.url === x.url && r.con === x.con)) throw new Error(x.name + ': 이미 낸 주소예요.');
      if (R.length >= 10) throw new Error(x.name + ': 한 학생에 음원은 10개까지 낼 수 있어요.'); });
    ensureHead_(AUD, AUD_HEAD);
    const sh = SpreadsheetApp.getActive().getSheetByName(AUD), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const rows = out.map((x, i) => { const v = { '음원ID': 'U' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + String(10 + i).slice(-2) + Math.floor(Math.random() * 9), '제출일시': stamp_(), '접수번호': '', '참가자ID': '', '이름': x.name, '학원': x.acad, '음악회': x.con, '주소': "'" + x.url, '제출자': u.name, '상태': '심사 전', '학생ID': x.sid, '작곡가': x.comp, '곡명': x.title, '악기': x.inst };
      return head.map(h => v[h] == null ? '' : v[h]); });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
    log_(u.name, '음원 먼저 내기', out.map(x => x.name + '(' + x.con + ')').join(', '));
  } finally { lock.releaseLock(); }
  return audPreList(token);
}
function audAdd(token, pid, url) {
  const u = who_(token); url = String(url || '').trim();
  if (!audUrlOk_(url)) throw new Error('주소를 https:// 로 시작하게 넣어 주세요 (유튜브 「일부 공개」 링크 등).');
  const lock = lock_();
  try {
    const sb = loadSubs_().find(x => pid.indexOf(x.no + '_') === 0);
    if (!canEdit_(u, sb) || !u.acads.includes(sb.acad)) throw new Error('이 접수에는 음원을 넣을 수 없어요.');
    const p = sb.ppl.find(x => x.id === pid); if (!p || p.status !== '정상') throw new Error('참가 중인 사람에게만 음원을 넣을 수 있어요.');
    const i = (((sb.form || {}).info) || {})[pid.slice(sb.no.length + 1)] || {}, con = String(i.concert || ''), C = audCfg_()[con];
    if (!C || !C.on) throw new Error((con || '이') + ' 음악회는 음원을 받지 않아요.');
    if (C.end && today_() > C.end) throw new Error(con + ' 음악회 음원 마감(' + C.end + ')이 지났어요. 운영진에게 문의해 주세요.');
    const R = audRows_().filter(r => r.pid === pid);
    if (R.some(r => r.url === url) || String(i.video || '').trim() === url) throw new Error('이미 넣은 주소예요.');
    if (R.length >= 10) throw new Error('한 사람에 음원은 10개까지 넣을 수 있어요.');
    ensureHead_(AUD, AUD_HEAD);
    const sh = SpreadsheetApp.getActive().getSheetByName(AUD);
    sh.appendRow(['U' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10), stamp_(), sb.no, pid, p.name, sb.acad, con, "'" + url, u.name, '심사 전', '', '', '']);
    log_(u.name, '음원 추가', pid + ' · ' + con);
    return { ok: true, aud: audMine_([sb]) };
  } finally { lock.releaseLock(); }
}
function audList(token) {
  const a = adm_(token); if (!a.sup && !['보기', '편집'].includes(a.perms.aud)) throw new Error('음원 심사 권한이 없어요.');
  return { cfg: audCfg_(), rows: audAll_(loadSubs_()).map(x => { const o = Object.assign({}, x); delete o._row; return o; }) };
}
function audSet(token, id, st, memo) {
  const a = adm_(token); need_(a, 'aud');
  if (!AUD_ST.includes(st)) throw new Error('상태를 확인해 주세요.');
  const lock = lock_();
  try {
    ensureHead_(AUD, AUD_HEAD); const sh = SpreadsheetApp.getActive().getSheetByName(AUD);
    let r = audRows_().find(x => x.id === id);
    if (!r && /^V:/.test(id)) {   /* 접수 때 넣은 주소: 처음 심사할 때 시트에 줄을 만듦 */
      const pid = id.slice(2), sb = loadSubs_().find(x => pid.indexOf(x.no + '_') === 0), p = sb && sb.ppl.find(x => x.id === pid);
      const i = sb ? (((sb.form || {}).info) || {})[pid.slice(sb.no.length + 1)] || {} : {};
      if (!p || !String(i.video || '').trim()) throw new Error('그 음원을 찾지 못했어요. 새로 불러와 주세요.');
      sh.appendRow(['U' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10), sb.date || stamp_(), sb.no, pid, p.name, sb.acad, String(i.concert || ''), "'" + String(i.video).trim(), sb.owner + ' (접수 때)', '심사 전', '', '', '']);
      r = audRows_().find(x => x.pid === pid && x.url === String(i.video).trim());
    }
    if (!r) throw new Error('그 음원을 찾지 못했어요. 새로 불러와 주세요.');
    const c = AUD_HEAD.indexOf('상태') + 1;
    sh.getRange(r._row, c, 1, 4).setValues([[st, st === '심사 전' ? '' : a.name || '총관리자', st === '심사 전' ? '' : today_(), String(memo == null ? r.memo : memo).slice(0, 200)]]);
    log_('관리자 ' + (a.name || ''), '음원 심사', r.pid + ' · ' + r.con + ' · ' + st);
  } finally { lock.releaseLock(); }
  return audList(token);
}
/** 관리자 음원 고치기 · 지우기 (11-12): 시트에 있는 줄만 (접수 때 넣은 주소 「V:」는 신청서에서 고침) */
function audEdit(token, id, o) {
  const a = adm_(token); need_(a, 'aud'); o = o || {};
  const url = String(o.url || '').trim(), comp = String(o.comp || '').trim().slice(0, 60), title = String(o.title || '').trim().slice(0, 120), con = String(o.con || '');
  if (!audUrlOk_(url)) throw new Error('주소를 https:' + '//' + ' 로 시작하게 넣어 주세요.');
  const lock = lock_();
  try {
    const r = audRows_().find(x => x.id === String(id || '')); if (!r) throw new Error('시트에 없는 음원이에요(접수 때 넣은 주소는 신청서에서 고쳐요). 새로 불러와 주세요.');
    const sh = SpreadsheetApp.getActive().getSheetByName(AUD), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const set = (h, v) => { const c = head.indexOf(h); if (c >= 0) sh.getRange(r._row, c + 1).setValue(v); };
    set('주소', "'" + url); set('작곡가', comp); set('곡명', title);
    if (con && !r.pid) { if (!audCfg_()[con]) throw new Error('음악회를 확인해 주세요.'); set('음악회', con); }
    log_('관리자 ' + (a.name || ''), '음원 고침', r.name + ' · ' + r.id);
  } finally { lock.releaseLock(); }
  return audList(token);
}
function audDel(token, id) {
  const a = adm_(token); need_(a, 'aud'); const lock = lock_();
  try {
    const r = audRows_().find(x => x.id === String(id || '')); if (!r) throw new Error('시트에 없는 음원이에요(접수 때 넣은 주소는 신청서에서 지워요). 새로 불러와 주세요.');
    SpreadsheetApp.getActive().getSheetByName(AUD).deleteRow(r._row);
    log_('관리자 ' + (a.name || ''), '음원 지움', r.name + ' · ' + r.con + ' · ' + r.url);
  } finally { lock.releaseLock(); }
  return audList(token);
}
/** 가상 음원 (11-04, STG 시험용): 가상 접수 학생 몇 명에게 음악회(음원 받는 곳)를 정하고 음원 주소를 상태별로 넣음. 지우기는 「(가상)」 줄만 */
function devAud(token, n) {
  const a = adm_(token); needSup_(a);
  if (!String(setting_('테스트 로그인') || '').trim()) throw new Error('테스트(STG)에서만 쓸 수 있어요.');
  const C = audCfg_(), cons = camp_().cons.filter(k => C[k] && C[k].on); if (!cons.length) throw new Error('먼저 「캠프 설정 › 음악회 음원 제출」에서 음원 받기를 켜 주세요.');
  n = Math.max(3, Math.min(20, +n || 8));
  const SONGS = [['A. Vivaldi', 'Violin Concerto in A minor, RV 356 1st mvt'], ['J. S. Bach', 'Concerto for Two Violins in D minor, BWV 1043 1st mvt'], ['F. Seitz', 'Pupil\'s Concerto No. 2, Op. 13 1st mvt'], ['G. Fauré', 'Élégie, Op. 24'], ['C. Saint-Saëns', 'The Swan'], ['J. Haydn', 'Cello Concerto in C major 1st mvt']];
  const lock = lock_(); const made = [];
  try {
    const all = loadSubs_(), pool = [];
    all.filter(sb => sb.fake || sb.vscen).concat(all.filter(sb => !sb.fake && !sb.vscen)).forEach(sb => sb.ppl.forEach(p => { if (p.status !== '정상' || p.kind === '교사' || p.kind === '가족') return; pool.push({ sb, p }); }));
    if (!pool.length) throw new Error('학생이 들어 있는 접수가 없어요. 「캠프 설정 › 테스트용 가상 접수」를 먼저 만들어 주세요.');
    const pick = pool.slice(0, n), touched = {};
    ensureHead_(AUD, AUD_HEAD); const sh = SpreadsheetApp.getActive().getSheetByName(AUD), rows = [];
    let seq = 0; const id = () => 'U' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + String(++seq).padStart(2, '0');
    const url = () => 'https:' + '//www.youtube.com/watch?v=GAsang' + Math.random().toString(36).slice(2, 7);
    pick.forEach(({ sb, p }, j) => {
      const k = p.id.slice(sb.no.length + 1), info = (sb.form = sb.form || {}).info = sb.form.info || {}, i = info[k] = info[k] || {};
      i.concert = cons[j % cons.length]; if (!String(i.song || '').trim() && !String(i.ot || '').trim()) { const s2 = SONGS[j % SONGS.length]; i.other = true; i.oc = s2[0]; i.ot = s2[1]; }
      if (j === 0) i.video = url();   /* 접수 때 넣은 주소 */
      touched[sb.no] = sb;
      const plan = [[], ['보류', '심사 전'], ['승인'], ['비승인'], ['심사 전'], ['심사 전', '심사 전'], ['승인'], []][j % 8];
      plan.forEach((st, q) => rows.push([id(), Utilities.formatDate(new Date(Date.now() - (n - j) * 3600e3 - q * 600e3), TZ, 'yyyy-MM-dd HH:mm:ss'), sb.no, p.id, p.name, sb.acad, i.concert, url(), sb.owner + ' (가상)', st, st === '심사 전' ? '' : a.name || '총관리자', st === '심사 전' ? '' : today_(), '가상']));
      made.push(p.name + '(' + i.concert + ')');
    });
    Object.keys(touched).forEach(no => writeSub_(touched[no], false));
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, AUD_HEAD.length).setNumberFormat('@').setValues(rows);
    log_(a.name, '가상 음원', made.join(', '));
  } finally { lock.releaseLock(); }
  return Object.assign({ made }, audList(token));
}
function devAudClear(token) {
  const a = adm_(token); needSup_(a);
  const lock = lock_(); let k = 0;
  try { const sh = SpreadsheetApp.getActive().getSheetByName(AUD); if (sh) audRows_().filter(r => / \(가상\)$/.test(r.by)).map(r => r._row).sort((x, y) => y - x).forEach(r => { sh.deleteRow(r); k++; }); log_(a.name, '가상 음원 지움', k + '줄'); }
  finally { lock.releaseLock(); }
  return Object.assign({ n: k }, audList(token));
}
function audPub(token, con, on) {
  const a = adm_(token); need_(a, 'aud');
  if (!camp_().cons.includes(con)) throw new Error('음악회를 확인해 주세요.');
  const cur = String(setting_('음원 결과 공개') || '').split(',').map(x => x.trim()).filter(x => camp_().cons.includes(x) && x !== con);
  if (on) cur.push(con);
  ensureSettings_(); const sh = SpreadsheetApp.getActive().getSheetByName('설정'), row = rows_('설정').find(x => String(x['항목']) === '음원 결과 공개');
  if (row) sh.getRange(row._row, 2).setValue(cur.join(', ')); else sh.appendRow(['음원 결과 공개', cur.join(', '), '음원 심사 결과를 신청자에게 보여 줄 음악회']);
  setMemoClear_(); log_('관리자 ' + (a.name || ''), '음원 결과 공개', con + ' = ' + (on ? '공개' : '숨김'));
  return audList(token);
}
function conGet(token) {
  adm_(token);
  const c = actCfg_();
  let concerts = Array.isArray(c.concerts) ? c.concerts : null;
  const linked = (Array.isArray(c.kinds) ? c.kinds : ACT_KINDS).filter(k => k.link).map(k => k.n);
  if (!concerts) concerts = actEvents_().filter(e => e.type === '오후음악회' || (linked.includes(e.title) && (!e.stage || e.stage === '본공연'))).sort((a, b) => a.d - b.d || a.s.localeCompare(b.s) || a.room.localeCompare(b.room))
    .map(e => ({ id: 'c' + e.id, name: evName_(e) + ' ' + String((c.days || [])[e.d] || '').replace(/\(.\)/, ''), d: e.d, cs: e.s, rs: '', room: e.room, min: 5 }));
  return { days: c.days || [], concerts, order: c.conorder || {}, rev: +c.conrev || 0 };
}
function conSave(token, b) {
  const a = adm_(token); need_(a, 'con');
  const lock = lock_();
  try {
    const c = actCfg_(); const sh = actSheets_();
    if ((+c.conrev || 0) !== (+b.rev || 0)) { lock.releaseLock(); return Object.assign({ conflict: true, msg: '다른 관리자 화면에서 먼저 고쳤어요. 최신 내용으로 다시 불러왔어요.' }, conGet(token)); }
    const t = (s, n) => String(s == null ? '' : s).trim().slice(0, n || 80);
    const okT = s => !s || /^\d{2}:\d{2}$/.test(String(s));
    const concerts = (b.concerts || []).slice(0, 40).map(x => ({ id: t(x.id, 30), name: t(x.name, 60), d: +x.d || 0, cs: t(x.cs, 5), rs: t(x.rs, 5), room: t(x.room, 40), min: Math.max(1, Math.min(60, +x.min || 5)) }));
    concerts.forEach(x => { if (!okT(x.cs) || !okT(x.rs)) throw new Error(x.name + ': 시간은 09:00 처럼 넣어 주세요.'); });
    const order = {}; concerts.forEach(x => order[x.id] = ((b.order || {})[x.id] || []).map(p => t(p, 60)).filter(Boolean));
    const seen = {}; Object.keys(order).forEach(k => order[k] = order[k].filter(p => seen[p] ? false : (seen[p] = 1)));
    const put = (k, v) => { const s = JSON.stringify(v); if (s.length > 45000) throw new Error('내용이 너무 길어요.'); const r = rows_(SH.ACTCFG).find(x => String(x['항목']) === k); if (r) sh.cfg.getRange(r._row, 2).setValues([[s]]); else sh.cfg.appendRow([k, s]); };
    put('concerts', concerts); put('conorder', order); put('conrev', (+c.conrev || 0) + 1);
    // 보기용 시트
    const ss = SpreadsheetApp.getActive(); let cs = ss.getSheetByName(SH.CON); if (!cs) { cs = ss.insertSheet(SH.CON); cs.appendRow(CON_HEAD); }
    const info = {}; loadSubs_().forEach(sb => sb.ppl.forEach(p => { const k = p.id.slice(sb.no.length + 1); const i = (sb.form && sb.form.info && sb.form.info[k]) || {}; info[p.id] = { p, sb, i }; }));
    const days = c.days || []; const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
    const fmt = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
    const rows = [];
    concerts.forEach(x => { let k = 0; order[x.id].forEach((pid, idx) => { const s = info[pid]; const gone = !s || s.p.status === '취소';
      rows.push([x.name, days[x.d] || '', "'" + (x.cs || ''), idx + 1, gone ? '(취소)' : (x.rs ? "'" + fmt(hm(x.rs) + (k++) * x.min) : ''), x.room, pid, s ? s.p.name : '', s ? s.sb.acad : '', s ? (s.p.inst || s.i.inst || '') : '', s ? s.i.prog || '' : '', s ? (s.i.other ? [s.i.oc, s.i.ot].filter(Boolean).join(' · ') : s.i.song || '') : '']); }); });
    const last = cs.getLastRow(); if (last > 1) cs.getRange(2, 1, last - 1, CON_HEAD.length).clearContent();
    if (rows.length) cs.getRange(2, 1, rows.length, CON_HEAD.length).setValues(rows);
    log_('관리자 ' + a.name, '음악회 순서 저장', concerts.length + '개 공연 · ' + rows.length + '명');
    return { ok: true, rev: (+c.conrev || 0) + 1 };
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

/* ================= 예산 · 결산 =================
 * 시트 「예산결산」: 항목 · 값(JSON) · 설명. 값이 길면 plan, plan2 … 로 45,000자씩 나눠 저장 + rev(동시 수정 막기)
 * plan = { base, mix, inc, lines }
 *   base: n 예상 인원(유료 참가자) · rmix 차수 비율 [1차, 2차 …] (참가비 금액은 캠프 설정 참가비표에서 불러옴) · fx 환율 {USD, JPY} · cut 수입에서 떼는 몫 {pct, parts:[[이름, %]…]}
 *         hotelFix 인원별 손익에서 호텔(객실·식사·홀)을 계약대로 고정할지 · sMin/sMax/sStep 인원표 범위
 *   mix:  참가자격별 인원 비율(평균 참가비 계산용) {참가자격: 인원}
 *   inc:  참가비 밖 수입 줄 { id, name, amt(예산), cur, scale, sys(접수 입금에 이미 들어감), act(실제), memo }
 *   lines: 지출 줄 { id, cat, name, unit, qty, times, cur, scale('fixed'|'person'), guar(보증 최소 수량), auto, conf(확정·견적), paid(지급), date, how, memo }
 * 권한: 메뉴 bplan(예산 계획) · bset(결산). 보기 = budData, 편집 = budSave */
const BUD_SH = '예산결산';
const BUD_CATS = ['room', 'meal', 'hall', 'prof', 'teach', 'staff', 'print', 'equip', 'ad', 'bus', 'schol', 'etc'];
const BUD_CUR = ['KRW', 'USD', 'JPY'];
const BUD_HOW = ['', '통장', '카드', '현금', '달러', '엔화', '기타'];
function budSeed_() {
  let k = 0; const L = o => Object.assign({ id: 'l' + (++k), unit: 0, qty: 1, times: 1, cur: 'KRW', scale: 'fixed', guar: '', auto: '', conf: '', paid: '', date: '', how: '', memo: '' }, o);
  let j = 0; const I = o => Object.assign({ id: 'i' + (++j), amt: 0, cur: 'KRW', scale: 'fixed', sys: false, act: '', memo: '' }, o);
  return {
    base: { n: 600, rmix: [474, 39, 7], fx: { USD: 1450, JPY: 9.5 }, cut: { pct: 10, parts: [['7%', 7], ['3%', 3]] }, hotelFix: true, sMin: 350, sMax: 700, sStep: 25 },
    mix: { '학생': 266, '교사': 95, '연수생': 26, '회원의 악기하는 자녀': 20, '회원의 첫번째 보호자': 69, '회원의 그외 악기 안하는 동반가족': 29, '동반가족 중 15개월 미만': 1, '비회원 학생': 2, '비회원 보호자': 2 },
    inc: [
      I({ name: '추가 레슨 · 마스터클래스', amt: 4200000, scale: 'person', sys: true, memo: '26 여름: 추가 레슨 24명 · 마스터클래스 9명 · 접수 입금에 함께 들어옴' }),
      I({ name: '해외 참가 달러 수입', amt: 0, cur: 'USD', memo: '26 겨울 $29,495 (통장 밖 · 환전 25,000,000원)' }),
      I({ name: '기타 수입 (식비 · 티켓 등)', amt: 0, memo: '26 여름 식비 270,000 · 티켓 260,000' })],
    lines: [
      L({ cat: 'room', name: '객실 S25 · S30 (4인실)', unit: 135000, qty: 200, times: 4, scale: 'person', memo: '스플라스 리솜 견적 26.10.21 · 600명 기준 · 4박' }),
      L({ cat: 'meal', name: '조식 (자율배식)', unit: 12000, qty: 540, times: 4, scale: 'person', auto: 'meal', memo: '1/12~15 · 보증인원 = 비용 (메뉴 변경 3일 전까지)' }),
      L({ cat: 'meal', name: '중식 · 석식 (자율배식)', unit: 12000, qty: 640, times: 7, scale: 'person', auto: 'meal', memo: '1/11 석식 ~ 1/14 석식' }),
      L({ cat: 'hall', name: '연회장 7곳 일괄 (그랜드홀 · 루비노홀 · 스페이스 · 스튜디오)', unit: 3000000, memo: '빔프로젝터 · 인터넷 포함' }),
      L({ cat: 'prof', name: '내국 교수진', unit: 26950000, memo: '26 겨울 실지출' }),
      L({ cat: 'prof', name: '외국 교수진', unit: 14300000, memo: '26 겨울 실지출 ($7,895 + ¥297,000)' }),
      L({ cat: 'teach', name: '교사 수당', unit: 200000, qty: 95, scale: 'person', auto: 'teach', memo: '26 겨울 실지출 19,000,000' }),
      L({ cat: 'staff', name: '스텝', unit: 2650000, memo: '26 겨울 실지출' }),
      L({ cat: 'staff', name: '외부 연주자', unit: 10000000, memo: '26 겨울 실지출 (예산 900,000에서 크게 늘었던 항목)' }),
      L({ cat: 'print', name: '프로그램북', unit: 1266000 }),
      L({ cat: 'print', name: '악보', unit: 300000 }),
      L({ cat: 'equip', name: '피아노 대여 · 조율', unit: 1650000, memo: '그랜드1 · 업라이트2' }),
      L({ cat: 'ad', name: '잡지 광고', unit: 1000000 }),
      L({ cat: 'bus', name: '버스비 지원', unit: 3700000 }),
      L({ cat: 'schol', name: '장학금', unit: 5900000, auto: 'schol', memo: '학생 30명↑ 120만 · 20명↑ 80만 · 10명↑ 40만 + 첼로 지원' }),
      L({ cat: 'etc', name: '호텔 기타 (음료 · 추가 침구 등)', unit: 2000000 }),
      L({ cat: 'etc', name: '잡비', unit: 1500000 })]
  };
}
function budRead_() {
  const R = rows_(BUD_SH); let rev = 0; const parts = [];
  R.forEach(r => { const k = String(r['항목'] || ''), v = String(r['값'] == null ? '' : r['값']);
    if (k === 'rev') rev = +v || 0; else { const m = k.match(/^plan(\d*)$/); if (m) parts.push([+(m[1] || 1), v]); } });
  if (!parts.length) return { plan: null, rev };
  try { return { plan: JSON.parse(retype_(parts.sort((a, b) => a[0] - b[0]).map(x => x[1]).join(''))), rev }; } catch (x) { return { plan: null, rev, err: '예산결산 시트의 값을 읽지 못했어요.' }; }
}
function budCanSee_(a) { if (!a.sup && !['bplan', 'bset'].some(k => a.perms[k] === '보기' || a.perms[k] === '편집')) throw new Error('예산 · 결산을 볼 권한이 없어요.'); }
function budData(token) {
  const a = adm_(token); budCanSee_(a);
  const r = budRead_();
  let schol = 0, scholN = 0; try { scholRows_().forEach(x => { if (x.state === '해당 없음') return; const v = x.amt === '' || x.amt == null ? +x.base || 0 : +x.amt || 0; schol += v; if (v) scholN++; }); } catch (x) {}
  let lessons = 0; try { lessons = lessons_().length; } catch (x) {}
  let rooms = 0; try { rooms = rooms_().filter(x => (x.occ || []).length).length; } catch (x) {}
  const c = camp_();
  let pay = null; try { pay = payData_(); } catch (x) { pay = { err: x.message }; }
  return { plan: r.plan || budSeed_(), rev: r.rev, seeded: !r.plan, err: r.err || '', auto: { schol, scholN, lessons, rooms }, fees: c.fees, rounds: c.rounds.map(x => x.n), camp: c.base, pay };
}
/** 결산 › 교사 · 교수 정산: 교사 일정 역할 횟수 · 개인레슨 칸 수 · 마스터클래스 신청 학생 수 (단가 · 세금은 화면 + 예산결산 plan.pay) */
function payData_() {
  const c = actCfg_(), ppl = actPeople_(c.people), evs = actEvents_();
  const cnt = {}, reh = {}, roles = {};
  evs.forEach(e => {
    if (e.title === '마스터클래스') return;   // 마스터클래스는 교수 레슨비(신청 학생 수)로
    const cat = ACT_CATS.includes(e.type) ? e.type : (e.type === '리허설' ? '공연' : '레슨');
    const main = cat !== '공연' || !e.stage || e.stage === '본공연';
    e.ppl.forEach(z => { if (!z || !z.n) return; const k = cat + '|' + (z.r || '수업'); roles[k] = 1; const T = main ? cnt : reh; (T[z.n] = T[z.n] || {})[k] = ((T[z.n] || {})[k] || 0) + 1; });
  });
  const les = {}; try { lessons_().forEach(x => { les[x.pr] = (les[x.pr] || 0) + 1; }); } catch (x) {}
  const mc = {}; try { loadSubs_().forEach(sb => sb.ppl.forEach(p => { if (p.status === '취소') return; const i = (sb.form && sb.form.info && sb.form.info[p.id.slice(sb.no.length + 1)]) || {}; (i.mc || []).forEach(m => { mc[m] = (mc[m] || 0) + 1; }); })); } catch (x) {}
  const profs = profs_().filter(p => p.on || les[p.name] || mc[p.name]).map(p => ({ n: p.name, inst: p.inst, org: p.org, fee: p.fee, lesson: p.lesson, mc: p.mc }));
  const TS = teachers_(), byId = {}, byNm = {}; TS.forEach(t => { byId[t.id] = t; const k = t.name.replace(/\s/g, ''); (byNm[k] = byNm[k] || []).push(t); });
  const mem = (tid, n) => { const t = (tid && byId[tid]) || ((byNm[String(n).replace(/\s/g, '')] || []).length === 1 ? byNm[String(n).replace(/\s/g, '')][0] : null); return t ? { tid: t.id, acct: t.acct, rrn: t.rrn, inc: t.inc } : { tid: '', acct: false, rrn: false, inc: '' }; };
  return { ppl: ppl.map(p => Object.assign({ id: p.id, n: p.n, kind: p.kind, acad: p.acad || '', inst: p.inst || '', cx: !!p.cx, out: !!p.out }, mem(p.tid, p.n))), cnt, reh, roles: Object.keys(roles).sort(), les, mc,
    profs: profs.map(p => Object.assign(p, mem('', p.n))), sent: (() => { const sh = SpreadsheetApp.getActive().getSheetByName('정산'); return sh ? String(sh.getRange(1, 8).getNote() || '') : ''; })() };
}
/** 결산 › 「회원관리로 보내기」: 사람별 지급액 · 세율을 이 시트 「정산」 탭에 통째로 씀 → 회원관리 통장 › 지급 › 「캠프 정산 불러오기」 (계좌 · 주민번호는 회원관리에만) */
function paySend(token, rows) {
  const a = adm_(token); need_(a, ['bset']);
  const L = (rows || []).slice(0, 800).map(r => [String(r.tid || '').slice(0, 20), String(r.n || '').slice(0, 40), String(r.what || '').slice(0, 60), Math.max(0, Math.round(+r.g || 0)), ['3.3', '8.8', '0'].includes(String(r.rate)) ? String(r.rate) : '3.3', String(r.memo || '').slice(0, 200)]).filter(r => r[1] && r[3] > 0);
  const lock = lock_();
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName('정산'); if (!sh) sh = ss.insertSheet('정산');
    sh.clearContents(); const head = ['교사ID', '이름', '내용', '지급액', '세율', '메모'];
    sh.getRange(1, 1, L.length + 1, head.length).setNumberFormat('@').setValues([head].concat(L.map(r => r.map(String)))); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    const at = stamp_(); sh.getRange(1, 8).setValue('보낸 때').setNote(at + ' · ' + a.name + ' · ' + L.length + '명');
    log_('관리자 ' + a.name, '정산 보내기', L.length + '명 · ' + L.reduce((t, r) => t + r[3], 0) + '원');
    return { n: L.length, at: at + ' · ' + a.name + ' · ' + L.length + '명' };
  } finally { lock.releaseLock(); }
}
/** 선생님 화면 「내 수당」 (숨김 · 설정 「수당 공개」 = 예일 때만): 「정산」 탭에서 내 줄 */
function myPay_(tid, name) {
  if (setting_('수당 공개') !== '예') return null;
  const sh = SpreadsheetApp.getActive().getSheetByName('정산'); if (!sh || sh.getLastRow() < 2) return null;
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues();
  const L = v.filter(r => (tid && r[0] === tid) || (!r[0] && r[1] === name)).map(r => ({ what: r[2], g: +r[3] || 0, rate: r[4], memo: r[5] }));
  return L.length ? L : null;
}
function budSave(token, plan, rev) {
  const a = adm_(token); need_(a, ['bplan', 'bset']);
  const n = v => { const x = Math.round((+v || 0) * 100) / 100; return isFinite(x) ? x : 0; }, opt = v => v === '' || v == null ? '' : n(v);
  const s = (v, m) => String(v == null ? '' : v).trim().slice(0, m || 120), okD = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  const p = plan || {}, b = p.base || {}, fx = b.fx || {}, cut = b.cut || {};
  const base = { n: Math.max(1, Math.round(+b.n || 0)), rmix: (Array.isArray(b.rmix) ? b.rmix : []).slice(0, 6).map(v => Math.max(0, n(v))), fx: { USD: Math.max(0, n(fx.USD)), JPY: Math.max(0, n(fx.JPY)) },
    cut: { pct: Math.max(0, Math.min(100, n(cut.pct))), parts: (cut.parts || []).slice(0, 6).map(x => [s(x[0], 20), Math.max(0, Math.min(100, n(x[1])))]).filter(x => x[0]) },
    hotelFix: !!b.hotelFix, sMin: Math.max(1, Math.round(+b.sMin || 300)), sMax: Math.max(1, Math.round(+b.sMax || 700)), sStep: Math.max(1, Math.round(+b.sStep || 25)) };
  if (base.sMax <= base.sMin) throw new Error('인원표의 끝 인원을 시작 인원보다 크게 넣어 주세요.');
  if ((base.sMax - base.sMin) / base.sStep > 80) throw new Error('인원표 줄이 너무 많아요. 간격을 넓혀 주세요.');
  const mix = {}; FEE_TYPES.forEach(t => { const v = Math.max(0, Math.round(+((p.mix || {})[t]) || 0)); if (v) mix[t] = v; });
  const ids = {}; const uid = (x, pre) => { let id = s(x, 20) || pre + Utilities.getUuid().slice(0, 6); while (ids[id]) id = pre + Utilities.getUuid().slice(0, 6); ids[id] = 1; return id; };
  const inc = (p.inc || []).slice(0, 60).map(x => ({ id: uid(x.id, 'i'), name: s(x.name, 60), amt: n(x.amt), cur: BUD_CUR.includes(x.cur) ? x.cur : 'KRW', scale: x.scale === 'person' ? 'person' : 'fixed', sys: !!x.sys, act: opt(x.act), memo: s(x.memo, 300) })).filter(x => x.name);
  const lines = (p.lines || []).slice(0, 200).map(x => ({ id: uid(x.id, 'l'), cat: BUD_CATS.includes(x.cat) ? x.cat : 'etc', name: s(x.name, 80), unit: n(x.unit), qty: n(x.qty === '' || x.qty == null ? 1 : x.qty), times: n(x.times === '' || x.times == null ? 1 : x.times),
    cur: BUD_CUR.includes(x.cur) ? x.cur : 'KRW', scale: x.scale === 'person' ? 'person' : 'fixed', guar: opt(x.guar), auto: ['schol', 'teach', 'meal', 'room', 'plesson'].includes(x.auto) ? x.auto : '',
    conf: opt(x.conf), paid: opt(x.paid), date: okD(x.date), how: BUD_HOW.includes(x.how) ? x.how : '', memo: s(x.memo, 300) })).filter(x => x.name);
  const py = p.pay || {}, per = {}, sn = v => { const x = opt(v); return x === '' ? '' : x; };
  const items = (Array.isArray(py.items) ? py.items : []).slice(0, 30).map(x => ({ id: s(x.id, 16) || 'i' + Utilities.getUuid().slice(0, 5), name: s(x.name, 20) || '항목', rate: Math.max(0, n(x.rate)), rule: ['count', 'once', 'max'].includes(x.rule) ? x.rule : 'count',
    n: Math.max(1, Math.min(20, Math.round(+x.n || 1))), train: !!x.train, roles: (Array.isArray(x.roles) ? x.roles : []).slice(0, 60).map(k => s(k, 60)).filter(Boolean) }));
  Object.keys(py.per || {}).slice(0, 800).forEach(k => { const x = py.per[k] || {}, o = { adj: sn(x.adj), fin: sn(x.fin), les: sn(x.les), mc: sn(x.mc), why: s(x.why, 120), inc: ['3.3', '8.8', '0'].includes(String(x.inc)) ? String(x.inc) : '', noLes: !!x.noLes };
    if (o.adj !== '' || o.fin !== '' || o.les !== '' || o.mc !== '' || o.why || o.inc || o.noLes) per[s(k, 80)] = o; });
  const pay = { items, reh: !!py.reh, lesRate: Math.max(0, n(py.lesRate == null ? 50000 : py.lesRate)), mcRate: Math.max(0, n(py.mcRate)), mcFee: !!py.mcFee, free: Math.max(0, n(py.free == null ? 50000 : py.free)), what: s(py.what, 40), per };
  const json = JSON.stringify({ base, mix, inc, lines, pay });
  const lock = lock_();
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(BUD_SH);
    if (!sh) { sh = ss.insertSheet(BUD_SH); sh.getRange(1, 1, 1, 3).setValues([['항목', '값', '설명']]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('B:B').setNumberFormat('@'); }
    const cur = budRead_();
    if ((+rev || 0) !== (cur.rev || 0)) throw new Error('다른 분이 먼저 예산 · 결산을 바꿨어요. 새로 불러온 뒤 다시 해 주세요.');
    const vals = []; for (let i = 0; i * JSON_CHUNK < json.length; i++) vals.push(['plan' + (i ? i + 1 : ''), json.slice(i * JSON_CHUNK, (i + 1) * JSON_CHUNK), i ? '앞 줄에 이어짐' : '예산 계획 · 결산 (관리자 예산 · 결산 메뉴에서 바꿈 · 직접 고치지 마세요)']);
    vals.push(['rev', String((cur.rev || 0) + 1), '바꾼 횟수 (건드리지 마세요)']);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).clearContent();
    sh.getRange(2, 1, vals.length, 3).setValues(vals);
    log_('관리자 ' + a.name, '예산 · 결산 저장', '수입 줄 ' + inc.length + ' · 지출 줄 ' + lines.length + ' · 예상 인원 ' + base.n);
  } finally { lock.releaseLock(); }
  return budData(token);
}

/* ---------- 공유 미리보기(OG) 11-01: 깃허브 공유 페이지(app.suzukimusickorea.org)의 og 태그 · 이미지를 관리자 화면에서 고침 ----------
 * 토큰: 스크립트 속성 GITHUB_TOKEN (관리자 화면 「깃허브 토큰 등록」, redica1/suzuki 「Contents: Read and write」만 준 fine-grained 토큰)
 * 매니페스트에 https://www.googleapis.com/auth/script.external_request 가 있어야 함 */
const OG_PAGES = { camp: 'camp/index.html', intl: 'camp/intl.html' };
const OG_REPO = 'redica1/suzuki', OG_BASE = 'https://app.suzukimusickorea.org/';
/** 편집기에서 한 번 실행 → 「외부 서비스에 연결」 권한 허용 창이 떠요 (OG 저장 권한 오류 고치기) */
function ogAuth() { const r = UrlFetchApp.fetch('https://api.github.com/repos/' + OG_REPO, { muteHttpExceptions: true }); Logger.log('깃허브 연결 ' + r.getResponseCode() + ' · 이제 배포 관리 › 새 버전으로 다시 배포하세요'); }
function ogTok_() { return PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN') || ''; }
function ogGh_(method, path, body) {
  const tok = ogTok_(); if (!tok) throw new Error('깃허브 토큰이 아직 없어요. 아래 「깃허브 토큰 등록」을 먼저 해 주세요.');
  const o = { method, headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, muteHttpExceptions: true };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + OG_REPO + (path ? '/contents/' + path : ''), o), c = r.getResponseCode();
  if (c === 404 && method === 'get') return null;
  if (c >= 300) throw new Error('깃허브가 거절했어요 (' + c + '). 토큰 권한(Contents 쓰기)을 확인해 주세요. ' + r.getContentText().slice(0, 160));
  return JSON.parse(r.getContentText());
}
const ogEsc_ = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ogDec_ = s => String(s || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function ogMeta_(html, attr, key) { const m = html.match(new RegExp('<meta ' + attr + '="' + key.replace(/[.:]/g, '\\$&') + '" content="([^"]*)"[^>]*>')); return m ? ogDec_(m[1]) : ''; }
function ogSet_(html, attr, key, val, after) {
  const re = new RegExp('<meta ' + attr + '="' + key.replace(/[.:]/g, '\\$&') + '" content="[^"]*"[^>]*>'), tag = '<meta ' + attr + '="' + key + '" content="' + ogEsc_(val) + '">';
  if (re.test(html)) return html.replace(re, tag);
  const a = after && html.match(new RegExp('<meta [^>]*' + after.replace(/[.:]/g, '\\$&') + '[^>]*>'));
  return a ? html.replace(a[0], a[0] + '\n' + tag) : html.replace('</head>', tag + '\n</head>');
}
function ogPage_(key) { const p = OG_PAGES[key]; if (!p) throw new Error('고칠 수 없는 페이지예요.'); return p; }
function ogGet(token, key) {
  const a = adm_(token); if (typeof needSup_ === 'function') needSup_(a);
  const path = ogPage_(key), has = !!ogTok_();
  let html = '';
  try { if (has) { const f = ogGh_('get', path); html = f ? Utilities.newBlob(Utilities.base64Decode(f.content.replace(/\n/g, ''))).getDataAsString('UTF-8') : ''; }
        else html = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + OG_REPO + '/main/' + path + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText('UTF-8'); }
  catch (e) { return { ok: true, hasToken: has, err: e.message, url: OG_BASE + path.replace(/index\.html$/, '') }; }
  return { ok: true, hasToken: has, url: OG_BASE + path.replace(/index\.html$/, ''), title: ogMeta_(html, 'property', 'og:title'), desc: ogMeta_(html, 'property', 'og:description'), image: ogMeta_(html, 'property', 'og:image') };
}
function ogToken(token, tok) {
  const a = adm_(token); if (typeof needSup_ === 'function') needSup_(a);
  tok = String(tok || '').trim(); if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(tok)) throw new Error('깃허브 토큰 모양이 아니에요 (github_pat_… 로 시작).');
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + OG_REPO, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('이 토큰으로 ' + OG_REPO + ' 저장소를 열 수 없어요 (' + r.getResponseCode() + ').');
  const j = JSON.parse(r.getContentText()); if (j.permissions && j.permissions.push === false) throw new Error('이 토큰은 쓰기 권한이 없어요. 「Contents: Read and write」로 다시 만들어 주세요.');
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', tok);
  return { ok: true };
}
function ogSave(token, key, d) {
  const a = adm_(token); if (typeof needSup_ === 'function') needSup_(a); d = d || {};
  const path = ogPage_(key), dir = path.replace(/[^/]*$/, ''), title = String(d.title || '').trim().slice(0, 90), desc = String(d.desc || '').trim().slice(0, 200);
  if (!title) throw new Error('제목을 넣어 주세요.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    let img = '';
    if (d.img) {
      const m = String(d.img).match(/^data:image\/(png|jpeg);base64,(.+)$/); if (!m) throw new Error('이미지는 PNG · JPG 만 돼요.');
      if (m[2].length > 2800000) throw new Error('이미지가 너무 커요 (2MB 까지).');
      const ip = dir + 'og-' + key + '.' + (m[1] === 'png' ? 'png' : 'jpg'), old = ogGh_('get', ip);
      ogGh_('put', ip, { message: 'OG 이미지 바꿈 · ' + key + ' (관리자 ' + a.name + ')', content: m[2], sha: old ? old.sha : undefined });
      img = OG_BASE + ip + '?v=' + Date.now().toString(36);
    }
    const f = ogGh_('get', path); if (!f) throw new Error('페이지 파일을 찾지 못했어요: ' + path);
    let html = Utilities.newBlob(Utilities.base64Decode(f.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
    html = ogSet_(html, 'property', 'og:title', title, 'og:type');
    html = ogSet_(html, 'property', 'og:description', desc, 'og:title');
    html = ogSet_(html, 'name', 'description', desc, 'viewport');
    if (img) { html = ogSet_(html, 'property', 'og:image', img, 'og:url'); html = ogSet_(html, 'name', 'twitter:card', 'summary_large_image', 'og:image'); }
    ogGh_('put', path, { message: 'OG 바꿈 · ' + key + ' (관리자 ' + a.name + ')', content: Utilities.base64Encode(html, Utilities.Charset.UTF_8), sha: f.sha });
  } finally { lock.releaseLock(); }
  return ogGet(token, key);
}


/* ================= 분실물 (11-03) =================
 * 누구나 올림: 로그인한 선생님 또는 「일정 찾기」에 이름 · 휴대전화로 들어온 사람.
 * 「제 거예요」는 각자 알아서(운영진 확인 없음). 주인이 누르면 「주인 찾음」, 누른 사람이나 올린 사람이 되돌릴 수 있음.
 * 사진: 화면에서 줄여서 보냄 → 큰 사진은 드라이브 「캠프 분실물 사진 (캠프ID)」(비공개), 작은 사진은 시트 칸에 글자로. 화면에는 서버를 거쳐서만 보임 */
const LOST = '분실물', LOST_HEAD = ['번호', '등록일시', '등록자', '등록자 구분', '찾은 곳', '설명', '사진ID', '작은사진', '상태', '주인', '주인 구분', '찾은일시', '본인키', '주인키', '보관 장소'];
function lostSheet_() { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(LOST); if (!sh) { sh = ss.insertSheet(LOST); sh.appendRow(LOST_HEAD); } else { const h = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]; if (h.indexOf('보관 장소') < 0) sh.getRange(1, h.filter(String).length + 1).setValue('보관 장소'); } return sh; }
function lostFolder_() { const n = '캠프 분실물 사진 ' + camp_().base.id, it = DriveApp.getFoldersByName(n); return it.hasNext() ? it.next() : DriveApp.createFolder(n); }
function lostApiT(token, req) { const u = who_(token); return lost_({ key: 'T:' + u.name, name: u.name, kind: '선생님' }, req || {}); }
function lostApiF(req, tok) { const G0 = findGate_(); if (!G0.open) return G0; let v; try { v = findTok_(tok); } catch (e) { return { ok: false, needIn: true, msg: '처음 화면에서 이름 · 휴대전화를 넣어 주세요.' }; }
  const [nm, p4] = String(v).split('|'); return lost_({ key: 'F:' + nm + '|' + p4, name: nm, kind: '참가자' }, req || {}); }
function lost_(me, req) {
  const op = String(req.op || 'list'), a = req.a || {};
  const rows = () => rows_(LOST).filter(r => String(r['번호'] || ''));
  const mask = n => { n = String(n || ''); return n.length <= 1 ? n : n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n.slice(-1); };
  const ts = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'M/d HH:mm') : String(v || '').replace(/^\d{4}-0?(\d+)-0?(\d+)\s+(\d+:\d+).*$/, '$1/$2 $3');
  const out = r => ({ id: String(r['번호']), at: ts(r['등록일시']), by: mask(r['등록자']), byKind: String(r['등록자 구분'] || ''), where: String(r['찾은 곳'] || ''), desc: String(r['설명'] || ''), th: String(r['작은사진'] || ''), pic: !!String(r['사진ID'] || ''),
    keep: String(r['보관 장소'] || ''), st: String(r['상태'] || '보관 중'), owner: mask(r['주인']), ownAt: ts(r['찾은일시']), mine: String(r['본인키']) === me.key, myClaim: String(r['주인키']) === me.key });
  if (op === 'list') { lostSheet_(); return { ok: true, me: me.name, items: rows().filter(r => String(r['상태']) !== '삭제').map(out).reverse() }; }
  if (op === 'photo') { const r = rows().find(x => String(x['번호']) === String(a.id)); if (!r || !r['사진ID']) return { ok: false, msg: '사진이 없어요.' };
    try { const b = DriveApp.getFileById(String(r['사진ID'])).getBlob(); return { ok: true, img: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) }; } catch (e) { return { ok: false, msg: '사진을 불러오지 못했어요.' }; } }
  const C = CacheService.getScriptCache(), rk = 'lost_' + me.key; if (op === 'add' && C.get(rk)) return { ok: false, msg: '방금 올렸어요. 20초 뒤에 다시 올려 주세요.' };
  const lock = lock_();
  try {
    const sh = lostSheet_();
    if (op === 'add') {
      const where = String(a.where || '').trim().slice(0, 40), desc = String(a.desc || '').trim().slice(0, 200), th = String(a.th || '');
      if (!a.img && !desc) return { ok: false, msg: '사진이나 설명을 넣어 주세요.' };
      if (th.length > 45000) return { ok: false, msg: '작은 사진이 너무 커요. 다시 골라 주세요.' };
      if (a.img && String(a.img).length > 1500000) return { ok: false, msg: '사진이 너무 커요. 다시 골라 주세요.' };
      let pid = ''; if (a.img) { const m = String(a.img).match(/^data:(image\/\w+);base64,(.+)$/); if (!m) return { ok: false, msg: '사진 파일만 올릴 수 있어요.' };
        pid = lostFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], Utilities.formatDate(new Date(), TZ, 'MMdd-HHmmss') + '.jpg')).getId(); }
      const n = rows().reduce((m, r) => Math.max(m, +String(r['번호']).replace(/\D/g, '') || 0), 0) + 1;
      sh.appendRow(['L' + String(n).padStart(3, '0'), stamp_(), me.name, me.kind, where, desc, pid, th, '보관 중', '', '', '', me.key, '', String(a.keep || '').trim().slice(0, 40)]);
      C.put(rk, '1', 20); log_(me.name, '분실물 올림', where + ' ' + desc.slice(0, 30));
    } else {
      const r = rows().find(x => String(x['번호']) === String(a.id)); if (!r) return { ok: false, msg: '그 분실물을 찾지 못했어요. 새로 고쳐 주세요.' };
      const H = LOST_HEAD, set = (k, v) => sh.getRange(r._row, H.indexOf(k) + 1).setValue(v);
      if (op === 'claim') { if (String(r['상태']) !== '보관 중') return { ok: false, msg: '이미 주인이 찾아갔어요.' }; set('상태', '주인 찾음'); set('주인', me.name); set('주인 구분', me.kind); set('찾은일시', stamp_()); set('주인키', me.key); log_(me.name, '분실물 제 거예요', r['번호']); }
      else if (op === 'undo') { if (String(r['주인키']) !== me.key && String(r['본인키']) !== me.key) return { ok: false, msg: '찾은 사람이나 올린 사람만 되돌릴 수 있어요.' }; set('상태', '보관 중'); set('주인', ''); set('주인 구분', ''); set('찾은일시', ''); set('주인키', ''); log_(me.name, '분실물 되돌림', r['번호']); }
      else if (op === 'keep') { if (String(r['본인키']) !== me.key) return { ok: false, msg: '올린 사람만 바꿀 수 있어요.' }; set('보관 장소', String(a.keep || '').trim().slice(0, 40)); }
      else if (op === 'del') { if (String(r['본인키']) !== me.key) return { ok: false, msg: '올린 사람만 지울 수 있어요.' }; set('상태', '삭제'); log_(me.name, '분실물 지움', r['번호']); }
      else return { ok: false, msg: '알 수 없는 요청이에요.' };
    }
  } finally { lock.releaseLock(); }
  return lost_(me, { op: 'list' });
}

/* ================= 공지사항 (11-03): 캠프 페이지 「공지사항」 · 관리자 「공지사항」 탭 =================
 * 시트 「공지사항」: 날짜 · 제목 · 내용 · 맨 위(예) · 쓴 사람. 맨 위 띠 한 줄은 설정 「공지」 */
function ntcSheet_() { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName('공지사항'); if (!sh) { sh = ss.insertSheet('공지사항'); sh.appendRow(['날짜', '제목', '내용', '맨 위', '쓴 사람']); } return sh; }
function adminNotices(token) { const a = adm_(token); if (!a.sup && !['ntc', 'tt'].some(t => a.perms[t] === '편집' || a.perms[t] === '보기')) throw new Error('공지사항 권한이 있어야 볼 수 있어요.'); ntcSheet_();
  const L = rows_('공지사항').filter(r => String(r['제목'] || r['내용'] || '').trim()).map(r => ({ row: r._row, at: r['날짜'] instanceof Date ? Utilities.formatDate(r['날짜'], TZ, 'yyyy-MM-dd HH:mm') : String(r['날짜'] || ''), title: String(r['제목'] || ''), body: String(r['내용'] || ''), top: /^(예|y|o|1|true)$/i.test(String(r['맨 위'] || '').trim()), by: String(r['쓴 사람'] || '') })).reverse();
  return Object.assign({ ok: true, list: L, banner: setting_('공지') }, menuCtx_()); }
/* 식단표 (11-03): 시트 「식단표」 날짜번호 · 식사 · 메뉴(한 줄에 하나) · 메모(원산지 등) — 관리자 「공지사항」 탭에서 넣고, 캠프 페이지 「식사 · 장소」에 날짜별로 보임 */
const MENU_SH = '식단표';
function menuRows_() { const ss = SpreadsheetApp.getActive(); if (!ss.getSheetByName(MENU_SH)) return [];
  return rows_(MENU_SH).filter(r => String(r['식사'] || '').trim()).map(r => ({ d: +r['날짜번호'] || 0, k: String(r['식사']).trim(), items: String(r['메뉴'] || '').split('\n').map(x => x.trim()).filter(Boolean), memo: String(r['메모'] || '') })); }
function menuCtx_() { const c = actCfg_(), days = c.days || [];
  const meals = (Array.isArray(c.meals) ? c.meals : mealGen_(camp_().meals, days.length)).map(m => ({ d: m.d, k: String(m.k || m.t || ''), s: m.s, e: m.e })).filter(m => m.k);
  return { days, meals, menu: menuRows_() }; }
function adminMenuSave(token, list) { const a = adm_(token); need_(a, ['ntc', 'tt']);
  const L = (list || []).slice(0, 200).map(x => [Math.max(0, Math.round(+x.d || 0)), String(x.k || '').trim().slice(0, 20), (Array.isArray(x.items) ? x.items : String(x.items || '').split('\n')).map(v => String(v).trim().slice(0, 60)).filter(Boolean).slice(0, 40).join('\n'), String(x.memo || '').trim().slice(0, 300)]).filter(r => r[1] && (r[2] || r[3]));
  const lock = lock_(); try { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(MENU_SH); if (!sh) sh = ss.insertSheet(MENU_SH);
    sh.clearContents(); const head = ['날짜번호', '식사', '메뉴', '메모']; sh.getRange(1, 1, L.length + 1, 4).setValues([head].concat(L)); sh.setFrozenRows(1); sh.getRange(1, 1, 1, 4).setFontWeight('bold');
    log_('관리자 ' + a.name, '식단표 저장', L.length + '끼'); } finally { lock.releaseLock(); }
  return Object.assign({ ok: true }, menuCtx_()); }
function adminNoticeSave(token, d) { const a = adm_(token); need_(a, ['ntc', 'tt']); d = d || {};
  const lock = lock_(); try { const sh = ntcSheet_();
    if (d.del && d.row) { sh.deleteRow(+d.row); log_('관리자 ' + a.name, '공지 지움', String(d.title || '')); }
    else { const title = String(d.title || '').trim().slice(0, 80), body = String(d.body || '').trim().slice(0, 2000); if (!title && !body) throw new Error('제목이나 내용을 넣어 주세요.');
      if (d.row) sh.getRange(+d.row, 2, 1, 4).setValues([[title, body, d.top ? '예' : '', a.name]]); else sh.appendRow([stamp_(), title, body, d.top ? '예' : '', a.name]);
      log_('관리자 ' + a.name, d.row ? '공지 고침' : '공지 올림', title); }
  } finally { lock.releaseLock(); }
  return adminNotices(token); }


/* ================= 식권 QR (11-04): 2026 여름에 따로 쓰던 「식권 QR」 앱스크립트를 캠프에 합침 =================
 * 그대로 둔 것 (여름 HANDOFF): 수거 방식 · 유효시간 검사 없음(표시만) · 스캔하면 판정 없이 「제출 완료」, 발급 기록에 없는 번호만 「등록되지 않은 QR」
 *   · 고유번호 {식사코드 1~4}-{이용 시작일 YYMMDD}-{6자리} · 식사구분 아침 1 / 점심 2 / 저녁 3 / 공연 4 · 티켓 50mm × 74.5mm, A4 에 4 × 3 = 12장
 * 바뀐 것: 번호를 서버가 한 번에 만들어 시트에 씀(예전엔 한 장마다 따로 보냄) · QR 에는 고유번호만(라벨은 그림에만 · 인식이 쉬움)
 *   · 식사 목록 = 캠프 설정 「식사 시간」 × 교사 일정 날짜 · 스캐너 = ?page=meal (새로 고치지 않고 바로 다음 스캔)
 * 시트 「식권발급」 고유번호 · 식사구분 · 라벨 · 발급일시 · 이용시작 · 이용마감 · 묶음 · 발급자 / 「식권제출」 고유번호 · 식사구분 · 라벨 · 제출시각 · 묶음 · 스캐너 */
const MEAL_ISS = '식권발급', MEAL_SUB = '식권제출';
const MEAL_ISS_HEAD = ['고유번호', '식사구분', '라벨', '발급일시', '이용시작', '이용마감', '묶음', '발급자'];
const MEAL_SUB_HEAD = ['고유번호', '식사구분', '라벨', '제출시각', '묶음', '스캐너'];
const MEAL_KINDS = { '1': '아침', '2': '점심', '3': '저녁', '4': '공연' };
const MEAL_RX_NO = /([1-4]-\d{6}-\d{6})/;
function mealSh_(name, head) { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('A:A').setNumberFormat('@'); }
  return sh; }
function mealVals_(name, head) { const sh = mealSh_(name, head), n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, head.length).getDisplayValues(); }
function mealPerm_(a, edit) { if (a.sup) return; const p = a.perms.meal; if (edit ? p !== '편집' : !['보기', '편집'].includes(p)) throw new Error(edit ? '식권 「편집」 권한이 있어야 해요.' : '식권 권한이 있어야 볼 수 있어요.'); }
function mealAddDays_(ymd, n) { const [y, m, d] = String(ymd).split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); }
function mealScanUrl_() { let stg = false; try { stg = !!setting_('테스트 로그인'); } catch (x) {}
  let exec = ''; try { exec = ScriptApp.getService().getUrl(); } catch (x) {}
  return { pretty: 'https://app.suzukimusickorea.org/camp/meal.html' + (stg ? '?test' : ''), exec: exec ? exec + '?page=meal' : '' }; }

/** 관리자 「식권」 탭: 식사 목록(날짜 × 식사) · 만든 묶음(발급 · 제출 · 중복) · 최근 스캔 */
function mealAdmin(token) {
  const a = adm_(token); mealPerm_(a, false);
  const C = camp_(), start = C.base.start, ctx = menuCtx_();
  const meals = ctx.meals.map(m => ({ d: m.d, date: mealAddDays_(start, m.d), day: String(ctx.days[m.d] || ''), k: m.k, s: hm_(m.s), e: hm_(m.e) }));
  const iss = mealVals_(MEAL_ISS, MEAL_ISS_HEAD), sub = mealVals_(MEAL_SUB, MEAL_SUB_HEAD);
  const B = {}, of = {};
  iss.forEach(r => { const id = r[6] || '(묶음 없음)'; of[r[0]] = id;
    const b = B[id] || (B[id] = { id, kind: r[1], label: r[2], at: r[3], s: r[4], e: r[5], by: r[7], n: 0, sub: 0, dup: 0, last: '' }); b.n++; });
  const seen = {};
  sub.forEach(r => { const id = r[4] || of[r[0]]; const b = B[id]; if (!b) return; if (seen[r[0]]) b.dup++; else { seen[r[0]] = 1; b.sub++; } if (r[3] > b.last) b.last = r[3]; });
  const batches = Object.keys(B).map(k => B[k]).sort((x, y) => String(x.s).localeCompare(String(y.s)) || x.label.localeCompare(y.label));
  const recent = sub.slice(-30).reverse().map(r => ({ no: r[0], kind: r[1], label: r[2], at: r[3], dev: r[5], dup: 0 }));
  return { ok: true, camp: C.base.name, start, days: ctx.days, meals, batches, recent, total: { iss: iss.length, sub: Object.keys(seen).length, scans: sub.length },
    url: mealScanUrl_(), sheet: SpreadsheetApp.getActive().getUrl() };
}

/** 식권 만들기: list = [{label, kind(1~4), sdate, stime, edate, etime, n}] → 묶음마다 고유번호 n개 (서버가 겹치지 않게 만듦) */
function mealIssue(token, list) {
  const a = adm_(token); mealPerm_(a, true);
  const L = (Array.isArray(list) ? list : []).slice(0, 40).map(x => {
    const kind = String(x.kind || ''), label = String(x.label || '').trim().slice(0, 30), n = Math.round(+x.n || 0);
    const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(v), okT = v => /^\d{2}:\d{2}$/.test(v);
    if (!MEAL_KINDS[kind]) throw new Error('식사 구분이 맞지 않아요.');
    if (!label) throw new Error('라벨을 넣어 주세요.');
    if (!ok(x.sdate) || !ok(x.edate) || !okT(x.stime) || !okT(x.etime)) throw new Error(label + ': 이용 날짜 · 시간을 확인해 주세요.');
    if (x.sdate + x.stime >= x.edate + x.etime) throw new Error(label + ': 마감이 시작보다 나중이어야 해요.');
    if (n < 1 || n > 1500) throw new Error(label + ': 매수는 1 ~ 1,500장이에요.');
    return { kind, label, s: x.sdate + ' ' + x.stime, e: x.edate + ' ' + x.etime, sdate: x.sdate, n };
  });
  if (!L.length) throw new Error('만들 식권을 골라 주세요.');
  const tot = L.reduce((t, x) => t + x.n, 0); if (tot > 8000) throw new Error('한 번에 8,000장까지 만들 수 있어요. 나눠서 만들어 주세요.');
  const lock = lock_(); const made = [];
  try {
    const sh = mealSh_(MEAL_ISS, MEAL_ISS_HEAD), have = {}; mealVals_(MEAL_ISS, MEAL_ISS_HEAD).forEach(r => have[r[0]] = 1);
    const now = stamp_(), base = 'M' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss'), rows = [];
    L.forEach((x, i) => { const id = base + '-' + (i + 1), dp = x.sdate.slice(2).replace(/-/g, '');
      for (let k = 0; k < x.n; k++) { let no, t = 0; do { no = x.kind + '-' + dp + '-' + (100000 + Math.floor(Math.random() * 900000)); } while (have[no] && ++t < 50); if (have[no]) throw new Error('고유번호를 만들지 못했어요. 다시 해 주세요.'); have[no] = 1;
        rows.push([no, MEAL_KINDS[x.kind], x.label, "'" + now, "'" + x.s, "'" + x.e, id, a.name]); }
      made.push(id); });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, MEAL_ISS_HEAD.length).setValues(rows);
    log_('관리자 ' + a.name, '식권 만듦', L.map(x => x.label + ' ' + x.n + '장').join(', '));
  } finally { lock.releaseLock(); }
  return Object.assign(mealAdmin(token), { made });
}

/** 인쇄용: 묶음 id 들의 고유번호 목록 */
function mealTickets(token, ids) {
  const a = adm_(token); mealPerm_(a, false); const want = {}; [].concat(ids || []).forEach(i => want[i] = 1);
  const B = {}; mealVals_(MEAL_ISS, MEAL_ISS_HEAD).forEach(r => { if (!want[r[6]]) return; const b = B[r[6]] || (B[r[6]] = { id: r[6], kind: r[1], label: r[2], s: r[4], e: r[5], nos: [] }); b.nos.push(r[0]); });
  return { ok: true, camp: camp_().base.name, list: [].concat(ids || []).map(i => B[i]).filter(Boolean) };
}

/** 묶음 지우기: 아직 한 장도 제출되지 않은 묶음만 (잘못 만들었을 때) */
function mealDel(token, id) {
  const a = adm_(token); mealPerm_(a, true);
  const lock = lock_();
  try {
    const sh = mealSh_(MEAL_ISS, MEAL_ISS_HEAD), v = mealVals_(MEAL_ISS, MEAL_ISS_HEAD), mine = {};
    v.forEach(r => { if (r[6] === id) mine[r[0]] = 1; });
    if (!Object.keys(mine).length) throw new Error('그 묶음을 찾지 못했어요.');
    if (mealVals_(MEAL_SUB, MEAL_SUB_HEAD).some(r => mine[r[0]])) throw new Error('이미 제출된 식권이 있어서 지울 수 없어요.');
    const keep = v.filter(r => r[6] !== id), n = v.length - keep.length;
    sh.getRange(2, 1, v.length, MEAL_ISS_HEAD.length).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, MEAL_ISS_HEAD.length).setValues(keep.map(r => r.map((c, j) => (j >= 3 && j <= 5) ? "'" + c : c)));
    log_('관리자 ' + a.name, '식권 묶음 지움', id + ' · ' + n + '장');
  } finally { lock.releaseLock(); }
  return mealAdmin(token);
}

/** 스캐너 화면 처음: 캠프 이름 */
function mealHello() { let name = CAMP_NAME; try { name = camp_().base.name; } catch (x) {} return { ok: true, camp: name }; }

/** 스캔 (로그인 없음 · 스캐너 화면 ?page=meal): 판정 없이 제출 기록. 발급 기록에 없으면 found:false */
function mealScan(raw, dev) {
  const m = String(raw || '').match(MEAL_RX_NO); if (!m) return { ok: true, found: false, no: String(raw || '').slice(0, 40), at: stamp_(), bad: true };
  const no = m[1], iss = mealSh_(MEAL_ISS, MEAL_ISS_HEAD);
  const cell = iss.getRange('A:A').createTextFinder(no).matchEntireCell(true).findNext();
  const at = stamp_();
  if (!cell || cell.getRow() < 2) return { ok: true, found: false, no, at };
  const r = iss.getRange(cell.getRow(), 1, 1, MEAL_ISS_HEAD.length).getDisplayValues()[0];
  const lock = lock_(); let before = 0;
  try {
    const sub = mealSh_(MEAL_SUB, MEAL_SUB_HEAD);
    before = sub.getRange('A:A').createTextFinder(no).matchEntireCell(true).findAll().length;
    sub.appendRow([no, r[1], r[2], "'" + at, r[6], String(dev || '').slice(0, 30)]);
  } finally { lock.releaseLock(); }
  return { ok: true, found: true, no, kind: r[1], label: r[2], at, before };
}


/* ---------- STG 시험 체크 (11-14): 할 일 50개(아래 QA_TASKS)를 시험하는 사람마다 모두 · 「잘 됨 / 문제 있음」 · 메모.
 *  결과는 시트 「시험 결과」에 (번호 · 이름)마다 한 줄. STG(설정 「테스트 로그인」 있음)에서만 ---------- */
const QA_SH = '시험 결과', QA_HEAD = ['번호', '이름', '결과', '메모', '적은 시각', '운영 답', '답 시각'];   /* 운영 답 (11-14): 운영진이 메모에 다는 답 · 결과는 건드리지 않음 */
const QA_TASKS = [["1-01", "1. 회원 선생님 접수", "시험 선생님으로 로그인 · 동의", "STG 접수 화면 › 「STG 시험 선생님」 카드로 들어가 개인정보 동의까지. 막히는 곳 · 이상한 문구를 적어 주세요."], ["1-02", "1. 회원 선생님 접수", "본인 + 학생 3명 담기", "학생 추가에서 3명을 고르고, 학생회비가 확인 안 된 학생에게 연회비가 붙는지."], ["1-03", "1. 회원 선생님 접수", "필수 칸 빠뜨리고 다음", "학생 1명의 권수를 비우고 「다음」 → 무엇이 빠졌는지 알려 주고 그 칸으로 가는지."], ["1-04", "1. 회원 선생님 접수", "추가레슨 2회 + 선호 교수 1 · 2", "금액이 30분당 금액 × 2로 더해지는지, 선호 교수 2는 1을 고른 뒤에만 열리는지."], ["1-05", "1. 회원 선생님 접수", "추가레슨 없이 선호 교수만", "추가레슨 「신청 안 함」에서도 선호 교수 1 · 2가 골라지고 저장되는지."], ["1-06", "1. 회원 선생님 접수", "마스터클래스 신청", "교수님 · 시간이 나오고 금액이 합계에 더해지는지."], ["1-07", "1. 회원 선생님 접수", "신청 확인 금액 검산", "사람별 금액(참가비 · 레슨 · 마스터클래스 · 연회비)을 손으로 더해 합계와 같은지."], ["1-08", "1. 회원 선생님 접수", "접수하기 → 접수번호", "접수번호가 나오고 「내 접수」에 방금 사람들이 보이는지."], ["1-09", "1. 회원 선생님 접수", "방 요청 사항 (일반 방)", "참가 정보 맨 아래 「방 요청 사항」에 「○○학원과 같은 층으로 붙여 주세요 · 침대방 꼭」처럼 적고 접수 → 내 접수에서 고쳐도 남는지. (관리자 › 방배정 › 방 요청에 보이는지는 관리자 담당과 함께)"], ["2-01", "2. 가족 · 가족방", "가족 추가 3종", "학생 1명에 보호자 · 동반가족 · 「15개월 미만」 추가. 이름 · 참가비가 맞는지."], ["2-02", "2. 가족 · 가족방", "가족방 4명", "학생 + 가족 3명으로 가족방 신청 → 가족방 추가 금액 0원."], ["2-03", "2. 가족 · 가족방", "가족방 3명", "3명으로 신청 → 빈 자리 1개 140,000원이 붙는지."], ["2-04", "2. 가족 · 가족방", "가족방 5명 막힘", "5명이면 「가족방은 한 방에 4명까지」로 다음 단계가 막히는지."], ["2-05", "2. 가족 · 가족방", "형제 연결", "이미 접수된 학생을 「+ 형제」로 같은 가족방에 묶기."], ["2-06", "2. 가족 · 가족방", "가족방 현황 · 가족방만 취소", "내 접수 › 가족방 현황 표 확인 → 「가족방만 취소」(입금 전) → 가족방 금액만 빠지는지."], ["2-07", "2. 가족 · 가족방", "가족 1명 취소", "가족방 가족 1명 취소 때 「가족방은 그대로」와 빈 자리 추가 청구 안내가 나오는지."], ["2-08", "2. 가족 · 가족방", "대표 취소 → 새 대표", "대표 학생을 취소하면 새 대표를 고르게 하고, 후보에 보호자 · 동반가족이 없는지."], ["2-09", "2. 가족 · 가족방", "가족방 가족 모두 취소", "「가족방 가족 모두 취소」를 고르면 남은 가족이 함께 선택되는지."], ["2-10", "2. 가족 · 가족방", "가족방 요청 사항", "「가족방 신청」에 체크하면 아래 「가족방 요청 사항」 칸이 열리는지 · 「아기 침대 꼭」처럼 적고 접수 → 내 접수에서 다시 보이는지."], ["3-01", "3. 입금 · 환불", "입금 신고", "내 접수 › 입금 신고에서 입금자명 · 날짜 · 금액을 넣고 신고."], ["3-02", "3. 입금 · 환불", "「입금 확인 중」 표시", "신고한 사람 줄에 「입금 확인 중 · 날짜 금액」이 보이는지."], ["3-03", "3. 입금 · 환불", "관리자 확인 → 입금 확인", "STG 관리자 › 입금 신고에서 확인 → 선생님 화면이 「입금 확인」으로 바뀌는지."], ["3-04", "3. 입금 · 환불", "더 많이 신고 → 차액 돌려받기", "청구보다 많이 확인된 경우 「돌려받기 요청」이 나오고 계좌를 받는지."], ["3-05", "3. 입금 · 환불", "차수 마감 금액 안내", "입금 전인 사람 청구 칸에 마감일별 금액(12/7까지 · 12/18까지 · 이후)이 보이는지."], ["3-06", "3. 입금 · 환불", "환불 규정 표", "내 접수 아래 「취소 · 환불 규정」에서 진단서 미제출 / 진단서 제출 두 칸이 맞는지."], ["3-07", "3. 입금 · 환불", "입금된 사람 취소 요청", "입금 확인된 1명 취소 → 환불 예정 금액 · 계좌 → 요청. STG 관리자 › 환불 요청에도 보이는지."], ["3-08", "3. 입금 · 환불", "취소 요청 거두기", "방금 요청을 「취소 요청 철회」 → 다시 「정상」이 되는지."], ["3-09", "3. 입금 · 환불", "계좌 기억", "두 번째 취소 · 차액 요청 때 지난번 계좌가 미리 채워지는지."], ["4-01", "4. 원장 · 고치기", "원장 계정 로그인", "직급이 「원장」인 시험 선생님으로 로그인 (원장이 아니면 메모)."], ["4-02", "4. 원장 · 고치기", "우리 학원 전체", "다른 선생님 접수가 보이고 「접수 교사」 칸이 있는지."], ["4-03", "4. 원장 · 고치기", "다른 선생님 접수 고치기", "체크 → 「선택한 n명 정보 수정」 → 저장. 접수 교사 이름이 그대로인지."], ["4-04", "4. 원장 · 고치기", "다른 선생님 접수 취소", "입금 전 1명을 원장이 취소할 수 있는지."], ["4-05", "4. 원장 · 고치기", "선생님별 보기 · 전체 선택", "위 표 선생님 줄을 누르면 그 접수만 보이고 「전체 선택」이 그 목록만 고르는지."], ["4-06", "4. 원장 · 고치기", "일반 선생님에게는 안 보임", "원장이 아닌 시험 선생님으로 들어가 「우리 학원 전체」 탭이 없고, 다른 선생님 · 관리자가 낸 접수가 하나도 안 보이는지."], ["4-07", "4. 원장 · 고치기", "인원 추가", "「＋ 인원 추가」로 1명 더하기 → 더한 날의 차수 금액인지."], ["4-08", "4. 원장 · 고치기", "레슨 · 진도 탭 · 엑셀", "레슨 · 학생 진도 탭이 맞게 나오고 「엑셀로 받기」 파일이 열리는지."], ["5-01", "5. 음악회 · 앙상블", "오후음악회 신청 · 곡명", "학생 1명 오후음악회 신청 → 곡 목록에서 고르기 · 곡명이 「신청 확인」에 그대로."], ["5-02", "5. 음악회 · 앙상블", "곡명 빼고 신청", "오후음악회를 고르고 곡명을 비우면 어떻게 안내하는지."], ["5-03", "5. 음악회 · 앙상블", "이브닝 신청 + 음원", "이브닝 신청 후 유튜브 주소를 넣는 곳 · 마감일 안내가 나오는지."], ["5-04", "5. 음악회 · 앙상블", "트와일라잇 신청", "트와일라잇 신청과 곡 입력이 되는지."], ["5-05", "5. 음악회 · 앙상블", "음원 먼저 내기", "첫 화면 「음원 먼저 내기」로 유튜브 주소 넣기 → 내 접수에 보이는지."], ["5-06", "5. 음악회 · 앙상블", "유튜브가 아닌 주소", "엉뚱한 주소를 넣으면 막거나 안내하는지."], ["5-07", "5. 음악회 · 앙상블", "내 접수 › 음악회 탭", "음악회별로 신청한 학생 · 곡이 맞게 나오는지."], ["5-08", "5. 음악회 · 앙상블", "앙상블 신청", "대표 학원으로 앙상블 신청 · 함께하는 학원 넣기 · 다른 학원에서 보이는지."], ["6-01", "6. 비회원 · 관계자 · 안내 · 휴대폰", "비회원(학부모) 접수", "보호자 이름 · 휴대전화로 들어가 아이 1명 접수."], ["6-02", "6. 비회원 · 관계자 · 안내 · 휴대폰", "비회원 다시 들어오기", "같은 이름 · 휴대전화로 다시 들어오면 내 접수가 보이는지."], ["6-03", "6. 비회원 · 관계자 · 안내 · 휴대폰", "관계자 접수", "관계자 시험 계정으로 역할을 고르고 접수."], ["6-04", "6. 비회원 · 관계자 · 안내 · 휴대폰", "영어(해외) 화면", "STG 영어 화면에서 시험 로그인 → 접수 한 번."], ["6-05", "6. 비회원 · 관계자 · 안내 · 휴대폰", "캠프 접수 안내 13장", "「캠프 접수 안내 · 사용법」 13장을 모두 넘겨 보기. 틀린 설명 메모."], ["6-06", "6. 비회원 · 관계자 · 안내 · 휴대폰", "상담하기 질문 5개", "오른쪽 아래 「상담하기」에 직접 질문 5개. 엉뚱한 답은 질문과 함께 메모."], ["6-07", "6. 비회원 · 관계자 · 안내 · 휴대폰", "게시판 · 일정 찾기", "게시판에 글 남기기, 일정 찾기(find)에서 이름으로 찾기."], ["6-08", "6. 비회원 · 관계자 · 안내 · 휴대폰", "휴대폰 화면", "휴대폰에서 첫 화면 · 접수 단계 · 내 접수가 화면에 맞는지 (기종을 같이 적어 주세요)."]];
function qaOn_() { try { return !!String(setting_('테스트 로그인') || '').trim(); } catch (e) { return false; } }
function qaSheet_() {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(QA_SH);
  if (!sh) { sh = ss.insertSheet(QA_SH); sh.getRange(1, 1, 1, QA_HEAD.length).setValues([QA_HEAD]).setFontWeight('bold'); sh.getRange(2, 1, 2000, QA_HEAD.length).setNumberFormat('@'); sh.setFrozenRows(1); sh.setColumnWidth(4, 420); }
  if (sh.getLastColumn() < QA_HEAD.length) sh.getRange(1, 1, 1, QA_HEAD.length).setValues([QA_HEAD]).setFontWeight('bold');
  return sh;
}
function qaList() {
  if (!qaOn_()) return { ok: false, msg: 'STG에서만 써요.' };
  const sh = qaSheet_(), n = sh.getLastRow(), v = n > 1 ? sh.getRange(2, 1, n - 1, QA_HEAD.length).getDisplayValues() : [];
  return { ok: true, tasks: QA_TASKS.map(r => ({ id: r[0], grp: r[1], task: r[2], how: r[3] })), res: v.filter(r => r[0] && r[1]).map(r => ({ id: r[0], by: r[1], res: r[2], memo: r[3], at: r[4], reply: r[5] || '', rat: r[6] || '' })) };
}
/** 운영 답: (번호 · 이름) 줄의 메모에 답만 달기 — 결과 · 메모는 그대로 */
function qaReply(q) {
  if (!qaOn_()) return { ok: false, msg: 'STG에서만 써요.' };
  q = q || {};
  const id = String(q.id || ''), by = String(q.by || '').trim().slice(0, 20), reply = String(q.reply || '').slice(0, 2000);
  const safe = x => /^[=+\-@]/.test(x) ? "'" + x : x;
  const l = lock_();
  try {
    const sh = qaSheet_(), n = sh.getLastRow(), v = n > 1 ? sh.getRange(2, 1, n - 1, 2).getDisplayValues() : [];
    const i = v.findIndex(r => r[0] === id && r[1] === by); if (i < 0) return { ok: false, msg: '그 메모를 찾지 못했어요. 새로 고쳐 주세요.' };
    const at = Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM-dd HH:mm');
    sh.getRange(i + 2, 6, 1, 2).setValues([[safe(reply), reply ? at : '']]);
    return { ok: true, at: reply ? at : '' };
  } finally { l.releaseLock(); }
}
function qaSave(q) {
  if (!qaOn_()) return { ok: false, msg: 'STG에서만 써요.' };
  q = q || {};
  const safe = x => /^[=+\-@]/.test(x) ? "'" + x : x;
  const id = String(q.id || ''), res = ['', '잘 됨', '문제 있음'].indexOf(String(q.res || '')) >= 0 ? String(q.res || '') : '';
  const memo = String(q.memo || '').slice(0, 2000), by = String(q.by || '').trim().slice(0, 20);
  if (!QA_TASKS.some(r => r[0] === id)) return { ok: false, msg: '없는 번호예요. 새로 고쳐 주세요.' };
  if (!by) return { ok: false, msg: '이름을 먼저 적어 주세요.' };
  const l = lock_();
  try {
    const sh = qaSheet_(), n = sh.getLastRow(), v = n > 1 ? sh.getRange(2, 1, n - 1, 2).getDisplayValues() : [];
    const i = v.findIndex(r => r[0] === id && r[1] === by), at = Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM-dd HH:mm');
    const row = [id, safe(by), res, safe(memo), at];   /* 운영 답(6 · 7칸)은 그대로 둠 */
    if (i >= 0) sh.getRange(i + 2, 1, 1, row.length).setValues([row]); else sh.getRange(n + 1, 1, 1, row.length).setValues([row]);
    return { ok: true, at };
  } finally { l.releaseLock(); }
}
