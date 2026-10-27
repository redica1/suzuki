/* build: 20261027-233537 */
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
  '교사': ['교사ID', '이름', '구분글자', '원래이름', '휴대전화', '이메일', '학원1', '학원2', '학원3', '직급', '전공', '회원구분', '명단자격', '명단취득', '회비구분', '캠프교수', '내부외부', '상태', '확인', '확인메모', '메모', '원본', '수정일', '수정자'],
  '학생': ['학생ID', '학원ID', '이름', '구분글자', '원래이름', '출생연도', '출생연도추정', '전공', '시작월', '상태', '담당교사ID', '확인', '확인메모', '메모', '원본', '수정일', '수정자'],
  '연회비': ['대상', 'ID', '년도', '부과', '납부', '납부일', '방식', '메모', '수정일', '수정자'],
  '설정': ['항목', '값', '설명'],
  '기록': ['일시', '누가', '표', 'ID', '동작', '내용'],
};
const KEY = { '학원': '학원ID', '교사': '교사ID', '학생': '학생ID' };
/* 화면에서 고칠 수 있는 칸 (나머지는 서버가 정함) */
const EDIT = {
  '학원': ['학원명', '구분', '상태', '원장교사ID', '교실대표번호', '이메일', '교습과목', '시도', '시군구', '우편번호', '주소', '상세주소', '개원일', '계약체결일', '확인', '확인메모', '메모'],
  '교사': ['이름', '구분글자', '휴대전화', '이메일', '학원1', '학원2', '학원3', '직급', '전공', '회원구분', '회비구분', '캠프교수', '내부외부', '상태', '확인', '확인메모', '메모'],
  '학생': ['학원ID', '이름', '구분글자', '출생연도', '전공', '시작월', '상태', '담당교사ID', '확인', '확인메모', '메모'],
};
const SETTINGS = [
  ['관리자 아이디', 'admin', '관리자 화면 아이디'],
  ['관리자 비밀번호', '', '8자 이상으로 직접 적어 주세요 (노란 칸)'],
  ['테스트 표시', '아니오', 'STG 시트만 「예」 → 화면 위에 테스트 띠'],
  ['관리자 자동 로그인', '아니오', 'STG 시험용. 「예」면 비밀번호 없이 들어감 (메인에서는 꼭 아니오)'],
  ['원본 시트', SRC_ID, '처음 불러올 연회비 명단 시트 ID'],
];

/* ====================== 웹 앱 ====================== */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('스즈키 회원관리')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(n) { return HtmlService.createHtmlOutputFromFile(n).getContent(); }

function api(name, args) {
  const open = { login, hello };
  const fns = { boot, saveRow, setCheck, logs, importRoster, saveDues, delDues };
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
  Object.keys(HEAD).forEach(n => ensure_(ss, n));
  const sh = ss.getSheetByName('설정'); const have = sh.getDataRange().getDisplayValues().map(r => r[0]);
  SETTINGS.forEach(r => { if (have.indexOf(r[0]) < 0) sh.appendRow(r); });
  const pwRow = sh.getDataRange().getDisplayValues().findIndex(r => r[0] === '관리자 비밀번호');
  if (pwRow >= 0) sh.getRange(pwRow + 1, 2).setBackground('#fff2a8');
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
    const A = readSrc_(src, '학원정보DB', '학원명', ['운영', '구분', '지역1', '지역2', '학원명', '원장명', '교실대표번호', '이메일', '주소', '계약서작성일', '개원일', '교습과목', '우편번호', '상세주소']);
    const Tt = readSrc_(src, '교사정보DB', '교사명', ['소속스즈키', '내부외부', '회비기준', '지역1', '지역2', '학원1', '학원2', '학원3', '직급', '전공', '캠프기준', '교사명', '보유자격증1', '자격취득년도', '전화번호', '이메일', '납부방식', '납부연도', '교사부과회비', 'CMS이체', '직접이체', '환불금액', '교사미납회비', '납부일']);
    const St = readSrc_(src, '학생정보DB', '학생명', ['운영', '구분', '지역1', '지역2', '학원명', '원장명', '학생명', '출생년도', '전공', '시작월', '학생부과회비', '학생납부회비', '학생미납회비', '납부연도', '납부일']);
    const stamp = now_(), by = who.name + ' (원본 불러오기)';
    /* 학원 */
    const acads = [], byName = {};
    const addAcad = (o) => { const id = 'A' + String(acads.length + 1).padStart(4, '0'); o['학원ID'] = id; acads.push(o); byName[normA_(o['학원명'])] = id; return id; };
    A.rows.forEach(r => {
      const name = String(r['학원명'] || '').trim(); if (!name) return;
      const kind = String(r['구분'] || '').trim(), phone = digits_(r['교실대표번호']);
      const notes = [];
      if (kind && ['학원', '클래스'].indexOf(kind) < 0) notes.push('구분 칸이 「' + kind + '」 — 열 밀림 의심');
      if (/[시군구]\s|로\s?\d|길\s?\d|동\s?\d/.test(name) && name.length > 12) notes.push('학원명 칸이 주소처럼 보여요');
      if (r['지역2'] && /@/.test(r['지역2'])) notes.push('지역2 칸에 이메일 — 열 밀림 의심');
      if (byName[normA_(name)]) notes.push('같은 이름 학원이 또 있어요');
      const addr = String(r['주소'] || '').trim();
      addAcad({ '학원명': name, '구분': ['학원', '클래스'].indexOf(kind) >= 0 ? kind : (/클래스$/.test(name) ? '클래스' : '학원'), '상태': /휴|폐/.test(String(r['운영'])) ? '휴원' : '운영',
        '원장교사ID': '', '원장명': String(r['원장명'] || '').trim(), '교실대표번호': phone, '이메일': String(r['이메일'] || '').trim(), '교습과목': String(r['교습과목'] || '').trim(),
        '시도': String(r['지역1'] || '').trim() || addr.split(' ')[0] || '', '시군구': String(r['지역2'] || '').trim() || addr.split(' ')[1] || '', '우편번호': String(r['우편번호'] || '').trim(), '주소': addr, '상세주소': String(r['상세주소'] || '').trim(),
        '개원일': ymd_(r['개원일']), '계약체결일': ymd_(r['계약서작성일']), '확인': notes.length ? '확인 필요' : '확인 전', '확인메모': notes.join(' · '), '메모': '', '원본': '학원정보DB ' + r._row + '행', '수정일': stamp, '수정자': by });
    });
    const acadId = (name, from) => { name = String(name || '').trim(); if (!name) return ''; const k = normA_(name); if (byName[k]) return byName[k];
      return addAcad({ '학원명': name, '구분': /클래스$/.test(name) ? '클래스' : '학원', '상태': '운영', '원장교사ID': '', '원장명': '', '교실대표번호': '', '이메일': '', '교습과목': '', '시도': '', '시군구': '', '우편번호': '', '주소': '', '상세주소': '', '개원일': '', '계약체결일': '',
        '확인': '확인 필요', '확인메모': '학원정보DB 에 없고 ' + from + ' 에만 있는 학원', '메모': '', '원본': from, '수정일': stamp, '수정자': by }); };
    /* 교사 */
    const teachers = [], dues = [];
    Tt.rows.forEach(r => {
      const raw = String(r['교사명'] || '').trim(); if (!raw) return;
      const id = 'T' + String(teachers.length + 1).padStart(4, '0');
      const nm = splitName_(raw);
      const ac = [...new Set([r['학원1'], r['학원2'], r['학원3']].map(x => String(x || '').trim()).filter(Boolean))].map(x => acadId(x, '교사정보DB'));
      const notes = [];
      if (nm.tag) notes.push('이름 끝 구분 글자 「' + nm.tag + '」를 따로 뺐어요');
      if (!digits_(r['전화번호'])) notes.push('휴대전화 없음');
      const onlyName = !r['회비기준'] && !r['전공'] && !r['학원1'] && !r['보유자격증1'];
      if (onlyName) notes.push('이름 말고 다른 칸이 비어 있어요');
      const fee = num_(r['교사부과회비']), unpaid = num_(r['교사미납회비']);
      teachers.push({ '교사ID': id, '이름': nm.name, '구분글자': nm.tag, '원래이름': raw, '휴대전화': digits_(r['전화번호']), '이메일': String(r['이메일'] || '').trim(),
        '학원1': ac[0] || '', '학원2': ac[1] || '', '학원3': ac[2] || '', '직급': String(r['직급'] || '').trim(), '전공': inst_(r['전공']),
        '회원구분': '확인 전', '명단자격': String(r['보유자격증1'] || '').trim(), '명단취득': String(r['자격취득년도'] || '').trim(),
        '회비구분': String(r['회비기준']).trim() === '교수' ? '면제' : '납부', '캠프교수': String(r['캠프기준']).trim() === '교수' ? '예' : '아니오', '내부외부': String(r['내부외부'] || '').trim(),
        '상태': '활동', '확인': onlyName ? '확인 필요' : '확인 전', '확인메모': notes.join(' · '), '메모': '', '원본': '교사정보DB ' + r._row + '행', '수정일': stamp, '수정자': by });
      if (fee || unpaid || r['납부일']) dues.push({ '대상': '교사', 'ID': id, '년도': String(r['납부연도'] || CUR_Y).replace(/\D/g, '').slice(0, 4) || CUR_Y, '부과': fee, '납부': Math.max(0, fee - unpaid), '납부일': ymd_(r['납부일']), '방식': String(r['납부방식'] || '').trim(), '메모': '원본에서', '수정일': stamp, '수정자': by });
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
      const notes = []; if (nm.tag) notes.push('이름의 「' + nm.tag + '」를 따로 뺐어요'); if (!by_.y) notes.push('출생연도 없음'); if (by_.guess) notes.push('출생연도를 나이(' + r['출생년도'] + ')로 계산');
      const ins = inst_(r['전공']); if (r['전공'] && !ins) notes.push('전공 「' + r['전공'] + '」');
      students.push({ '학생ID': id, '학원ID': acadId(r['학원명'], '학생정보DB'), '이름': nm.name, '구분글자': nm.tag, '원래이름': raw, '출생연도': by_.y, '출생연도추정': by_.guess ? '예' : '',
        '전공': ins || String(r['전공'] || '').trim(), '시작월': String(r['시작월'] || '').trim(), '상태': '재원', '담당교사ID': '', '확인': '확인 전', '확인메모': notes.join(' · '), '메모': '', '원본': '학생정보DB ' + r._row + '행', '수정일': stamp, '수정자': by });
      const due = num_(r['학생부과회비']), paid = num_(r['학생납부회비']);
      if (due || paid || r['납부일']) dues.push({ '대상': '학생', 'ID': id, '년도': String(r['납부연도'] || CUR_Y).replace(/\D/g, '').slice(0, 4) || CUR_Y, '부과': due, '납부': paid, '납부일': ymd_(r['납부일']), '방식': '', '메모': '원본에서', '수정일': stamp, '수정자': by });
    });
    /* 쓰기 */
    const put = (name, objs) => { const sh = ensure_(ss, name); if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
      if (objs.length) sh.getRange(2, 1, objs.length, HEAD[name].length).setValues(objs.map(o => HEAD[name].map(k => o[k] == null ? '' : String(o[k])))); };
    put('학원', acads); put('교사', teachers); put('학생', students); put('연회비', dues);
    const msg = '학원 ' + acads.length + '곳 · 교사 ' + teachers.length + '명 · 학생 ' + students.length + '명 · 연회비 ' + dues.length + '줄';
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
  return s;
}
