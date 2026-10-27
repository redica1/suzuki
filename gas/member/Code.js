/* build: 20261028-004937 */
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
  '교사': ['교사ID', '이름', '구분글자', '원래이름', '휴대전화', '이메일', '학원1', '학원2', '학원3', '직급', '전공', '회원구분', '명단자격', '명단취득', '회비구분', '캠프교수', '내부외부', '상태', '확인', '확인메모', '메모', '원본', '수정일', '수정자', '영문이름', '본인자격', '회비납부방법'],
  '학생': ['학생ID', '학원ID', '이름', '구분글자', '원래이름', '출생연도', '출생연도추정', '전공', '시작월', '상태', '담당교사ID', '확인', '확인메모', '메모', '원본', '수정일', '수정자'],
  '연회비': ['대상', 'ID', '년도', '부과', '납부', '납부일', '방식', '메모', '수정일', '수정자'],
  '설정': ['항목', '값', '설명'],
  '기록': ['일시', '누가', '표', 'ID', '동작', '내용'],
  '계정': ['이메일', '교사ID', '비번해시', '솔트', '상태', '경로', '만든날', '처리일', '마지막로그인', '메모'],
  '요청': ['요청ID', '종류', '교사ID', '이름', '휴대전화', '이메일', '내용', '상태', '신청일', '처리일', '처리자', '메모'],
  '정산': ['교사ID', '은행', '계좌번호', '예금주', '우편번호', '주소', '상세주소', '수정일'],
};
const KEY = { '학원': '학원ID', '교사': '교사ID', '학생': '학생ID' };
/* 화면에서 고칠 수 있는 칸 (나머지는 서버가 정함) */
const EDIT = {
  '학원': ['학원명', '구분', '상태', '원장교사ID', '교실대표번호', '이메일', '교습과목', '시도', '시군구', '우편번호', '주소', '상세주소', '개원일', '계약체결일', '확인', '확인메모', '메모'],
  '교사': ['이름', '구분글자', '휴대전화', '이메일', '학원1', '학원2', '학원3', '직급', '전공', '회원구분', '회비구분', '회비납부방법', '캠프교수', '내부외부', '상태', '확인', '확인메모', '메모'],
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
  const open = { login, hello, tHello, tLookup, tStart, tResend, tVerify, tCreate, tLogin, tForgot, tReset, tMe, tSavePay, tLogout };
  const fns = { boot, saveRow, setCheck, logs, importRoster, saveDues, delDues, reqs, reqDo, delAcad };
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
    put('학원', acads); put('교사', teachers); put('학생', students); put('연회비', dues);
    const sk = Object.keys(skipped);
    const msg = '학원 ' + acads.length + '곳 · 교사 ' + teachers.length + '명 · 학생 ' + students.length + '명 · 연회비 ' + dues.length + '줄' + (sk.length ? ' · 스즈키가 아니라 학원에서 뺀 이름 ' + sk.length + '개: ' + sk.slice(0, 15).join(', ') + (sk.length > 15 ? ' …' : '') : '');
    log_(who.name, '전체', '', '원본 불러오기', msg);
    return { msg };
  } finally { lock.releaseLock(); }
}
/** 원본 시트에서 머리글 이름으로 필요한 칸만 읽음 (주민번호·계좌·주소 칸은 이름을 적지 않았으므로 읽지 않음) */
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
function nextId_(T, k, p) { const c = T.h.indexOf(k); let m = 0; T.v.forEach(r => { const n = +(String(r[c]).replace(/\D/g, '')) || 0; if (n > m) m = n; }); return p + String(m + 1).padStart(4, '0'); }
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
    const q = tbl_('요청').v.find(r => r[1] === '새 회원' && digits_(r[4]) === phone && r[7] === '대기');
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
  if (s.stage === 'verified') return { ok2: true };
  if (s.stage !== 'code') fail('처음부터 다시 해 주세요.');
  if (Date.now() - s.codeAt > 10 * 60 * 1000) fail('코드 시간이 지났어요. 「코드 다시 받기」를 눌러 주세요.');
  if (++s.tries > 5) { cput_('tk:' + token, s, 3600); fail('5번 틀렸어요. 「코드 다시 받기」를 눌러 주세요.'); }
  if (String(code).trim() !== s.code) { cput_('tk:' + token, s, 3600); fail('코드가 맞지 않아요.'); }
  s.stage = 'verified'; cput_('tk:' + token, s, 3600);
  return { ok2: true };
}
const CERTS_ = ['초급', '중급', '티처트레이너', '국민대학원', '대구가톨릭대학원', '전주대학원'];
/** 가입 때 선생님이 넣은 정보 검사 (기존 교사회원 · 신규 회원 같은 칸) */
function cleanInfo_(n, isNew) {
  n = n || {}; const an = acadNames_(); const o = {};
  if (isNew) {
    if (['교사회원', '연수교사회원'].indexOf(n.type) < 0) fail('가입 종류를 골라 주세요.');
    if (n.type === '연수교사회원' && ['초급', '중급'].indexOf(n.course) < 0) fail('연수 과정을 골라 주세요.');
    o.type = n.type; o.course = n.type === '연수교사회원' ? n.course : '';
    o.kind = n.type === '교사회원' ? '정식 교사' : n.course === '중급' ? '중급 연수' : '초급 연수';
  } else { if (KINDS.indexOf(n.kind) < 0) fail('회원 구분을 골라 주세요.'); o.kind = n.kind; }
  /* 소속: 주로 근무하는 학원 1곳(필수) + 추가 근무 학원 2곳까지 (10-28). 소속 없음은 연수 중인 선생님만 */
  o.noAcad = !!n.noAcad || (isNew && o.type === '연수교사회원');
  if (o.noAcad && o.kind === '정식 교사') fail('정식 교사는 주로 근무하는 학원을 꼭 골라 주세요.');
  const main = o.noAcad ? '' : (an[n.main] ? String(n.main) : '');
  o.acadText = o.noAcad || main ? '' : String(n.mainText || '').trim().slice(0, 60);
  if (!o.noAcad && !main && !o.acadText) fail('주로 근무하는 학원을 골라 주세요.');
  const extras = o.noAcad ? [] : [...new Set((n.extras || []).map(String))].filter(id => an[id] && id !== main).slice(0, 2);
  o.acads = (main ? [main] : []).concat(extras);
  o.role = ['원장', '강사', ''].indexOf(n.role) >= 0 ? n.role : ''; if (n.role == null) fail('직급을 골라 주세요.');
  if (INSTS_.indexOf(n.inst) < 0) fail('악기를 골라 주세요.'); o.inst = n.inst;
  o.certs = (n.certs || []).filter(x => CERTS_.indexOf(x.n) >= 0).map(x => ({ n: x.n, y: /^(19|20)\d{2}$/.test(String(x.y)) ? String(x.y) : '' }));
  o.certTxt = o.certs.map(x => x.n + (x.y ? ' ' + x.y : '')).join(', ');
  o.acadNames = o.noAcad ? '소속 없음' : (o.acadText ? ['(목록에 없음) ' + o.acadText] : []).concat(o.acads.map(id => an[id])).join(', ');
  return o;
}
function tCreate(token, d) {
  const s = tok_(token); d = d || {};
  if (s.stage !== 'verified') fail('이메일 인증부터 해 주세요.');
  if (String(d.pw || '').length < 8) fail('비밀번호는 8자 이상으로 만들어 주세요.');
  if (!d.agree) fail('개인정보 수집·이용 동의에 체크해 주세요.');
  const tid = s.tid, o = cleanInfo_(d.info, !tid);
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
      const newA = o.noAcad ? [] : o.acads;   // 주 근무 학원이 목록에 없으면(직접 적음) 학원1은 비우고 「정보 수정」 요청
      const diff = [];
      if (oldA.join(',') !== newA.join(',')) diff.push('소속 ' + (oldA.map(x => an[x] || x).join(', ') || '없음') + ' → ' + (newA.map(x => an[x] || x).join(', ') || '없음'));
      if (o.acadText) diff.push('주 근무 학원이 목록에 없음 「' + o.acadText + '」');
      if (g('직급') !== o.role) diff.push('직급 ' + (g('직급') || '없음') + ' → ' + (o.role || '없음'));
      if (g('전공') !== o.inst) diff.push('악기 ' + (g('전공') || '없음') + ' → ' + o.inst);
      if (o.certTxt && o.certTxt !== g('명단자격')) diff.push('자격 (명단: ' + (g('명단자격') || '없음') + ') → ' + o.certTxt);
      const upd = { '학원1': newA[0] || '', '학원2': newA[1] || '', '학원3': newA[2] || '', '직급': o.role, '전공': o.inst, '회원구분': o.kind, '본인자격': o.certTxt, '수정일': stamp, '수정자': s.name + ' (가입)' };
      if (s.emailMatch) upd['이메일'] = s.email;
      if (diff.length) { upd['확인'] = '확인 필요'; upd['확인메모'] = [g('확인메모'), '가입 때 바꿈: ' + diff.join(' · ')].filter(Boolean).join(' · ').slice(0, 500); }
      T.set(i, upd);
      if (!s.emailMatch) addReq_('이메일 확인', tid, s, { '명단 이메일': maskEmail_(s.rosterEmail), '새 이메일': s.email });
      if (o.acadText) addReq_('정보 수정', tid, s, { '목록에 없는 학원': o.acadText, '넣은 소속': o.acadNames });
      log_(s.name, '계정', tid, '가입', (s.emailMatch ? '바로 사용' : '명단과 다른 이메일 · 관리자 확인 대기') + ' · ' + o.kind + (diff.length ? ' · 바뀜: ' + diff.join(' · ') : ''));
    } else {
      state = '대기';
      tbl_('계정').append({ '이메일': s.email, '교사ID': '', '비번해시': hash_(d.pw, salt), '솔트': salt, '상태': '대기', '경로': '신규 회원', '만든날': stamp });
      addReq_('새 회원', '', s, { '가입 종류': o.type, '연수 과정': o.course, '회원 구분': o.kind, '소속 학원ID': o.acads.join(','), '소속 학원': o.acadNames, '직급': o.role || '없음', '악기': o.inst, '자격': o.certTxt });
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
  return { me: { name: g('이름'), phone: g('휴대전화'), email: u.email, acads: [g('학원1'), g('학원2'), g('학원3')].filter(Boolean).map(id => an[id] || id), role: g('직급'), inst: g('전공'), kind: g('회원구분'), eng: g('영문이름'), heads,
    pay: p ? { bank: p['은행'], acct: maskAcct_(p['계좌번호']), holder: p['예금주'], zip: p['우편번호'], addr: p['주소'], addr2: p['상세주소'] } : null, reqs } };
}
function tSavePay(sess, d) {
  const u = tsess_(sess); d = d || {};
  const o = { '은행': String(d.bank || '').slice(0, 20), '예금주': String(d.holder || '').trim().slice(0, 20), '우편번호': digits_(d.zip).slice(0, 5), '주소': String(d.addr || '').trim().slice(0, 120), '상세주소': String(d.addr2 || '').trim().slice(0, 80) };
  const acct = String(d.acct || '').replace(/[^\d-]/g, '');
  if (acct && !/^[\d-]{8,20}$/.test(acct)) fail('계좌번호는 숫자와 - 로 넣어 주세요.');
  if (acct && (!o['은행'] || !o['예금주'])) fail('은행과 예금주도 넣어 주세요.');
  const eng = String(d.eng || '').trim().slice(0, 60); if (eng && !/^[A-Za-z .'-]+$/.test(eng)) fail('영문 이름은 영어로 넣어 주세요.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = tbl_('교사'), i = T.find('교사ID', u.tid); if (i >= 0) T.set(i, { '영문이름': eng });
    const P = payTbl_(), j = P.find('교사ID', u.tid), row = Object.assign({ '교사ID': u.tid, '수정일': now_() }, o);
    if (acct) row['계좌번호'] = acct; else if (j < 0) row['계좌번호'] = '';
    if (j < 0) P.append(row); else P.set(j, row);
    log_(u.email, '정산', u.tid, '선생님이 수정', ['영문 이름', '주소'].concat(acct ? ['계좌'] : []).join(' · '));
  } finally { lock.releaseLock(); }
  return tMe(sess);
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
    if (kind === '새 회원' && act === '승인') {
      const T = tbl_('교사');
      if (linkTid) { if (T.find('교사ID', linkTid) < 0) fail('연결할 교사 번호를 찾지 못했어요.'); tid = linkTid; T.set(T.find('교사ID', tid), { '이메일': email, '회원구분': info['회원 구분'] || '확인 전', '수정일': now_(), '수정자': who.name }); }
      else { tid = nextId_(T, '교사ID', 'T'); const ac = String(info['소속 학원ID'] || '').split(',').filter(Boolean);
        T.append({ '교사ID': tid, '이름': name, '원래이름': name, '휴대전화': digits_(q[c['휴대전화']]), '이메일': email, '학원1': ac[0] || '', '학원2': ac[1] || '', '학원3': ac[2] || '', '직급': info['직급'] === '없음' ? '' : (info['직급'] || ''), '전공': info['악기'] || '', '회원구분': info['회원 구분'] || '확인 전', '본인자격': info['자격'] || '',
          '회비구분': '납부', '캠프교수': '아니오', '상태': '활동', '확인': '확인 전', '확인메모': (info['가입 종류'] || '') + ' 가입 신청' + (info['연수 과정'] ? ' · ' + info['연수 과정'] + ' 과정' : '') + (/목록에 없음/.test(info['소속 학원'] || '') ? ' · ' + info['소속 학원'] : ''), '원본': '가입 신청 ' + id, '수정일': now_(), '수정자': who.name }); }
      if (ai >= 0) A.set(ai, { '교사ID': tid, '상태': '사용', '처리일': now_() });
      mailTo = email; subj = '[스즈키] 회원 가입이 승인됐어요'; body = '<p>' + esc_(name) + ' 선생님, 협회가 확인하고 승인했어요.</p><p>이제 가입할 때 만든 이메일과 비밀번호로 로그인할 수 있어요.</p>';
    } else if (kind === '이메일 확인' && act === '승인') {
      if (ai >= 0) A.set(ai, { '상태': '사용', '처리일': now_() });
      const T = tbl_('교사'), ti = T.find('교사ID', tid); if (ti >= 0) T.set(ti, { '이메일': email, '수정일': now_(), '수정자': who.name });
      mailTo = email; subj = '[스즈키] 계정이 열렸어요'; body = '<p>' + esc_(name) + ' 선생님, 협회가 새 이메일을 확인했어요.</p><p>이제 이 이메일과 비밀번호로 로그인할 수 있어요.</p>';
    } else if (act === '반려' && kind !== '정보 수정') {
      if (ai >= 0) A.set(ai, { '상태': '반려', '처리일': now_(), '메모': String(memo).slice(0, 200) });
      mailTo = email; subj = '[스즈키] 확인이 필요해요'; body = '<p>신청하신 내용을 승인하지 못했어요.</p><p><b>사유:</b> ' + esc_(memo) + '</p><p>다시 신청하거나 협회 카카오톡 채널로 문의해 주세요.</p>';
    }
    R.set(i, { '상태': act === '반려' ? '반려' : act === '처리' ? '처리' : '승인', '교사ID': tid || '', '처리일': now_(), '처리자': who.name, '메모': String(memo || '').slice(0, 300) });
    log_(who.name, '요청', id, kind + ' ' + act, String(memo || ''));
  } finally { lock.releaseLock(); }
  if (mailTo) { try { mail_(mailTo, subj, body); } catch (e) { console.warn('mail', e); } }
  return reqs(who);
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
  const all = sh.getDataRange().getDisplayValues(); const h = (all.shift() || HEAD['정산']).map(String); const v = all.filter(r => r.some(x => x !== ''));
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
