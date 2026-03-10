"use client";

import { useEffect, useState, useCallback } from "react";
import { ProjectCard } from "@/components/project/ProjectCard";
import { CreateProjectForm } from "@/components/project/CreateProjectForm";
import { Button } from "@/components/ui/Button";
import type { ApiSuccessResponse, ProjectListItem, MeResponse } from "@/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<ProjectListItem[]>;
        setProjects(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const json = (await res.json()) as { data: MeResponse };
          setUser(json.data);
        }
      })
      .catch(() => {});
  }, [fetchProjects]);

  function handleCreateSuccess(id: string) {
    setShowForm(false);
    fetchProjects();
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">프로젝트</h1>
        {user && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "취소" : "새 프로젝트"}
          </Button>
        )}
      </div>

      {showForm && (
        <div className="mt-4 rounded-xl border border-foreground/20 p-5">
          <CreateProjectForm onSuccess={handleCreateSuccess} />
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-foreground/60">로딩 중...</p>
        ) : projects.length === 0 ? (
          <p className="text-foreground/60">프로젝트가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
