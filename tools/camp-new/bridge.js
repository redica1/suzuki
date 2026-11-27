/* ── 11-21 STG 새 접수: 실제 로그인 · 실제 명단 (저장은 다음 단계) ── */
var GS=window.google&&google.script&&google.script.run;let NCONS={};
function liveIn(r){if(!r||!r.ok){S.loading=false;S.lerr=(r&&r.msg)||'들어가지 못했어요.';render();toast(S.lerr,true);return}
 S.token=r.token;S.today=r.today;S.aud=r.aud||null;S.me=r.teacher;S.subs=r.subs||[];S.R=r;S.myAcads=(r.teacher.acads||[]).slice();const A=(S.acPick&&S.myAcads.includes(S.acPick)?S.acPick:(r.teacher.acads||[])[0])||'';ACAD=A;ACADS[0]=A;
 const R=(r.rosters||{})[A]||{teachers:[],students:[]};
 loadLive({head:r.teacher.name,teachers:R.teachers.map(t=>({n:t.name,r:t.role,i:t.inst,p:t.paidDate||''})),students:R.students.map(x=>({n:x.name,i:x.inst,y:x.birth,t:x.teacher,g:'',p:x.paidDate||''})),profs:r.profs||[]});
 WHO=r.teacher.name;S.prep={};S.rck={};S.rv={};S.mck={};campIn(r.camp);idsIn(R);subsIn(r.subs);ensIn(r.teams,r.subs);S.rsubs=r.subs||[];S.pbank=r.pbank||{};S.ppilot=r.ppilot||[];S.plink=r.plink||{};S.pbEd=0;S.pq=(r.ppilot||[]).includes(ACAD)?{L:(r.preq||[]).filter(q=>q.acad===ACAD),nob:r.teacher.role==='원장'&&!((r.pbank||{})[ACAD]||{}).acct,pre:r.pqPre&&!(r.pqEarly||[]).includes(ACAD)?r.pqPre:''}:null;S.others=[];S.role=r.teacher.role==='원장'?'head':'teacher';document.body.classList.add('live');OTH.length=0;famLoad();google.script.run.withSuccessHandler(L=>{S.orch=L||[];if(S.tab==='home')render()}).orchMine(r.token);S.q.a=A;S.loading=false;S.lerr='';S.tab=S.after||'home';S.after='';if(S.tab==='audp')S.AP=null;render();scrollTo(0,0)}
/* ── 11-21 2단계: 실제 저장 (새 화면 → 접수 시트) · 로그인 때 내 접수 불러오기 ── */
const K2T={'교사':'교사','학생':'학생','교사 자녀 (악기)':'회원의 악기하는 자녀','첫번째 보호자':'회원의 첫번째 보호자','보호자':'회원의 첫번째 보호자','동반가족':'회원의 그외 악기 안하는 동반가족','15개월 미만':'동반가족 중 15개월 미만'};
const T2K={};Object.keys(K2T).forEach(k=>{if(!T2K[K2T[k]])T2K[K2T[k]]=k});T2K['연수생']='교사';
function campIn(c){if(!c)return;S.cfg=c;const ri=+c.ri||0;Object.keys(K2T).forEach(k=>{const v=(c.fees||{})[K2T[k]];if(v)FEE1[k]=+v[ri]||0});
 const o=c.opt||{};if(o.lessonFee)LES=+o.lessonFee;if(o.mcFee)MCFEE=+o.mcFee;if(o.studentDues)DUES=+o.studentDues;if(Array.isArray(c.cons)&&c.cons.length)CONS=c.cons.slice();
 if(c.progs)PRG=c.progs;if(c.songs)SNG=c.songs;S.camp=c}
function idsIn(R){MEMBERS.forEach(m=>{if(m.a!==ACAD)return;const L=m.k==='교사'?R.teachers:R.students,h=L.find(q=>q.name===m.n);if(h)m.id=h.id})}
function infoOf(x){const f=inf(x),kk=f.kind||x.k,o0=Object.keys(f.cons||{})[0],o=o0?f.cons[o0]:null,by=x.y?String(x.y):f.age!==''&&f.age!=null&&!isNaN(+f.age)?String(new Date().getFullYear()-(+f.age)):'';
 return {by,man:f.age||'',gender:/^여/.test(f.sex||'')?'여':/^남/.test(f.sex||'')?'남':'',teacher:f.t||'',type:K2T[kk]||kk,prog:f.prog||'',pref:!!f.p1,p1:f.p1||'',p2:f.p2||'',lessons:f.no?0:+f.add||0,noBase:!!f.no,mc:f.mc?(f.mcP||[]).map(q=>String(q).split(' · ')[0]):[],
  move:f.mv||'',concert:o0||'없음',song:o&&!o.nl?o.song||'':'',other:!!(o&&o.nl),oc:o&&o.nl?o.comp||'':'',ot:o&&o.nl?o.title||'':'',dur:o&&/이브닝/.test(o0)?String(o.dur||''):'',video:o&&o.url||''}}
function nSubmit(L0){const L=L0||P.picked.filter(x=>!x.done);if(!L.length||S.busy)return;
 const own=(S.subs||[]).find(sb=>sb.owner===WHO&&sb.acad===ACAD&&(sb.ppl||[]).some(p=>p.status!=='취소'));
 const sb0=own?JSON.parse(JSON.stringify(own)):{no:'N'+Date.now(),owner:WHO,acad:ACAD,round:'',date:S.today||'',ppl:[],form:{picked:{},extra:[],fam:[],info:{},room:{},join:{},ens:{},note:null,ri:(S.camp||{}).ri||0}};const sb=sb0;sb.pressAt=new Date().toISOString();
 sb.form=sb.form||{};['picked','info','room','join','ens'].forEach(k=>{if(!sb.form[k])sb.form[k]={}});['extra','fam'].forEach(k=>{if(!Array.isArray(sb.form[k]))sb.form[k]=[]});
 const F=sb.form,stamp=(S.today||'')+' '+new Date().toTimeString().slice(0,8);
 L.forEach((x,ix)=>{const f=inf(x),kk=f.kind||x.k,isT=kk==='교사',np=NOPLAY(kk);let key=x.id&&!/^t_n|^x\d|^f\d/.test(x.id)?x.id:'';
  if(key){F.picked[key]=true}else if(np){key='f'+Date.now()+ix;F.fam.push({id:key,name:x.n,type:K2T[kk],link:''})}else{key=(isT?'t_n':'x')+Date.now()+ix;const e={id:key,name:x.n,birth:'',inst:instOf(x),start:'-',teacher:f.t||''};if(isT)e.t=1;F.extra.push(e)}
  x.key=key;const i=infoOf(x);const ex=F.extra.find(e=>e.id===key);if(ex)ex.birth=i.by;F.info[key]=i;
  sb.ppl.push({id:sb.no+'_'+key,name:x.n,dtag:'',inst:np?'':instOf(x),kind:isT?'교사':np?'가족':'학생',type:i.type,fee:0,lesson:0,dues:0,room:0,status:'정상',pay:'전',paidAmt:0,batch:1,addAt:stamp})});
 S.busy=true;toast('캠프 신청을 보내는 중…');const keep=new Set(P.picked.filter(x=>x.now).map(x=>x.n+'|'+x.k).concat(L.map(x=>x.n+'|'+x.k)));
 const ok=r=>{S.busy=false;if(!r||r.ok===false){if(r&&r.subs)resync(r.subs,keep);toast((r&&r.msg)||'신청하지 못했어요.',true);return}resync(r.subs||[],keep,L);const left=P.picked.filter(y=>!y.done).length;render();toast(L.map(x=>x.n).join(', ')+' · 캠프 신청했어요'+(left?'':' · 모두 신청했어요'));if(!left)scrollTo(0,0)};
 const bad=e=>{S.busy=false;toast('신청하지 못했어요 · '+((e&&e.message)||e),true)};
 if(own)google.script.run.withSuccessHandler(ok).withFailureHandler(bad).saveSubs(S.token,[sb]);else{sb.reqId=sb.no;google.script.run.withSuccessHandler(ok).withFailureHandler(bad).submitNew(S.token,sb)}}
/* 11-25 신청한 사람 고치기: 그 접수의 info · 구분 · 담당 교사만 바꿔 saveSubs (금액은 서버가 다시 셈) */
function nEdit(x){if(S.busy)return;const o=pOf(x);if(!o||!o.p){toast('접수를 찾지 못했어요. 새로 고침 해 주세요.',true);return}
 const sb=JSON.parse(JSON.stringify(o.sb)),key=x.key,i=infoOf(x),F=sb.form=sb.form||{};F.info=F.info||{};F.info[key]=Object.assign({},F.info[key]||{},i);
 const p=sb.ppl.find(q=>q.id===sb.no+'_'+key);if(p&&i.type)p.type=i.type;const ex=(F.extra||[]).find(e=>e.id===key);if(ex){if(i.teacher)ex.teacher=i.teacher;if(i.by)ex.birth=i.by}
 sb.pressAt=new Date().toISOString();S.busy=true;toast('고친 내용을 보내는 중…');const keep=new Set(P.picked.filter(y=>y.now).map(y=>y.n+'|'+y.k));
 google.script.run.withSuccessHandler(r=>{S.busy=false;if(!r||r.ok===false){if(r&&r.subs)resync(r.subs,keep);x.edit=false;render();toast((r&&r.msg)||'저장하지 못했어요.',true);return}
  resync(r.subs||[],keep);S.tab='mine';S.mv='pay';render();scrollTo(0,0);toast(x.n+' · 고친 내용을 저장했어요')}).withFailureHandler(e=>{S.busy=false;toast('저장하지 못했어요 · '+((e&&e.message)||e),true)}).saveSubs(S.token,[sb])}
/* 서버 접수로 화면을 다시 맞춤 (방금 신청한 사람 표시는 남김) */
function resync(subs,keep,L){S.subs=subs;const pend=P.picked.filter(x=>!x.done&&!(L||[]).includes(x));P.picked=pend;S.prep={};subsIn(subs);if(S.famRooms)famIn({ok:true,rooms:S.famRooms});const t=nowTs();P.picked.forEach(x=>{if(keep&&keep.has(x.n+'|'+x.k)&&x.done){x.now=true;if(!x.at)x.at=t}})}
/* 입금 신고 · 신고 수정 · 신고 취소 → 접수 저장(saveSubs) */
function pOf(x){const sb=(S.subs||[]).find(s=>s.no===x.no);return sb?{sb,p:sb.ppl.find(q=>q.id===sb.no+'_'+x.key)}:null}
const pAmtS=p=>(+p.fee||0)+(+p.lesson||0)+(+p.dues||0)+(+p.room||0);
function paySave(fn,msg){const ch={};P.picked.filter(x=>x.done&&x.no).forEach(x=>{const o=pOf(x);if(!o||!o.p)return;if(!ch[o.sb.no])ch[o.sb.no]=JSON.parse(JSON.stringify(o.sb))});
 const n=fn(ch);if(!n)return;const L=Object.values(ch).filter(sb=>sb._t);L.forEach(sb=>delete sb._t);S.busy=true;toast('보내는 중…');
 google.script.run.withSuccessHandler(r=>{S.busy=false;if(r&&r.subs)resync(r.subs,new Set(P.picked.filter(x=>x.now).map(x=>x.n+'|'+x.k)));S.rck={};render();toast(r&&r.ok===false?r.msg:msg,r&&r.ok===false)}).withFailureHandler(e=>{S.busy=false;toast('보내지 못했어요 · '+((e&&e.message)||e),true)}).saveSubs(S.token,L)}
document.addEventListener('click',e=>{if(!S.token)return;const b=e.target.closest('[data-act="repGo"],[data-resave],[data-repx]');if(!b)return;e.stopImmediatePropagation();const d=b.dataset;
 const byK=k=>P.picked.find(x=>pkey(x)===k);
 if(d.act==='repGo'){const ks0=Object.keys(S.rck||{}).filter(k=>S.rck[k]),rk=ks0.filter(k=>/\|가족방$/.test(k)),ks=ks0.filter(k=>!/\|가족방$/.test(k));const nm0=((document.getElementById('rvAllN')||{}).value||'').trim(),dt0=(document.getElementById('rvAllD')||{}).value||'';if(rk.length&&nm0&&dt0){const ids=rk.map(k=>(S.list.find(q=>'가족방 · '+q.rep+'|가족방'===k)||{}).id).filter(Boolean);google.script.run.withSuccessHandler(r=>{famIn(r);if(!ks.length){S.rck={};render();toast('가족방 입금 신고를 보냈어요')}}).withFailureHandler(e=>toast((e&&e.message)||String(e),true)).famPay(S.token,ids,nm0,dt0);if(!ks.length)return}const nm=((document.getElementById('rvAllN')||{}).value||'').trim(),dt=(document.getElementById('rvAllD')||{}).value||'';S.rvN=nm;S.rvD=dt;
  if(!nm||!dt){S.rerr='입금자명과 입금일을 넣어 주세요.';render();return}S.rerr='';
  paySave(ch=>{const id='R'+Date.now().toString(36),ids=[],rows={};let sum=0;const ps=[];ks.forEach(k=>{const x=byK(k);if(!x||!x.no)return;const sb=ch[x.no];if(!sb)return;const p=sb.ppl.find(q=>q.id===sb.no+'_'+x.key);if(!p)return;const a=Math.max(0,pAmtS(p)-(+p.paidAmt||0));ids.push(p.id);rows[p.id]={name:nm,date:dt,a};sum+=a;ps.push([sb,p])});
   const rep={id,name:nm,date:dt,amt:sum,memo:'',ids,rows};ps.forEach(([sb,p])=>{p.pay='신고';p.rep=rep;sb._t=1});return ps.length},ks.length+'명 입금 신고를 보냈어요 · 운영진이 확인하면 「입금 확인」으로 바뀌어요');return}
 if(/\|가족방$/.test(d.resave||d.repx||'')){const k=d.resave||d.repx,q=S.list.find(z=>'가족방 · '+z.rep+'|가족방'===k);if(!q)return;const nm=d.resave?((document.getElementById('reN')||{}).value||'').trim():'',dt=d.resave?(document.getElementById('reD')||{}).value||'':'';S.redit='';google.script.run.withSuccessHandler(r=>{famIn(r);render();toast(d.resave?'신고를 고쳤어요':'입금 신고를 취소했어요')}).withFailureHandler(e=>toast((e&&e.message)||String(e),true)).famPay(S.token,[q.id],nm,dt);return}
 if(d.resave){const x=byK(d.resave),nm=((document.getElementById('reN')||{}).value||'').trim(),dt=(document.getElementById('reD')||{}).value||'';if(!x||!nm||!dt)return;S.redit='';
  paySave(ch=>{const sb=ch[x.no],p=sb&&sb.ppl.find(q=>q.id===sb.no+'_'+x.key);if(!p||!p.rep)return 0;const a=Math.max(0,pAmtS(p)-(+p.paidAmt||0));p.rep=Object.assign({},p.rep,{id:'R'+Date.now().toString(36),name:nm,date:dt,amt:a,ids:[p.id],rows:{[p.id]:{name:nm,date:dt,a}}});sb._t=1;return 1},'신고를 고쳤어요');return}
 if(d.repx){const x=byK(d.repx);if(!x)return;S.redit='';paySave(ch=>{const sb=ch[x.no],p=sb&&sb.ppl.find(q=>q.id===sb.no+'_'+x.key);if(!p)return 0;p.pay='전';delete p.rep;sb._t=1;return 1},'입금 신고를 취소했어요');return}},true);

function subsIn(subs){S.cxL=[];(subs||[]).forEach(sb=>{if(sb.acad!==ACAD)return;const fm=sb.form||{},IN=fm.info||{};(sb.ppl||[]).forEach(p=>{if(p.status==='취소'){const key=String(p.id).slice(String(sb.no).length+1);S.cxL.push({n:p.name,kn:p.kind==='가족'?(p.type||'가족'):p.kind||'',i:p.inst?(IAB[p.inst]||p.inst):'',no:sb.no,key,owner:sb.owner,at:String(p.cxAt||'').slice(2,16).replace(/-/g,'.'),fee:+p.cxFee||0,paid:(+p.paidAmt||0)>0,refund:p.refund?+p.refund.amt||0:0});return}const key=String(p.id).slice(String(sb.no).length+1),i=IN[key]||{},kk=T2K[p.type]||(p.kind==='교사'?'교사':'학생');
  if(P.picked.some(x=>x.no===sb.no&&x.key===key))return;
  const x={cxReq:p.status==='취소요청',n:p.name,k:kk,i:p.inst||'',sub:sb.acad+' · '+(sb.owner===WHO?'내 접수':sb.owner+' 선생님 접수'),done:true,at:String(p.addAt||sb.createdAt||'').slice(2,16).replace(/-/g,'.'),no:sb.no,key,id:key,owner:sb.owner,pay:p.pay,paidAmt:+p.paidAmt||0};
  P.picked.push(x);const f=inf(x);Object.assign(f,{saved:true,mv:i.move||'',sex:i.gender==='여'?'여성':i.gender==='남'?'남성':'',age:i.man||(i.by?String(new Date().getFullYear()-(+i.by)):''),t:i.teacher||'',prog:i.prog||'',p1:i.p1||'',p2:i.p2||'',add:+i.lessons||0,no:!!i.noBase,mc:(i.mc||[]).length>0,mcP:(i.mc||[]).map(n=>{const q=PF.find(z=>z[0]===n);return q?q[0]+' · '+q[1]:n}),cons:i.concert&&i.concert!=='없음'?{[i.concert]:{song:i.song||'',nl:!!i.other,title:i.ot||'',comp:i.oc||'',dur:i.dur||'',url:i.video||''}}:{}});
  x.srv={fee:+p.fee||0,lesson:+p.lesson||0,dues:+p.dues||0,room:+p.room||0,late:!!p.late,kind:p.kind,pd:+p.paidAmt||0,due5:p.due5||'',over5:!!p.over5};if(p.pay==='신고'||(+p.paidAmt||0)>0){const rw=(p.rep&&p.rep.rows&&p.rep.rows[p.id])||p.rep||{};S.prep=S.prep||{};S.prep[pkey(x)]={payer:rw.name||'',date:rw.date||'',ok:(+p.paidAmt||0)>0,okd:(+p.paidAmt||0)>0?String((p.rep&&p.rep.ok)||'').slice(0,10):''}}})})}

/* 11-21 가족방 (서버 「가족방신청」 시트) */
function famIn(r){if(!r||!r.ok)return;if(r.cap)CAP=r.cap;if(r.emptyFee!==undefined)ROOM_EMPTY=r.emptyFee;if(r.acads&&r.acads.length){ACADS.length=0;ACADS.push(ACAD,...r.acads.filter(a=>a!==ACAD))}
 S.famRooms=r.rooms||[];S.list=S.famRooms.map(q=>({id:q.id,rep:q.repName,names:q.mem.map(m=>m.name),n:q.mem.length,room:true,amt:q.amt,empty:q.empty,st:q.pay==='확인'?'입금 확인':q.pay==='신고'?'입금 신고':'입금 전',srv:q}));
 S.prep=S.prep||{};S.famRooms.forEach(q=>{const k='가족방 · '+q.repName+'|가족방';if(q.pay!=='전')S.prep[k]={payer:q.payer,date:q.payDate,ok:q.pay==='확인',okd:q.okDate?String(q.okDate).slice(5).replace('-','/'):''};else delete S.prep[k]})}
function famLoad(){google.script.run.withSuccessHandler(r=>{famIn(r);render()}).famList(S.token)}
function famFindIn(a){if(a===ACAD){OTH.length=0;return}google.script.run.withSuccessHandler(L=>{OTH.length=0;(L||[]).forEach(p=>OTH.push({n:p.name,k:p.kind==='가족'?'첫번째 보호자':p.kind,i:p.inst,a:p.acad,pid:p.id,id:p.id}));render()}).famFind(S.token,a,'')}
document.addEventListener('change',e=>{if(S.token&&e.target.id==='qa'){S.q.a=e.target.value;famFindIn(S.q.a)}},true);
document.addEventListener('click',e=>{if(!S.token)return;const b=e.target.closest('[data-act="submit"]');if(!b||S.tab!=='new')return;e.stopImmediatePropagation();
 const rep=S.mem.find(m=>KEY(m)===S.rep);if(!rep||!rep.pid){toast('대표를 골라 주세요',true);return}const mem=S.mem.filter(m=>m!==rep).map(m=>m.pid).filter(Boolean);if(!mem.length){toast('함께 갈 가족을 추가해 주세요',true);return}
 const fid=S.famEdit||'';S.busy=true;toast(fid?'고친 내용을 저장하는 중…':'가족방을 보내는 중…');google.script.run.withSuccessHandler(r=>{S.busy=false;famIn(r);S.done=true;S.famEdit='';render();toast(fid?'가족방을 고쳤어요':'가족방 신청을 완료했어요')}).withFailureHandler(e=>{S.busy=false;toast((e&&e.message)||String(e),true)}).famSave(S.token,fid?{id:fid,rep:rep.pid,mem}:{rep:rep.pid,mem})},true);
/* 11-27 신청한 가족방 고치기 · 취소 (입금 전 · 입금 확인은 고치기, 신고 중은 막음 · 서버도 같음) */
document.addEventListener('click',e=>{if(!S.token)return;const b=e.target.closest&&e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.fed!==undefined){const q=(S.famRooms||[]).find(r=>r.id===d.fed);if(!q)return;e.stopImmediatePropagation();S.famEdit=q.id;S.done=false;S.mem=q.mem.map(m=>({n:m.name,k:m.kind==='가족'?'첫번째 보호자':m.kind,i:'',a:m.acad,sub:m.acad||'',pid:m.id,id:m.id}));S.rep=q.rep;S.room=true;S.tab='new';render();toast(q.repName+' 가족방을 고치는 중이에요 · 다 고치면 「고친 내용 저장」');const el=document.querySelector('[data-act="submit"]');if(el)el.scrollIntoView({block:'center'});return}
 if(d.fx!==undefined){e.stopImmediatePropagation();S.fxK=d.fx;render();return}
 if(d.fx0){e.stopImmediatePropagation();S.fxK='';render();return}
 if(d.fxgo!==undefined){e.stopImmediatePropagation();S.busy=true;google.script.run.withSuccessHandler(r=>{S.busy=false;S.fxK='';if(S.famEdit===d.fxgo){S.famEdit='';S.mem=[]}famIn(r);render();toast('가족방을 취소했어요')}).withFailureHandler(er=>{S.busy=false;toast((er&&er.message)||String(er),true)}).famDel(S.token,d.fxgo);return}
},true);

function failIn(e){S.loading=false;S.lerr='연결이 잠시 안 돼요. 다시 눌러 주세요.';render();toast(S.lerr,true)}
document.addEventListener('click',e=>{if(!GS)return;const b=e.target.closest('[data-tt],[data-act="login"]');if(!b)return;e.stopImmediatePropagation();e.preventDefault();
 const all={};Object.keys(NCONS).forEach(k=>all[k]=true);
 if(b.dataset.tt){S.loading=true;toast(b.dataset.tt+' 선생님으로 들어가는 중…');google.script.run.withSuccessHandler(liveIn).withFailureHandler(failIn).testLogin(b.dataset.tt,all);return}
 const u=(document.getElementById('lgId')||{}).value||'',dm=(document.getElementById('lgDom')||{}).value||'',pw=(document.getElementById('lgPw')||{}).value||'',ag=(document.getElementById('lgAg')||{}).checked;
 const em=(u.includes('@')?u:(u&&dm&&dm!=='직접 입력'?u+'@'+dm:'')).trim().toLowerCase();
 if(!em||!pw){S.lerr='이메일과 비밀번호를 넣어 주세요.';render();return}
 S.loading=true;S.lerr='';render();google.script.run.withSuccessHandler(r=>lgOrConsent(r,em,pw)).withFailureHandler(failIn).loginPw(em,pw,{},false)},true);
/* 11-25 로그인 → (처음이면) 동의 화면 → 동의하면 같은 이메일 · 비밀번호로 다시 들어감 (비밀번호는 이 화면 메모리에만 · 동의 뒤 지움) */
function lgOrConsent(r,em,pw){if(r&&r.needConsent){S.loading=false;S.cons=r.consent||null;S.cck={};S.cop={};S.lgCred={em,pw};S.tab='consent';render();scrollTo(0,0);return}S.lgCred=null;liveIn(r)}
document.addEventListener('click',e=>{if(!GS||S.tab!=='consent')return;const b=e.target.closest&&e.target.closest('[data-cagree]');if(!b)return;e.stopImmediatePropagation();
 const c=S.lgCred;if(!c){S.tab='login';render();return}const K=(S.cons&&S.cons.items)||[],ag={};K.forEach(x=>{ag[x.id]=!!(S.cck||{})[x.id]});
 S.loading=true;render();toast('들어가는 중…');google.script.run.withSuccessHandler(r=>{S.lgCred=null;if(r&&r.ok)S.tab='home';liveIn(r)}).withFailureHandler(failIn).loginPw(c.em,c.pw,ag,false)},true);
if(GS)google.script.run.withSuccessHandler(c=>{(c||[]).forEach(x=>NCONS[x]=1)}).newConsentIds();

/* 11-23 로그인 전 첫 화면: 지금 음원을 먼저 받는 음악회 이름 · 마감일 (개인정보 없음) */
if(GS)google.script.run.withSuccessHandler(L=>{S.apOpen=Array.isArray(L)?L:null;if(S.tab==='login')render()}).audPreOpen();

/* 11-23 앙상블 저장: 내 접수(form.ens)에 저장 · 서버 teams_ 가 팀을 다시 만듦 · 한 학원은 한 팀 (checkEns_) */
function ensOwn(){return (S.subs||[]).find(sb=>sb.owner===WHO&&sb.acad===ACAD&&(sb.ppl||[]).some(p=>p.status!=='취소'))}
function ensIn(teams,subs){if(Array.isArray(teams)){TEAMS.length=0;teams.forEach(t=>TEAMS.push({name:t.name,rep:t.rep,by:t.by||'',no:t.no,mates:(t.acads||[]).filter(a=>a!==t.rep)}))}
 const own=ensOwn(),e=(own&&own.form&&own.form.ens)||{},E=S.ens;E.err='';E.aq='';
 if(e.on){Object.assign(E,{on:'rep',name:e.group||'',mates:(e.acads||[]).slice(),song:e.c1||'',comp:e.k1||'',n:String(e.n||''),done:true,team:''})}
 else if(e.member){const t=TEAMS.find(x=>x.no===e.joinNo);Object.assign(E,{on:'mem',team:t?t.name:'',done:true})}
 else Object.assign(E,{on:'',done:false,team:''});
 E.saved=e.on?'rep':e.member?'mem':'';
 const lk=TEAMS.find(t=>(t.rep===ACAD||t.mates.includes(ACAD))&&(!own||(t.no!==own.no&&!(e.member&&e.joinNo===t.no))));
 E.lock=lk?{name:lk.name,rep:lk.rep,by:lk.by}:null}
function ensSend(ens,msg){const own=ensOwn();if(!own){S.ens.err='앙상블은 캠프 신청에 붙어서 저장돼요. 먼저 「캠프 신청하기」에서 한 명 이상 신청해 주세요.';render();return}
 const sb=JSON.parse(JSON.stringify(own));sb.form=sb.form||{};sb.form.ens=Object.assign({},sb.form.ens||{},ens);S.busy=true;toast('보내는 중…');
 google.script.run.withSuccessHandler(r=>{S.busy=false;if(r&&r.ok===false){S.ens.err=r.msg||'저장하지 못했어요.';render();toast(S.ens.err,true);return}if(r&&r.subs){S.subs=r.subs;resync(r.subs,new Set(P.picked.filter(x=>x.now).map(x=>x.n+'|'+x.k)))}
  const T=TEAMS.filter(t=>t.no!==sb.no);TEAMS.length=0;T.forEach(t=>{t.mates=t.mates.filter(a=>!(a===ACAD&&!(ens.member&&t.no===ens.joinNo)));if(ens.member&&t.no===ens.joinNo&&!t.mates.includes(ACAD))t.mates.push(ACAD);TEAMS.push(t)});if(ens.on)TEAMS.push({name:ens.group,rep:ACAD,by:WHO,no:sb.no,mates:(ens.acads||[]).slice()});
  ensIn(null,null);render();toast(msg)}).withFailureHandler(e=>{S.busy=false;S.ens.err=(e&&e.message)||String(e);render();toast(S.ens.err,true)}).saveSubs(S.token,[sb])}
document.addEventListener('click',e=>{if(!S.token||S.tab!=='ens')return;const b=e.target.closest('[data-act="ensSave"],[data-eteam],[data-eoff]');if(!b)return;e.stopImmediatePropagation();e.preventDefault();if(S.busy)return;const E=S.ens,d=b.dataset;
 if(d.act==='ensSave'){E.err=!E.name.trim()?'팀 이름을 넣어 주세요.':!String(E.n).trim()?'인원을 넣어 주세요.':!E.song.trim()||!E.comp.trim()?'곡명 · 작곡가를 넣어 주세요.':'';if(E.err){render();return}
  ensSend({on:true,member:false,joinNo:'',group:E.name.trim(),acads:E.mates.slice(),c1:E.song.trim(),k1:E.comp.trim(),n:String(E.n).trim()},E.done?'앙상블 팀 정보를 고쳤어요':'앙상블을 신청했어요');return}
 if(d.eteam){const t=TEAMS.find(x=>x.name===d.eteam);if(!t)return;ensSend({on:false,member:true,joinNo:t.no,group:'',acads:[]},'「'+t.name+'」 팀에 함께해요');return}
 if(d.eoff){ensSend({on:false,member:false,joinNo:''},'앙상블 신청을 취소했어요');return}},true);

/* 11-23 학원 고르기 (소속 여럿 · 겸임): 같은 로그인 묶음으로 그 학원 명단 · 접수를 다시 그림 */
function acadGo(A){const r=S.R;if(!r||!A||A===ACAD)return;if(P.picked.some(x=>!x.done)&&!confirm('아직 신청하지 않은 사람이 있어요. 학원을 바꾸면 지워져요. 바꿀까요?'))return;
 const keep=S.tab;S.acPick=A;liveIn(Object.assign({},r,{subs:S.subs}));if(keep&&keep!=='login'&&keep!=='home'&&keep!=='audp'){S.tab=keep;render()}toast(A+' 접수로 바꿨어요')}
document.addEventListener('click',e=>{if(!S.token)return;const b=e.target.closest&&e.target.closest('[data-acgo],[data-acopen],[data-accls]');if(!b)return;e.stopImmediatePropagation();if(S.busy)return;
 if(b.dataset.acgo){acadGo(b.dataset.acgo);return}
 const v=b.dataset.accls?WHO+' 클래스':(S.acq||'').trim();if(!v){toast('학원 이름을 넣어 주세요',true);return}S.busy=true;toast('명단을 불러오고 있어요…');
 google.script.run.withSuccessHandler(r=>{S.busy=false;if(!r||r.ok===false){toast((r&&r.msg)||'열지 못했어요',true);return}
  const R0=S.R,acs=(r.acads||(r.teacher&&r.teacher.acads)||R0.teacher.acads.concat([v]));S.R=Object.assign({},R0,{rosters:Object.assign({},R0.rosters||{},r.rosters||{}),teacher:Object.assign({},R0.teacher,{acads:acs}),subs:r.subs||S.subs});S.acAdd=0;S.acq='';S.acPick=v;liveIn(S.R);toast(v+' 명단을 열었어요 · 소속은 그대로예요')})
 .withFailureHandler(e=>{S.busy=false;toast((e&&e.message)||String(e),true)}).addAcad(S.token,v)},true);

/* 11-23 원장님 우리 학원 설정 저장: 계좌(acadBankSet) → 마감일(acadDueSet) */
document.addEventListener('click',e=>{if(!S.token)return;const b=e.target.closest&&e.target.closest('[data-pbsave]');if(!b)return;e.stopImmediatePropagation();if(S.busy)return;
 const g=id=>((document.getElementById(id)||{}).value||'').trim(),bk={bank:g('pbBank'),acct:g('pbAcct'),holder:g('pbHold')},due=null,on2=!!(document.getElementById('pb2On')||{}).checked;if(on2){bk.bk2={bank:g('pb2Bank'),acct:g('pb2Acct'),holder:g('pb2Hold')};if(!bk.bk2.bank||!bk.bk2.acct||!bk.bk2.holder){toast('버스비 계좌의 은행 · 계좌번호 · 예금주를 모두 넣어 주세요',true);return}}S.pb2On=undefined;
 if(!bk.bank||!bk.acct||!bk.holder){toast('은행 · 계좌번호 · 예금주를 모두 넣어 주세요',true);return}
 S.busy=true;toast('저장하는 중…');const bad=x=>{S.busy=false;toast((x&&x.message)||String(x),true)};
 google.script.run.withSuccessHandler(r=>{S.busy=false;S.pbank=(r&&r.pbank)||S.pbank;S.pbEd=0;render();toast('우리 학원 계좌를 저장했어요')}).withFailureHandler(bad).acadBankSet(S.token,ACAD,bk)},true);
/* 11-24 학원 차수 마감 저장 (acadRoundSet) */
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-rdsave]');if(!b)return;e.stopImmediatePropagation();const B=(S.pbank||{})[ACAD]||{},L=aRounds(B),v=S.rdv||L.map(r=>r.mine),er=rdErr(L,v);
 if(er.length){toast(er[0],true);return}
 if(!S.token){B.rd=v.slice();(S.pbank=S.pbank||{})[ACAD]=B;S.rdv=null;render();toast('차수 마감을 저장했어요 (미리보기)');return}
 if(S.busy)return;S.busy=true;toast('저장하는 중…');
 google.script.run.withSuccessHandler(r=>{S.busy=false;S.pbank=(r&&r.pbank)||S.pbank;S.rdv=null;render();toast('차수 마감을 저장했어요 · 학부모 화면에 바로 나와요')}).withFailureHandler(x=>{S.busy=false;toast((x&&x.message)||String(x),true)}).acadRoundSet(S.token,ACAD,v)},true);

/* 11-24 원장님 학원 관리: 버스 금액 저장(acadBusSet) · 학부모 입금 확인 / 반려(parentPayDo) */
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-busave]');if(!b)return;e.stopImmediatePropagation();
 const g=id=>+(((document.getElementById(id)||{}).value||'').replace(/[^\d]/g,''))||0,ck=id=>!!(document.getElementById(id)||{}).checked,bus={r:g('bsR'),g:g('bsG'),b:g('bsB'),off:ck('bsOff'),one:!ck('bsOne'),later:S.busM!==undefined?S.busM==='later':!!((((S.pbank||{})[ACAD]||{}).bus)||{}).later};
 if(!S.token){const B=((S.pbank||{})[ACAD]=(S.pbank||{})[ACAD]||{});B.bus=bus;render();toast('버스 금액을 저장했어요 (미리보기)');return}
 if(S.busy)return;S.busy=true;toast('저장하는 중…');
 google.script.run.withSuccessHandler(r=>{S.busy=false;S.pbank=(r&&r.pbank)||S.pbank;render();S.busM=undefined;toast('우리 학원 버스를 저장했어요')}).withFailureHandler(x=>{S.busy=false;toast((x&&x.message)||String(x),true)}).acadBusSet(S.token,ACAD,bus)},true);
/* 11-25 ① 받을 것 저장 (나중 방식 · 금액은 그대로 · 확정은 풀지 않음) */
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-busopt]');if(!b)return;e.stopImmediatePropagation();
 const B=((S.pbank||{})[ACAD]||{}).bus||{},o=S.busO||B.o||{r:!B.off,g:!B.off&&B.one!==false,b:!B.off&&B.one!==false},bus={r:+B.r||0,g:+B.g||0,b:+B.b||0,later:true,o};
 if(!S.token){const P=((S.pbank||{})[ACAD]=(S.pbank||{})[ACAD]||{});P.bus=Object.assign({},B,bus,{off:!(o.r||o.g||o.b),one:!!(o.g||o.b)});S.busO=null;S.busM=undefined;render();toast('받을 것을 저장했어요 (미리보기)');return}
 if(S.busy)return;S.busy=true;toast('저장하는 중…');
 google.script.run.withSuccessHandler(r=>{S.busy=false;S.pbank=(r&&r.pbank)||S.pbank;S.busO=null;S.busM=undefined;render();toast('받을 것을 저장했어요 · 학부모는 금액 없이 골라요')}).withFailureHandler(x=>{S.busy=false;toast((x&&x.message)||String(x),true)}).acadBusSet(S.token,ACAD,bus)},true);
/* 11-25 버스 금액 확정 (acadBusConfirm) */
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-busconf]');if(!b)return;e.stopImmediatePropagation();
 const g=id=>+(((document.getElementById(id)||{}).value||'').replace(/[^\d]/g,''))||0,ck=id=>!!(document.getElementById(id)||{}).checked,B0=((S.pbank||{})[ACAD]||{}).bus||{},bus={r:g('bsR'),g:g('bsG'),b:g('bsB'),later:true,o:B0.o||{r:!B0.off,g:!B0.off&&B0.one!==false,b:!B0.off&&B0.one!==false}};
 if(!(bus.r||bus.g||bus.b)){toast('버스 금액을 넣어 주세요',true);return}
 if(!S.token){const B=((S.pbank||{})[ACAD]=(S.pbank||{})[ACAD]||{});B.bus=Object.assign(bus,{conf:'2026-11-25 13:00'});S.busM=undefined;render();toast('금액을 확정했어요 (미리보기)');return}
 if(!confirm('이 금액으로 확정할까요? 버스를 고른 학부모에게 메일이 가요.'))return;
 if(S.busy)return;S.busy=true;toast('확정하는 중…');
 google.script.run.withSuccessHandler(r=>{S.busy=false;S.pbank=(r&&r.pbank)||S.pbank;S.busM=undefined;render();toast('버스 금액을 확정했어요 · 학부모 '+((r&&r.n)||0)+'집에 메일')}).withFailureHandler(x=>{S.busy=false;toast((x&&x.message)||String(x),true)}).acadBusConfirm(S.token,ACAD,bus)},true);
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-hapay]');if(!b)return;e.stopImmediatePropagation();const [id,i,ok]=b.dataset.hapay.split('|');
 if(!S.token){const r=(HA_MOCK.L||[]).find(x=>x.id===id);if(r)r.m.reps[+i].st=ok==='1'?'확인':'반려';render();return}
 let why='';if(ok!=='1'){why=prompt('반려하는 까닭을 적어 주세요 (학부모에게 메일로 가요)','')||'';if(!why.trim())return}
 if(S.busy)return;S.busy=true;toast('처리하는 중…');
 google.script.run.withSuccessHandler(r=>{S.busy=false;if(r&&r.preq)S.pq=Object.assign({},S.pq||{},{L:(r.preq||[]).filter(q=>q.acad===ACAD)});render();toast(ok==='1'?'입금을 확인했어요 · 학부모에게 메일이 가요':'반려했어요')}).withFailureHandler(x=>{S.busy=false;toast((x&&x.message)||String(x),true)}).parentPayDo(S.token,id,+i,ok==='1',why)},true);
