"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ProjectCard } from "@/components/project/ProjectCard";
import { CreateProjectForm } from "@/components/project/CreateProjectForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PlusIcon, FolderIcon, SearchIcon } from "@/components/ui/Icons";
import { ProjectCardGridSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Pagination } from "@/components/ui/Pagination";
import { useDebounce } from "@/hooks/useDebounce";
import type { ApiSuccessResponse, ProjectListItem, ProjectListResponse, MeResponse, Pagination as PaginationType } from "@/types";

type SortBy = "latest" | "name";
type Tab = "mine" | "others";

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationType>({ page: 1, limit: 12, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [activeTab, setActiveTab] = useState<Tab>("mine");
  const [page, setPage] = useState(1);

  // Track total per tab for tab counts
  const [mineTotal, setMineTotal] = useState(0);
  const [othersTotal, setOthersTotal] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const json = (await res.json()) as { data: MeResponse };
          setUser(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      params.set("page", String(page));
      params.set("limit", "12");
      params.set("sort", sortBy);
      const qs = params.toString();

      if (user) {
        const endpoint = activeTab === "mine" ? "/api/projects/mine" : "/api/projects/others";
        const res = await fetch(`${endpoint}?${qs}`);
        if (res.ok) {
          const json = (await res.json()) as ApiSuccessResponse<ProjectListResponse>;
          setProjects(json.data.projects);
          setPagination(json.data.pagination);
          if (activeTab === "mine") setMineTotal(json.data.pagination.total);
          else setOthersTotal(json.data.pagination.total);
        } else {
          setError(true);
        }
      } else {
        const res = await fetch(`/api/projects?${qs}`);
        if (res.ok) {
          const json = (await res.json()) as ApiSuccessResponse<ProjectListResponse>;
          setProjects(json.data.projects);
          setPagination(json.data.pagination);
        } else {
          setError(true);
        }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user, activeTab, debouncedQuery, sortBy, page]);

  // Fetch tab counts on initial load for logged-in users
  const fetchTabCounts = useCallback(async () => {
    if (!user) return;
    try {
      const [mineRes, othersRes] = await Promise.all([
        fetch("/api/projects/mine?limit=1"),
        fetch("/api/projects/others?limit=1"),
      ]);
      if (mineRes.ok) {
        const json = (await mineRes.json()) as ApiSuccessResponse<ProjectListResponse>;
        setMineTotal(json.data.pagination.total);
      }
      if (othersRes.ok) {
        const json = (await othersRes.json()) as ApiSuccessResponse<ProjectListResponse>;
        setOthersTotal(json.data.pagination.total);
      }
    } catch {
      // ignore count fetch errors
    }
  }, [user]);

  useEffect(() => {
    if (authChecked) {
      fetchProjects();
      fetchTabCounts();
    }
  }, [authChecked, fetchProjects, fetchTabCounts]);

  // Reset page when search/sort/tab changes
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedQuery, sortBy, activeTab]);

  function handleCreateSuccess(id: string) {
    router.push(`/projects/${id}`);
  }

  if (!authChecked) {
    return (
      <section>
        <div className="h-8 w-48 mb-6" />
        <ProjectCardGridSkeleton count={6} />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">프로젝트</h1>
        {user && (
          <Button
            variant={showForm ? "secondary" : "primary"}
            size="sm"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? (
              "취소"
            ) : (
              <>
                <PlusIcon className="w-4 h-4 mr-1" />
                새 프로젝트
              </>
            )}
          </Button>
        )}
      </div>

      {showForm && (
        <div
          className="rounded-xl border border-accent/30 bg-accent-light/20 p-5 animate-fade-in"
        >
          <h2 className="text-sm font-bold text-foreground mb-4">새 프로젝트 만들기</h2>
          <CreateProjectForm onSuccess={handleCreateSuccess} />
        </div>
      )}

      {/* 로그인 시 탭 */}
      {user && (
        <div className="flex gap-1 border-b border-border" role="tablist" aria-label="프로젝트 소유 필터">
          <button
            role="tab"
            id="project-tab-mine"
            aria-selected={activeTab === "mine"}
            aria-controls="project-tabpanel"
            tabIndex={activeTab === "mine" ? 0 : -1}
            onClick={() => setActiveTab("mine")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setActiveTab(activeTab === "mine" ? "others" : "mine");
              }
            }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "mine"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            내 프로젝트 ({mineTotal})
          </button>
          <button
            role="tab"
            id="project-tab-others"
            aria-selected={activeTab === "others"}
            aria-controls="project-tabpanel"
            tabIndex={activeTab === "others" ? 0 : -1}
            onClick={() => setActiveTab("others")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setActiveTab(activeTab === "mine" ? "others" : "mine");
              }
            }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "others"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            다른 프로젝트 ({othersTotal})
          </button>
        </div>
      )}

      {/* 검색 + 정렬 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="프로젝트 검색..."
            aria-label="프로젝트 검색"
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="정렬 기준"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="latest">최신순</option>
          <option value="name">이름순</option>
        </select>
      </div>

      {/* 목록 */}
      {loading ? (
        <ProjectCardGridSkeleton count={6} />
      ) : error ? (
        <ErrorState message="프로젝트를 불러오는데 실패했습니다." onRetry={fetchProjects} />
      ) : projects.length === 0 ? (
        searchQuery.trim() ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FolderIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="mt-4 text-muted-foreground">아직 프로젝트가 없습니다.</p>
            {user && !showForm && activeTab === "mine" && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setShowForm(true)}
              >
                <PlusIcon className="w-4 h-4 mr-1" />
                첫 프로젝트 만들기
              </Button>
            )}
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          {pagination.totalPages > 1 && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
