import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    // 시간 제한은 기본 5초로 두어 느려진 테스트가 드러나게 한다. 화면 전체를 그리는 무거운 파일(콘솔·오버레이 화면,
    // 오버레이 설정)만 파일 안에서 vi.setConfig로 늘린다(실행이 겹친 CPU 경합에서 그 파일들만 5초를 넘었다)
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    // 에이전트 worktree(.claude/worktrees)의 테스트 사본까지 잡히지 않게 한다
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
