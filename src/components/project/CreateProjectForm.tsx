"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { NEW_TIMER_PARAM } from "@/lib/project-flow";
import type { ApiSuccessResponse, ApiErrorResponse, ProjectCreateResponse } from "@/types";

interface CreateProjectFormProps {
  onSuccess?: (id: string) => void;
}

export function CreateProjectForm({ onSuccess }: CreateProjectFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });

      if (!res.ok) {
        const json = (await res.json()) as ApiErrorResponse;
        setError(json.error.message);
        return;
      }

      const json = (await res.json()) as ApiSuccessResponse<ProjectCreateResponse>;
      toast("프로젝트가 생성되었습니다.", "success");
      if (onSuccess) {
        onSuccess(json.data.id);
      } else {
        // 프로젝트와 타이머는 1:1이라 상세 화면에서 타이머 만들기 창을 바로 연다
        router.push(`/projects/${json.data.id}?${NEW_TIMER_PARAM}`);
      }
    } catch {
      setError("프로젝트 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="프로젝트 이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
        maxLength={100}
        placeholder="프로젝트 이름을 입력하세요"
      />
      <Input
        label="설명"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        placeholder="프로젝트 설명 (선택)"
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
      <Button type="submit" disabled={loading || !name.trim()} aria-busy={loading}>
        {loading ? "생성 중…" : "프로젝트 만들기"}
      </Button>
    </form>
  );
}
