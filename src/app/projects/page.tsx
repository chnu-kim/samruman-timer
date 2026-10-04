"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ProjectCard } from "@/components/project/ProjectCard";
import { CreateProjectForm } from "@/components/project/CreateProjectForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PlusIcon, FolderIcon, SearchIcon } from "@/components/ui/Icons";
import { ProjectCardGridSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { FILL_FIRST_SCREEN } from "@/components/layout/page-height";
import { ErrorState } from "@/components/ui/ErrorState";
import { Pagination } from "@/components/ui/Pagination";
import { useDebounce } from "@/hooks/useDebounce";
import { authFetch } from "@/lib/auth-fetch";
import { fetchMe } from "@/lib/session-me";
import { SITE_DESCRIPTION } from "@/lib/site";
import type { ApiSuccessResponse, ProjectListItem, ProjectListResponse, MeResponse, Pagination as PaginationType } from "@/types";

type SortBy = "latest" | "name";
type Tab = "mine" | "others";

/** 한 페이지의 카드 수. 로딩 골격도 이 수만큼 그려 첫 페이지와 높이가 같다 */
const PAGE_SIZE = 12;

export default function ProjectsPage() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationType>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 첫 목록 응답을 받았는지. 받기 전에는 제목과 골격만 그린다(탭·검색줄이 뒤늦게 끼어들어 아래를 밀지 않게)
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [activeTab, setActiveTab] = useState<Tab>("mine");
  const [page, setPage] = useState(1);

  // 탭 개수(검색어와 무관한 전체 수). 처음 열 때 한 번만 센다(만들기·삭제는 다른 화면에서 하고 돌아오면 다시 연다).
  // 응답 전·실패면 null로 두어 '(0)'처럼 확정된 값으로 보이지 않게 한다
  const [mineTotal, setMineTotal] = useState<number | null>(null);
  const [othersTotal, setOthersTotal] = useState<number | null>(null);
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
    // 헤더도 같은 첫 로드에 세션을 확인하므로 fetchMe로 한 요청을 같이 쓴다. 비로그인·오류면 null이라 실패하지 않는다
    fetchMe()
      .then((me) => {
        if (me) setUser(me);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      params.set("sort", sortBy);
      const qs = params.toString();

      if (user) {
        const endpoint = activeTab === "mine" ? "/api/projects/mine" : "/api/projects/others";
        const res = await authFetch(`${endpoint}?${qs}`);
        if (res.ok) {
          const json = (await res.json()) as ApiSuccessResponse<ProjectListResponse>;
          setProjects(json.data.projects);
          setPagination(json.data.pagination);
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
      setListLoadedOnce(true);
    }
  }, [user, activeTab, debouncedQuery, sortBy, page]);

  // 로그인 사용자의 탭 개수. 검색·정렬·탭·페이지를 바꿀 때는 다시 세지 않는다
  const fetchTabCounts = useCallback(async () => {
    if (!user) return;
    try {
      const [mineRes, othersRes] = await Promise.all([
        authFetch("/api/projects/mine?limit=1"),
        authFetch("/api/projects/others?limit=1"),
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
      // 개수를 받지 못하면 탭을 개수 없이 둔다
    } finally {
      setCountsLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    if (authChecked) fetchProjects();
  }, [authChecked, fetchProjects]);

  useEffect(() => {
    if (authChecked) fetchTabCounts();
  }, [authChecked, fetchTabCounts]);

  // Reset page when search/sort/tab changes
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedQuery, sortBy, activeTab]);

  // WAI-ARIA Tabs 패턴: 화살표 키로 선택을 옮길 때 포커스도 새 탭으로 옮긴다
  function handleTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next: Tab = activeTab === "mine" ? "others" : "mine";
    setActiveTab(next);
    document.getElementById(`project-tab-${next}`)?.focus();
  }

  // 공개 프로젝트(다른 사람의 프로젝트)가 하나도 없으면 고를 것이 없으므로 탭 바 없이 내 목록만 둔다.
  // 개수를 받지 못했으면(null) 있는지 모르므로 탭을 남긴다
  const showTabs = !!user && othersTotal !== 0;
  if (!showTabs && activeTab !== "mine") setActiveTab("mine");

  // 고른 탭에 프로젝트가 하나도 없으면 검색할 대상이 없으므로 검색·정렬을 숨긴다.
  // 개수를 모르면(실패) 검색어 없이 받은 첫 페이지가 0건일 때로 판단한다
  const tabTotal = activeTab === "mine" ? mineTotal : othersTotal;
  const tabEmpty =
    tabTotal === 0 ||
    (tabTotal === null && !loading && !error && !debouncedQuery && page === 1 && projects.length === 0);
  const hideSearchControls = !!user && tabEmpty && !searchQuery;

  // 빈 목록에서는 본문의 '첫 프로젝트 만들기' 하나만 남긴다. 폼을 열면 헤더 버튼이 '취소'로 돌아와 닫을 수 있다.
  // 본문 버튼이 실제로 그려질 때만 숨긴다. 목록 요청이 로딩 중이거나 실패하면 본문 버튼이 없어 만들 길이 사라진다
  const hideHeaderCreate =
    activeTab === "mine" && hideSearchControls && !showForm && !loading && !error && projects.length === 0;

  // 화면 모양(탭 바·검색줄·만들기 버튼·소개 줄)을 정하는 것을 모두 받기 전에는 제목과 골격만 그린다.
  // 로그인 확인 → 목록·개수가 따로 도착할 때마다 줄이 끼어들어 아래를 미는 대신 골격 → 본문 한 번에 바뀐다
  const ready = authChecked && listLoadedOnce && (!user || countsLoaded);

  return (
    <section className={`space-y-6 ${FILL_FIRST_SCREEN}`}>
      {/* 헤더. 제목은 처음부터 그린다. 제목 줄을 버튼 높이로 잡아 두어 버튼·소개 줄이 나중에 나타나도 제목이 움직이지 않는다 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex min-h-10 pointer-coarse:min-h-11 items-center">
            <h1 className="text-2xl font-bold">프로젝트</h1>
          </div>
          {/* 처음 온 사람이 이 서비스가 무엇인지 알 수 있게 로그아웃 상태에만 한 줄 소개를 둔다 */}
          {ready && !user && <p className="text-sm text-muted-foreground">{SITE_DESCRIPTION}</p>}
        </div>
        {ready && user && !hideHeaderCreate && (
          <Button
            variant={showForm ? "secondary" : "primary"}
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
          <CreateProjectForm />
        </div>
      )}

      {!ready ? (
        // 검색줄 자리 + 첫 페이지 카드 수만큼의 골격
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-10 w-full pointer-coarse:h-11" />
          <ProjectCardGridSkeleton count={PAGE_SIZE} />
        </div>
      ) : (
      <>
      {/* 로그인 시 탭. 공개 프로젝트가 없으면 내 목록만 둔다 */}
      {showTabs && (
        <div className="flex gap-1 border-b border-border" role="tablist" aria-label="프로젝트 소유 필터">
          <button
            role="tab"
            id="project-tab-mine"
            aria-selected={activeTab === "mine"}
            aria-controls="project-tabpanel"
            tabIndex={activeTab === "mine" ? 0 : -1}
            onClick={() => setActiveTab("mine")}
            onKeyDown={handleTabKeyDown}
            className={`h-10 px-4 pointer-coarse:min-h-11 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "mine"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            내 프로젝트{mineTotal !== null && ` (${mineTotal})`}
          </button>
          <button
            role="tab"
            id="project-tab-others"
            aria-selected={activeTab === "others"}
            aria-controls="project-tabpanel"
            tabIndex={activeTab === "others" ? 0 : -1}
            onClick={() => setActiveTab("others")}
            onKeyDown={handleTabKeyDown}
            className={`h-10 px-4 pointer-coarse:min-h-11 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "others"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            공개 프로젝트{othersTotal !== null && ` (${othersTotal})`}
          </button>
        </div>
      )}

      {/* 검색 + 정렬 */}
      {!hideSearchControls && (
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="프로젝트 검색…"
              aria-label="프로젝트 검색"
              className="h-10 pointer-coarse:min-h-11 w-full rounded-control border border-border-input bg-background pl-9 pr-3 text-sm transition-colors"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label="정렬 기준"
            className="h-10 pointer-coarse:min-h-11 shrink-0 rounded-control border border-border-input bg-background px-3 text-sm"
          >
            <option value="latest">최신순</option>
            <option value="name">이름순</option>
          </select>
        </div>
      )}

      {/* 목록. 탭이 있으면 위 탭이 가리키는 tabpanel이다 */}
      <div
        className="space-y-6"
        role={showTabs ? "tabpanel" : undefined}
        id={showTabs ? "project-tabpanel" : undefined}
        aria-labelledby={showTabs ? `project-tab-${activeTab}` : undefined}
      >
        {loading ? (
          <ProjectCardGridSkeleton count={PAGE_SIZE} />
        ) : error ? (
          <ErrorState message="프로젝트를 불러오지 못했습니다." onRetry={fetchProjects} />
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
              {/* 내 목록이면 아직 만들지 않은 것, 공개 목록(다른 사람의 프로젝트·로그아웃 목록)이면 공개된 것이 없는 것이다 */}
              <p className="mt-4 text-muted-foreground">
                {user && activeTab === "mine" ? "아직 프로젝트가 없습니다." : "공개된 프로젝트가 없습니다."}
              </p>
              {user && !showForm && activeTab === "mine" && (
                <Button
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
                <ProjectCard key={project.id} project={project} showOwner={!(user && activeTab === "mine")} />
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
      </div>
      </>
      )}
    </section>
  );
}
