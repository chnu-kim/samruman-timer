---
name: commit
description: 변경 분석 → 커밋 메시지 생성 → 커밋
user_invocable: true
---

# Git 커밋

변경 사항을 분석하고, Conventional Commits 형식의 한국어 커밋 메시지를 자동 생성하여 커밋한다.

## 동작

**반드시 `git-committer` 에이전트를 Agent 도구로 호출하여 위임한다.**

에이전트가 다음을 수행한다:
1. `git status` + `git diff`로 변경 분석
2. 기존 커밋 스타일 참조 (`git log --oneline -10`)
3. 커밋 타입 판별 (feat/fix/refactor/style/test/docs/chore)
4. 커밋 메시지 생성 (`type: 한국어 설명`)
5. `pnpm build` 빌드 검증
6. 민감 파일 제외 후 스테이징 + 커밋

## 출력 형식

```
## 커밋 완료

| 항목 | 내용 |
|------|------|
| 커밋 해시 | abc1234 |
| 타입 | feat |
| 메시지 | feat: 새 기능 추가 |
| 변경 파일 | 5개 (추가 2, 수정 3) |
```
