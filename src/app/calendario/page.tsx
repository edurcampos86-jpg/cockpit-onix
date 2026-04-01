"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CalendarGrid } from "@/components/calendario/calendar-grid";
import { CalendarWeekGrid } from "@/components/calendario/calendar-week-grid";
import { CalendarFilters } from "@/components/calendario/calendar-filters";
import { CalendarStats } from "@/components/calendario/calendar-stats";
import { NewPostDialog } from "@/components/calendario/new-post-dialog";
import { PostDetailSheet } from "@/components/calendario/post-detail-sheet";
import { WeekCategoriesAlert } from "@/components/calendario/week-categories-alert";
import { PlanningReminderBanner } from "@/components/dashboard/planning-reminder-banner";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, LayoutGrid } from "lucide-react";
import type { PostFormat, PostStatus } from "@/lib/types";

type CalendarView = "month" | "week";

export interface CalendarPost {
  id: string;
  title: string;
  format: string;
  category: string;
  status: string;
  scheduledDate: string;
  scheduledTime: string | null;
  ctaType: string | null;
  author: { name: string };
  script?: {
    hook: string | null;
    estimatedTime: string | null;
    ctaType: string | null;
  } | null;
}

export default function CalendarioPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFormat, setFilterFormat] = useState<PostFormat | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState<PostStatus | "todos">("todos");
  const [newPostDate, setNewPostDate] = useState<string | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>("week");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    let startDate: string;
    let endDate: string;

    if (view === "week") {
      const dow = currentDate.getDay();
      const monday = new Date(currentDate);
      monday.setDate(currentDate.getDate() - (dow === 0 ? 6 : dow - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      startDate = monday.toISOString();
      endDate = sunday.toISOString();
    } else {
      startDate = new Date(year, month, 1).toISOString();
      endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    }

    try {
      const res = await fetch(`/api/posts?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      setPosts(data);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  }, [year, month, view, currentDate]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const goToPrev = () => {
    if (view === "week") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };
  const goToNext = () => {
    if (view === "week") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  };
  const goToToday = () => setCurrentDate(new Date());

  const handleDayClick = (dateStr: string) => {
    setNewPostDate(dateStr);
    setShowNewPost(true);
  };

  const handlePostMoved = async (postId: string, newDate: string) => {
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, scheduledDate: new Date(newDate).toISOString() } : p
      )
    );
    try {
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: new Date(newDate).toISOString() }),
      });
    } catch {
      fetchPosts(); // Rollback on error
    }
  };

  const handlePostStatusChange = async (postId: string, newStatus: PostStatus) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p))
    );
    try {
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      fetchPosts();
    }
  };

  const handlePostCreated = () => {
    setShowNewPost(false);
    setNewPostDate(null);
    fetchPosts();
  };

  const filteredPosts = posts.filter((p) => {
    if (filterFormat !== "todos" && p.format !== filterFormat) return false;
    if (filterStatus !== "todos" && p.status !== filterStatus) return false;
    return true;
  });

  const monthName = currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const getWeekLabel = () => {
    const dow = currentDate.getDay();
    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    return `${fmt(monday)} — ${fmt(sunday)}, ${sunday.getFullYear()}`;
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <PageHeader
          title="Calendário Editorial"
          description="Planeje e visualize seus posts do mês"
        />
        <button
          onClick={() => {
            setNewPostDate(new Date().toISOString().split("T")[0]);
            setShowNewPost(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm self-start"
        >
          <Plus className="h-4 w-4" />
          Novo Post
        </button>
      </div>

      {/* Stats */}
      <CalendarStats posts={posts} />

      {/* Validação de Quadros Fixos da Semana */}
      <div className="mt-4 space-y-3">
        <WeekCategoriesAlert posts={posts} />
        <PlanningReminderBanner />
      </div>

      {/* Navigation + View Toggle + Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={goToPrev}
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-foreground capitalize min-w-[250px] text-center">
            {view === "week" ? getWeekLabel() : monthName}
          </h2>
          <button
            onClick={goToNext}
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
          >
            Hoje
          </button>

          {/* View toggle */}
          <div className="flex items-center bg-accent rounded-lg p-0.5 ml-2">
            <button
              onClick={() => setView("week")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Semana
            </button>
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Mês
            </button>
          </div>
        </div>

        <CalendarFilters
          filterFormat={filterFormat}
          filterStatus={filterStatus}
          onFormatChange={setFilterFormat}
          onStatusChange={setFilterStatus}
        />
      </div>

      {/* Calendar Grid */}
      {view === "week" ? (
        <CalendarWeekGrid
          currentDate={currentDate}
          posts={filteredPosts}
          loading={loading}
          onDayClick={handleDayClick}
          onPostMoved={handlePostMoved}
          onPostStatusChange={handlePostStatusChange}
          onPostClick={setSelectedPostId}
        />
      ) : (
        <CalendarGrid
          year={year}
          month={month}
          posts={filteredPosts}
          loading={loading}
          onDayClick={handleDayClick}
          onPostMoved={handlePostMoved}
          onPostStatusChange={handlePostStatusChange}
          onPostClick={setSelectedPostId}
        />
      )}

      {/* New Post Dialog */}
      {showNewPost && (
        <NewPostDialog
          defaultDate={newPostDate || ""}
          onClose={() => {
            setShowNewPost(false);
            setNewPostDate(null);
          }}
          onCreated={handlePostCreated}
        />
      )}

      {/* Post Detail Sheet */}
      {selectedPostId && (
        <PostDetailSheet
          postId={selectedPostId}
          onClose={() => setSelectedPostId(null)}
          onUpdated={() => {
            setSelectedPostId(null);
            fetchPosts();
          }}
          onDeleted={() => {
            setSelectedPostId(null);
            fetchPosts();
          }}
          onDuplicated={() => {
            setSelectedPostId(null);
            fetchPosts();
          }}
        />
      )}
    </div>
  );
}
