---
name: push
description: 현재 브랜치를 원격에 푸시한다
user_invocable: true
---

# Git 푸시

현재 브랜치의 커밋을 원격 저장소에 푸시한다. 에이전트 없이 직접 실행한다.

## 동작 순서

### 1단계: 현재 브랜치 확인

```bash
git branch --show-current
```

### 2단계: main/master 브랜치 보호

현재 브랜치가 `main` 또는 `master`인 경우 경고를 표시하고 사용자 확인을 받는다.

### 3단계: 미커밋 변경 확인

```bash
git status
```

커밋되지 않은 변경 사항이 있으면 `/commit`을 먼저 실행하라고 안내한다.

### 4단계: 미푸시 커밋 확인

```bash
git log @{u}..HEAD --oneline 2>/dev/null || git log --oneline -5
```

푸시할 커밋이 없으면 "이미 최신 상태입니다"를 출력하고 종료한다.

### 5단계: 푸시 실행

```bash
git push -u origin HEAD
```

### 6단계: 결과 출력

```
## 푸시 완료

| 항목 | 내용 |
|------|------|
| 브랜치 | feature/my-branch |
| 푸시 커밋 | 3개 |
| 상태 | 성공 |
```
