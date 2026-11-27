import re,subprocess,sys,os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','gas','camp'))
import tempfile
out=os.path.join(tempfile.gettempdir(),'gaschk_g.js')
bad=0
for f in ['Admin.html','Index.html','New.html','Parent.html','Find.html','Meal.html','Lost.html','Intl.html','QA.html']:
  if not os.path.exists(f):continue
  s=open(f).read()
  s=re.sub(r"<\?!=\s*include\('(\w+)'\)\s*\?>",lambda m:open(m.group(1)+'.html').read(),s)
  s=re.sub(r"<\?[\s\S]*?\?>",'""',s)
  for i,t in enumerate(re.findall(r'<script>([\s\S]*?)</script>',s)):
    t2=re.sub(r'/\*[\s\S]*?\*/',' ',t)   # GAS 처럼 /* */ 를 문자열 안이어도 지움
    for ln,L in enumerate(t2.split('\n')):
      if re.search(r'://',L): bad+=1;print(f,i,'// 있음 줄',ln,L.strip()[:120])
    open(out,'w').write(t2)
    r=subprocess.run(['node','--check',out],capture_output=True,text=True)
    if r.returncode: bad+=1;print(f,i,r.stderr.split('\n')[0:5])
print('bad',bad)
