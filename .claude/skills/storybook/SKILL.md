---
name: storybook
description: Storybook 빌드를 실행하고 결과를 분석한다
user_invocable: true
---

# Storybook 빌드 검증 스킬

## 실행 절차

1. **스토리 파일 확인**: `src/components/**/*.stories.tsx` 패턴으로 모든 스토리 파일 목록 조회
2. **빌드 실행**: `pnpm build-storybook` 실행
3. **결과 분석**:
   - 빌드 성공 시: 포함된 스토리 수, 컴포넌트 수 보고
   - 빌드 실패 시: 에러 메시지 분석 및 수정 방안 제시
4. **커버리지 갭 확인**: `src/components/` 내 컴포넌트 중 스토리가 없는 파일 목록 출력

## 출력 형식

```
## Storybook 빌드 결과

- 상태: ✅ 성공 / ❌ 실패
- 스토리 파일: N개
- 커버리지 갭: (스토리 없는 컴포넌트 목록)
```
