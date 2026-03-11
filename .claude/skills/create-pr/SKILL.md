---
name: create-pr
description: 변경 분석 → PR 제목/본문 생성 → gh pr create
user_invocable: true
---

# PR 생성

현재 브랜치의 변경 사항을 분석하여 PR 제목과 본문을 자동 생성하고 GitHub PR을 생성한다.

## 동작 순서

### 1단계: 브랜치 확인

```bash
git branch --show-current
```

`main` 또는 `master`에서 실행 시 새 브랜치를 만들라고 안내하고 종료한다.

### 2단계: 포함 커밋 확인

```bash
git log main..HEAD --oneline
```

커밋이 없으면 안내 메시지를 출력하고 종료한다.

### 3단계: 전체 변경 분석

```bash
git diff main...HEAD
```

모든 커밋의 변경을 종합 분석한다. 파일별 변경 유형(추가/수정/삭제)과 주요 로직 변경을 파악한다.

### 4단계: PR 제목 + 본문 생성

사용자에게 미리보기를 보여주고 확인을 받는다:

```
## PR 미리보기

**제목**: feat: add timer settings page
**브랜치**: feature/timer-settings → main
**커밋**: 5개

### 본문
## 요약
- 타이머 설정 페이지 추가
- 기본값 편집 기능 구현

## 테스트 계획
- [ ] 설정 저장/불러오기 확인
- [ ] 유효성 검증 확인
```

### 5단계: 미푸시 커밋 푸시

미푸시 커밋이 있으면 자동으로 `git push -u origin HEAD`를 실행한다.

### 6단계: PR 생성

```bash
gh pr create --title "PR 제목" --body "$(cat <<'EOF'
## 요약
- bullet points

## 테스트 계획
- [ ] 체크리스트

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 7단계: 결과 출력

```
## PR 생성 완료

| 항목 | 내용 |
|------|------|
| PR URL | https://github.com/... |
| 제목 | feat: add timer settings |
| 브랜치 | feature/timer-settings → main |
| 커밋 수 | 5개 |
```
