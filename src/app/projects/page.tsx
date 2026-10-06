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
import { rememberSignedIn } from "@/lib/auth-hint";
import { buttonClassName } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { SITE_DESCRIPTION } from "@/lib/site";
import type { ApiSuccessResponse, ProjectListItem, ProjectListResponse, MeResponse, Pagination as PaginationType } from "@/types";

type SortBy = "latest" | "name";

/** 한 페이지의 카드 수. 로딩 골격도 이 수만큼 그려 첫 페이지와 높이가 같다 */
const PAGE_SIZE = 12;

/** 로그아웃 본문(로그인 안내)의 높이. 골격도 로그아웃 힌트면 같은 높이만 비워 두어 골격 → 본문 때 아래가 밀리지 않는다 */
const SIGNED_OUT_BLOCK = "h-56";

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
  const [page, setPage] = useState(1);

  // 검색어와 무관한 내 프로젝트 전체 수. 검색어 없이 받은 응답의 total로 정한다(만들기·삭제는 다른 화면에서 하고 돌아오면 다시 연다).
  // 받기 전·실패면 null이다
  const [mineTotal, setMineTotal] = useState<number | null>(null);

  useEffect(() => {
    // 헤더도 같은 첫 로드에 세션을 확인하므로 fetchMe로 한 요청을 같이 쓴다. 비로그인·오류면 null이라 실패하지 않는다
    fetchMe()
      .then((me) => {
        if (me) setUser(me);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // 목록은 내 프로젝트만 보인다. 다른 사람의 프로젝트는 목록으로 드러내지 않고 상세는 소유자가 건넨 링크로만 연다.
  // 로그아웃이면 보일 목록이 없으므로 부르지 않는다
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      params.set("sort", sortBy);
      const qs = params.toString();

      const res = await authFetch(`/api/projects/mine?${qs}`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<ProjectListResponse>;
        setProjects(json.data.projects);
        setPagination(json.data.pagination);
        if (!debouncedQuery) setMineTotal(json.data.pagination.total);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setListLoadedOnce(true);
    }
  }, [user, debouncedQuery, sortBy, page]);

  useEffect(() => {
    if (authChecked) fetchProjects();
  }, [authChecked, fetchProjects]);

  // Reset page when search/sort changes
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedQuery, sortBy]);

  // 프로젝트가 하나도 없으면 검색할 대상이 없으므로 검색·정렬을 숨긴다.
  // 개수를 모르면(실패) 검색어 없이 받은 첫 페이지가 0건일 때로 판단한다
  const listEmpty =
    mineTotal === 0 ||
    (mineTotal === null && !loading && !error && !debouncedQuery && page === 1 && projects.length === 0);
  const hideSearchControls = listEmpty && !searchQuery;

  // 빈 목록에서는 본문의 '첫 프로젝트 만들기' 하나만 남긴다. 폼을 열면 헤더 버튼이 '취소'로 돌아와 닫을 수 있다.
  // 본문 버튼이 실제로 그려질 때만 숨긴다. 목록 요청이 로딩 중이거나 실패하면 본문 버튼이 없어 만들 길이 사라진다
  const hideHeaderCreate = hideSearchControls && !showForm && !loading && !error && projects.length === 0;

  // 화면 모양(검색줄·만들기 버튼·소개 줄·로그인 안내)을 정하는 것을 모두 받기 전에는 제목과 골격만 그린다.
  // 로그인 확인 → 목록이 따로 도착할 때마다 줄이 끼어들어 아래를 미는 대신 골격 → 본문 한 번에 바뀐다
  const ready = authChecked && (!user || listLoadedOnce);

  return (
    <section className={`space-y-6 ${FILL_FIRST_SCREEN}`}>
      {/* 헤더. 제목은 처음부터 그린다. 제목 줄을 버튼 높이로 잡아 두어 버튼·소개 줄이 나중에 나타나도 제목이 움직이지 않는다 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex min-h-10 pointer-coarse:min-h-11 items-center">
            <h1 className="text-2xl font-bold">프로젝트</h1>
          </div>
          {/* 처음 온 사람이 이 서비스가 무엇인지 알 수 있게 로그아웃 상태에만 한 줄 소개를 둔다.
              로그인 확인 전(골격)에도 로그아웃 방문자로 보이면(html[data-auth=out], src/lib/auth-hint.ts) 같은 줄을 미리 그려,
              골격 → 본문 때 소개 줄이 끼어들어 검색줄·카드를 밀지 않게 한다. 같은 요소를 이어 쓰므로 다시 그려지지 않는다 */}
          {(!ready || !user) && (
            <p className={cn("text-sm text-muted-foreground", !ready && "hidden signed-out:block")}>{SITE_DESCRIPTION}</p>
          )}
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
        // 로그인 힌트면 검색줄 자리 + 첫 페이지 카드 수만큼의 골격, 로그아웃 힌트면 로그인 안내 높이만큼 비워 둔다
        <div aria-busy="true">
          <div className={cn("hidden signed-out:block", SIGNED_OUT_BLOCK)} />
          <div className="space-y-6 signed-out:hidden">
            <Skeleton className="h-10 w-full pointer-coarse:h-11" />
            <ProjectCardGridSkeleton count={PAGE_SIZE} />
          </div>
        </div>
      ) : !user ? (
        // 목록은 로그인한 사용자의 프로젝트만 보인다. 로그아웃이면 만들 수 있다는 것과 로그인 버튼 하나만 둔다
        <div className={cn("flex flex-col items-center justify-center text-center", SIGNED_OUT_BLOCK)}>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FolderIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-muted-foreground">로그인하면 내 타이머 프로젝트를 만들고 관리할 수 있습니다.</p>
          {/* API 라우트로 전체 이동해야 하므로 <a>다. 로그인 화면과 같이 이동 직전에 힌트를 남겨 돌아온 첫 로드가 로그인 골격을 그린다 */}
          <a
            href="/api/auth/login?next=%2Fprojects"
            onClick={() => rememberSignedIn(true)}
            className={buttonClassName({ className: "mt-4" })}
          >
            CHZZK로 로그인
          </a>
        </div>
      ) : (
      <>
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

      {/* 목록 */}
      <div className="space-y-6">
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
              <p className="mt-4 text-muted-foreground">아직 프로젝트가 없습니다.</p>
              {!showForm && (
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
      </div>
      </>
      )}
    </section>
  );
}
