---
name: commit
description: 변경 분석 → 커밋 메시지 생성 → 커밋
user_invocable: true
---

# Git 커밋

변경 사항을 분석하고, Conventional Commits 형식의 한국어 커밋 메시지를 자동 생성하여 커밋한다.

## 동작 순서

### 1단계: 변경 사항 확인

```bash
git status
git diff --cached
git diff
```

변경 파일이 없으면 안내 메시지를 출력하고 종료한다.

### 2단계: 기존 커밋 스타일 참조

```bash
git log --oneline -10
```

### 3단계: 변경 분석 및 커밋 타입 판별

변경된 파일과 diff 내용을 분석하여 적절한 커밋 타입을 판별한다:

- `feat` — 새 route.ts, page.tsx, 컴포넌트 추가
- `fix` — 기존 파일 버그 수정
- `refactor` — 코드 구조 변경 (동작 불변)
- `style` — CSS, 디자인 토큰, UI 변경
- `test` — test 파일만 변경
- `docs` — docs/ 또는 *.md 파일만 변경
- `chore` — config, migration, 설정 파일

### 4단계: 커밋 메시지 생성

형식: `type: 한국어 설명`

사용자에게 생성된 커밋 메시지를 보여주고 확인을 받는다:

```
## 커밋 메시지 미리보기

type: 한국어 설명

변경 파일:
- 추가: file1.ts, file2.ts
- 수정: file3.ts
- 삭제: file4.ts
```

### 5단계: 빌드 검증

```bash
pnpm build 2>&1
```

빌드 실패 시 에러를 보고하고 커밋하지 않는다.

### 6단계: 스테이징 + 커밋

민감 파일(`.env`, credentials 등)은 제외하고 변경 파일을 개별 스테이징한다.

```bash
git add <파일들>
git commit -m "$(cat <<'EOF'
type: 한국어 설명

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### 7단계: 결과 출력

```
## 커밋 완료

| 항목 | 내용 |
|------|------|
| 커밋 해시 | abc1234 |
| 타입 | feat |
| 메시지 | feat: 새 기능 추가 |
| 변경 파일 | 5개 (추가 2, 수정 3) |
```
