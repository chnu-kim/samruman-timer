// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { Badge } from "../Badge";

type Variant = Parameters<typeof Badge>[0]["variant"];

const classOf = (variant: Variant) => {
  const { container } = render(<Badge variant={variant}>배지</Badge>);
  return container.firstElementChild!.className;
};

// C105: 배지 색은 의미 축 네 개(진행·추가 초록, 종료·차감 빨강, 예약 보라, 나머지 회색)와 '연결 끊김' 윤곽뿐이다
describe("Badge 의미 축", () => {
  it("같은 의미는 같은 모양이다", () => {
    expect(classOf("expire")).toBe(classOf("expired"));
    expect(classOf("subtract")).toBe(classOf("expired"));
    expect(classOf("add")).toBe(classOf("running"));
    expect(classOf("completed")).toBe(classOf("running"));
    for (const v of ["reopen", "activate", "delete"] as const) expect(classOf(v)).toBe(classOf("create"));
  });

  it("모양은 다섯 가지(색 4 + 윤곽 1)를 넘지 않는다", () => {
    const all: Variant[] = ["running", "expired", "scheduled", "create", "add", "subtract", "expire", "reopen", "activate", "delete", "completed", "disconnected"];
    expect(new Set(all.map(classOf)).size).toBe(5);
  });

  // 라이트에서 채도 높은 알약(흰 글자)이 카운트다운보다 먼저 눈에 띄지 않게 라이트도 틴트 방식이다
  it("라이트도 옅은 틴트 위 진한 글자다", () => {
    expect(classOf("running")).toContain("bg-green-50");
    expect(classOf("running")).toContain("text-green-700");
    expect(classOf("expired")).toContain("bg-red-50");
    for (const v of ["running", "expired", "scheduled", "create"] as const) expect(classOf(v)).not.toContain("text-white");
  });

  it("연결 끊김은 칠하지 않은 윤곽이라 흑백에서도 다른 배지와 구분된다", () => {
    expect(classOf("disconnected")).toContain("ring-1");
    expect(classOf("disconnected")).toContain("bg-transparent");
    expect(classOf("create")).not.toContain("ring-1");
  });
});
