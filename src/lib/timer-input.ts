// 시간 조작·타이머 생성 폼이 함께 쓰는 입력 규칙 (클라이언트·서버 공용, 순수 함수)

export interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

/** 총 초를 시·분·초로 나눈다. 음수·NaN·소수는 0 이상의 정수 초로 맞춘다 */
export function splitSeconds(totalSeconds: number): TimeParts {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * 시·분·초 입력을 정규화한다. 60 이상의 분·초는 잘라 버리지 않고 윗자리로 올린다
 * (90분 → 1시간 30분, 75초 → 1분 15초). 입력한 만큼 그대로 반영되고, 결과는 버튼 라벨로 보인다
 */
export function normalizeTimeParts(hours: number, minutes: number, seconds: number): TimeParts {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return splitSeconds(safe(hours) * 3600 + safe(minutes) * 60 + safe(seconds));
}

/**
 * 즉시 적용(모바일 하단 바, 숫자 단축키)이 기록할 닉네임.
 * 입력란에 적은 이름이 우선이고, 비어 있으면 기본 닉네임을 쓴다. 둘 다 없으면 빈 문자열
 */
export function resolveQuickActor(typedName: string, defaultActor: string): string {
  return typedName.trim() || defaultActor.trim();
}
