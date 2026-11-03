"""공통 라이브러리를 각 앱 폴더로 복사: python3 -I gas/common/sync.py (gas 폴더 밖에서도 됨)"""
import pathlib, re
here = pathlib.Path(__file__).resolve().parent
src = (here / 'UiLib.html').read_text(encoding='utf-8')
if '//' in re.sub(r'/\*.*?\*/', '', src, flags=re.S): raise SystemExit('UiLib.html 안에 // 가 있어요 (구글이 지움)')
for app in ['camp']:   # 회원관리(member)는 연결한 뒤 추가
    d = here.parent / app / 'UiLib.html'
    old = d.read_text(encoding='utf-8') if d.exists() else ''
    m = re.search(r'build: \S+', old)
    out = src.replace('build: 0', m.group(0), 1) if m else src
    d.write_text(out, encoding='utf-8'); print('복사', d)
