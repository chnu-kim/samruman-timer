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
    // 전체 병렬 실행(부하) 때 jsdom 페이지 렌더 테스트가 5초 기본값을 넘겨 흔들렸다
    testTimeout: 20000,
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    // 에이전트 worktree(.claude/worktrees)의 테스트 사본까지 잡히지 않게 한다
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
