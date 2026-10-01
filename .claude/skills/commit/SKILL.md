---
name: commit
description: 작업 트리 변경을 분석해 이 프로젝트 컨벤션(Conventional Commits, 한국어 요약)으로 커밋한다.
argument-hint: "[커밋 범위나 메시지 힌트]"
disable-model-invocation: true
---

현재 변경을 커밋한다. 인자가 있으면 커밋 범위나 메시지에 대한 힌트로 사용한다: $ARGUMENTS

1. `git status`, `git diff`, `git diff --cached`, `git log --oneline -10`으로 변경과 최근 메시지 스타일을 파악한다.
2. 변경이 서로 무관한 여러 작업을 섞고 있으면 논리 단위로 나눠 여러 커밋을 제안한다. 이번 작업과 무관해 보이는 파일(사용자의 진행 중 작업, 임시 스크립트 등)은 임의로 포함하지 말고 물어본다.
3. 메시지: `type: 한국어 요약` 한 줄(50자 안팎). 타입은 `feat`/`fix`/`refactor`/`style`/`test`/`docs`/`chore`. 이유가 diff만으로 드러나지 않으면 본문에 "왜"를 적는다.
4. 코드 변경이 포함되면 `pnpm test`와 `pnpm build`를 통과시킨 뒤 커밋한다. 실패하면 커밋하지 않고 원인을 보고한다. 문서·하네스만 바뀐 경우는 생략한다.
5. 파일을 경로로 지정해 스테이징한다 (`git add -A` 금지). `.env*`, 자격 증명, `.dev.vars`는 절대 스테이징하지 않는다.
6. main/master 브랜치라면 커밋 전에 브랜치를 만들지 사용자에게 확인한다.

끝나면 커밋 해시와 메시지를 짧게 보고한다.
