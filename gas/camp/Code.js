/* build: 20261031-221902 */
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
  '회원의 그외 악기 안하는 동반가족': [410000, 420000, 440000], '동반가족 중 돌전아기': [310000, 320000, 340000],
  /* 비회원(학부모 직접 접수) — 금액은 「캠프 설정」 참가비표에서 정함 (기본값은 회원 금액과 같게 넣어 둠) */
  '비회원 학생': [560000, 570000, 590000], '비회원 보호자': [510000, 520000, 540000], '비회원 동반가족': [410000, 420000, 440000], '비회원 돌전아기': [310000, 320000, 340000],
  /* 관계자 (10-31) — 금액은 「캠프 설정」 참가비표에서 (기본 0원) */
  '초빙교수': [0, 0, 0], '반주자': [0, 0, 0], '지휘자': [0, 0, 0], '통역': [0, 0, 0], '초청강사': [0, 0, 0], '스태프': [0, 0, 0], '기타 관계자': [0, 0, 0],
  /* 해외 단체 (10-31, 영어 화면) — 금액은 「캠프 설정」 참가비표에서, 연회비 없음 */
  '해외 학생': [0, 0, 0], '해외 교사': [0, 0, 0], '해외 보호자': [0, 0, 0], '해외 동반가족': [0, 0, 0], '해외 돌전아기': [0, 0, 0]   /* 해외 줄은 USD (opt.usdRate 로 원화 청구액 계산) */
};
const ROUND_NAMES = ['1차', '2차', '3차'];
const OPT = { lessonFee: 60000, lessonMax: 5, studentDues: 30000, teacherDues: 300000, roomCap: 4, roomEmptyFee: 130000 };
const PLAYS = ['교사', '연수생', '소속없는 중급연수생', '학생', '회원의 악기하는 자녀', '비회원 학생', '해외 학생', '해외 교사'];
const MASTER = [{ n: '안드레아 부샤츠', fee: 150000 }, { n: '이성주', fee: 150000 }];
/* 교수진: 「교수진」 시트에서 관리 (처음 한 번만 아래 목록으로 채움) */
const PROF_SEED = {
  '바이올린':['곽은수','김소정','김유정','김한기','민연희','변지혜','서민정','신재원','양승돈','오영근','이광호','이슬비','정호진','황경익','황선영','Ayumi Moriyama','Jeffrey Solares','Motomichi Kisohara','Sara M. Gonzales'],
  '첼로':['김현실','이숙정','황선경']};
const PROF_HEAD = ['이름', '악기', '레슨', '마스터클래스', '시간(분)', '마스터클래스 금액', '소속', '사용', '메모', '레슨실'];
const PROF_INST = ['바이올린', '첼로', '플루트', '비올라', '피아노', '기타'];
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
    min: +r['시간(분)'] || 0, fee: +String(r['마스터클래스 금액'] || 0).replace(/[^\d]/g, '') || 0, org: String(r['소속'] || ''), on: String(r['사용'] || '예').trim() === '' || yes_(r['사용']), memo: String(r['메모'] || ''), room: String(r['레슨실'] || '') }));
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
  ['공유주소', 'https://redica1.github.io/suzuki/camp/', '카카오톡 안에서 열었을 때 바깥 브라우저로 넘길 주소'],
  ['회원관리 시트', '', '회원관리 DB 시트 ID 또는 주소 — 선생님 로그인(이메일 · 비밀번호)을 회원관리 계정으로 확인. 비우면 이름 + 휴대전화'],
  ['로그인 방식', '둘 다', '「둘 다」 = 이메일 · 비밀번호 + (회원 가입 전 선생님은) 이름 + 휴대전화 / 「회원관리 계정」 = 이메일 · 비밀번호만 / 「이름+휴대전화」 = 예전 방식'],
  ['회원관리 주소', 'https://redica1.github.io/suzuki/member/', '선생님 가입 · 비밀번호 찾기 안내에 쓰는 회원관리 주소 (STG 는 끝에 ?test)'],
  ['회원 명단 파일', '', '회원관리가 만드는 「행사용 명단」 파일 ID 또는 주소. 넣으면 명단_교사 · 명단_학생을 그 파일로 5분마다 맞춤 (비우면 지금처럼 이 시트의 명단 그대로)'],
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
  const admin = e && e.parameter && e.parameter.page === 'admin';
  let page, cname = CAMP_NAME, cj = '';
  try { const c = campPublic_(); cname = c.base.name; cj = JSON.stringify(c); } catch (x) {}
  const intl = e && e.parameter && e.parameter.page === 'intl';
  if (admin) page = HtmlService.createHtmlOutputFromFile('Admin');
  else if (intl) page = HtmlService.createHtmlOutputFromFile('Intl');
  else { const t = HtmlService.createTemplateFromFile('Index'); let share = ''; let tl = ''; try { ensureSettings_(); share = setting_('공유주소'); tl = setting_('테스트 로그인'); } catch (x) {} t.shareUrl = share; t.testLogin = tl; t.campJson = cj; try { t.loginPw = { pw: '1', both: '2' }[loginMode_()] || ''; t.memberUrl = setting_('회원관리 주소'); } catch (x) { t.loginPw = ''; t.memberUrl = ''; } /* 테스트 로그인: STG 「설정」에만 (이름/휴대전화) — 로그인 칸을 미리 채움 · campJson: 「캠프설정」 시트 값 (날짜·장소·차수·참가비) */ page = t.evaluate(); }
  return page
    .setTitle(intl ? 'Suzuki Winter Music Camp · Overseas Registration' : cname + (admin ? ' 접수 관리' : ' 접수'))
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
    paidDate: dstr_(r['회비 납부일']), dueAmt: +r['연회비'] || 0, state: String(r['상태'] || '승인'), kind: String(r['회원구분'] || '')
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
  if (pwMode_()) return { ok: false, msg: '이메일 · 비밀번호로 로그인해 주세요. 화면을 새로 고쳐 주세요.' };
  const ph = String(phone || '').replace(/\D/g, '');
  const nm = bare_(name);
  if (!nm || ph.length < 10) return { ok: false, msg: '이름과 휴대전화를 모두 넣어 주세요.' };
  const t = teachers_().find(x => bare_(x.name) === nm && x.p4 && ph.endsWith(x.p4));
  if (!t) return { ok: false, msg: '회원 명단의 이름·휴대전화와 맞지 않아요.' };
  return loginT_(t, consent);
}
/* ---------------- 관계자 (10-31) ----------------
 * 회원관리 「외부인」(X0001) 계정 = 관계자: 학원 「관계자」로만 접수, 본인 참가 구분 = 역할(초빙교수 · 반주자 …, 참가비는 캠프 설정 참가비표), 가족은 회원 가족 참가비, 연회비 없음.
 * 운영진은 관리자 화면 「접수 · 입금 확인 › 관계자」에서 대신 등록(staffAdd). 초빙교수는 「교수진」 탭에 자동으로 들어감(staffProfs_). */
const STAFF_ACAD = '관계자';
const STAFF_TYPES = ['초빙교수', '반주자', '지휘자', '통역', '초청강사', '스태프', '기타 관계자'];
const STAFF_FAM = ['회원의 첫번째 보호자', '회원의 그외 악기 안하는 동반가족', '동반가족 중 돌전아기'];
const isStaffT_ = t => t && t.kind === '외부인';
function staffOk_(t, staff) {
  if (staff && !isStaffT_(t)) throw new Error('관계자(외부인) 계정이 아니에요. 회원 선생님은 처음 화면에서 「회원 선생님」을 골라 주세요.');
}
/* ---------------- 해외 단체 (10-31) ----------------
 * 해외 단체(예: 필리핀) = 대표 한 명이 영어 화면(?page=intl)에서 단체 사람을 모두 접수. 운영진이 관리자 「접수 · 입금 확인 › 해외」에서 단체를 만들고
 * 접속 코드를 대표 이메일로 보냄 → 대표는 이메일 + 코드로 로그인. 단체 하나 = 접수 하나(학원 「해외 · 단체이름」, sb.intl = true).
 * 참가 구분 = 해외 학생 · 해외 교사 · 해외 보호자 · 해외 동반가족 · 해외 돌전아기 (캠프 설정 참가비표), 연회비 없음. 송금은 단체가 한꺼번에 → 대표가 송금 신고(intlRep),
 * 운영진이 받은 금액으로 사람마다 입금 확인(기존 일괄 확인). */
const INTL_SH = '해외단체', INTL_HEAD = ['단체ID', '단체', '나라', '대표', '이메일', '접속코드', '만든날', '사용', '메모'];
const INTL_TYPES = ['해외 학생', '해외 교사', '해외 보호자', '해외 동반가족', '해외 돌전아기'];
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
function loginT_(t, consent) {
  if (t.state === '대기') return { ok: false, msg: '승인 대기 중이에요. 협회가 확인하면 이메일로 알려 드려요.' };
  if (isStaffT_(t) && camp_().base.staff === false) return { ok: false, msg: '지금은 관계자 접수를 받지 않아요. 협회에 연락하면 운영진이 대신 접수해 드려요.' };
  if (!isStaffT_(t) && camp_().base.member === false) return { ok: false, msg: '이 행사는 회원 접수를 받지 않아요.' };
  { const ce = consentErr_(consent); if (ce) return { ok: false, msg: ce }; }
  if (isStaffT_(t)) {
    consentLog_('관계자', t.name, t.p4, consent);
    const token = Utilities.getUuid(), acads = [STAFF_ACAD];
    CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ name: t.name, acads, staff: true }), 21600);
    log_(t.name, '관계자 로그인', '');
    return Object.assign({ ok: true, token, today: today_(), teacher: { id: t.id, name: t.name, role: '관계자', inst: t.inst, acads, home: acads, p4: t.p4, staff: true }, myAcct: myAcct_(t.name) }, bundle_(acads, t.name));
  }
  consentLog_('회원(교사)', t.name, t.p4, consent);
  try { ensureSettings_(); } catch (x) {}
  const open = acadOpen_();
  const own = [...new Set(loadSubs_().filter(x => x.owner === t.name).map(x => x.acad))];
  const acads = [...new Set(t.acads.concat(own))].filter(a => !open || open.includes(a));
  if (!acads.length) return { ok: false, msg: '지금은 ' + open.join(', ') + '만 접수할 수 있어요.' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ name: t.name, acads }), 21600);
  log_(t.name, '로그인', '');
  return Object.assign({ ok: true, token, today: today_(), teacher: { id: t.id, name: t.name, role: t.role, inst: t.inst, acads, home: t.acads, p4: t.p4 }, myAcct: myAcct_(t.name) }, bundle_(acads, t.name));
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
function who_(token) {
  const v = CacheService.getScriptCache().get('tok_' + token);
  if (!v) throw new Error('로그인이 끝났어요. 화면을 새로 고쳐 다시 로그인해 주세요.');
  return JSON.parse(v);
}

/** 화면에 필요한 것: 학원 명단, 그 학원 접수 전부(다른 선생님 것 포함 — 중복 접수 막기용), 앙상블 팀 */
function bundle_(acads, owner) {
  const profs = (() => { try { return profPublic_(); } catch (x) { return null; } })();
  const ts = teachers_();
  const st = rows_(SH.S);
  const rosters = {};
  acads.forEach(a => {
    if (a === STAFF_ACAD) { rosters[a] = { teachers: [], students: [] }; return; }   /* 관계자: 본인은 화면이 넣음 */
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
  return { rosters, subs: all.filter(sb => acads.includes(sb.acad) && ((sb.acad !== GUEST_ACAD && sb.acad !== STAFF_ACAD) || sb.owner === owner)), teams: teams_(all), bank: bankInfo_(), today: today_(), profs, camp };
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

function writeSub_(sb, isNew) { writeSubRow_(sb, isNew); writePeople_(sb); try { staffProfs_(sb); } catch (e) { Logger.log('교수진 자동 추가: ' + e.message); } }
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
  const CC = camp_(), FEES = CC.fees, OPT = CC.opt;
  const f = sb.form || {}, info = f.info || {}, ri = Math.max(0, Math.min(CC.rounds.length - 1, +f.ri || 0));
  sb.round = CC.rounds[ri].n;
  const guest = sb.acad === GUEST_ACAD;   // 비회원: 연회비 없음 · 비회원 참가비
  const staff = sb.acad === STAFF_ACAD;
  const intl = !!sb.intl;   // 해외 단체: 연회비 없음 · 해외 참가비   // 관계자: 연회비 없음 · 본인은 역할 참가비 · 가족은 회원 가족 참가비
  const tPaid = {}; teachers_().forEach(t => tPaid['t_' + t.id] = !!t.paidDate);
  const sPaid = {}; rows_(SH.S).forEach(r => sPaid[String(r['ID'])] = !!dstr_(r['회비 납부일']));
  const viaCamp = duesViaCamp_();   /* 이 캠프에서 받은 연회비는 회원관리에 납부로 남아도 그대로 청구 (10-31) */
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
    if (p.status !== '취소' && plays && i.concert === '이브닝' && !/^https?:\S{6,}$/i.test(String(i.video || '').trim())) throw new Error(p.name + ': 이브닝 음악회는 오디션 영상 주소(https…)를 넣어 주세요.');
    const isT = /^t_|^me_/.test(k), isFam = (f.fam || []).some(x => x.id === k);
    const paid = viaCamp[p.id] ? false : guest || staff || intl ? true : isFam ? true : isT ? (k.indexOf('me_') === 0 ? true : !!tPaid[k]) : !!sPaid[k];
    p.type = i.type; p.fee = FEES[i.type][ri];
    if (intl) { p.usd = +FEES[i.type][ri] || 0; p.fee = Math.round(p.usd * (+OPT.usdRate || 1450)); }   /* 해외: 참가비표 값 = USD, 원화 청구액 = USD × 환율 */ p.lesson = les * OPT.lessonFee + mc;
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
    if (sb.reqId) { const done = all.find(x => x.reqId === sb.reqId); if (done) { lock.releaseLock(); return Object.assign({ ok: true, no: done.no, again: true }, bundle_(u.acads, u.name)); } }
    // 같은 학원 다른 접수에 이미 있는 사람은 다시 못 넣음
    const key = id => id.slice(id.indexOf('_') + 1);
    const taken = {};
    all.filter(x => x.acad === sb.acad).forEach(x => x.ppl.filter(p => p.status === '정상').forEach(p => taken[key(p.id)] = x.no));
    const dup = sb.ppl.filter(p => p.kind !== '가족' && taken[key(p.id)]);
    if (dup.length) throw new Error(`${dup.map(p => p.name).join(', ')}은(는) 이미 ${taken[key(dup[0].id)]}에 접수돼 있어요. 「내 접수」에서 확인해 주세요.`);
    const n = all.reduce((m, x) => Math.max(m, +String(x.no).split('-')[1] || 0), 0) + 1;
    const no = camp_().base.id + '-' + String(n).padStart(3, '0');
    const tmp = sb.no;
    sb.no = no; sb.owner = u.name; sb.createdAt = stamp_();
    if (u.guest) sb.contact = String(u.phone || '').replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');   // 비회원 보호자 연락처 (관리자 화면 · 시트에만)
    sb.ppl.forEach(p => { p.id = no + p.id.slice(tmp.length); p.pay = '전'; p.paidAmt = 0; delete p.rep; });
    sb.rev = 1; recalc_(sb); checkEns_(sb, all);
    teacherDup_(all, sb);
    writeSub_(sb, true);
    all.push(sb); writeTeams_(all);
    log_(u.name, '새 접수', no + ' · ' + sb.ppl.length + '명');
    mail_(sb, u);
  } finally { lock.releaseLock(); }
  return Object.assign({ ok: true, no: sb.no }, bundle_(u.acads, u.name));
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
      if (cur.owner !== u.name) throw new Error(sb.no + '는 ' + cur.owner + ' 선생님이 낸 접수라 고칠 수 없어요.');
      sb.acad = cur.acad; sb.owner = cur.owner; if (cur.contact) sb.contact = cur.contact; else delete sb.contact; sb.createdAt = cur.createdAt; sb.no = cur.no; sb.reqId = cur.reqId; sb.rev = (+cur.rev || 0) + 1;
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
  return Object.assign({ ok: true }, bundle_(u.acads, u.name));
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
const FEE_TYPES = ['교사', '연수생', '소속없는 중급연수생', '학생', '회원의 악기하는 자녀', '회원의 첫번째 보호자', '회원의 그외 악기 안하는 동반가족', '동반가족 중 돌전아기', '비회원 학생', '비회원 보호자', '비회원 동반가족', '비회원 돌전아기',
  '초빙교수', '반주자', '지휘자', '통역', '초청강사', '스태프', '기타 관계자',
  '해외 학생', '해외 교사', '해외 보호자', '해외 동반가족', '해외 돌전아기'];
const CAMP_DEF = {
  base: { id: CAMP_ID, name: CAMP_NAME, start: '2027-01-11', end: '2027-01-15', place: '추후 안내', open: '2026-12-01', close: '2026-12-28', cur: 'auto', guest: true, staff: true, member: true, intl: true },
  rounds: [{ n: '1차', from: '2026-12-01', to: '2026-12-10' }, { n: '2차', from: '2026-12-11', to: '2026-12-20' }, { n: '3차', from: '2026-12-21', to: '2026-12-28' }],
  fees: FEES,
  opt: { lessonFee: OPT.lessonFee, lessonMax: OPT.lessonMax, mcFee: 150000, studentDues: OPT.studentDues, teacherDues: OPT.teacherDues, roomCap: OPT.roomCap, roomEmptyFee: OPT.roomEmptyFee, usdRate: 1450 },
  refund: { rules: [{ until: '2026-12-10', label: '접수 마감 전', rate: 100, doc: false }, { until: '2026-12-28', label: '캠프 14일 전까지', rate: 50, doc: false }, { until: '2027-01-10', label: '캠프 전날까지', rate: 0, doc: true }],
    after: { label: '캠프 시작 후', rate: 0, doc: true, allow: false }, duesRefund: false },
  /* 식사 시간: 교사 일정 모든 날짜에 식사 줄로 들어감 · first/last = 첫날 · 마지막 날에도 넣을지 */
  meals: [{ k: '아침', t: 'Breakfast 아침 식사', s: '07:20', e: '08:50', on: true, first: false, last: true },
    { k: '점심', t: 'Lunch 점심 식사', s: '11:30', e: '13:20', on: true, first: false, last: true },
    { k: '저녁', t: 'Dinner 저녁 식사', s: '17:30', e: '19:20', on: true, first: true, last: false }],
  consent: { ver: '2026-10-24', items: [
    { id: 'collect', title: '개인정보 수집·이용 동의', req: true, on: true, body: '수집 항목\n- 접수하는 분: 이름, 휴대전화, 이메일\n- 참가자: 이름, 성별, 출생연도, 악기·현재 진도, 담당 선생님, 레슨·음악회·가족방 신청 내용\n- 입금·환불: 입금자명, 입금일, 금액, 환불 받을 계좌(은행·계좌번호·예금주)\n\n이용 목적\n캠프 접수 확인, 반·레슨·숙소 배정, 일정 안내와 연락, 참가비 입금 확인과 환불\n\n보유 기간\n캠프가 끝나고 1년 동안 보관한 뒤 지워요. 회계 기록은 관련 법령이 정한 기간만큼 보관해요.\n\n동의하지 않을 수 있지만, 동의하지 않으면 캠프 접수를 할 수 없어요.' },
    { id: 'third', title: '개인정보 제3자 제공 동의', req: true, on: true, body: '제공받는 곳: 캠프 숙소(리조트)\n제공 항목: 참가자 이름, 성별, 학원(소속)\n제공 목적: 객실 배정과 투숙 관리\n보유 기간: 캠프가 끝나면 숙소의 방침에 따라 지워요.\n\n동의하지 않을 수 있지만, 동의하지 않으면 숙소 배정이 필요한 캠프 접수를 할 수 없어요.' },
    { id: 'minor', title: '만 14세 미만 참가자 보호자 동의', req: true, on: true, body: '만 14세 미만 참가자의 개인정보는 법정대리인(보호자)의 동의를 받아야 해요.\n- 선생님이 접수할 때: 접수하는 만 14세 미만 학생의 보호자에게 위 수집·이용, 제3자 제공 내용을 알리고 동의를 받았어요.\n- 보호자가 직접 접수할 때: 나는 접수하는 만 14세 미만 참가자의 법정대리인(보호자)이며 위 내용에 동의해요.' },
    { id: 'refund', title: '취소·환불 규정 확인', req: true, on: true, body: '' },
    { id: 'photo', title: '사진·영상 촬영과 홍보 활용 동의 (선택)', req: false, on: true, body: '캠프 중 찍은 사진·영상(참가자 모습 포함)을 협회 홈페이지, SNS, 소식지 같은 홍보에 쓸 수 있어요.\n보유 기간: 게시물을 내려 달라고 요청할 때까지\n\n동의하지 않아도 접수할 수 있어요. 동의하지 않으면 홍보물에 쓰지 않아요.' }
  ] },
};
const CAMP_KEYS = [['base', '기본'], ['rounds', '차수'], ['fees', '참가비'], ['opt', '옵션'], ['refund', '환불'], ['consent', '동의'], ['meals', '식사']];
let CAMP_CACHE = null;
function camp_() {
  if (CAMP_CACHE) return CAMP_CACHE;
  const c = JSON.parse(JSON.stringify(CAMP_DEF)); c.rev = 0;
  rows_(CAMPCFG).forEach(r => {
    const k = (CAMP_KEYS.find(x => x[1] === String(r['항목'])) || [])[0], v = String(r['값'] || '');
    if (String(r['항목']) === 'rev') { c.rev = +v || 0; return; }
    if (!k || !v) return;
    try { const o = JSON.parse(v); c[k] = Array.isArray(o) ? o : Object.assign(c[k], o); } catch (x) {}
  });
  /* 참가비표 칸 수 = 차수 수 (새로 생긴 참가자격·차수는 마지막 금액으로 채움) */
  FEE_TYPES.forEach(t => { const a = (c.fees[t] || []).slice(0, c.rounds.length); while (a.length < c.rounds.length) a.push(a.length ? a[a.length - 1] : 0); c.fees[t] = a; });
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
function campPublic_() { const c = camp_(); return Object.assign({}, c, { ri: curRound_(c) }); }
function campGet(token) { const a = adm_(token); needSup_(a); return { camp: campPublic_(), subs: rows_(SH.SUB).filter(r => r['접수번호']).length }; }
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
  const rf = c.refund || {}, rules = (rf.rules || []).map(r => ({ until: String(r.until || ''), label: String(r.label || '').trim(), rate: Math.max(0, Math.min(100, Math.round(+r.rate || 0))), doc: !!r.doc }));
  rules.forEach((r, i) => { if (!ok.test(r.until) || !r.label) throw new Error((i + 1) + '번째 환불 규정의 날짜·이름을 확인해 주세요.'); if (i && r.until <= rules[i - 1].until) throw new Error('환불 규정은 날짜 순서대로 적어 주세요.'); });
  const af = rf.after || {}, refund = { rules, after: { label: String(af.label || '캠프 시작 후'), rate: Math.max(0, Math.min(100, Math.round(+af.rate || 0))), doc: !!af.doc, allow: !!af.allow }, duesRefund: !!rf.duesRefund };
  const cur = b.cur === 'auto' || b.cur === '' || b.cur == null ? 'auto' : String(Math.max(0, Math.min(rounds.length - 1, +b.cur || 0)));
  const oc = (c.consent && c.consent.items) || [], dc = CAMP_DEF.consent.items;
  const consent = { ver: today_(), items: dc.map(d => { const x = oc.find(y => y.id === d.id) || d; const fixed = d.id === 'collect';
    return { id: d.id, title: String(x.title || d.title).trim().slice(0, 60) || d.title, req: fixed ? true : !!x.req, on: fixed ? true : !!x.on, body: String(x.body == null ? d.body : x.body).slice(0, 4000) }; }) };
  { const old = camp_().consent; if (JSON.stringify(old.items) === JSON.stringify(consent.items)) consent.ver = old.ver; }
  const meals = (Array.isArray(c.meals) ? c.meals : []).slice(0, 6).map(m => ({ k: String(m.k || '').trim().slice(0, 10), t: String(m.t || '').trim().slice(0, 120), s: String(m.s || ''), e: String(m.e || ''), on: m.on !== false, first: !!m.first, last: !!m.last }));
  meals.forEach((m, i) => { if (!m.k) throw new Error((i + 1) + '번째 식사 이름을 적어 주세요.'); if (!/^\d{2}:\d{2}$/.test(m.s) || !/^\d{2}:\d{2}$/.test(m.e) || m.e <= m.s) throw new Error(m.k + ' 시간을 07:20 ~ 08:50 꼴로 확인해 주세요.'); if (!m.t) m.t = m.k + ' 식사'; });
  const nc = { meals, base: { id: String(b.id).trim(), name: String(b.name).trim(), start: b.start, end: b.end, place: String(b.place || '').trim(), open: b.open, close: b.close, cur, guest: b.guest !== false, staff: b.staff !== false, member: b.member !== false, intl: b.intl !== false }, rounds, fees, opt, refund, consent };
  const lock = lock_();
  try {
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(CAMPCFG);
    if (!sh) { sh = ss.insertSheet(CAMPCFG); sh.getRange(1, 1, 1, 3).setValues([['항목', '값', '설명']]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('B:B').setNumberFormat('@'); }
    CAMP_CACHE = null; const old = camp_();
    if ((+rev || 0) !== (old.rev || 0)) throw new Error('다른 분이 먼저 캠프 설정을 바꿨어요. 새로 고친 뒤 다시 해 주세요.');
    const desc = { base: '캠프 코드 · 이름 · 날짜 · 장소 · 접수 기간 · 비회원 접수', rounds: '차수 이름과 기간', fees: '참가자격 × 차수 참가비', opt: '추가 레슨 · 마스터클래스 · 회비 · 가족방', refund: '취소·환불 규정', meals: '식사 시간 (교사 일정 모든 날짜의 식사 줄)', consent: '개인정보 동의 문구 (바꾸면 버전 날짜가 바뀜)' };
    const vals = CAMP_KEYS.map(k => [k[1], JSON.stringify(nc[k[0]]), desc[k[0]]]).concat([['rev', String((old.rev || 0) + 1), '바꾼 횟수 (건드리지 마세요)']]);
    sh.getRange(2, 1, Math.max(sh.getLastRow(), vals.length + 1), 3).clearContent();
    sh.getRange(2, 1, vals.length, 3).setValues(vals);
    CAMP_CACHE = null;
    if (JSON.stringify(old.meals || []) !== JSON.stringify(meals) || c.mealsApply) nc.mealsDays = mealsApply_(meals);
    log_(a.name, '캠프 설정 저장', nc.base.id + ' · ' + nc.base.start + '~' + nc.base.end);
  } finally { lock.releaseLock(); }
  return { ok: true, camp: campPublic_(), mealsDays: nc.mealsDays };
}
/** 캠프 설정의 식사 시간 → 교사 일정(일정설정 meals) 모든 날짜에 다시 넣기
 *  예전 식사 줄(표시 k가 있거나 아침·점심·저녁 / Breakfast·Lunch·Dinner 글이 든 줄)은 바꾸고, 그 밖의 줄(간식 등)은 그대로 둠 → 바꾼 날짜 수 */
const MEAL_RX = /아침|점심|저녁|breakfast|lunch|dinner/i;
function mealGen_(meals, n) { const L = []; for (let d = 0; d < n; d++) (meals || []).forEach(m => { if (m.on === false) return; if (d === 0 && !m.first && n > 1) return; if (d === n - 1 && !m.last && n > 1) return; L.push({ d, s: m.s, e: m.e, t: m.t, k: m.k }); }); return L; }
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
function scholTiers_() { try { const v = JSON.parse(setting_('장학금 기준') || '[]'); return Array.isArray(v) ? v.filter(x => +x[0] > 0).map(x => [+x[0], +x[1] || 0]).sort((a, b) => b[0] - a[0]) : []; } catch (x) { return []; } }
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
/** 오케스트라 파트 역할 (지휘 · 악장 · Vln 1 …) — 이 역할이 들어간 공연은 「오케 명단」에 나옴 */
const ORCH_PARTS = ['지휘', '악장', 'Vln 1', 'Vln 2', 'Vla', 'Vc', 'D.B', '악보계'];
const isPart_ = r => /^(악장|vln?\s*\d|vn\s*\d|vla|va|vc|d\.?\s*b|cb|fl\s*\d?)$/i.test(String(r || '').trim());
/** 프로그램표 만들기 (미리보기 · 구글 시트 공통) → 날짜별 칸 값 V · 칸 색 F · 식사 줄 · 참가교사 · 오케 명단 */
function progBuild_() {
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
    const W = Math.max(2, rooms.length + 1), V = [], F = [];
    const HH = pvHide_(c), dt = dayDate(d), note = HH.f.has('note') ? '' : (c.dayNotes || [])[d] || '';
    V.push([note].concat(Array(W - 1).fill(''))); F.push(Array(W).fill(null));
    V.push([dt ? `${dt.getMonth() + 1}월 ${dt.getDate()}일 스케쥴     ${MON_EN[dt.getMonth()]} ${ord_(dt.getDate())} ${WD_EN[dt.getDay()]} Schedule` : dl + ' 스케쥴'].concat(Array(W - 1).fill(''))); F.push(Array(W).fill(null));
    V.push([''].concat(rooms.map(r => r[0]), Array(W - 1 - rooms.length).fill(''))); F.push(Array(W).fill('#e8eef0'));
    V.push([''].concat(rooms.map(r => r[1] || ''), Array(W - 1 - rooms.length).fill(''))); F.push(Array(W).fill('#e8eef0'));
    const meals = [];
    starts.forEach(t => {
      M.filter(m => m.s === t).forEach(m => { meals.push(V.length); V.push([m.s + '-' + m.e, m.t].concat(Array(W - 2).fill(''))); F.push(Array(W).fill('#f1f1f1')); });
      const here = E.filter(e => e.s === t); if (!here.length) return;
      const endMain = here.map(e => e.e).sort()[0];
      const row = [t + '-' + endMain], col = [null];
      rooms.forEach(r => { const xs = here.filter(e => e.room === r[0]); row.push(xs.map(e => (e.e !== endMain ? e.s + '-' + e.e + '\n' : '') + progCell_(e, c, nameOf)).join('\n\n')); col.push(xs.length ? ({ 공연: '#fdf3e1', 레슨: '#e9f4f5', 업무: '#f3f3f3' })[xs[0].cat] : null); });
      while (row.length < W) { row.push(''); col.push(null); }
      V.push(row); F.push(col);
    });
    out.push({ name: tabName(dl + ' 프로그램'), label: dl, V, F, meals, W });
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
  const HT = pvHide_(c).t;
  return { title: C.base.name, days: out, teachers: HT.has('t') ? null : teachers, orch: HT.has('o') ? null : orch, concerts: HT.has('c') ? [] : progConcerts_(c, C, evs, nameOf, dayDate), hide: c.pvHide || { f: [], r: [], t: [] }, roleSets: Object.assign({}, ACT_ROLESETS, c.roleSets || {}), used: [...new Set(evs.flatMap(e => e.ppl.map(p => e.cat + ':' + p.r)))] };
}
/** 음악회 프로그램 (오후음악회 · 이브닝 …): 「오후음악회」 탭의 연주 순서 그대로 · 같은 곡이 이어지면 한 번호로 묶고 학원별로 이름을 모음
 *  곡 이름: 목록 곡 「V01-14 미뉴에트 2번 (바흐)」 → 「바흐 미뉴에트 2번」, 직접 입력은 작곡가 + 곡명 · 영어 곡명은 설정 songEn(관리자가 미리보기에서 입력) */
const INST_PF = { 바이올린: 'Vln.', 첼로: 'Vc.', 플루트: 'Fl.', 비올라: 'Vla.', 피아노: 'Pf.' };
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
    const items = []; L.forEach(s => { const ko = songKo_(s.i) || '(곡 미정)'; let it = items[items.length - 1]; if (!it || it.ko !== ko) items.push(it = { ko, en: EN[ko] || '', P: [] }); it.P.push({ n: s.p.name, a: s.sb.acad, ins: s.p.inst || s.i.inst || '' }); });
    const rows = [{ k: 'f', v: ['', C.base.name] }, { k: 't', v: ['', x.name] }];
    rows.push({ k: 'm', v: ['', '일시: ' + (dt ? `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일(${WD[dt.getDay()]}) ` : (c.days || [])[x.d] + ' ') + ampm(x.cs)] });
    rows.push({ k: 'm', v: ['', '장소: ' + (x.room || '') + (room && room[1] ? ' (' + room[1] + ')' : '')] });
    if (mc.length) rows.push({ k: 'm', v: ['', '사회 및 진행: ' + mc.join(', ') + ' 선생님'] });
    rows.push({ k: 'b', v: [''] });
    items.forEach((it, n) => {
      const G = []; it.P.forEach(p => { let g = G[G.length - 1]; if (!g || g.a !== p.a || g.ins !== p.ins) G.push(g = { a: p.a, ins: p.ins, N: [] }); g.N.push(p.n); });
      const lines = G.map((g, k) => (k === 0 || g.ins !== G[k - 1].ins ? (INST_PF[g.ins] || '') : '') + g.N.join(',') + (g.a ? '(' + g.a + ')' : ''));
      const left = [it.ko, it.en];
      for (let k = 0; k < Math.max(2, lines.length); k++) rows.push({ k: k === 0 ? 'i' : 'j', v: [k === 0 ? (n + 1) + '.' : '', left[k] || '', lines[k] || ''] });
      rows.push({ k: 'b', v: [''] });
    });
    if (!items.length) rows.push({ k: 'j', v: ['', '(연주 순서가 아직 없어요 · 오후음악회 탭에서 순서를 정하면 나와요)', ''] });
    return { id: x.id, name: x.name, rows, songs: items.map(it => it.ko) };
  });
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
const ADMIN_TABS = [['home', '한눈에'], ['subs', '접수 · 입금 확인'], ['rp', '입금 신고'], ['cx', '취소 · 환불'], ['ens', '앙상블'], ['prof', '교수진'], ['act', '교사 일정'], ['tt', '개인레슨'], ['room', '방 배정'], ['con', '오후음악회'], ['stat', '통계'], ['q', '오류·건의'], ['schol', '장학금'], ['mem', '회원 명단'], ['bplan', '예산 계획'], ['bset', '결산']];
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
    return [t['교사ID'], t['이름'], t['직급'] || '강사', t['전공'] || '', String(t['휴대전화'] || '').replace(/\D/g, '').slice(-4), ['학원1', '학원2', '학원3'].map(k => an[t[k]] || '').filter(Boolean).join(', '), paid, +t['올해부과'] || 0, '승인', t['회원구분'] || ''];
  });
  const S = get('학생').filter(s => s['학생ID'] && s['학원명'] && s['상태'] !== '퇴원').map(s => {
    const ok = s['자격상태'] === '유효' || s['자격상태'] === '시작 전', wait = !ok && s['회비확인대기'] === '예';   /* 확인 대기 = 회원처럼 접수 (10-31) */
    return [s['학생ID'], s['학생ID'], s['이름'], s['구분글자'] || '', s['학원명'], s['전공'] || '', s['출생연도'] || '', s['담당교사명'] || '', ok ? (s['올해납부일'] || (s['자격시작'] ? s['자격시작'] + '-01' : '납부')) : wait ? '확인 중' : ''];
  });
  const ss = SpreadsheetApp.getActive();
  const put = (name, head, rows) => {
    let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
    if (!P.getProperty('memberBackup_' + name) && sh.getLastRow() > 1) { const b = sh.copyTo(ss); b.setName(name + '_이전(' + Utilities.formatDate(new Date(), TZ, 'MMdd') + ')'); P.setProperty('memberBackup_' + name, b.getName()); }
    sh.clearContents(); const data = [head].concat(rows); sh.getRange(1, 1, data.length, head.length).setNumberFormat('@').setValues(data); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  };
  const lock = lock_();
  try {
    put(SH.T, ['ID', '이름', '직급', '악기', '휴대전화 뒤 4자리', '소속 학원', '회비 납부일', '연회비', '상태', '회원구분'], T);
    put(SH.S, ['ID', '고유번호', '이름', '구분 표시', '학원', '악기', '출생연도', '담당 교사', '회비 납부일'], S);
  } finally { lock.releaseLock(); }
  P.setProperty('memberStamp', stamp); P.setProperty('memberSyncAt', stamp_());
  log_('회원관리 연동', '명단 맞춤', '교사 ' + T.length + ' · 학생 ' + S.length + ' · 회원관리 ' + stamp);
  return { ok: true, at: stamp, t: T.length, s: S.length };
}
function memberSyncTick() { try { memberSync_(false); } catch (e) { Logger.log('회원관리 연동: ' + e.message); } try { memberReport_(); } catch (e) { Logger.log('회원관리 보고: ' + e.message); } }
/** 관리자(총관리자): 지금 불러오기 + 5분마다 자동 켜기 */
function memberSyncNow(token) {
  const a = adm_(token); needSup_(a);
  try { if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'memberSyncTick')) ScriptApp.newTrigger('memberSyncTick').timeBased().everyMinutes(5).create(); } catch (e) { }
  const r = memberSync_(true); if (r.skip) throw new Error(r.msg);
  try { r.report = memberReport_(); } catch (e) { r.report = { err: e.message }; }
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
/** 관리자 화면에 필요한 것: 모든 접수 · 운영진 칸 · 환불 요청 · 앙상블 팀 */
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
  const a = adm_(token); need_(a, ['subs', 'rp']);
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
    touched.forEach(sb => writeSub_(sb, false));
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
  const L = (list || []).map(p => ({ name: t(p.name, 40), inst: t(p.inst, 20), lesson: !!p.lesson, mc: !!p.mc, min: Math.max(0, Math.min(240, +p.min || 0)), fee: Math.max(0, Math.min(5000000, +String(p.fee || 0).replace(/[^\d]/g, '') || 0)), org: t(p.org, 40), on: p.on !== false, memo: t(p.memo, 200), room: t(p.room, 30) })).filter(p => p.name);
  const seen = {};
  L.forEach(p => {
    if (!PROF_INST.includes(p.inst)) throw new Error(p.name + ': 악기를 골라 주세요.');
    const k = p.name + '|' + p.inst; if (seen[k]) throw new Error(p.name + '(' + p.inst + ')이(가) 두 번 있어요.'); seen[k] = 1;
    if (p.mc && !p.fee) throw new Error(p.name + ': 마스터클래스 금액을 넣어 주세요.');
    if (!p.lesson && !p.mc) throw new Error(p.name + ': 레슨이나 마스터클래스 중 하나는 골라 주세요.');
  });
  const lock = lock_();
  try {
    const sh = profSheet_(); const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, PROF_HEAD.length).clearContent();
    if (L.length) sh.getRange(2, 1, L.length, PROF_HEAD.length).setValues(L.map(p => [p.name, p.inst, p.lesson ? '예' : '아니오', p.mc ? '예' : '아니오', p.mc ? (p.min || '') : '', p.mc ? p.fee : '', p.org, p.on ? '예' : '아니오', p.memo, p.room]));
    PROF_CACHE = null;
    log_('관리자 ' + a.name, '교수진 저장', L.length + '명');
  } finally { lock.releaseLock(); }
  return adminData(token);
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
const ACT_STAGES = ['본공연', '리허설', '무대 세팅'];
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
    mine.push({ d: e.d, t: e.s, e: e.e, what: me.r, title: evName_(e), where: e.room, loc: roomLoc(e.d, e.room), with: e.ppl.filter(p => !meIds.includes(p.n)).map(p => pn(p.n) + '(' + p.r + ')').join(', ') }); });
  const prof = profs_().find(p => p.on && p.lesson && nm(p.name) === nm(u.name));
  const subs = loadSubs_(); const byPid = {};
  subs.forEach(sb => sb.ppl.forEach(p => { if (p.status !== '취소') { const k = p.id.slice(sb.no.length + 1); byPid[p.id] = { p, sb, i: (sb.form && sb.form.info && sb.form.info[k]) || {} }; } }));
  const L = lessons_(); const roomOf = n => (profs_().find(p => p.name === n) || {}).room || '';
  if (prof) L.filter(x => x.pr === prof.name).forEach(x => { const s = byPid[x.pid]; if (!s) return; mine.push({ d: x.d, t: x.t, e: '', what: '개인레슨', title: '개인레슨', where: prof.room || '레슨실', loc: '', with: s ? s.p.name + ' (' + s.sb.acad + ')' : '' }); });
  const stu = [];
  Object.keys(byPid).forEach(id => { const s = byPid[id]; const type = s.p.type || s.i.type || '';
    if (!['학생', '회원의 악기하는 자녀', '비회원 학생'].includes(type)) return;
    const mineSub = s.sb.owner === u.name, myPupil = nm(s.i.teacher) === nm(u.name) && u.acads.includes(s.sb.acad);
    if (!mineSub && !myPupil) return;
    stu.push({ name: s.p.name, acad: s.sb.acad, inst: s.p.inst || s.i.inst || '', teacher: s.i.teacher || '', req: +s.i.lessons || 0, lessons: L.filter(x => x.pid === id).map(x => ({ d: x.d, t: x.t, pr: x.pr, room: roomOf(x.pr) })) }); });
  stu.sort((a, b) => a.acad.localeCompare(b.acad) || a.name.localeCompare(b.name));
  return { open: true, days, mine, prof: prof ? { name: prof.name, room: prof.room } : null, students: stu, rooms: myRooms_(u) };
}
/** 관리자: 설정 한 줄 바꾸기 (시간표 공개 등 허용된 항목만) */
function adminSetSetting(token, key, val) {
  const a = adm_(token); need_(a, 'tt');
  if (!['시간표 공개'].includes(key)) throw new Error('바꿀 수 없는 설정이에요.');
  ensureSettings_(); const sh = SpreadsheetApp.getActive().getSheetByName('설정');
  const r = rows_('설정').find(x => String(x['항목']) === key);
  if (r) sh.getRange(r._row, 2).setValues([[String(val)]]); else sh.appendRow([key, String(val), '']);
  log_('관리자 ' + a.name, '설정 바꿈', key + ' = ' + val);
  return { ok: true, val: setting_(key) };
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
    mix: { '학생': 266, '교사': 95, '연수생': 26, '회원의 악기하는 자녀': 20, '회원의 첫번째 보호자': 69, '회원의 그외 악기 안하는 동반가족': 29, '동반가족 중 돌전아기': 1, '비회원 학생': 2, '비회원 보호자': 2 },
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
      L({ cat: 'schol', name: '장학금', unit: 5900000, auto: 'schol', memo: '학생 20명↑ 80만 · 10명↑ 40만 + 첼로 지원' }),
      L({ cat: 'etc', name: '호텔 기타 (음료 · 추가 침구 등)', unit: 2000000 }),
      L({ cat: 'etc', name: '잡비', unit: 1500000 })]
  };
}
function budRead_() {
  const R = rows_(BUD_SH); let rev = 0; const parts = [];
  R.forEach(r => { const k = String(r['항목'] || ''), v = String(r['값'] == null ? '' : r['값']);
    if (k === 'rev') rev = +v || 0; else { const m = k.match(/^plan(\d*)$/); if (m) parts.push([+(m[1] || 1), v]); } });
  if (!parts.length) return { plan: null, rev };
  try { return { plan: JSON.parse(parts.sort((a, b) => a[0] - b[0]).map(x => x[1]).join('')), rev }; } catch (x) { return { plan: null, rev, err: '예산결산 시트의 값을 읽지 못했어요.' }; }
}
function budCanSee_(a) { if (!a.sup && !['bplan', 'bset'].some(k => a.perms[k] === '보기' || a.perms[k] === '편집')) throw new Error('예산 · 결산을 볼 권한이 없어요.'); }
function budData(token) {
  const a = adm_(token); budCanSee_(a);
  const r = budRead_();
  let schol = 0, scholN = 0; try { scholRows_().forEach(x => { if (x.state === '해당 없음') return; const v = x.amt === '' || x.amt == null ? +x.base || 0 : +x.amt || 0; schol += v; if (v) scholN++; }); } catch (x) {}
  let lessons = 0; try { lessons = lessons_().length; } catch (x) {}
  let rooms = 0; try { rooms = rooms_().filter(x => (x.occ || []).length).length; } catch (x) {}
  const c = camp_();
  return { plan: r.plan || budSeed_(), rev: r.rev, seeded: !r.plan, err: r.err || '', auto: { schol, scholN, lessons, rooms }, fees: c.fees, rounds: c.rounds.map(x => x.n), camp: c.base };
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
    cur: BUD_CUR.includes(x.cur) ? x.cur : 'KRW', scale: x.scale === 'person' ? 'person' : 'fixed', guar: opt(x.guar), auto: ['schol', 'teach', 'meal', 'room'].includes(x.auto) ? x.auto : '',
    conf: opt(x.conf), paid: opt(x.paid), date: okD(x.date), how: BUD_HOW.includes(x.how) ? x.how : '', memo: s(x.memo, 300) })).filter(x => x.name);
  const json = JSON.stringify({ base, mix, inc, lines });
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
