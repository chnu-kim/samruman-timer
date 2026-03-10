---
paths:
  - src/lib/db.ts
  - migrations/**
---

# 데이터베이스 규칙

DB 관련 코드 작업 시 반드시 아래 설계 문서를 참조한다:

- `docs/DATABASE.md` — D1 스키마, 인덱스, 마이그레이션 전략, 타입 규칙

## 핵심 규칙

- DB: Cloudflare D1 (SQLite 호환)
- 접근: `getCloudflareContext().env.DB`
- ID: `TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))` — 32자 hex
- 날짜: `TEXT` 타입, `datetime('now')` (ISO 8601 UTC)
- enum: `TEXT` + `CHECK` 제약조건
- 트랜잭션: `db.batch()` 로 여러 쿼리를 원자적 실행
- 마이그레이션: `migrations/NNNN_description.sql` 순번 관리
- 기존 마이그레이션 파일 수정 금지 — 변경 시 새 파일 추가
- `wrangler d1 migrations apply` 로 적용