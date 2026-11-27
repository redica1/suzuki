# tools (캠프 작업 도구 · 앱스크립트로 올라가지 않음)

- `gaschk.py` — gas/camp 화면 스크립트 문법 검사. `bad 0` 일 때만 커밋 · 푸시.
  `python3 tools/gaschk.py | tail -1 | grep -q "bad 0" && git commit … && git push`
- `camp-new/` — 새 접수 화면(gas/camp/New.html) 원본.
  - `fam.html` (화면) + `bridge.js` (서버 연결) → `python3 tools/camp-new/build_new.py` → `gas/camp/New.html`
  - New.html 은 직접 고치지 말고 여기 원본을 고친 뒤 빌드. (직접 고치면 다음 빌드 때 덮어씀)
  - build_new.py 의 바꾸기(rep)는 원본 글자와 정확히 맞아야 함 · 새 코드가 같은 글자를 만들면 충돌.
- 화면 스크립트 안 문자열에 `//` · `/*` 를 쓰지 말 것 (구글이 주석으로 지움).
