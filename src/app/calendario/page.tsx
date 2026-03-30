"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CalendarGrid } from "@/components/calendario/calendar-grid";
import { CalendarFilters } from "@/components/calendario/calendar-filters";
import { CalendarStats } from "@/components/calendario/calendar-stats";
import { NewPostDialog } from "@/components/calendario/new-post-dialog";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { PostFormat, PostStatus } from "@/lib/types";

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
}

export default function CalendarioPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFormat, setFilterFormat] = useState<PostFormat | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState<PostStatus | "todos">("todos");
  const [newPostDate, setNewPostDate] = useState<string | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const startDate = new Date(year, month, 1).toISOString();
    const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    try {
      const res = await fetch(`/api/posts?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      setPosts(data);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
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

      {/* Month navigation + Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={goToPrevMonth}
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-foreground capitalize min-w-[200px] text-center">
            {monthName}
          </h2>
          <button
            onClick={goToNextMonth}
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
        </div>

        <CalendarFilters
          filterFormat={filterFormat}
          filterStatus={filterStatus}
          onFormatChange={setFilterFormat}
          onStatusChange={setFilterStatus}
        />
      </div>

      {/* Calendar Grid */}
      <CalendarGrid
        year={year}
        month={month}
        posts={filteredPosts}
        loading={loading}
        onDayClick={handleDayClick}
        onPostMoved={handlePostMoved}
      />

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
    </div>
  );
}
