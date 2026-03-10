# 삼루먼 타이머

치지직 스트리머용 방송 연장 카운트다운 타이머.

시청자 후원에 따라 시간을 추가/차감하고, 변경 이력을 로그와 그래프로 시각화한다. OBS 브라우저 소스로 방송 화면에 표시 가능.

## 시작하기

```bash
pnpm install
cp .env.example .env
pnpm db:migrate:local
pnpm dev
```

## 스크립트

```bash
pnpm dev              # 개발 서버
pnpm test             # 테스트
pnpm run deploy       # Cloudflare 배포
pnpm db:migrate       # DB 마이그레이션 (원격)
pnpm db:migrate:local # DB 마이그레이션 (로컬)
```

## 기술 스택

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Recharts · Cloudflare D1 · CHZZK OAuth

## 문서

설계 문서는 [`docs/`](docs/) 참고.
