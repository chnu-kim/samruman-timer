---
paths:
  - src/lib/db.ts
  - migrations/**
---

# D1 / 마이그레이션

스키마 설계: `docs/DATABASE.md`. 현재 스키마의 최종 형태는 `migrations/`를 순서대로 적용한 결과다.

## 마이그레이션 작성

- 새 파일: `migrations/NNNN_snake_case_description.sql`, 기존 최대 번호 + 1.
- 이미 존재하는 마이그레이션 파일은 수정하지 않는다. 프로덕션에 적용됐을 수 있다.
- 컬럼 타입 관례: ID `TEXT PRIMARY KEY` (32자 hex), 날짜 `TEXT` (ISO 8601 UTC), enum은 `TEXT` + `CHECK (... IN (...))`.
- SQLite는 `CHECK` 제약 변경이나 컬럼 수정을 `ALTER`로 못 한다. 이런 변경은 새 테이블 생성 → 데이터 복사 → 기존 테이블 삭제 → rename 순서로 한다 (`0002_scheduled_start.sql` 참고). 이때 인덱스도 다시 만든다.
- D1은 외래 키 강제가 기본 꺼져 있으므로 참조 무결성은 앱 코드에서 보장한다.
- 스키마를 바꾸면 `src/types/`의 행 타입과 `docs/DATABASE.md`를 함께 갱신한다.
- 로컬 검증: `pnpm db:migrate:local`. 원격(`pnpm db:migrate`)은 사용자 확인 후에만 실행한다.
