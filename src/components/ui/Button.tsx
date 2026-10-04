import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// 변형 색과 hover를 나눠 둔다. 처리 중(aria-busy)에는 색만 남기고 hover는 뺀다
const variantStyles: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-accent text-accent-foreground",
  secondary: "border-border bg-transparent",
  ghost: "border-transparent bg-transparent",
  danger: "border-transparent bg-red-600 text-white dark:bg-red-700",
  // 텍스트 액션('다시 시도' 등). 크기와 상관없이 누르는 높이는 44px이다
  link: "border-transparent bg-transparent text-accent underline-offset-4",
};

const hoverStyles: Record<ButtonVariant, string> = {
  primary: "hover:bg-accent-hover",
  secondary: "hover:bg-foreground/5",
  ghost: "hover:bg-foreground/10",
  danger: "hover:bg-red-700 dark:hover:bg-red-800",
  link: "hover:underline",
};

// 크기는 역할로 고른다.
// md: 주 CTA·다이얼로그 제출·헤더 액션(기본값). sm: 표·밀집 영역·칩. lg: 시간 추가 제출 하나.
// 터치 기기(폰·태블릿)에서는 터치 타깃 44px을 보장한다. 화면 폭이 아니라 입력 방식으로 갈라서 가로 태블릿도 포함한다.
// min-height가 height보다 우선하므로 마우스 환경의 높이(h-8·h-10)는 그대로다
const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm pointer-coarse:min-h-11",
  md: "h-10 px-4 pointer-coarse:min-h-11",
  lg: "h-12 px-5 text-lg",
};

const linkSizeStyle = "min-h-11 px-2 text-sm";

// 비활성은 opacity로 흐리지 않고 중립 토큰으로 칠해 라이트·다크에서 같은 모양으로 둔다.
// 배경이 없는 ghost·link는 글자색만 바꾼다. 비활성일 때는 변형 스타일(hover 포함)을 붙이지 않는다
// (cn은 이어 붙이기만 해서 bg가 겹치면 CSS 순서로 갈린다)
const disabledStyles: Record<ButtonVariant, string> = {
  primary: "bg-muted text-muted-foreground border-border",
  secondary: "bg-muted text-muted-foreground border-border",
  danger: "bg-muted text-muted-foreground border-border",
  ghost: "border-transparent text-muted-foreground",
  link: "border-transparent text-muted-foreground",
};

type ButtonState = "enabled" | "disabled" | "busy";

function classes(variant: ButtonVariant, size: ButtonSize, state: ButtonState, className?: string) {
  return cn(
    // 테두리는 항상 1px을 두고 색만 변형마다 정한다(채움 버튼은 투명). 비활성으로 바뀔 때 크기가 달라지지 않는다
    "inline-flex items-center justify-center rounded-control border font-medium transition-colors",
    variant === "link" ? linkSizeStyle : sizeStyles[size],
    state === "enabled" && cn(variantStyles[variant], hoverStyles[variant]),
    state === "disabled" && cn(disabledStyles[variant], "cursor-not-allowed"),
    // 처리 중에 잠깐 막힌 버튼은 '쓸 수 없음'(회색)이 아니라 같은 색을 유지한다
    state === "busy" && cn(variantStyles[variant], "cursor-wait"),
    className,
  );
}

/**
 * Button과 같은 모양이 필요한 링크(<Link>)용 클래스.
 * 링크에는 :disabled가 없으므로 비활성 상태는 받지 않는다(가지 못하는 곳이면 링크를 렌더하지 않는다)
 */
export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return classes(variant, size, "enabled", className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const busy = props["aria-busy"] === true || props["aria-busy"] === "true";
  const state: ButtonState = !disabled ? "enabled" : busy ? "busy" : "disabled";
  return (
    <button
      className={classes(variant, size, state, className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
