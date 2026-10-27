"""올리기 전에: 빌드 번호를 새로 찍고, 구글이 화면을 망가뜨리는 글자가 없는지 검사 (python3 -I stamp.py)"""
import re, sys, json, datetime, pathlib
here = pathlib.Path(__file__).parent
bid = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime('%Y%m%d-%H%M%S')
bad = []
for n in json.loads((here / 'files.json').read_text()):
    p = here / n; s = p.read_text(encoding='utf-8')
    s = re.sub(r'build: \S+', 'build: ' + bid, s, count=1)
    if any(ord(c) > 0xFFFF for c in s): bad.append(n + ': 이모지 같은 4바이트 글자')
    if n.endswith('.html'):
        for js in re.findall(r'<script>(.*?)</script>', s, re.S):
            for i, line in enumerate(js.split('\n')):
                if '//' in line: bad.append(f'{n}: 스크립트 안 // (구글이 주석으로 지움) → {line.strip()[:80]}')
        if '<?' in s: bad.append(n + ': <? (템플릿 글자)')
    if '주민' in s and n == 'Index.html' and re.search(r'\d{6}-\d{7}', s): bad.append(n + ': 주민번호처럼 보이는 숫자')
    p.write_text(s, encoding='utf-8')
if bad: print('멈춤:\n' + '\n'.join(bad)); sys.exit(1)
print('build', bid)
