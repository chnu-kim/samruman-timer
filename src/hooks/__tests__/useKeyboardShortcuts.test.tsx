// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts, SHORTCUT_HELP } from "../useKeyboardShortcuts";

function press(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function setup(enabled = true) {
  const onPreset = vi.fn();
  const onToggleAction = vi.fn();
  const onRefresh = vi.fn();
  const hook = renderHook(
    ({ enabled }) => useKeyboardShortcuts({ enabled, onPreset, onToggleAction, onRefresh }),
    { initialProps: { enabled } },
  );
  return { hook, onPreset, onToggleAction, onRefresh };
}

describe("useKeyboardShortcuts", () => {
  // UX-01: Tab은 포커스 이동에 쓰여야 한다
  it("Tab은 가로채지 않는다 (preventDefault 없음, 방향 전환 없음)", () => {
    const { onToggleAction } = setup();
    const event = press({ key: "Tab", code: "Tab" });
    expect(event.defaultPrevented).toBe(false);
    expect(onToggleAction).not.toHaveBeenCalled();
  });

  it("X 키로 추가/차감을 전환한다", () => {
    const { onToggleAction } = setup();
    const event = press({ key: "x", code: "KeyX" });
    expect(event.defaultPrevented).toBe(true);
    expect(onToggleAction).toHaveBeenCalledTimes(1);
  });

  it("한국어 IME가 켜져 있어도 X 위치의 키로 전환한다", () => {
    const { onToggleAction } = setup();
    press({ key: "ㅌ", code: "KeyX" });
    press({ key: "Process", code: "KeyX" });
    press({ key: "X", code: "KeyX", shiftKey: true });
    expect(onToggleAction).toHaveBeenCalledTimes(3);
  });

  it("Cmd/Ctrl/Alt 조합의 X는 전환하지 않는다", () => {
    const { onToggleAction } = setup();
    const meta = press({ key: "x", code: "KeyX", metaKey: true });
    press({ key: "x", code: "KeyX", ctrlKey: true });
    press({ key: "≈", code: "KeyX", altKey: true });
    expect(onToggleAction).not.toHaveBeenCalled();
    expect(meta.defaultPrevented).toBe(false);
  });

  it("숫자키는 프리셋 초를 넘긴다", () => {
    const { onPreset } = setup();
    press({ key: "1", code: "Digit1" });
    press({ key: "5", code: "Digit5" });
    press({ key: "0", code: "Digit0" });
    expect(onPreset.mock.calls).toEqual([[3600], [18000], [36000]]);
  });

  // Cmd+1(탭 전환)이 1시간 추가를 보내거나 Cmd+R 새로고침이 막히면 안 된다
  it("Cmd/Ctrl/Alt 조합의 숫자키는 프리셋을 보내지 않고 브라우저 동작을 막지 않는다", () => {
    const { onPreset } = setup();
    const events = [
      press({ key: "1", code: "Digit1", metaKey: true }),
      press({ key: "5", code: "Digit5", ctrlKey: true }),
      press({ key: "0", code: "Digit0", altKey: true }),
    ];
    expect(onPreset).not.toHaveBeenCalled();
    expect(events.every((event) => !event.defaultPrevented)).toBe(true);
  });

  it("Cmd/Ctrl/Alt 조합의 R, ?는 가로채지 않는다", () => {
    const { hook, onRefresh } = setup();
    const events = [
      press({ key: "r", code: "KeyR", metaKey: true }),
      press({ key: "r", code: "KeyR", ctrlKey: true }),
      press({ key: "R", code: "KeyR", metaKey: true, shiftKey: true }),
      press({ key: "?", code: "Slash", metaKey: true, shiftKey: true }),
    ];
    expect(onRefresh).not.toHaveBeenCalled();
    expect(hook.result.current.showHelp).toBe(false);
    expect(events.every((event) => !event.defaultPrevented)).toBe(true);
  });

  it("R은 대소문자와 한국어 IME에 상관없이 키 위치로 동작한다", () => {
    const { onRefresh } = setup();
    press({ key: "r", code: "KeyR" });
    press({ key: "R", code: "KeyR", shiftKey: true });
    press({ key: "ㄱ", code: "KeyR" });
    press({ key: "Process", code: "KeyR" });
    expect(onRefresh).toHaveBeenCalledTimes(4);
  });

  it("입력 필드에 포커스가 있으면 무시한다", () => {
    const { onPreset, onToggleAction } = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    press({ key: "1", code: "Digit1" }, input);
    press({ key: "x", code: "KeyX" }, input);
    expect(onPreset).not.toHaveBeenCalled();
    expect(onToggleAction).not.toHaveBeenCalled();
    input.remove();
  });

  // UX-04: 모달이 열리면 page가 enabled=false로 내린다
  it("enabled=false이면 아무 단축키도 동작하지 않는다", () => {
    const { onPreset, onToggleAction, onRefresh } = setup(false);
    press({ key: "1", code: "Digit1" });
    press({ key: "x", code: "KeyX" });
    press({ key: "r", code: "KeyR" });
    expect(onPreset).not.toHaveBeenCalled();
    expect(onToggleAction).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  // UX-04: 도움말이 열려 있는 동안 시간을 바꾸는 단축키는 막고 '?'는 유지한다
  it("도움말이 열려 있으면 프리셋과 전환을 무시하고 '?'로 닫을 수 있다", () => {
    const { hook, onPreset, onToggleAction, onRefresh } = setup();
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(hook.result.current.showHelp).toBe(true);

    press({ key: "1", code: "Digit1" });
    press({ key: "x", code: "KeyX" });
    expect(onPreset).not.toHaveBeenCalled();
    expect(onToggleAction).not.toHaveBeenCalled();

    press({ key: "r", code: "KeyR" });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    press({ key: "?", code: "Slash", shiftKey: true });
    expect(hook.result.current.showHelp).toBe(false);

    press({ key: "1", code: "Digit1" });
    expect(onPreset).toHaveBeenCalledWith(3600);
  });

  it("도움말 목록에 Tab이 없고 X가 있다", () => {
    const keys = SHORTCUT_HELP.map((item) => item.key);
    expect(keys).not.toContain("Tab");
    expect(keys).toContain("X");
  });
});
