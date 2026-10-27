/* build: 20261028-084830 */
/**
 * 스즈키 회원관리 (앱스크립트 웹 앱) — 학원 · 교사 · 학생 · 연회비
 *
 * 코드 원본: 깃허브 redica1/suzuki 의 gas/member/ (공개 저장소 — 개인정보 넣지 않음. 명단은 시트에만)
 * 시트(이 스크립트가 붙은 시트): 학원 · 교사 · 학생 · 연회비 · 설정 · 기록
 *   - 한 표에 한 종류, 한 줄에 한 건. 모든 사람·학원에 바뀌지 않는 번호(A0001 · T0001 · S0001).
 *   - 주민등록번호 · 계좌 · 집 주소는 이 시트에 두지 않음 (원본에서도 읽지 않음).
 * 처음: 함수 setup 실행 → 탭이 만들어지고 설정 탭에 관리자 비밀번호 칸이 생김 → 관리자 화면 「설정 › 원본 명단 불러오기」
 */

const SRC_ID = '1CsIOTl_N7HlETEUJFLqklgYJOC1fYfTVdfuvUUkfDPs';   // [2026]스즈키교사 연회비납부명단 (읽기만)
const CUR_Y = '2026';

const HEAD = {
  '학원': ['학원ID', '학원명', '구분', '상태', '원장교사ID', '원장명', '교실대표번호', '이메일', '교습과목', '시도', '시군구', '우편번호', '주소', '상세주소', '개원일', '계약체결일', '확인', '확인메모', '메모', '원본', '수정일', '수정자'],
  '교사': ['교사ID', '이름', '구분글자', '원래이름', '휴대전화', '이메일', '학원1', '학원2', '학원3', '직급', '전공', '회원구분', '명단자격', '명단취득', '회비구분', '캠프교수', '내부외부', '상태', '확인', '확인메모', '메모', '원본', '수정일', '수정자', '영문이름', '본인자격', '회비납부방법', '강사료대상'],
  '학생': ['학생ID', '학원ID', '이름', '구분글자', '원래이름', '출생연도', '출생연도추정', '전공', '시작월', '상태', '담당교사ID', '확인', '확인메모', '메모', '원본', '수정일', '수정자'],
  '연회비': ['대상', 'ID', '년도', '부과', '납부', '납부일', '방식', '메모', '수정일', '수정자'],
  '설정': ['항목', '값', '설명'],
  '기록': ['일시', '누가', '표', 'ID', '동작', '내용'],
  '참가이력': ['이력ID', '대상', 'ID', '행사', '년도', '기간', '역할', '상태', '메모', '수정일', '수정자'],   // 행사 참여 기록 (10-28): 캠프·졸업연주 등이 끝나면 여기에 모음
  '문의': ['문의ID', '작성일', '교사ID', '이름', '휴대전화', '이메일', '분류', '제목', '내용', '상태', '처리일', '처리자', '수정일'],   // 문의·요청 게시판 (10-28): 상태 = 접수 · 처리중 · 완료
  '댓글': ['댓글ID', '문의ID', '작성일', '쓴사람', '이름', '내용'],   // 쓴사람 = 관리자 · 작성자
  '근무': ['근무ID', '교사ID', '학원ID', '학원명', '시작', '종료', '주근무', '출처', '메모', '수정일', '수정자'],   // 근무지 이력 (10-28): 한 줄 = 한 근무지, 종료가 비면 지금 근무 중
  '계정': ['이메일', '교사ID', '비번해시', '솔트', '상태', '경로', '만든날', '처리일', '마지막로그인', '메모'],
  '요청': ['요청ID', '종류', '교사ID', '이름', '휴대전화', '이메일', '내용', '상태', '신청일', '처리일', '처리자', '메모'],
  '정산': ['교사ID', '은행', '계좌번호', '예금주', '우편번호', '주소', '상세주소', '수정일', '이메일', '집우편번호', '집주소', '집상세주소', '주민번호암호', '주민번호표시', '주민번호동의일'],   // 우편번호·주소·상세주소 = 우편물 받을 주소
};
const KEY = { '학원': '학원ID', '교사': '교사ID', '학생': '학생ID' };
/* 화면에서 고칠 수 있는 칸 (나머지는 서버가 정함) */
const EDIT = {
  '학원': ['학원명', '구분', '상태', '원장교사ID', '교실대표번호', '이메일', '교습과목', '시도', '시군구', '우편번호', '주소', '상세주소', '개원일', '계약체결일', '확인', '확인메모', '메모'],
  '교사': ['이름', '구분글자', '휴대전화', '이메일', '학원1', '학원2', '학원3', '직급', '전공', '회원구분', '본인자격', '회비구분', '회비납부방법', '강사료대상', '캠프교수', '내부외부', '상태', '확인', '확인메모', '메모'],
  '학생': ['학원ID', '이름', '구분글자', '출생연도', '전공', '시작월', '상태', '담당교사ID', '확인', '확인메모', '메모'],
};
const SETTINGS = [
  ['관리자 아이디', 'admin', '관리자 화면 아이디'],
  ['관리자 비밀번호', '', '8자 이상으로 직접 적어 주세요 (노란 칸)'],
  ['테스트 표시', '아니오', 'STG 시트만 「예」 → 화면 위에 테스트 띠'],
  ['관리자 자동 로그인', '아니오', 'STG 시험용. 「예」면 비밀번호 없이 들어감 (메인에서는 꼭 아니오)'],
  ['원본 시트', SRC_ID, '처음 불러올 연회비 명단 시트 ID'],
  ['보내는 이름', '한국스즈키음악협회', '인증·안내 메일의 보내는 사람 이름'],
  ['인증 코드 화면 표시', '아니오', 'STG 시험용. 「예」면 메일과 함께 화면에도 인증 코드를 보여 줌 (메인에서는 꼭 아니오)'],
  ['정산 정보 시트', '', 'setup 이 만드는 관리자 전용 파일 ID (계좌·우편물 주소). 공유하지 마세요'],
  ['지난 회비 원본', '', '설정 › 지난 해 교사 회비 불러오기에 마지막으로 넣은 시트 ID'],
];

/* ====================== 웹 앱 ====================== */
function doGet(e) {
  const admin = e && e.parameter && e.parameter.page === 'admin';
  return HtmlService.createTemplateFromFile(admin ? 'Index' : 'Teacher').evaluate()
    .setTitle(admin ? '스즈키 회원관리' : '스즈키 선생님 회원')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(n) { return HtmlService.createHtmlOutputFromFile(n).getContent(); }

function api(name, args) {
  const open = { login, hello, tHello, tLookup, tStart, tResend, tVerify, tCreate, tLogin, tForgot, tReset, tMe, tSavePay, tSavePart, tSaveRrn, tAddWork, tEndWork, tMainWork, tLogout, bPost, bMine, bReply };
  const fns = { boot, saveRow, setCheck, logs, importRoster, saveDues, delDues, reqs, reqDo, delAcad, payView, bulkSet, saveWorks, importPastDues, bList, bSet, bComment };
  try {
    if (open[name]) return Object.assign({ ok: true }, open[name].apply(null, args || []));
    if (!fns[name]) throw new UserError('알 수 없는 요청이에요.');
    const who = sess_(args && args[0]);
    return Object.assign({ ok: true }, fns[name].apply(null, [who].concat((args || []).slice(1))));
  } catch (e) {
    if (e instanceof UserError) return { ok: false, msg: e.message };
    console.error(name, e && e.stack || e);
    return { ok: false, msg: '잠시 문제가 생겼어요: ' + (e && e.message || e) };
  }
}
class UserError extends Error {}
const fail = m => { throw new UserError(m); };

/* ---------- 로그인 ---------- */
function hello() {
  const s = settings_();
  return { test: s['테스트 표시'] === '예', auto: s['관리자 자동 로그인'] === '예', ready: !!s['관리자 비밀번호'] || s['관리자 자동 로그인'] === '예' };
}
function login(id, pw, auto) {
  const s = settings_();
  if (auto) { if (s['관리자 자동 로그인'] !== '예') fail('자동 로그인이 꺼져 있어요.'); }
  else {
    limit_('lg', 10, 900, '여러 번 틀렸어요. 15분 뒤 다시 해 주세요.');
    if (!s['관리자 비밀번호'] || String(s['관리자 비밀번호']).length < 8) fail('설정 탭에 관리자 비밀번호(8자 이상)를 먼저 적어 주세요.');
    if (String(id).trim() !== String(s['관리자 아이디'] || 'admin') || String(pw) !== String(s['관리자 비밀번호'])) fail('아이디나 비밀번호가 맞지 않아요.');
  }
  const t = Utilities.getUuid();
  CacheService.getScriptCache().put('ss:' + t, JSON.stringify({ name: '관리자', at: now_() }), 6 * 3600);
  return { sess: t };
}
function sess_(t) {
  const v = t && CacheService.getScriptCache().get('ss:' + t);
  if (!v) fail('LOGIN 로그인 시간이 지났어요. 다시 로그인해 주세요.');
  CacheService.getScriptCache().put('ss:' + t, v, 6 * 3600);
  return JSON.parse(v);
}

/* ---------- 읽기 ---------- */
function boot(who) {
  const out = {};
  ['학원', '교사', '학생', '연회비'].forEach(n => { const T = tbl_(n); out[n] = { h: T.h, rows: T.v }; });
  out.test = settings_()['테스트 표시'] === '예';
  const acc = {}; tbl_('계정').v.forEach(r => { if (r[1]) acc[r[1]] = r[4]; }); out.acc = acc;
  out.reqN = tbl_('요청').v.filter(r => r[7] === '대기').length;
  out.pdSrc = String(settings_()['지난 회비 원본'] || '');
  out.bN = tbl_('문의').v.filter(r => r[9] === '접수').length;
  { const W = tbl_('근무'); out['근무'] = { h: W.h, rows: W.v }; }
  const pf = {}; try { const P = payTbl_(), c = col_(P); P.v.forEach(r => { pf[r[0]] = { a: !!r[c['계좌번호']], h: !!r[c['집주소']], m: !!r[c['주소']], r: !!r[c['주민번호암호']] }; }); } catch (e) {}
  out.pay = pf;   // 있음/없음만 (값은 「내용 보기」로)
  out.empty = !out['학원'].rows.length && !out['교사'].rows.length;
  out.now = now_();
  return out;
}
function logs(who) {
  const T = tbl_('기록'); return { h: T.h, rows: T.v.slice(-300).reverse() };
}

/* ---------- 쓰기 ---------- */
function saveRow(who, table, obj, base) {
  if (!KEY[table]) fail('고칠 수 없는 표예요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = tbl_(table), k = KEY[table];
    const o = clean_(table, obj || {});
    let i = obj[k] ? T.find(k, obj[k]) : -1;
    if (obj[k] && i < 0) fail('그 번호를 찾지 못했어요. 새로 고침해 주세요.');
    if (i >= 0 && base && String(T.get(i, '수정일')) !== String(base)) fail('다른 사람이 먼저 고쳤어요 (' + T.get(i, '수정일') + '). 새로 고침 뒤 다시 해 주세요.');
    const stamp = now_();
    let id = obj[k], diff = [];
    if (i < 0) {
      id = nextId_(T, k, { '학원': 'A', '교사': 'T', '학생': 'S' }[table]);
      const row = Object.assign({}, o, { [k]: id, '원본': '새로 추가', '수정일': stamp, '수정자': who.name });
      if (table === '학생' && !row['상태']) row['상태'] = '재원';
      if (table === '교사' && !row['상태']) row['상태'] = '활동';
      if (table === '학원' && !row['상태']) row['상태'] = '운영';
      T.append(row); diff = ['새로 추가'];
    } else {
      EDIT[table].forEach(c => { if (c in o && String(o[c]) !== String(T.get(i, c))) diff.push(c + ': ' + T.get(i, c) + ' → ' + o[c]); });
      if (!diff.length) return { row: T.rowObj(i), same: true };
      T.set(i, Object.assign({}, o, { '수정일': stamp, '수정자': who.name }));
    }
    log_(who.name, table, id, i < 0 ? '추가' : '수정', diff.join(' · ').slice(0, 1000));
    const T2 = tbl_(table); return { row: T2.rowObj(T2.find(k, id)) };
  } finally { lock.releaseLock(); }
}
/** 잘못 넣은 학원 지우기 — 소속 교사·학생·원장이 연결돼 있으면 막음 (그럴 땐 상태를 「탈퇴」로) */
function delAcad(who, id) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const A = tbl_('학원'), i = A.find('학원ID', id); if (i < 0) fail('학원을 찾지 못했어요.');
    const name = A.get(i, '학원명');
    const T = tbl_('교사'), tc = col_(T), nT = T.v.filter(r => [r[tc['학원1']], r[tc['학원2']], r[tc['학원3']]].indexOf(id) >= 0).length;
    const S = tbl_('학생'), sc = col_(S), nS = S.v.filter(r => r[sc['학원ID']] === id).length;
    if (nT || nS) fail(name + ' 에 소속 교사 ' + nT + '명 · 학생 ' + nS + '명이 있어 지울 수 없어요. 먼저 옮기거나, 상태를 「탈퇴」로 바꿔 주세요.');
    A.sh.deleteRow(i + 2);
    log_(who.name, '학원', id, '삭제', name);
    return { ok2: true };
  } finally { lock.releaseLock(); }
}
/** 관리자: 교사 여러 명에게 직급 · 캠프교수 · 회비면제 한꺼번에 (10-28) */
function bulkSet(who, ids, ch) {
  ch = ch || {}; const ok = { '직급': ['원장', '강사', ''], '캠프교수': ['예', '아니오'], '회비구분': ['납부', '면제'] };
  const upd = {}; Object.keys(ok).forEach(k => { if (k in ch) { if (ok[k].indexOf(ch[k]) < 0) fail(k + ' 값이 틀렸어요.'); upd[k] = ch[k]; } });
  if (!Object.keys(upd).length) fail('바꿀 것을 골라 주세요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = tbl_('교사'), stamp = now_(); let n = 0;
    (ids || []).forEach(id => { const i = T.find('교사ID', id); if (i < 0) return; T.set(i, Object.assign({}, upd, { '수정일': stamp, '수정자': who.name })); n++; });
    log_(who.name, '교사', (ids || []).slice(0, 20).join(','), '한꺼번에 바꾸기', Object.keys(upd).map(k => k + '=' + (upd[k] || '없음')).join(' · ') + ' · ' + n + '명');
    return { n, stamp, upd };
  } finally { lock.releaseLock(); }
}
function setCheck(who, table, ids, val) {
  if (!KEY[table]) fail('표 이름이 틀렸어요.');
  if (['확인 전', '확인', '확인 필요'].indexOf(val) < 0) fail('확인 값이 틀렸어요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = tbl_(table), k = KEY[table], col = T.h.indexOf('확인') + 1, ucol = T.h.indexOf('수정일') + 1, wcol = T.h.indexOf('수정자') + 1, stamp = now_();
    let n = 0;
    (ids || []).forEach(id => { const i = T.find(k, id); if (i < 0) return;
      T.sh.getRange(i + 2, col).setValue(val); T.sh.getRange(i + 2, ucol).setValue(stamp); T.sh.getRange(i + 2, wcol).setValue(who.name); n++; });
    log_(who.name, table, (ids || []).slice(0, 20).join(',') + ((ids || []).length > 20 ? ' …' : ''), '확인 표시', val + ' ' + n + '건');
    return { n, stamp };
  } finally { lock.releaseLock(); }
}
function saveDues(who, d) {
  d = d || {};
  if (['교사', '학생'].indexOf(d['대상']) < 0) fail('대상이 틀렸어요.');
  if (!/^\d{4}$/.test(String(d['년도']))) fail('년도를 확인해 주세요.');
  const due = num_(d['부과']), paid = num_(d['납부']);
  if (due < 0 || paid < 0 || due > 5000000 || paid > 5000000) fail('금액을 확인해 주세요.');
  if (paid > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(String(d['납부일'] || ''))) fail('납부일을 골라 주세요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = tbl_('연회비'); const stamp = now_();
    const i = T.v.findIndex(r => r[0] === d['대상'] && String(r[1]) === String(d.ID) && String(r[2]) === String(d['년도']));
    const row = { '대상': d['대상'], 'ID': d.ID, '년도': String(d['년도']), '부과': due, '납부': paid, '납부일': String(d['납부일'] || ''), '방식': String(d['방식'] || '').slice(0, 20), '메모': String(d['메모'] || '').slice(0, 200), '수정일': stamp, '수정자': who.name };
    if (i < 0) T.append(row); else T.set(i, row);
    log_(who.name, '연회비', d.ID, i < 0 ? '추가' : '수정', d['년도'] + ' 부과 ' + due + ' · 납부 ' + paid + ' ' + (d['납부일'] || ''));
    return { rows: tbl_('연회비').v };
  } finally { lock.releaseLock(); }
}
function delDues(who, target, id, y) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = tbl_('연회비'); const i = T.v.findIndex(r => r[0] === target && String(r[1]) === String(id) && String(r[2]) === String(y));
    if (i >= 0) { T.sh.deleteRow(i + 2); log_(who.name, '연회비', id, '삭제', y); }
    return { rows: tbl_('연회비').v };
  } finally { lock.releaseLock(); }
}

function clean_(table, o) {
  const r = {};
  EDIT[table].forEach(c => { if (c in o) r[c] = String(o[c] == null ? '' : o[c]).trim().slice(0, 300); });
  if ('휴대전화' in r) r['휴대전화'] = digits_(r['휴대전화']);
  if ('교실대표번호' in r) r['교실대표번호'] = digits_(r['교실대표번호']);
  if (table === '학원' && '학원명' in r && !r['학원명']) fail('학원명을 넣어 주세요.');
  if (table === '교사' && '이름' in r && !r['이름']) fail('이름을 넣어 주세요.');
  if (table === '학생') {
    if ('이름' in r && !r['이름']) fail('학생 이름을 넣어 주세요.');
    if (r['출생연도'] && !/^(19|20)\d{2}$/.test(r['출생연도'])) fail('출생연도는 4자리로 넣어 주세요.');
  }
  if (r['확인'] && ['확인 전', '확인', '확인 필요'].indexOf(r['확인']) < 0) r['확인'] = '확인 전';
  return r;
}

/* ====================== 처음 설정 · 원본 불러오기 ====================== */
function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEAD).filter(n => n !== '정산').forEach(n => ensure_(ss, n));   // 정산은 별도 파일에만
  const stray = ss.getSheetByName('정산'); if (stray && stray.getLastRow() <= 1 && ss.getSheets().length > 1) ss.deleteSheet(stray);
  const sh = ss.getSheetByName('설정'); const have = sh.getDataRange().getDisplayValues().map(r => r[0]);
  SETTINGS.forEach(r => { if (have.indexOf(r[0]) < 0) sh.appendRow(r); });
  const pwRow = sh.getDataRange().getDisplayValues().findIndex(r => r[0] === '관리자 비밀번호');
  if (pwRow >= 0) sh.getRange(pwRow + 1, 2).setBackground('#fff2a8');
  rrnKey_();   // 주민번호 암호화 열쇠 (스크립트 속성, 시트에는 없음)
  const P = settings_();
  if (!P['정산 정보 시트']) {
    const f = SpreadsheetApp.create((P['테스트 표시'] === '예' ? '[STG] ' : '') + '스즈키 회원관리 – 정산 정보 (관리자 전용)');
    f.getSheets()[0].setName('정산'); ensure_(f, '정산');
    setSetting_('정산 정보 시트', f.getId());
  }
  const d = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1'); if (d && d.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(d);
  try { SpreadsheetApp.getUi().alert('탭을 준비했어요. 「설정」 탭 관리자 비밀번호(노란 칸)를 적고 관리자 화면에서 원본 명단을 불러와 주세요.'); } catch (e) {}
}
function ensure_(ss, name) {
  let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
  const h = HEAD[name];
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), h.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e9eef0');
  sh.setFrozenRows(1);
  return sh;
}

/** 연회비 명단 → 학원 · 교사 · 학생 · 연회비. 표가 비어 있을 때만 (STG 는 「지우고 다시」 가능). 주민번호·계좌·집 주소 칸은 읽지 않음. */
function importRoster(who, replace) {
  const ss = SpreadsheetApp.getActive(), s = settings_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const has = ['학원', '교사', '학생'].some(n => tbl_(n).v.length);
    if (has && !(replace && s['테스트 표시'] === '예')) fail('이미 명단이 들어 있어요. (지우고 다시 불러오기는 STG 에서만)');
    const src = SpreadsheetApp.openById(String(s['원본 시트'] || SRC_ID));
    const A = readSrc_(src, '학원정보DB', '학원명', ['운영', '구분', '지역1', '지역2', '학원명', '원장명', '교실대표번호', '이메일', '이메일주소', '주소', '학원주소', '계약서작성일', '개원일', '개설일', '교습과목', '우편번호', '상세주소']);
    const Tt = readSrc_(src, '교사정보DB', '교사명', ['소속스즈키', '내부외부', '회비기준', '지역1', '지역2', '학원1', '학원2', '학원3', '직급', '전공', '캠프기준', '교사명', '보유자격증1', '자격취득년도', '전화번호', '이메일', '납부방식', '납부연도', '교사부과회비', 'CMS이체', '직접이체', '환불금액', '교사미납회비', '납부일']);
    const St = readSrc_(src, '학생정보DB', '학생명', ['운영', '구분', '지역1', '지역2', '학원명', '원장명', '학생명', '출생년도', '전공', '시작월', '학생부과회비', '학생납부회비', '학생미납회비', '납부연도', '납부일']);
    const stamp = now_(), by = who.name + ' (원본 불러오기)';
    /* 학원 */
    const acads = [], byName = {}, skipped = {};
    /* 이름에 「스즈키」가 들어간 곳만 학원 (10-28 결정). 협회 이름은 학원이 아님 */
    const isAcad = n => /스즈키/.test(n) && !/스즈키\s*음악\s*협회/.test(n);
    const addAcad = (o) => { const id = 'A' + String(acads.length + 1).padStart(4, '0'); o['학원ID'] = id; acads.push(o); byName[normA_(o['학원명'])] = id; return id; };
    A.rows.forEach(r => {
      const name = String(r['학원명'] || '').trim(); if (!name) return;
      if (!isAcad(name)) { skipped[name] = (skipped[name] || 0) + 1; return; }
      const kind = String(r['구분'] || '').trim(), phone = digits_(r['교실대표번호']);
      r['이메일'] = r['이메일'] || r['이메일주소']; r['주소'] = r['주소'] || r['학원주소']; r['개원일'] = r['개원일'] || r['개설일'];
      const notes = [];
      if (kind && ['학원', '클래스'].indexOf(kind) < 0) notes.push('구분 칸이 「' + kind + '」 — 열 밀림 의심');
      if (/[시군구]\s|로\s?\d|길\s?\d|동\s?\d/.test(name) && name.length > 12) notes.push('학원명 칸이 주소처럼 보여요');
      if (r['지역2'] && /@/.test(r['지역2'])) notes.push('지역2 칸에 이메일 — 열 밀림 의심');
      if (byName[normA_(name)]) notes.push('같은 이름 학원이 또 있어요');
      const addr = String(r['주소'] || '').trim();
      addAcad({ '학원명': name, '구분': ['학원', '클래스'].indexOf(kind) >= 0 ? kind : (/클래스$/.test(name) ? '클래스' : '학원'), '상태': /휴|폐|^no$|^n$|아니/i.test(String(r['운영']).trim()) ? '휴원' : '운영',
        '원장교사ID': '', '원장명': String(r['원장명'] || '').trim(), '교실대표번호': phone, '이메일': String(r['이메일'] || '').trim(), '교습과목': String(r['교습과목'] || '').trim(),
        '시도': String(r['지역1'] || '').trim() || addr.split(' ')[0] || '', '시군구': String(r['지역2'] || '').trim() || addr.split(' ')[1] || '', '우편번호': String(r['우편번호'] || '').trim(), '주소': addr, '상세주소': String(r['상세주소'] || '').trim(),
        '개원일': ymd_(r['개원일']), '계약체결일': ymd_(r['계약서작성일']), '확인': notes.length ? '확인 필요' : '확인 전', '확인메모': notes.join(' · '), '메모': '', '원본': '학원정보DB ' + r._row + '행', '수정일': stamp, '수정자': by });
    });
    const acadId = (name, from) => { name = String(name || '').trim(); if (!name) return ''; if (!isAcad(name)) { skipped[name] = (skipped[name] || 0) + 1; return ''; } const k = normA_(name); if (byName[k]) return byName[k];
      return addAcad({ '학원명': name, '구분': /클래스$/.test(name) ? '클래스' : '학원', '상태': '운영', '원장교사ID': '', '원장명': '', '교실대표번호': '', '이메일': '', '교습과목': '', '시도': '', '시군구': '', '우편번호': '', '주소': '', '상세주소': '', '개원일': '', '계약체결일': '',
        '확인': '확인 필요', '확인메모': '학원정보DB 에 없고 ' + from + ' 에만 있는 학원', '메모': '', '원본': from, '수정일': stamp, '수정자': by }); };
    /* 교사 */
    const teachers = [], dues = [];
    Tt.rows.forEach(r => {
      const raw = String(r['교사명'] || '').trim(); if (!raw) return;
      const id = 'T' + String(teachers.length + 1).padStart(4, '0');
      const nm = splitName_(raw);
      const rawAc = [...new Set([r['학원1'], r['학원2'], r['학원3']].map(x => String(x || '').trim()).filter(Boolean))];
      const ac = rawAc.map(x => acadId(x, '교사정보DB')).filter(Boolean);
      const notes = [];
      const outAc = rawAc.filter(x => !isAcad(x)); if (outAc.length) notes.push('스즈키 학원이 아닌 소속 「' + outAc.join(', ') + '」은 뺐어요');
      if (nm.tag) notes.push('이름 끝 구분 글자 「' + nm.tag + '」를 따로 뺐어요');
      if (!digits_(r['전화번호'])) notes.push('휴대전화 없음');
      const onlyName = !r['회비기준'] && !r['전공'] && !r['학원1'] && !r['보유자격증1'];
      if (onlyName) notes.push('이름 말고 다른 칸이 비어 있어요');
      const fee = num_(r['교사부과회비']), unpaid = num_(r['교사미납회비']);
      /* 회비 납부 방법 (10-28): 납부방식 글자보다 실제 금액 칸(CMS이체 · 직접이체)을 봄 */
      const cms = num_(r['CMS이체']), dir = num_(r['직접이체']), ref = num_(r['환불금액']), pm = String(r['납부방식'] || '').trim();
      const payWay = pm === '교수제외' ? '면제' : pm === '단체납부' ? '단체납부' : pm === 'CMS' ? '자동이체' : dir ? '직접입금' : cms ? '자동이체' : '';
      const paidAmt = (cms || dir || ref) ? Math.max(0, cms + dir - ref) : Math.max(0, fee - unpaid);
      const way = cms && dir ? '자동이체+직접입금' : cms ? '자동이체' : dir ? (pm === '단체납부' ? '단체납부' : '직접입금') : '';
      const dRaw = String(r['납부일'] || '').trim(), dYmd = /\d{4}\D+\d{1,2}/.test(dRaw) ? ymd_(dRaw) : '';
      const dMemo = ['원본에서'].concat(pm && pm !== 'CMS' ? ['납부방식 ' + pm] : []).concat(ref ? ['환불 ' + ref.toLocaleString() + '원'] : []).concat(dRaw && !dYmd ? ['납부일 칸: ' + dRaw] : []).join(' · ');
      teachers.push({ '교사ID': id, '이름': nm.name, '구분글자': nm.tag, '원래이름': raw, '휴대전화': digits_(r['전화번호']), '이메일': String(r['이메일'] || '').trim(),
        '학원1': ac[0] || '', '학원2': ac[1] || '', '학원3': ac[2] || '', '직급': String(r['직급'] || '').trim(), '전공': inst_(r['전공']),
        '회원구분': '확인 전', '명단자격': String(r['보유자격증1'] || '').trim(), '명단취득': String(r['자격취득년도'] || '').trim(),
        '회비구분': String(r['회비기준']).trim() === '교수' ? '면제' : '납부', '캠프교수': String(r['캠프기준']).trim() === '교수' ? '예' : '아니오', '내부외부': String(r['내부외부'] || '').trim(), '회비납부방법': payWay,
        '상태': '활동', '확인': onlyName || outAc.length ? '확인 필요' : '확인 전', '확인메모': notes.join(' · '), '메모': '', '원본': '교사정보DB ' + r._row + '행', '수정일': stamp, '수정자': by });
      if (fee || unpaid || cms || dir || dRaw) dues.push({ '대상': '교사', 'ID': id, '년도': String(r['납부연도'] || CUR_Y).replace(/\D/g, '').slice(0, 4) || CUR_Y, '부과': fee, '납부': paidAmt, '납부일': dYmd, '방식': way, '메모': dMemo, '수정일': stamp, '수정자': by });
    });
    /* 원장 연결: 학원 원장명 = 그 학원 소속 교사 이름 */
    acads.forEach(a => { if (!a['원장명']) return; const n = normN_(a['원장명']);
      const t = teachers.find(t => normN_(t['이름']) === n && [t['학원1'], t['학원2'], t['학원3']].indexOf(a['학원ID']) >= 0) || teachers.filter(t => normN_(t['이름']) === n).length === 1 && teachers.find(t => normN_(t['이름']) === n);
      if (t) a['원장교사ID'] = t['교사ID']; else { a['확인'] = '확인 필요'; a['확인메모'] = [a['확인메모'], '원장 「' + a['원장명'] + '」을 교사 명단에서 못 찾음'].filter(Boolean).join(' · '); } });
    /* 학생 */
    const students = [];
    St.rows.forEach(r => {
      const raw = String(r['학생명'] || '').trim(); if (!raw) return;
      const id = 'S' + String(students.length + 1).padStart(4, '0');
      const nm = splitName_(raw), by_ = birth_(r['출생년도']);
      const rawA = String(r['학원명'] || '').trim(), sid = acadId(rawA, '학생정보DB');
      const notes = []; if (!sid) notes.push(rawA ? '스즈키 학원이 아닌 「' + rawA + '」 — 학원을 정해 주세요' : '학원 없음'); if (nm.tag) notes.push('이름의 「' + nm.tag + '」를 따로 뺐어요'); if (!by_.y) notes.push('출생연도 없음'); if (by_.guess) notes.push('출생연도를 나이(' + r['출생년도'] + ')로 계산');
      const ins = inst_(r['전공']); if (r['전공'] && !ins) notes.push('전공 「' + r['전공'] + '」');
      students.push({ '학생ID': id, '학원ID': sid, '이름': nm.name, '구분글자': nm.tag, '원래이름': raw, '출생연도': by_.y, '출생연도추정': by_.guess ? '예' : '',
        '전공': ins || String(r['전공'] || '').trim(), '시작월': String(r['시작월'] || '').trim(), '상태': '재원', '담당교사ID': '', '확인': sid ? '확인 전' : '확인 필요', '확인메모': notes.join(' · '), '메모': '', '원본': '학생정보DB ' + r._row + '행', '수정일': stamp, '수정자': by });
      const due = num_(r['학생부과회비']), paid = num_(r['학생납부회비']);
      if (due || paid || r['납부일']) dues.push({ '대상': '학생', 'ID': id, '년도': String(r['납부연도'] || CUR_Y).replace(/\D/g, '').slice(0, 4) || CUR_Y, '부과': due, '납부': paid, '납부일': ymd_(r['납부일']), '방식': '', '메모': '원본에서', '수정일': stamp, '수정자': by });
    });
    /* 쓰기 */
    const put = (name, objs) => { const sh = ensure_(ss, name); if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
      if (objs.length) sh.getRange(2, 1, objs.length, HEAD[name].length).setValues(objs.map(o => HEAD[name].map(k => o[k] == null ? '' : String(o[k])))); };
    const works = []; teachers.forEach(t => [t['학원1'], t['학원2'], t['학원3']].filter(Boolean).forEach((a, k) => works.push({ '근무ID': 'W' + String(works.length + 1).padStart(5, '0'), '교사ID': t['교사ID'], '학원ID': a, '시작': '', '종료': '', '주근무': k === 0 ? '예' : '', '출처': '원본', '수정일': stamp, '수정자': by })));
    put('학원', acads); put('교사', teachers); put('학생', students); put('연회비', dues); put('근무', works);
    const sk = Object.keys(skipped);
    const msg = '학원 ' + acads.length + '곳 · 교사 ' + teachers.length + '명 · 학생 ' + students.length + '명 · 연회비 ' + dues.length + '줄' + (sk.length ? ' · 스즈키가 아니라 학원에서 뺀 이름 ' + sk.length + '개: ' + sk.slice(0, 15).join(', ') + (sk.length > 15 ? ' …' : '') : '');
    log_(who.name, '전체', '', '원본 불러오기', msg);
    return { msg };
  } finally { lock.releaseLock(); }
}
/** 원본 시트에서 머리글 이름으로 필요한 칸만 읽음 (주민번호·계좌·주소 칸은 이름을 적지 않았으므로 읽지 않음) */
/** 지난 해 교사 회비 불러오기 (10-28). 그 해 교사정보DB 의 이름·전화·납부 칸만 읽어 교사 번호에 맞춰 연회비 탭에 넣음.
 *  맞추는 순서: 휴대전화(한 명) → 휴대전화가 같은 사람 중 이름 → 이름(한 명). 다시 돌리면 그 해 교사 줄을 새로 씀. */
function importPastDues(who, src, year) {
  const id = (String(src || '').match(/\/d\/([\w-]{20,})/) || [])[1] || String(src || '').trim();
  if (!/^[\w-]{20,}$/.test(id)) fail('구글 시트 주소를 넣어 주세요.');
  year = String(year || ''); if (!/^20\d{2}$/.test(year)) fail('년도를 골라 주세요.');
  if (year >= Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy')) fail('올해 회비는 「원본에서 불러오기」로 들어와요. 지난 해만 골라 주세요.');
  let ss; try { ss = SpreadsheetApp.openById(id); } catch (e) { fail('그 시트를 열지 못했어요. 이 앱을 만든 계정에 보기 권한이 있어야 해요.'); }
  const { rows } = readSrc_(ss, '교사정보DB', '교사명', ['교사명', '전화번호', '납부방식', '납부연도', '교사부과회비', '교사납부회비', '납부일']);
  const T = tbl_('교사'), c = col_(T), byP = {}, byN = {};
  T.v.forEach(r => { const tid = r[c['교사ID']], p = digits_(r[c['휴대전화']]); if (p) (byP[p] = byP[p] || []).push(tid);
    [r[c['이름']], String(r[c['원래이름']] || '').replace(/[A-Za-z()\s]+$/, '')].map(x => String(x || '').replace(/\s+/g, '')).filter(Boolean).forEach(n => { byN[n] = byN[n] || []; if (byN[n].indexOf(tid) < 0) byN[n].push(tid); }); });
  const nm = r => String(r['교사명'] || '').replace(/\s+/g, '').replace(/(?<=[가-힣])[A-Za-z()]+$/, '');
  const won = v => +String(v || '').replace(/[^\d-]/g, '') || 0;
  const ymd = v => { const m = String(v || '').match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/); return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : ''; };
  const got = {}, un = [], how = { '전화': 0, '전화+이름': 0, '이름': 0 }, nameOnly = [];
  rows.forEach(r => {
    const n = nm(r); if (!n || /^\d+$/.test(n)) return;
    if (String(r['납부연도'] || year).replace(/\D/g, '').slice(0, 4) !== year) return;
    const due = won(r['교사부과회비']), paid = won(r['교사납부회비']); if (!due && !paid) return;
    const p = digits_(r['전화번호']); let tid = '', h = '';
    if (p && byP[p] && byP[p].length === 1) { tid = byP[p][0]; h = '전화'; }
    else if (p && byP[p]) { const x = byP[p].filter(t => (byN[n] || []).indexOf(t) >= 0); if (x.length === 1) { tid = x[0]; h = '전화+이름'; } }
    if (!tid && (byN[n] || []).length === 1) { tid = byN[n][0]; h = '이름'; }
    if (!tid) { un.push(String(r['교사명']).trim() + (p ? ' (' + p.slice(-4) + ')' : '') + ' ' + due.toLocaleString() + '/' + paid.toLocaleString() + ((byN[n] || []).length > 1 ? ' · 같은 이름 ' + byN[n].length + '명' : '')); return; }
    const way = paid ? (/CMS/i.test(r['납부방식']) ? '자동이체' : /직접/.test(r['납부방식']) ? '직접입금' : String(r['납부방식'] || '').trim()) : '';
    const row = { '대상': '교사', 'ID': tid, '년도': year, '부과': due, '납부': paid, '납부일': ymd(r['납부일']), '방식': way, '메모': year + ' 교사정보DB에서 불러옴' + (h === '이름' ? ' · 이름으로 맞춤(전화 ' + (p ? '다름' : '없음') + ')' : ''), '수정일': now_(), '수정자': who.name };
    if (got[tid]) { const o = got[tid]; const keep = o._h !== '이름' ? o : row, other = keep === o ? row : o; keep['메모'] += ' · 원본에 같은 사람 줄이 하나 더 있음(' + other['부과'] + '/' + other['납부'] + (other['납부일'] ? ' ' + other['납부일'] : '') + ')'; keep._h = keep === o ? o._h : h; got[tid] = keep; return; }
    row._h = h; got[tid] = row; how[h]++; if (h === '이름') nameOnly.push(String(r['교사명']).trim() + ' → ' + tid);
  });
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const D = tbl_('연회비'), dc = col_(D);
    const keep = D.v.filter(r => !(r[dc['대상']] === '교사' && String(r[dc['년도']]) === year && got[r[dc['ID']]]));
    const add = Object.keys(got).map(t => D.h.map(k => got[t][k] == null ? '' : got[t][k]));
    const all = keep.concat(add), sh = D.sh;
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, D.h.length).clearContent();
    if (all.length) sh.getRange(2, 1, all.length, D.h.length).setValues(all);
    setSetting_('지난 회비 원본', id);
    log_(who.name, '연회비', year, '지난 회비 불러오기', '맞춘 ' + add.length + '명 · 못 맞춘 ' + un.length + '줄');
    return { year, n: add.length, how, un, nameOnly, dues: { h: D.h, rows: tbl_('연회비').v } };
  } finally { lock.releaseLock(); }
}
function readSrc_(ss, tab, mark, cols) {
  const sh = ss.getSheetByName(tab); if (!sh) fail('원본에 「' + tab + '」 탭이 없어요.');
  const last = sh.getLastRow(), lc = sh.getLastColumn();
  const top = sh.getRange(1, 1, Math.min(6, last), lc).getDisplayValues();
  const hr = top.findIndex(r => r.some(x => String(x).trim() === mark)); if (hr < 0) fail(tab + ' 머리글(' + mark + ')을 못 찾았어요.');
  const h = top[hr].map(x => String(x).trim());
  const start = hr + 2, n = last - hr - 1; if (n <= 0) return { rows: [] };
  const rows = Array.from({ length: n }, (_, i) => ({ _row: start + i }));
  cols.forEach(c => { const ci = h.indexOf(c); if (ci < 0) return;
    sh.getRange(start, ci + 1, n, 1).getDisplayValues().forEach((v, i) => { rows[i][c] = v[0]; }); });
  return { rows };
}

/* ====================== 도우미 ====================== */
function settings_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('설정'); if (!sh) return {};
  const o = {}; sh.getDataRange().getDisplayValues().slice(1).forEach(r => { if (r[0]) o[String(r[0]).trim()] = String(r[1]).trim(); }); return o;
}
function tbl_(name) {
  const ss = SpreadsheetApp.getActive(); const sh = ss.getSheetByName(name) || ensure_(ss, name);
  const all = sh.getDataRange().getDisplayValues(); const h = (all.shift() || HEAD[name]).map(String);
  const v = all.filter(r => r.some(x => x !== ''));
  const T = {
    sh, h, v,
    find(k, id) { const c = h.indexOf(k); return v.findIndex(r => String(r[c]) === String(id)); },
    get(i, k) { return v[i][h.indexOf(k)]; },
    rowObj(i) { return v[i]; },
    set(i, obj) { const row = v[i].slice(); Object.keys(obj).forEach(k => { const c = h.indexOf(k); if (c >= 0) row[c] = obj[k] == null ? '' : String(obj[k]); }); sh.getRange(i + 2, 1, 1, h.length).setValues([row.slice(0, h.length)]); v[i] = row; },
    append(obj) { const row = h.map(k => obj[k] == null ? '' : String(obj[k])); sh.getRange(v.length + 2, 1, 1, h.length).setNumberFormat('@').setValues([row]); v.push(row); },
  };
  return T;
}
function nextId_(T, k, p) { const c = T.h.indexOf(k); let m = 0; T.v.forEach(r => { if (String(r[c]).charAt(0) !== p) return; const n = +(String(r[c]).replace(/\D/g, '')) || 0; if (n > m) m = n; }); return p + String(m + 1).padStart(4, '0'); }
function log_(who, table, id, act, what) { const ss = SpreadsheetApp.getActive(); const sh = ss.getSheetByName('기록') || ensure_(ss, '기록'); sh.appendRow([now_(), who, table, String(id), act, String(what || '')]); }
function limit_(k, max, sec, msg) { const c = CacheService.getScriptCache(); const n = +(c.get(k) || 0) + 1; c.put(k, String(n), sec); if (n > max) fail(msg); }
function digits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function num_(v) { return +String(v == null ? '' : v).replace(/[^\d.-]/g, '') || 0; }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); }
function normA_(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
function normN_(s) { return String(s || '').replace(/\s+/g, '').replace(/([가-힣])[A-Za-z]$/, '$1'); }
function splitName_(raw) {
  let m = String(raw).trim().match(/^(.+?)\s*\(([^)]*)\)\s*$/); if (m) return { name: m[1].trim(), tag: m[2].trim() };
  m = String(raw).trim().match(/^([가-힣]{2,5})([A-Z])$/); if (m) return { name: m[1], tag: m[2] };
  return { name: String(raw).trim(), tag: '' };
}
function inst_(v) {
  const s = String(v || '').trim().toLowerCase(); if (!s) return '';
  if (/바이올린|^vn|^vl|violin/.test(s)) return '바이올린';
  if (/첼로|^vc|cello/.test(s)) return '첼로';
  if (/비올라|^va|viola/.test(s)) return '비올라';
  if (/플루트|플룻|^fl|flute/.test(s)) return '플루트';
  if (/피아노|^pf|^pn|piano/.test(s)) return '피아노';
  return '';
}
function birth_(v) {
  const s = String(v || '').trim(); let m = s.match(/(19|20)\d{2}/); if (m) return { y: m[0], guess: false };
  m = s.match(/^(\d{1,2})\s*세?$/); if (m && +m[1] > 0 && +m[1] < 30) return { y: String(+CUR_Y - +m[1] + 1), guess: true };
  return { y: '', guess: false };
}
function ymd_(v) {
  const s = String(v || '').trim(); if (!s) return '';
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  const m2 = s.match(/(\d{4})\D+(\d{1,2})/); if (m2) return m2[1] + '-' + ('0' + m2[2]).slice(-2);
  const m3 = s.match(/^(\d{1,2})\D+(\d{4})$/); if (m3) return m3[2] + '-' + ('0' + m3[1]).slice(-2);   // 12/2023
  return s;
}

function setSetting_(k, v) {
  const sh = SpreadsheetApp.getActive().getSheetByName('설정'); const vals = sh.getDataRange().getDisplayValues();
  const i = vals.findIndex(r => r[0] === k); if (i >= 0) sh.getRange(i + 1, 2).setValue(v); else sh.appendRow([k, v, '']);
}

/* ====================== 선생님 회원 (계정 · 가입 · 로그인) ======================
 * 흐름: 이름 + 휴대전화로 명단에서 찾기 → 이메일(명단 이메일과 같으면 바로, 다르면 관리자 확인) → 6자리 인증 코드(10분, 5번)
 *       → 소속·악기 「맞아요/달라요」 + 회원 구분 고르기 → 비밀번호 + 동의 → 계정
 *       명단에 없으면 같은 흐름으로 「회원 가입 신청」 → 관리자 승인 뒤 로그인
 * 비밀번호는 솔트 + SHA-256 5,000번 반복 해시만 저장 (관리자도 볼 수 없음). 나중에 다른 서버로 옮겨도 같은 계산으로 확인 가능. */
const KINDS = ['정식 교사', '중급 연수', '초급 연수'];
const INSTS_ = ['바이올린', '첼로', '비올라', '플루트', '피아노'];
function tHello() {
  const s = settings_();
  const acads = tbl_('학원').v.filter(r => r[3] !== '탈퇴' && r[1]).map(r => [r[0], r[1], r[9]]).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'ko'));
  return { test: s['테스트 표시'] === '예', acads };
}
function tLookup(name, phone) {
  name = String(name || '').trim(); phone = digits_(phone);
  if (!name) fail('이름을 넣어 주세요.');
  if (!/^01\d{8,9}$/.test(phone)) fail('휴대전화 번호를 확인해 주세요.');
  limit_('lk:' + phone, 10, 1800, '여러 번 시도했어요. 30분 뒤 다시 해 주세요.');
  const T = tbl_('교사'); const c = col_(T);
  const hits = T.v.filter(r => normN_(r[c['이름']]) === normN_(name) && digits_(r[c['휴대전화']]) === phone && r[c['상태']] !== '탈퇴');
  const t = hits[0];
  const A = acctAll_();
  if (t) {
    const a = A.find(x => x.tid === t[c['교사ID']] && (x.state === '사용' || x.state === '대기'));
    if (a) return { status: 'hasAccount', state: a.state, email: maskEmail_(a.email) };
  } else {
    const q = tbl_('요청').v.find(r => (r[1] === '새 회원' || r[1] === '외부인') && digits_(r[4]) === phone && r[7] === '대기');
    if (q) return { status: 'pending', email: maskEmail_(q[5]) };
  }
  const token = Utilities.getUuid();
  const s = { tid: t ? t[c['교사ID']] : '', name: t ? t[c['이름']] : name, phone, rosterEmail: t ? String(t[c['이메일']] || '').trim().toLowerCase() : '', stage: 'ident' };
  cput_('tk:' + token, s, 3600);
  if (!t) return { status: 'none', token };
  return { status: 'found', token };   // 명단 내용은 보여 주지 않음 (선생님이 처음부터 직접 넣음, 10-28 결정)
}
function tStart(token, email) {
  const s = tok_(token);
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('이메일 주소를 확인해 주세요.');
  if (acctAll_().some(a => a.email === email && a.state !== '반려')) fail('이미 가입한 이메일이에요. 로그인해 주세요.');
  /* 명단에 이메일이 있는데 다른 이메일이면 관리자 확인 (이름·번호만 아는 사람이 계정을 가로채지 못하게). 명단에 이메일이 없으면 바로 열림 */
  Object.assign(s, { email, emailMatch: !!(s.tid && (!s.rosterEmail || s.rosterEmail === email)), stage: 'code', sends: 0 });
  return sendCode_(token, s);
}
function tResend(token) { const s = tok_(token); if (!s.email) fail('처음부터 다시 해 주세요.'); return sendCode_(token, s); }
function sendCode_(token, s) {
  if (s.sends >= 5) fail('인증 메일을 너무 많이 보냈어요. 처음부터 다시 해 주세요.');
  s.code = String(100000 + Math.floor(Math.random() * 900000)); s.codeAt = Date.now(); s.sends = (s.sends || 0) + 1; s.tries = 0;
  cput_('tk:' + token, s, 3600);
  mail_(s.email, '[스즈키] 인증 코드 ' + s.code, '<p>' + esc_(s.name) + ' 선생님, 안녕하세요.</p><p>회원 계정 인증 코드예요. 10분 안에 넣어 주세요.</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">' + s.code + '</p><p style="color:#666">본인이 요청하지 않았다면 이 메일은 무시해 주세요.</p>');
  return { email: s.email, match: s.emailMatch, code: settings_()['인증 코드 화면 표시'] === '예' ? s.code : '' };
}
function tVerify(token, code) {
  const s = tok_(token);
  if (s.stage === 'verified') return { ok2: true, prefill: s.tid ? prefill_(s.tid) : null };
  if (s.stage !== 'code') fail('처음부터 다시 해 주세요.');
  if (Date.now() - s.codeAt > 10 * 60 * 1000) fail('코드 시간이 지났어요. 「코드 다시 받기」를 눌러 주세요.');
  if (++s.tries > 5) { cput_('tk:' + token, s, 3600); fail('5번 틀렸어요. 「코드 다시 받기」를 눌러 주세요.'); }
  if (String(code).trim() !== s.code) { cput_('tk:' + token, s, 3600); fail('코드가 맞지 않아요.'); }
  s.stage = 'verified'; cput_('tk:' + token, s, 3600);
  return { ok2: true, prefill: s.tid ? prefill_(s.tid) : null };
}
/** 명단에 있는 선생님: 이메일 인증 뒤 가입 화면에 기존 정보를 채워 줌 (10-28 결정 — 이전의 「처음부터 직접 입력」을 바꿈).
 *  근무지 · 직급 · 전공 · 회원 종류 · 자격만. 주소 · 계좌 · 주민번호는 원본에서 가져오지 않으므로 비어 있음. */
function prefill_(tid) {
  const T = tbl_('교사'), i = T.find('교사ID', tid); if (i < 0) return null;
  const g = k => String(T.get(i, k) || ''), kind = g('회원구분');
  const type = kind === '정식 교사' ? '교사회원' : /연수/.test(kind) ? '연수교사회원' : '', course = kind === '중급 연수' ? '중급' : kind === '초급 연수' ? '초급' : '';
  const works = worksOf_(tid).filter(w => !w['종료']).slice(0, 3).map(w => { const m = String(w['시작'] || '').match(/^(\d{4})-(\d{2})$/); return { id: w['학원ID'] || '', text: w['학원ID'] ? '' : w['학원명'], y: m ? m[1] : '', m: m ? m[2] : '' }; });
  const certs = {}; String(g('본인자격') || g('명단자격')).split(/[,，、]/).forEach(x => { x = x.trim(); if (!x) return; const m = x.match(/^(.+?)\s*((?:19|20)\d{2})/); let n = (m ? m[1] : x).replace('카톨릭', '가톨릭').replace(/\s+/g, ''); if (n === '국민대') n = '국민대학원';
    if (CERTS_.indexOf(n) >= 0 && n !== '티처트레이너') certs[n] = m ? m[2] : ''; });
  const role = ['원장', '강사'].indexOf(g('직급')) >= 0 ? g('직급') : null;
  return { type, course, works, noWork: false, role, inst: INSTS_.indexOf(g('전공')) >= 0 ? g('전공') : '', certs };
}
const CERTS_ = ['초급', '중급', '티처트레이너', '국민대학원', '대구가톨릭대학원', '전주대학원'];
/** 가입 때 선생님이 넣은 정보 검사 (기존 교사회원 · 신규 회원 같은 칸) */
const EXT_ROLES = ['반주자', '스태프', '통역', '초청 강사', '기타'];
/** 가입 정보 검사. mode: member(명단에 있는 교사) · new(신규 교사회원/연수교사회원) · ext(외부인) */
function cleanInfo_(n, mode) {
  n = n || {}; const an = acadNames_(); const o = { mode };
  if (mode === 'ext') {
    if (EXT_ROLES.indexOf(n.extRole) < 0) fail('하는 일을 골라 주세요.');
    o.extRole = n.extRole === '기타' ? '기타: ' + String(n.extRoleText || '').trim().slice(0, 30) : n.extRole;
    if (n.extRole === '기타' && !String(n.extRoleText || '').trim()) fail('하는 일을 적어 주세요.');
    o.org = String(n.org || '').trim().slice(0, 60); o.inst = INSTS_.indexOf(n.inst) >= 0 ? n.inst : '';
    o.kind = '외부인'; o.type = '외부인'; o.role = ''; o.works = []; o.noWork = true; o.certs = []; o.certTxt = ''; o.acads = []; o.acadNames = o.org || '-';
    return o;
  }
  if (mode === 'new') {
    if (['교사회원', '연수교사회원'].indexOf(n.type) < 0) fail('가입 종류를 골라 주세요.');
    if (n.type === '연수교사회원' && ['초급', '중급'].indexOf(n.course) < 0) fail('연수 과정을 골라 주세요.');
    o.type = n.type; o.course = n.type === '연수교사회원' ? n.course : '';
    o.kind = n.type === '교사회원' ? '정식 교사' : n.course === '중급' ? '중급 연수' : '초급 연수';
  } else { if (KINDS.indexOf(n.kind) < 0) fail('회원 구분을 골라 주세요.'); o.kind = n.kind; }
  /* 근무지 (10-28): 현재 근무지 3곳까지, 학원마다 시작 년·월 필수, 첫 번째가 주 근무. 다니는 학원이 없으면 「현재 근무지 없음」 */
  o.noWork = !!n.noWork; const ny = +Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy'), seen = {};
  o.works = o.noWork ? [] : (n.works || []).slice(0, 3).map(w => {
    const id = an[w.id] ? String(w.id) : '', text = id ? '' : String(w.text || '').trim().slice(0, 60);
    if (!id && !text) fail('근무지 학원을 골라 주세요.');
    const y = +w.y, m = String(w.m || '').padStart(2, '0');
    if (!(y >= 1980 && y <= ny) || !/^(0[1-9]|1[0-2])$/.test(m)) fail((an[id] || text) + ' 근무 시작 년·월을 골라 주세요.');
    const k = id || text; if (seen[k]) fail('같은 학원을 두 번 골랐어요.'); seen[k] = 1;
    return { id, text, start: y + '-' + m };
  });
  if (!o.noWork && !o.works.length) fail('근무지를 고르거나 「현재 근무지 없음」에 체크해 주세요.');
  o.acads = o.works.filter(w => w.id).map(w => w.id);
  o.acadText = o.works.filter(w => !w.id).map(w => w.text).join(', ');
  o.role = ['원장', '강사', ''].indexOf(n.role) >= 0 ? n.role : ''; if (n.role == null) fail('직급을 골라 주세요.');
  if (INSTS_.indexOf(n.inst) < 0) fail('악기를 골라 주세요.'); o.inst = n.inst;
  o.certs = (n.certs || []).filter(x => CERTS_.indexOf(x.n) >= 0 && x.n !== '티처트레이너')   /* 티처트레이너는 관리자만 (10-28) */.map(x => { if (!/^(19|20)\d{2}$/.test(String(x.y))) fail(x.n + ' 취득 년도를 골라 주세요.'); return { n: x.n, y: String(x.y) }; });
  o.certTxt = o.certs.map(x => x.n + (x.y ? ' ' + x.y : '')).join(', ');
  o.acadNames = o.noWork ? '현재 근무지 없음' : o.works.map(w => (an[w.id] || w.text + ' (목록에 없음)') + ' ' + w.start.replace('-', '.') + '~').join(' · ');
  return o;
}
function tCreate(token, d) {
  const s = tok_(token); d = d || {};
  if (s.stage !== 'verified') fail('이메일 인증부터 해 주세요.');
  if (String(d.pw || '').length < 8) fail('비밀번호는 8자 이상으로 만들어 주세요.');
  if (!d.agree) fail('개인정보 수집·이용 동의에 체크해 주세요.');
  const mode = d.mode === 'ext' && !s.tid ? 'ext' : s.tid ? 'member' : 'new';
  const tid = s.tid, o = cleanInfo_(d.info, mode), pay = cleanPay_(d.pay, true);
  const rr = String(d.rrn || '').trim() ? rrnRow_(d.rrn, d.rrnAgree) : null;   /* 주민번호: 선택 (10-28) */
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let state;
  try {
    if (acctAll_().some(a => a.email === s.email && a.state !== '반려')) fail('이미 가입한 이메일이에요.');
    const salt = Utilities.getUuid(), stamp = now_();
    if (tid) {
      state = s.emailMatch ? '사용' : '대기';
      tbl_('계정').append({ '이메일': s.email, '교사ID': tid, '비번해시': hash_(d.pw, salt), '솔트': salt, '상태': state, '경로': s.emailMatch ? '명단 확인' : '명단과 다른 이메일', '만든날': stamp });
      /* 선생님이 넣은 정보로 명단을 고치고, 바뀐 칸은 「확인 필요」로 남김 */
      const T = tbl_('교사'), i = T.find('교사ID', tid), r = T.rowObj(i), c = col_(T), g = k => String(r[c[k]] || '');
      const an = acadNames_(), oldA = [g('학원1'), g('학원2'), g('학원3')].filter(Boolean);
      const newA = o.acads;
      const diff = [];
      if (oldA.join(',') !== newA.join(',')) diff.push('소속 ' + (oldA.map(x => an[x] || x).join(', ') || '없음') + ' → ' + (newA.map(x => an[x] || x).join(', ') || '없음'));
      if (o.acadText) diff.push('목록에 없는 근무지 「' + o.acadText + '」');
      if (g('직급') !== o.role) diff.push('직급 ' + (g('직급') || '없음') + ' → ' + (o.role || '없음'));
      if (g('전공') !== o.inst) diff.push('악기 ' + (g('전공') || '없음') + ' → ' + o.inst);
      const tt = (g('본인자격').match(/티처트레이너[^,]*/) || [])[0] || (/티처트레이너/.test(g('명단자격')) ? '티처트레이너' : '');
      if (tt) o.certTxt = [o.certTxt, tt.trim()].filter(Boolean).join(', ');   // 관리자가 넣은 티처트레이너는 지키기
      if (o.certTxt && o.certTxt !== g('명단자격')) diff.push('자격 (명단: ' + (g('명단자격') || '없음') + ') → ' + o.certTxt);
      const upd = { '학원1': newA[0] || '', '학원2': newA[1] || '', '학원3': newA[2] || '', '직급': o.role, '전공': o.inst, '회원구분': o.kind, '본인자격': o.certTxt, '수정일': stamp, '수정자': s.name + ' (가입)' };
      putPay_(tid, s.email, pay); if (rr) { putRrn_(tid, rr); upd['강사료대상'] = '예'; }
      if (s.emailMatch) upd['이메일'] = s.email;
      if (diff.length) { upd['확인'] = '확인 필요'; upd['확인메모'] = [g('확인메모'), '가입 때 바꿈: ' + diff.join(' · ')].filter(Boolean).join(' · ').slice(0, 500); }
      T.set(i, upd);
      setWorksAtSignup_(tid, o.works, s.name + ' (가입)');
      if (!s.emailMatch) addReq_('이메일 확인', tid, s, { '명단 이메일': maskEmail_(s.rosterEmail), '새 이메일': s.email });
      if (o.acadText) addReq_('정보 수정', tid, s, { '목록에 없는 학원': o.acadText, '넣은 근무지': o.acadNames });
      log_(s.name, '계정', tid, '가입', (s.emailMatch ? '바로 사용' : '명단과 다른 이메일 · 관리자 확인 대기') + ' · ' + o.kind + (diff.length ? ' · 바뀜: ' + diff.join(' · ') : ''));
    } else {
      state = '대기';
      tbl_('계정').append({ '이메일': s.email, '교사ID': '', '비번해시': hash_(d.pw, salt), '솔트': salt, '상태': '대기', '경로': mode === 'ext' ? '외부인' : '신규 회원', '만든날': stamp });
      putPay_('E:' + s.email, s.email, pay);   // 승인되면 교사 번호로 바뀜
      if (rr) putRrn_('E:' + s.email, rr);
      addReq_(mode === 'ext' ? '외부인' : '새 회원', '', s, mode === 'ext' ? { '가입 종류': '외부인', '하는 일': o.extRole, '소속': o.org || '-', '악기': o.inst || '-', '주민번호': rr ? '넣음 (암호화)' : '' }
        : { '가입 종류': o.type, '연수 과정': o.course, '회원 구분': o.kind, '근무지': o.acadNames, '_근무': o.works, '직급': o.role || '없음', '악기': o.inst, '자격': o.certTxt, '주민번호': rr ? '넣음 (암호화) · 승인하면 강사료 대상' : '' });
      log_(s.name, '계정', s.email, '가입 신청', o.type + ' · ' + o.kind);
    }
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('tk:' + token);
  if (state === '사용') {
    mail_(s.email, '[스즈키] 회원 계정을 만들었어요', '<p>' + esc_(s.name) + ' 선생님, 계정이 만들어졌어요.</p><p>다음부터 이 이메일과 비밀번호로 로그인해 주세요.</p>');
    return { state, sess: newSess_({ email: s.email, tid }) };
  }
  mail_(s.email, '[스즈키] 신청을 받았어요', '<p>' + esc_(s.name) + ' 선생님, 신청해 주셔서 고마워요.</p><p>협회가 확인한 뒤 이 주소로 다시 알려 드려요. 그 뒤 이메일과 비밀번호로 로그인할 수 있어요.</p>');
  return { state };
}
function tLogin(email, pw) {
  email = String(email || '').trim().toLowerCase();
  limit_('tl:' + email, 10, 900, '로그인을 여러 번 실패했어요. 15분 뒤 다시 해 주세요.');
  const all = acctAll_().filter(a => a.email === email); const a = all.filter(x => x.state !== '반려').pop() || all.pop();
  if (!a || hash_(pw, a.salt) !== a.hash) fail('이메일이나 비밀번호가 맞지 않아요.');
  if (a.state === '대기') fail('협회가 확인하는 중이에요. 확인되면 이메일로 알려 드려요.');
  if (a.state === '반려') fail('신청이 반려됐어요' + (a.memo ? ' (' + a.memo + ')' : '') + '. 협회 카카오톡 채널로 문의해 주세요.');
  if (a.state !== '사용' || !a.tid) fail('사용할 수 없는 계정이에요. 협회에 문의해 주세요.');
  CacheService.getScriptCache().remove('tl:' + email);
  const A = tbl_('계정'); A.set(a.i, { '마지막로그인': now_() });
  return { sess: newSess_({ email, tid: a.tid }) };
}
function tLogout(sess) { CacheService.getScriptCache().remove('ts:' + sess); return {}; }
function tForgot(email) {
  email = String(email || '').trim().toLowerCase();
  limit_('fp:' + email, 3, 3600, '재설정 메일을 여러 번 보냈어요. 한 시간 뒤 다시 해 주세요.');
  const a = acctAll_().find(x => x.email === email && x.state === '사용');
  let code = '';
  if (a) { code = String(100000 + Math.floor(Math.random() * 900000)); cput_('rp:' + email, { code, tries: 0 }, 900);
    mail_(email, '[스즈키] 비밀번호 재설정 코드 ' + code, '<p>비밀번호 재설정 코드예요. 15분 안에 넣어 주세요.</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">' + code + '</p>'); }
  return { sent: true, code: settings_()['인증 코드 화면 표시'] === '예' ? code : '' };   // 가입 여부는 알려 주지 않음
}
function tReset(email, code, pw) {
  email = String(email || '').trim().toLowerCase();
  const r = cget_('rp:' + email); if (!r) fail('코드 시간이 지났어요. 다시 받아 주세요.');
  if (++r.tries > 5) { CacheService.getScriptCache().remove('rp:' + email); fail('여러 번 틀렸어요. 코드를 다시 받아 주세요.'); }
  if (String(code).trim() !== r.code) { cput_('rp:' + email, r, 900); fail('코드가 맞지 않아요.'); }
  if (String(pw || '').length < 8) fail('비밀번호는 8자 이상으로 만들어 주세요.');
  const a = acctAll_().find(x => x.email === email && x.state === '사용'); if (!a) fail('계정을 찾지 못했어요.');
  const salt = Utilities.getUuid(); tbl_('계정').set(a.i, { '솔트': salt, '비번해시': hash_(pw, salt) });
  CacheService.getScriptCache().remove('rp:' + email); log_(email, '계정', a.tid, '비밀번호 재설정', '');
  return { done: true };
}
function tMe(sess) {
  const u = tsess_(sess);
  const T = tbl_('교사'), i = T.find('교사ID', u.tid); if (i < 0) fail('명단에서 선생님을 찾지 못했어요. 협회에 문의해 주세요.');
  const r = T.rowObj(i), c = col_(T), an = acadNames_(), g = k => r[c[k]] || '';
  const heads = tbl_('학원').v.filter(a => a[4] === u.tid && a[3] !== '탈퇴').map(a => a[1]);
  const p = payRow_(u.tid);
  const reqs = tbl_('요청').v.filter(q => q[2] === u.tid && q[7] === '대기').map(q => q[1]);
  const works = worksOf_(u.tid).map(w => ({ wid: w['근무ID'], aid: w['학원ID'], name: w['학원ID'] ? (an[w['학원ID']] || w['학원ID']) : w['학원명'] + ' (목록에 없음)', start: w['시작'], end: w['종료'], main: w['주근무'] === '예' }));
  const dues = tbl_('연회비').v.filter(d => d[0] === '교사' && d[1] === u.tid).map(d => ({ year: d[2], due: +d[3] || 0, paid: +d[4] || 0, date: d[5], way: d[6] })).sort((a, b) => String(b.year).localeCompare(String(a.year)));
  let events = tbl_('참가이력').v.filter(e => e[1] === '교사' && e[2] === u.tid).map(e => ({ name: e[3], year: e[4], period: e[5], role: e[6], state: e[7] })).sort((a, b) => String(b.year).localeCompare(String(a.year)));
  if (!events.length && settings_()['테스트 표시'] === '예') events = [{ sample: true, name: '2026 여름 스즈키 음악캠프', year: '2026', period: '2026.07.27 ~ 07.31', role: '교사', state: '참가' }];   // STG 예시 (더미)
  return { me: { works, dues, events, duesWay: g('회비납부방법'), duesFree: g('회비구분') === '면제', ext: g('회원구분') === '외부인', name: g('이름'), phone: g('휴대전화'), email: u.email, acads: [g('학원1'), g('학원2'), g('학원3')].filter(Boolean).map(id => an[id] || id), role: g('직급'), inst: g('전공'), kind: g('회원구분'), eng: g('영문이름'), heads,
    payee: g('강사료대상') === '예',
    pay: p ? { bank: p['은행'], acct: maskAcct_(p['계좌번호']), holder: p['예금주'], zip: p['우편번호'], addr: p['주소'], addr2: p['상세주소'], hzip: p['집우편번호'], haddr: p['집주소'], haddr2: p['집상세주소'], rrn: p['주민번호표시'] || '', rrnAt: p['주민번호동의일'] || '' } : null, reqs } };
}
/** 계좌 · 집 주소 · 우편물 주소 검사. need=true 면 모두 필수 (가입 때, 10-28 결정) */
function cleanPay_(d, need, hasAcct) {
  d = d || {}; const o = {};
  o.bank = String(d.bank || '').trim().slice(0, 20); o.holder = String(d.holder || '').trim().slice(0, 20); o.acct = String(d.acct || '').replace(/[^\d-]/g, '');
  o.hzip = digits_(d.hzip).slice(0, 5); o.haddr = String(d.haddr || '').trim().slice(0, 120); o.haddr2 = String(d.haddr2 || '').trim().slice(0, 80);
  o.same = d.same !== false;
  o.zip = o.same ? o.hzip : digits_(d.zip).slice(0, 5); o.addr = o.same ? o.haddr : String(d.addr || '').trim().slice(0, 120); o.addr2 = o.same ? o.haddr2 : String(d.addr2 || '').trim().slice(0, 80);
  if (o.acct && !/^[\d-]{8,20}$/.test(o.acct)) fail('계좌번호는 숫자와 - 로 넣어 주세요.');
  if ((o.acct || need) && (!o.bank || !o.holder)) fail('은행과 예금주를 넣어 주세요.');
  if (need && !o.acct && !hasAcct) fail('계좌번호를 넣어 주세요.');
  if (need && !o.haddr) fail('집 주소를 넣어 주세요. 「주소 검색」을 눌러요.');
  if (need && !o.addr) fail('우편물 받을 주소를 넣어 주세요.');
  return o;
}
function putRrn_(key, rr) { const P = payTbl_(), j = P.find('교사ID', key); if (j < 0) P.append(Object.assign({ '교사ID': key, '수정일': now_() }, rr)); else P.set(j, rr); }
function putPay_(key, email, o) {
  const P = payTbl_(), j = P.find('교사ID', key);
  const row = { '교사ID': key, '이메일': email || '', '은행': o.bank, '예금주': o.holder, '우편번호': o.zip, '주소': o.addr, '상세주소': o.addr2, '집우편번호': o.hzip, '집주소': o.haddr, '집상세주소': o.haddr2, '수정일': now_() };
  if (o.acct) row['계좌번호'] = o.acct; else if (j < 0) row['계좌번호'] = '';
  if (j < 0) P.append(row); else P.set(j, row);
}
function tSavePay(sess, d) {
  const u = tsess_(sess); d = d || {};
  const old = payRow_(u.tid);
  const o = cleanPay_(d, true, !!(old && old['계좌번호']));
  const eng = String(d.eng || '').trim().slice(0, 60); if (eng && !/^[A-Za-z .'-]+$/.test(eng)) fail('영문 이름은 영어로 넣어 주세요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = tbl_('교사'), i = T.find('교사ID', u.tid); if (i >= 0) T.set(i, { '영문이름': eng });
    putPay_(u.tid, u.email, o);
    log_(u.email, '정산', u.tid, '선생님이 수정', ['영문 이름', '집 주소', '우편물 주소'].concat(o.acct ? ['계좌'] : []).join(' · '));
  } finally { lock.releaseLock(); }
  return tMe(sess);
}
/** 내 정보: 정산 정보 · 집 주소 · 우편물 받을 주소를 따로 고침 (10-28). part = acct | home | mail */
function tSavePart(sess, part, d) {
  const u = tsess_(sess); d = d || {};
  const old = payRow_(u.tid) || {}, row = {}, T = tbl_('교사'), i = T.find('교사ID', u.tid);
  if (part === 'acct') {
    const bank = String(d.bank || '').trim().slice(0, 20), holder = String(d.holder || '').trim().slice(0, 20), acct = String(d.acct || '').replace(/[^\d-]/g, '');
    if (!bank || !holder) fail('은행과 예금주를 넣어 주세요.');
    if (acct && !/^[\d-]{8,20}$/.test(acct)) fail('계좌번호는 숫자와 - 로 넣어 주세요.');
    if (!acct && !old['계좌번호']) fail('계좌번호를 넣어 주세요.');
    const eng = String(d.eng || '').trim().slice(0, 60); if (eng && !/^[A-Za-z .'-]+$/.test(eng)) fail('영문 이름은 영어로 넣어 주세요.');
    Object.assign(row, { '은행': bank, '예금주': holder }); if (acct) row['계좌번호'] = acct;
    if (i >= 0) T.set(i, { '영문이름': eng });
  } else if (part === 'home') {
    const haddr = String(d.haddr || '').trim().slice(0, 120); if (!haddr) fail('집 주소를 넣어 주세요. 「주소 검색」을 눌러요.');
    Object.assign(row, { '집우편번호': digits_(d.hzip).slice(0, 5), '집주소': haddr, '집상세주소': String(d.haddr2 || '').trim().slice(0, 80) });
  } else if (part === 'mail') {
    const same = d.same === true;
    const zip = same ? old['집우편번호'] : digits_(d.zip).slice(0, 5), addr = same ? old['집주소'] : String(d.addr || '').trim().slice(0, 120), addr2 = same ? old['집상세주소'] : String(d.addr2 || '').trim().slice(0, 80);
    if (!addr) fail(same ? '집 주소를 먼저 넣어 주세요.' : '우편물 받을 주소를 넣어 주세요. 「주소 검색」을 눌러요.');
    Object.assign(row, { '우편번호': zip || '', '주소': addr, '상세주소': addr2 || '' });
  } else fail('고칠 곳을 알 수 없어요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const P = payTbl_(), j = P.find('교사ID', u.tid); row['수정일'] = now_();
    if (j < 0) P.append(Object.assign({ '교사ID': u.tid, '이메일': u.email }, row)); else P.set(j, row);
    log_(u.email, '정산', u.tid, '선생님이 수정', { acct: '계좌 · 영문 이름', home: '집 주소', mail: '우편물 받을 주소' }[part]);
  } finally { lock.releaseLock(); }
  return tMe(sess);
}
/** 주민등록번호 — 관리자가 「강사료 대상」으로 표시한 선생님만 (강사료 원천징수용). 암호화해서 정산 파일에만 */
/** 주민등록번호 검사 → 암호화 줄 (가입 때 · 내 정보 공통) */
function rrnRow_(rrn, agree) {
  if (!agree) fail('주민등록번호를 넣으려면 고유식별정보 처리 안내를 읽고 동의에 체크해 주세요.');
  const v = String(rrn || '').replace(/\s/g, ''); const m = v.match(/^(\d{2})(\d{2})(\d{2})-?([1-8])(\d{6})$/);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) fail('주민등록번호 13자리를 확인해 주세요.');
  const plain = m[1] + m[2] + m[3] + '-' + m[4] + m[5];
  return { '주민번호암호': enc_(plain), '주민번호표시': plain.slice(0, 8) + '******', '주민번호동의일': now_() };
}
function tSaveRrn(sess, rrn, agree) {
  const u = tsess_(sess);
  const T = tbl_('교사'), i = T.find('교사ID', u.tid); if (i < 0) fail('명단에서 선생님을 찾지 못했어요.');
  const rr = rrnRow_(rrn, agree);   /* 10-28: 강사료 대상이 아니어도 넣을 수 있음(선택) → 넣으면 강사료 대상 */
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const P = payTbl_(), j = P.find('교사ID', u.tid);
    const row = Object.assign({ '교사ID': u.tid, '수정일': now_() }, rr);
    if (j < 0) P.append(Object.assign({ '이메일': u.email }, row)); else P.set(j, row);
    if (T.get(i, '강사료대상') !== '예') T.set(i, { '강사료대상': '예' });
    log_(u.email, '정산', u.tid, '주민번호 등록', '선생님이 직접 (값은 기록하지 않음)');
  } finally { lock.releaseLock(); }
  return tMe(sess);
}
/** 관리자: 정산 정보 전체 보기 — 열 때마다 기록 */
function payView(who, tid) {
  const p = payRow_(tid); if (!p) return { pay: null };
  let rrn = ''; if (p['주민번호암호']) { try { rrn = dec_(p['주민번호암호']); } catch (e) { rrn = '(풀 수 없음: ' + e.message + ')'; } }
  log_(who.name, '정산', tid, '관리자 열람', '계좌 · 주소' + (rrn ? ' · 주민번호' : ''));
  return { pay: { bank: p['은행'], acct: p['계좌번호'], holder: p['예금주'], zip: p['우편번호'], addr: p['주소'], addr2: p['상세주소'], hzip: p['집우편번호'], haddr: p['집주소'], haddr2: p['집상세주소'], rrn, rrnAt: p['주민번호동의일'], at: p['수정일'] } };
}

/* ---------- 주민번호 암호화 ----------
 * 열쇠: 스크립트 속성 RRN_KEY (32바이트, 시트·깃허브에 없음). 열쇠를 잃으면 풀 수 없으니 관리자만 따로 보관.
 * 방식: HMAC-SHA256 을 키 스트림으로 쓰는 CTR 암호 + HMAC-SHA256 인증 태그 (encrypt-then-MAC). 저장 형식 v1.nonce.암호문.태그 (base64) */
function rrnKey_() {
  const P = PropertiesService.getScriptProperties(); let k = P.getProperty('RRN_KEY');
  if (!k) { k = Utilities.base64Encode(rand_(32)); P.setProperty('RRN_KEY', k); }
  return Utilities.base64Decode(k);
}
function rand_(n) { let out = []; while (out.length < n) out = out.concat(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random())); return out.slice(0, n); }
function hm_(key, bytes) { return Utilities.computeHmacSha256Signature(bytes, key); }
function sub_(key, label) { return hm_(key, Utilities.newBlob(label).getBytes()); }
function enc_(plain) {
  const K = rrnKey_(), ek = sub_(K, 'enc'), mk = sub_(K, 'mac'), nonce = rand_(16);
  const pt = Utilities.newBlob(plain).getBytes(), ct = [];
  for (let b = 0; b * 32 < pt.length; b++) { const ks = hm_(ek, nonce.concat([0, 0, 0, b])); for (let i = 0; i < 32 && b * 32 + i < pt.length; i++) ct.push(((pt[b * 32 + i] ^ ks[i]) << 24) >> 24); }
  const tag = hm_(mk, nonce.concat(ct)).slice(0, 16);
  return 'v1.' + Utilities.base64Encode(nonce) + '.' + Utilities.base64Encode(ct) + '.' + Utilities.base64Encode(tag);
}
function dec_(s) {
  const p = String(s).split('.'); if (p[0] !== 'v1' || p.length !== 4) throw new Error('형식이 달라요');
  const K = rrnKey_(), ek = sub_(K, 'enc'), mk = sub_(K, 'mac'), nonce = Utilities.base64Decode(p[1]), ct = Utilities.base64Decode(p[2]), tag = Utilities.base64Decode(p[3]);
  const t2 = hm_(mk, nonce.concat(ct)).slice(0, 16); let diff = 0; for (let i = 0; i < 16; i++) diff |= (t2[i] ^ tag[i]); if (diff) throw new Error('값이 바뀌었어요');
  const pt = [];
  for (let b = 0; b * 32 < ct.length; b++) { const ks = hm_(ek, nonce.concat([0, 0, 0, b])); for (let i = 0; i < 32 && b * 32 + i < ct.length; i++) pt.push(((ct[b * 32 + i] ^ ks[i]) << 24) >> 24); }
  return Utilities.newBlob(pt).getDataAsString();
}

/* ---------- 관리자: 승인 대기 ---------- */
function reqs(who) { const T = tbl_('요청'); return { h: T.h, rows: T.v.slice().reverse() }; }
function reqDo(who, id, act, memo, linkTid) {
  if (['승인', '반려', '처리'].indexOf(act) < 0) fail('처리 방법이 틀렸어요.');
  if (act === '반려' && !String(memo || '').trim()) fail('반려 사유를 적어 주세요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let mailTo = '', subj = '', body = '';
  try {
    const R = tbl_('요청'), i = R.find('요청ID', id); if (i < 0) fail('요청을 찾지 못했어요.');
    const q = R.rowObj(i), c = col_(R), kind = q[c['종류']], email = q[c['이메일']], name = q[c['이름']];
    if (q[c['상태']] !== '대기') fail('이미 처리한 요청이에요.');
    const info = JSON.parse(q[c['내용']] || '{}'); const A = tbl_('계정'); const ai = A.v.findIndex(r => r[0] === email && (r[4] === '대기'));
    let tid = q[c['교사ID']];
    if ((kind === '새 회원' || kind === '외부인') && act === '승인') {
      const ext = kind === '외부인';
      const T = tbl_('교사');
      if (linkTid) { if (T.find('교사ID', linkTid) < 0) fail('연결할 교사 번호를 찾지 못했어요.'); tid = linkTid; T.set(T.find('교사ID', tid), { '이메일': email, '회원구분': info['회원 구분'] || '확인 전', '수정일': now_(), '수정자': who.name }); }
      else if (ext) { tid = nextId_(T, '교사ID', 'X');
        T.append({ '교사ID': tid, '이름': name, '원래이름': name, '휴대전화': digits_(q[c['휴대전화']]), '이메일': email, '전공': info['악기'] === '-' ? '' : (info['악기'] || ''), '회원구분': '외부인', '회비구분': '면제', '캠프교수': '아니오', '내부외부': '외부', '강사료대상': '예', '상태': '활동', '확인': '확인 전', '확인메모': '외부인 · ' + (info['하는 일'] || '') + (info['소속'] && info['소속'] !== '-' ? ' · ' + info['소속'] : ''), '원본': '외부인 신청 ' + id, '수정일': now_(), '수정자': who.name }); }
      else { tid = nextId_(T, '교사ID', 'T'); const wk = (() => { try { return Array.isArray(info['_근무']) ? info['_근무'] : JSON.parse(info['근무JSON'] || '[]'); } catch (e) { return []; } })(); const ac = wk.filter(w => w.id).map(w => w.id);
        T.append({ '교사ID': tid, '이름': name, '원래이름': name, '휴대전화': digits_(q[c['휴대전화']]), '이메일': email, '학원1': ac[0] || '', '학원2': ac[1] || '', '학원3': ac[2] || '', '직급': info['직급'] === '없음' ? '' : (info['직급'] || ''), '전공': info['악기'] || '', '회원구분': info['회원 구분'] || '확인 전', '본인자격': info['자격'] || '',
          '회비구분': '납부', '캠프교수': '아니오', '상태': '활동', '확인': '확인 전', '확인메모': (info['가입 종류'] || '') + ' 가입 신청' + (info['연수 과정'] ? ' · ' + info['연수 과정'] + ' 과정' : '') + (/목록에 없음/.test(info['근무지'] || '') ? ' · ' + info['근무지'] : ''), '원본': '가입 신청 ' + id, '수정일': now_(), '수정자': who.name });
        setWorksAtSignup_(tid, wk, who.name + ' (가입 승인)'); }
      if (ai >= 0) A.set(ai, { '교사ID': tid, '상태': '사용', '처리일': now_() });
      if (info['주민번호'] && tid) { const T3 = tbl_('교사'), k3 = T3.find('교사ID', tid); if (k3 >= 0) T3.set(k3, { '강사료대상': '예' }); }
      try { const P = payTbl_(), j = P.find('교사ID', 'E:' + email); if (j >= 0) { const old = P.find('교사ID', tid); if (old >= 0 && old !== j) P.sh.deleteRow(old + 2); const P2 = payTbl_(); P2.set(P2.find('교사ID', 'E:' + email), { '교사ID': tid }); } } catch (e) { console.warn('pay link', e); }
      mailTo = email; subj = '[스즈키] 회원 가입이 승인됐어요'; body = '<p>' + esc_(name) + ' 님, 협회가 확인하고 승인했어요.</p><p>이제 가입할 때 만든 이메일과 비밀번호로 로그인할 수 있어요.' + (ext ? ' 로그인한 뒤 「내 정보 › 강사료 정보」도 넣어 주세요.' : '') + '</p>';
    } else if (kind === '이메일 확인' && act === '승인') {
      if (ai >= 0) A.set(ai, { '상태': '사용', '처리일': now_() });
      const T = tbl_('교사'), ti = T.find('교사ID', tid); if (ti >= 0) T.set(ti, { '이메일': email, '수정일': now_(), '수정자': who.name });
      mailTo = email; subj = '[스즈키] 계정이 열렸어요'; body = '<p>' + esc_(name) + ' 선생님, 협회가 새 이메일을 확인했어요.</p><p>이제 이 이메일과 비밀번호로 로그인할 수 있어요.</p>';
    } else if (act === '반려' && kind !== '정보 수정') {
      if (ai >= 0) A.set(ai, { '상태': '반려', '처리일': now_(), '메모': String(memo).slice(0, 200) });
      if (kind === '새 회원' || kind === '외부인') { try { const P = payTbl_(), j = P.find('교사ID', 'E:' + email); if (j >= 0) P.sh.deleteRow(j + 2); } catch (e) {} }   // 반려된 신청의 계좌·주소는 지움
      mailTo = email; subj = '[스즈키] 확인이 필요해요'; body = '<p>신청하신 내용을 승인하지 못했어요.</p><p><b>사유:</b> ' + esc_(memo) + '</p><p>다시 신청하거나 협회 카카오톡 채널로 문의해 주세요.</p>';
    }
    R.set(i, { '상태': act === '반려' ? '반려' : act === '처리' ? '처리' : '승인', '교사ID': tid || '', '처리일': now_(), '처리자': who.name, '메모': String(memo || '').slice(0, 300) });
    log_(who.name, '요청', id, kind + ' ' + act, String(memo || ''));
  } finally { lock.releaseLock(); }
  if (mailTo) { try { mail_(mailTo, subj, body); } catch (e) { console.warn('mail', e); } }
  return reqs(who);
}

/* ---------- 문의·요청 게시판 (10-28) ---------- */
const B_CATS = ['회원가입', '정보 수정', '회비', '캠프·행사', '기타'], B_STATES = ['접수', '처리중', '완료'];
function bText_(v, n) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, n); }
function bObjs_() { const Q = tbl_('문의'), C = tbl_('댓글'); const o = (T, r) => { const x = {}; T.h.forEach((k, j) => x[k] = r[j]); return x; };
  const cm = {}; C.v.forEach(r => { const c = o(C, r); (cm[c['문의ID']] = cm[c['문의ID']] || []).push(c); });
  return Q.v.map(r => { const q = o(Q, r); q.comments = cm[q['문의ID']] || []; return q; }).sort((a, b) => String(b['작성일']).localeCompare(String(a['작성일']))); }
/** 글쓰기: 로그인했으면 그 회원으로, 아니면 이름 + 휴대전화 */
function bPost(sess, d) {
  d = d || {}; if (d.hp) fail('보내지 못했어요.');   /* 자동 등록 막기용 숨은 칸 */
  let u = null; if (sess) { try { u = tsess_(sess); } catch (e) { u = null; } }
  let tid = '', name, phone, email = '';
  if (u) { const T = tbl_('교사'), i = T.find('교사ID', u.tid); tid = u.tid; name = i >= 0 ? T.get(i, '이름') : ''; phone = i >= 0 ? T.get(i, '휴대전화') : ''; email = u.email; }
  else { name = bText_(d.name, 20); phone = digits_(d.phone); if (!name) fail('이름을 넣어 주세요.'); if (!/^01\d{8,9}$/.test(phone)) fail('휴대전화 번호를 확인해 주세요.'); }
  const cat = B_CATS.indexOf(d.cat) >= 0 ? d.cat : '기타', title = bText_(d.title, 80), body = bText_(d.body, 2000);
  if (!title) fail('제목을 넣어 주세요.'); if (body.length < 2) fail('내용을 넣어 주세요.');
  limit_('bp:' + (phone || tid), 5, 3600, '한 시간에 5개까지 남길 수 있어요. 잠시 뒤 다시 해 주세요.');
  limit_('bp:all', 300, 3600, '지금 글이 많이 들어오고 있어요. 잠시 뒤 다시 해 주세요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const Q = tbl_('문의'), id = 'Q' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
    Q.append({ '문의ID': id, '작성일': now_(), '교사ID': tid, '이름': name, '휴대전화': phone, '이메일': email, '분류': cat, '제목': title, '내용': body, '상태': '접수', '수정일': now_() });
    log_(name, '문의', id, '새 문의', cat + ' · ' + title.slice(0, 40) + (tid ? '' : ' (비로그인)'));
    return { id };
  } finally { lock.releaseLock(); }
}
/** 로그인한 회원: 내가 쓴 문의와 댓글 */
function bMine(sess) { const u = tsess_(sess); return { list: bObjs_().filter(q => q['교사ID'] === u.tid).map(q => ({ id: q['문의ID'], at: q['작성일'], cat: q['분류'], title: q['제목'], body: q['내용'], state: q['상태'], comments: q.comments.map(c => ({ at: c['작성일'], who: c['쓴사람'], name: c['쓴사람'] === '관리자' ? '협회' : c['이름'], text: c['내용'] })) })) }; }
function bAddComment_(qid, who, name, text) { const C = tbl_('댓글'); C.append({ '댓글ID': 'C' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10), '문의ID': qid, '작성일': now_(), '쓴사람': who, '이름': name, '내용': text }); }
function bReply(sess, qid, text) {
  const u = tsess_(sess); text = bText_(text, 1000); if (!text) fail('댓글을 넣어 주세요.');
  const Q = tbl_('문의'), i = Q.find('문의ID', qid); if (i < 0 || Q.get(i, '교사ID') !== u.tid) fail('그 문의를 찾지 못했어요.');
  limit_('bc:' + u.tid, 20, 3600, '댓글을 많이 남겼어요. 잠시 뒤 다시 해 주세요.');
  const T = tbl_('교사'), ti = T.find('교사ID', u.tid);
  bAddComment_(qid, '작성자', ti >= 0 ? T.get(ti, '이름') : u.email, text);
  if (Q.get(i, '상태') === '완료') Q.set(i, { '상태': '처리중', '수정일': now_() });   /* 끝난 문의에 다시 물으면 처리중으로 */
  return bMine(sess);
}
/** 관리자 */
function bList(who) { const all = bObjs_(); return { list: all }; }
function bSet(who, qid, state) {
  if (B_STATES.indexOf(state) < 0) fail('상태를 골라 주세요.');
  const Q = tbl_('문의'), i = Q.find('문의ID', qid); if (i < 0) fail('그 문의를 찾지 못했어요.');
  Q.set(i, { '상태': state, '처리일': state === '완료' ? now_() : Q.get(i, '처리일'), '처리자': who.name, '수정일': now_() });
  log_(who.name, '문의', qid, '상태', state);
  return bList(who);
}
function bComment(who, qid, text) {
  text = bText_(text, 1000); if (!text) fail('댓글을 넣어 주세요.');
  const Q = tbl_('문의'), i = Q.find('문의ID', qid); if (i < 0) fail('그 문의를 찾지 못했어요.');
  bAddComment_(qid, '관리자', who.name, text);
  if (Q.get(i, '상태') === '접수') Q.set(i, { '상태': '처리중', '처리자': who.name, '수정일': now_() });
  const em = Q.get(i, '이메일');
  if (em) { try { mail_(em, '[스즈키] 문의에 답이 달렸어요', '<p>「' + esc_(Q.get(i, '제목')) + '」 문의에 협회가 답을 남겼어요.</p><blockquote>' + esc_(text).replace(/\n/g, '<br>') + '</blockquote><p>로그인해서 「내 정보 › 내 문의」에서 볼 수 있어요.</p>'); } catch (e) {} }
  log_(who.name, '문의', qid, '댓글', text.slice(0, 60));
  return bList(who);
}

/* ---------- 근무지 이력 ---------- */
function workObjs_() { const W = tbl_('근무'); return { W, list: W.v.map((r, i) => { const o = { _i: i }; W.h.forEach((k, j) => o[k] = r[j]); return o; }) }; }
/** 그 선생님의 근무 줄. 근무 탭에 없고 교사 탭에 학원1~3만 있으면(예전 불러오기) 그 자리에서 만들어 둠 */
function worksOf_(tid) {
  let { list } = workObjs_(); let mine = list.filter(w => w['교사ID'] === tid);
  if (!mine.length) { const T = tbl_('교사'), i = T.find('교사ID', tid); if (i >= 0) { const W = tbl_('근무'); ['학원1', '학원2', '학원3'].map(k => T.get(i, k)).filter(Boolean).forEach((a, k) => W.append({ '근무ID': nextWid_(W), '교사ID': tid, '학원ID': a, '시작': '', '종료': '', '주근무': k === 0 ? '예' : '', '출처': '원본', '수정일': now_(), '수정자': '자동' })); mine = workObjs_().list.filter(w => w['교사ID'] === tid); } }
  return mine.sort((a, b) => (a['종료'] ? 1 : 0) - (b['종료'] ? 1 : 0) || (b['주근무'] === '예') - (a['주근무'] === '예') || String(b['시작']).localeCompare(String(a['시작'])));
}
function nextWid_(W) { let m = 0; W.v.forEach(r => { const n = +String(r[0]).replace(/\D/g, '') || 0; if (n > m) m = n; }); return 'W' + String(m + 1).padStart(5, '0'); }
/** 현재 근무지(종료 없음)로 교사 탭 학원1~3을 맞춤 (주 근무가 학원1) */
function syncAcads_(tid) {
  const cur = workObjs_().list.filter(w => w['교사ID'] === tid && !w['종료'] && w['학원ID']).sort((a, b) => (b['주근무'] === '예') - (a['주근무'] === '예') || String(a['시작']).localeCompare(String(b['시작'])));
  const T = tbl_('교사'), i = T.find('교사ID', tid); if (i < 0) return;
  T.set(i, { '학원1': (cur[0] || {})['학원ID'] || '', '학원2': (cur[1] || {})['학원ID'] || '', '학원3': (cur[2] || {})['학원ID'] || '' });
}
/** 가입 때: 원본에서 온 현재 근무 줄(시작 없음)은 지우고, 선생님이 넣은 근무지로 새로 씀. 지난 근무(종료 있음)는 그대로 */
function setWorksAtSignup_(tid, works, by) {
  let { W, list } = workObjs_();
  list.filter(w => w['교사ID'] === tid && !w['종료']).map(w => w._i).sort((a, b) => b - a).forEach(i => W.sh.deleteRow(i + 2));
  W = tbl_('근무');
  (works || []).forEach((w, k) => W.append({ '근무ID': nextWid_(W), '교사ID': tid, '학원ID': w.id || '', '학원명': w.id ? '' : w.text, '시작': w.start, '종료': '', '주근무': k === 0 ? '예' : '', '출처': '선생님', '수정일': now_(), '수정자': by }));
  syncAcads_(tid);
}
function ym_(y, m) { y = +y; m = String(m || '').padStart(2, '0'); const ny = +Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy'); if (!(y >= 1980 && y <= ny + 1) || !/^(0[1-9]|1[0-2])$/.test(m)) fail('년·월을 골라 주세요.'); return y + '-' + m; }
function tAddWork(sess, w) {
  const u = tsess_(sess); w = w || {}; const an = acadNames_();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const cur = worksOf_(u.tid).filter(x => !x['종료']); if (cur.length >= 3) fail('지금 근무지는 3곳까지예요. 그만둔 곳은 먼저 「종료」해 주세요.');
    const id = an[w.id] ? String(w.id) : '', text = id ? '' : String(w.text || '').trim().slice(0, 60); if (!id && !text) fail('학원을 골라 주세요.');
    if (cur.some(x => id ? x['학원ID'] === id : x['학원명'] === text)) fail('이미 근무 중인 학원이에요.');
    const W = tbl_('근무'); W.append({ '근무ID': nextWid_(W), '교사ID': u.tid, '학원ID': id, '학원명': text, '시작': ym_(w.y, w.m), '종료': '', '주근무': cur.length ? '' : '예', '출처': '선생님', '수정일': now_(), '수정자': u.email });
    syncAcads_(u.tid);
    if (text) { const T = tbl_('교사'), i = T.find('교사ID', u.tid); addReq_('정보 수정', u.tid, { name: T.get(i, '이름'), phone: T.get(i, '휴대전화'), email: u.email }, { '목록에 없는 학원': text }); }
    log_(u.email, '근무', u.tid, '근무지 추가', (an[id] || text) + ' ' + ym_(w.y, w.m) + '~');
  } finally { lock.releaseLock(); }
  return tMe(sess);
}
function tEndWork(sess, wid, y, m) {
  const u = tsess_(sess);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const { W, list } = workObjs_(); const w = list.find(x => x['근무ID'] === wid && x['교사ID'] === u.tid); if (!w) fail('근무지를 찾지 못했어요.');
    if (w['종료']) fail('이미 종료한 근무지예요.');
    const end = ym_(y, m); if (w['시작'] && end < w['시작']) fail('종료가 시작(' + w['시작'] + ')보다 빨라요.');
    W.set(w._i, { '종료': end, '주근무': '', '수정일': now_(), '수정자': u.email });
    if (w['주근무'] === '예') { const nx = worksOf_(u.tid).find(x => !x['종료']); if (nx) { const W2 = tbl_('근무'); W2.set(W2.find('근무ID', nx['근무ID']), { '주근무': '예' }); } }
    syncAcads_(u.tid);
    log_(u.email, '근무', u.tid, '근무지 종료', wid + ' ' + end);
  } finally { lock.releaseLock(); }
  return tMe(sess);
}
function tMainWork(sess, wid) {
  const u = tsess_(sess);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const { W, list } = workObjs_(); if (!list.some(x => x['근무ID'] === wid && x['교사ID'] === u.tid && !x['종료'])) fail('근무지를 찾지 못했어요.');
    list.filter(x => x['교사ID'] === u.tid && !x['종료']).forEach(x => W.set(x._i, { '주근무': x['근무ID'] === wid ? '예' : '' }));
    syncAcads_(u.tid);
  } finally { lock.releaseLock(); }
  return tMe(sess);
}
/** 관리자: 한 선생님의 근무 이력 전체를 바꿈 */
function saveWorks(who, tid, rows) {
  const an = acadNames_();
  const clean = (rows || []).slice(0, 30).map(r => {
    const id = an[r.id] ? String(r.id) : '', text = id ? '' : String(r.text || '').trim().slice(0, 60); if (!id && !text) fail('학원을 골라 주세요.');
    const st = String(r.start || ''), en = String(r.end || '');
    if (st && !/^\d{4}-(0[1-9]|1[0-2])$/.test(st)) fail('시작은 2024-03 처럼 넣어 주세요.'); if (en && !/^\d{4}-(0[1-9]|1[0-2])$/.test(en)) fail('종료는 2025-02 처럼 넣어 주세요.');
    if (st && en && en < st) fail((an[id] || text) + ' 종료가 시작보다 빨라요.');
    return { id, text, st, en, main: !!r.main && !en };
  });
  if (clean.filter(x => !x.en).length > 3) fail('지금 근무지는 3곳까지예요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    let { W, list } = workObjs_(); list.filter(w => w['교사ID'] === tid).map(w => w._i).sort((a, b) => b - a).forEach(i => W.sh.deleteRow(i + 2));
    W = tbl_('근무'); let hasMain = clean.some(x => x.main);
    clean.forEach(x => { const mn = x.main || (!hasMain && !x.en); if (mn) hasMain = true; W.append({ '근무ID': nextWid_(W), '교사ID': tid, '학원ID': x.id, '학원명': x.text, '시작': x.st, '종료': x.en, '주근무': mn ? '예' : '', '출처': '관리자', '수정일': now_(), '수정자': who.name }); });
    syncAcads_(tid);
    log_(who.name, '근무', tid, '근무 이력 수정', clean.map(x => (an[x.id] || x.text) + ' ' + (x.st || '?') + '~' + (x.en || '')).join(' · '));
    const W2 = tbl_('근무'), T = tbl_('교사'); return { works: { h: W2.h, rows: W2.v }, row: T.rowObj(T.find('교사ID', tid)) };
  } finally { lock.releaseLock(); }
}

/* ---------- 계정 도우미 ---------- */
function acctAll_() { const T = tbl_('계정'); return T.v.map((r, i) => ({ i, email: String(r[0]).toLowerCase(), tid: r[1], hash: r[2], salt: r[3], state: r[4], memo: r[9] })); }
function addReq_(kind, tid, s, info) {
  const R = tbl_('요청');
  R.append({ '요청ID': 'R' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10), '종류': kind, '교사ID': tid, '이름': s.name, '휴대전화': s.phone, '이메일': s.email, '내용': JSON.stringify(info), '상태': '대기', '신청일': now_() });
}
function newSess_(o) { const t = Utilities.getUuid(); cput_('ts:' + t, o, 6 * 3600); return t; }
function tsess_(t) { const v = t && cget_('ts:' + t); if (!v) fail('LOGIN 로그인 시간이 지났어요. 다시 로그인해 주세요.'); cput_('ts:' + t, v, 6 * 3600); return v; }
function tok_(token) { const s = cget_('tk:' + token); if (!s) fail('시간이 지났어요. 처음부터 다시 해 주세요.'); return s; }
function cput_(k, v, sec) { CacheService.getScriptCache().put(k, JSON.stringify(v), sec); }
function cget_(k) { const v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; }
function col_(T) { const o = {}; T.h.forEach((k, i) => o[k] = i); return o; }
function acadNames_() { const o = {}; tbl_('학원').v.forEach(r => o[r[0]] = r[1]); return o; }
function payTbl_() {
  const id = settings_()['정산 정보 시트']; if (!id) fail('정산 정보 파일이 아직 없어요. 관리자가 setup 을 한 번 더 실행해야 해요.');
  const ss = SpreadsheetApp.openById(id); const sh = ss.getSheetByName('정산') || ensure_(ss, '정산');
  let all = sh.getDataRange().getDisplayValues(); let h = (all.shift() || []).map(String);
  if (h.length < HEAD['정산'].length || h[0] !== '교사ID') { sh.getRange(1, 1, 1, HEAD['정산'].length).setValues([HEAD['정산']]).setFontWeight('bold'); h = HEAD['정산'].slice(); }   // 칸이 늘면 머리글만 늘림 (기존 칸 순서 그대로)
  const v = all.filter(r => r.some(x => x !== '')).map(r => { const x = r.slice(); while (x.length < h.length) x.push(''); return x; });
  return { sh, h, v, find(k, x) { const c = h.indexOf(k); return v.findIndex(r => String(r[c]) === String(x)); },
    set(i, obj) { const row = v[i].slice(); Object.keys(obj).forEach(k => { const c = h.indexOf(k); if (c >= 0) row[c] = String(obj[k]); }); sh.getRange(i + 2, 1, 1, h.length).setValues([row]); v[i] = row; },
    append(obj) { const row = h.map(k => obj[k] == null ? '' : String(obj[k])); sh.getRange(v.length + 2, 1, 1, h.length).setNumberFormat('@').setValues([row]); v.push(row); } };
}
function payRow_(tid) { try { const P = payTbl_(), j = P.find('교사ID', tid); if (j < 0) return null; const o = {}; P.h.forEach((k, i) => o[k] = P.v[j][i]); return o; } catch (e) { return null; } }
function hash_(pw, salt) {
  let h = salt + '|' + pw;
  for (let i = 0; i < 5000; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  return 'S256x5000$' + h;
}
function mail_(to, subject, html) {
  const name = settings_()['보내는 이름'] || '한국스즈키음악협회';
  MailApp.sendEmail({ to, subject, name, htmlBody: '<div style="font-family:sans-serif;font-size:15px;line-height:1.6">' + html + '<hr><p style="color:#888;font-size:12px">' + esc_(name) + ' · 보내기 전용 메일이에요. 문의는 협회 카카오톡 채널로 해 주세요.</p></div>' });
}
function maskEmail_(e) { e = String(e || ''); const m = e.match(/^([^@]{0,2})[^@]*(@.*)$/); return m ? m[1] + '***' + m[2] : ''; }
function maskPhone_(p) { p = digits_(p); return p.length >= 10 ? p.slice(0, 3) + '-****-' + p.slice(-4) : p; }
function maskAcct_(a) { return a ? String(a).replace(/\d(?=[\d-]{4})/g, '*') : ''; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
