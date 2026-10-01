---
name: create-pr
description: 현재 브랜치를 푸시하고 영어 제목·한국어 본문으로 GitHub PR을 만든다.
argument-hint: "[base 브랜치, 기본 main]"
disable-model-invocation: true
---

현재 브랜치로 PR을 만든다. base는 인자가 있으면 그것, 없으면 `main`: $ARGUMENTS

1. 현재 브랜치가 base와 같거나 main/master면 중단하고 브랜치를 만들라고 안내한다.
2. 미커밋 변경이 있으면 알리고 `/commit` 먼저 할지 묻는다.
3. `git log <base>..HEAD`와 `git diff <base>...HEAD`로 브랜치 전체 변경을 파악한다. 마지막 커밋만 보지 않는다.
4. 제목: 영어, Conventional Commits 형식, 70자 미만.
   본문(한국어):
   - `## 요약` — 무엇을 왜 바꿨는지
   - `## 변경 사항` — 리뷰어가 볼 지점 위주
   - `## 테스트` — 실제로 실행한 검증과 결과. 수동 확인이 필요한 항목은 체크박스로
   - 마이그레이션, 환경변수, `PROTECTED_ROUTES` 변경이 있으면 배포 시 주의사항으로 따로 적는다
5. `git push -u origin HEAD` 후 `gh pr create --base <base>`로 생성하고 PR URL을 보고한다.
