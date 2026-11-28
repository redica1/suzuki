import sys
import os
B=os.path.dirname(os.path.abspath(__file__))+'/'
R=os.path.abspath(B+'../..')+'/'
s=open(B+'fam.html').read()
br=open(B+'bridge.js').read()
def rep(a,b,n=1):
    global s
    assert a in s,a[:80]
    s=s.replace(a,b,n)
# texts
rep(' <p class="hint" style="margin:0">미리보기: 입력한 값은 쓰지 않아요. 「로그인」을 누르면 ${ACAD} 원장님으로 들어가요.</p>\n',' <p class="hint" style="margin:0">처음 로그인하면 다음 화면에서 동의를 한 번 받아요.</p>\n')
rep('<p class="hint" style="margin:0">새 화면 미리보기는 「회원 신청하기」 · 「비회원 신청하기」만 있어요. 나머지는 지금 STG 화면이 열려요.</p>','<p class="hint" style="margin:0">새 화면은 「회원 신청하기」 · 「비회원 신청하기」만 있어요. 해외 신청은 지금 STG 화면이 열려요.</p>')
rep('<span>${esc(a)} · 가상 명단으로 들어가요</span>','<span>${esc(a)} · STG 실제 명단으로 들어가요</span>')
rep('<p class="hint" style="margin:0">학원마다 가상 명단(선생님 2명 · 학생 6~10명)을 넣어 두었어요. 비밀번호 없이 들어가요.</p>','<p class="hint" style="margin:0">STG 시트의 그 학원 명단으로 들어가요. 비밀번호 없이 들어가요.</p>')
for a in ["const LES=60000","const CONS=['오후'","const MCFEE=150000","const DUES=30000","const PRG={","const SNG={"]:
    rep(a,'let'+a[5:])
s=s.replace("sub:m.a+' · 회원'}","sub:m.a+' · 회원',id:m.id}")
rep("S.tab==='login'?'로그인 · 미리보기 (가상 데이터)':WHO+' 원장님 · '+ACAD+' · 미리보기'+(LIVE?' (STG 명단)':' (가상 데이터)')","S.tab==='login'?'STG 시험 · 로그인':WHO+' '+((S.me&&S.me.role!=='원장')?'선생님':'원장님')+(ACAD?' · '+ACAD:'')+(S.token?' · STG 실제 명단 · 캠프 신청은 STG 시트에 저장돼요':' · 가상 데이터')")
rep('<title>가족 신청 미리보기</title>','<title>[STG] 새 접수</title>')
rep('<p id="who">미리보기 (가상 데이터)</p>','<p id="who">STG 시험</p>')
rep('<p class="mock">미리보기 화면이에요. 이름 · 학원은 모두 가상이고, 가족방 빈자리 금액은 STG 설정 기준이에요.</p>','<p class="mock">STG 새 접수 화면이에요. 보이는 것과 저장하는 것은 모두 STG 실제 데이터예요.</p>')

# 11-21 가족방 live
rep("const FEE={'보호자':1,'동반가족':1,'15개월 미만':1};const ROOM_EMPTY=140000,CAP=4;","const FEE={'보호자':1,'동반가족':1,'15개월 미만':1};let ROOM_EMPTY=140000,CAP=4;")
# per-card apply → server
rep("f.saved=true;x.done=true;x.now=true;x.at=nowTs();const left=","if(S.token){f.saved=true;nSubmit([x]);return}f.saved=true;x.done=true;x.now=true;x.at=nowTs();const left=")
# bridge
br=br.replace("STG 실제 명단 · 접수하면 STG 시트에 저장돼요","")
k='\nif(window.google&&google.script&&google.script.run)google.script.run.withSuccessHandler(L=>'
assert k in s
s=s.replace(k,'\n'+br+k,1)
rep("if(d.act==='submitAll'){const t=nowTs();","if(d.act==='submitAll'){if(S.token){nSubmit();return}const t=nowTs();") if "if(d.act==='submitAll'){const t=nowTs();" in s else None
# 11-23 메인 전환: 서버가 템플릿으로 ENV={stg,share} 넣음 → STG 문구 · 시험 선생님 · ?test 는 STG에서만
rep('<title>[STG] 새 접수</title>','<title>스즈키 겨울 음악제 접수</title><script>var ENV=<?!= env ?>;var TQ=ENV.stg?\'?test\':\'\',TA=ENV.stg?\'&test\':\'\';</script>')
rep("B+'intl.html?test')","B+'intl.html'+TQ)")
rep('<small class="hint">기존 STG 화면으로 열려요 ↗</small>','<small class="hint">기존 접수 화면으로 열려요 ↗</small>')
rep('<p class="hint" style="margin:0">새 화면은 「회원 신청하기」 · 「비회원 신청하기」만 있어요. 해외 신청은 지금 STG 화면이 열려요.</p></div>\n <div class="panel tNames">','<p class="hint" style="margin:0">해외는 기존 접수 화면에서 해요.</p></div>\n ${ENV.stg?`<div class="panel tNames">')
rep("<span>${esc(a)} · STG 실제 명단으로 들어가요</span></button>`).join('')}</div></div>`}","<span>${esc(a)} · STG 실제 명단으로 들어가요</span></button>`).join('')}</div></div>`:''}`}")
rep('<p class="hint" style="color:var(--warn);margin:0">STG(시험) 화면이에요. <b>회원관리 STG</b> 계정 비밀번호로 들어가요. 메인 회원관리 계정과는 따로예요.</p>','${ENV.stg?\'<p class="hint" style="color:var(--warn);margin:0">STG(시험) 화면이에요. <b>회원관리 STG</b> 계정 비밀번호로 들어가요. 메인 회원관리 계정과는 따로예요.</p>\':\'\'}')
s=s.replace('app.suzukimusickorea.org/member/index.html?test"','app.suzukimusickorea.org/member/index.html${TQ}"')
rep("S.tab==='login'?'STG 시험 · 로그인':","S.tab==='login'?(ENV.stg?'STG 시험 · 로그인':'로그인'):")
rep("+(S.token?' · STG 실제 명단 · 캠프 신청은 STG 시트에 저장돼요':' · 가상 데이터')","+(ENV.stg?(S.token?' · STG 실제 명단 · 캠프 신청은 STG 시트에 저장돼요':' · 가상 데이터'):'')")
rep('<p id="who">STG 시험</p>','<p id="who"></p>')
rep('<p class="mock">','<p class="mock" id="mockNote">')
s=s+'\n<script>if(!ENV.stg){var mn=document.getElementById(\'mockNote\');if(mn)mn.hidden=true}</script>\n'
import re as _re
# GAS 가 스크립트 안 // 를 주석으로 지움 (11-22) — 스크립트 안 // 는 \/\/ 로
s=_re.sub(r'<script>([\s\S]*?)</script>',lambda m:'<script>'+m.group(1).replace('//','\\/\\/')+'</script>',s)
assert not any('//' in x for x in _re.findall(r'<script>([\s\S]*?)</script>',s))
open(R+'gas/camp/New.html','w').write(s)
print('ok')
