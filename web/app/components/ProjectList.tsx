"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "./ToastProvider";

type Project = { id: string; name: string; language: string | null; createdAt: string; updatedAt: string };

export default function ProjectList() {
  const { notify } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/user/projects?search=${encodeURIComponent(search)}&page=${page}`);
      const data = (await response.json()) as { projects?: Project[]; totalPages?: number };
      setProjects(data.projects ?? []);
      setTotalPages(data.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  const rename = async (project: Project) => {
    const name = window.prompt("Tên project mới", project.name)?.trim();
    if (!name) return;
    const response = await fetch(`/api/user/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    notify(response.ok ? "Đã đổi tên project." : "Không thể đổi tên.", response.ok ? "success" : "error");
    if (response.ok) void load();
  };

  const remove = async (project: Project) => {
    if (!window.confirm(`Xóa ${project.name}?`)) return;
    const response = await fetch(`/api/user/projects/${project.id}`, { method: "DELETE" });
    notify(response.ok ? "Đã xóa project." : "Không thể xóa.", response.ok ? "success" : "error");
    if (response.ok) void load();
  };
  const duplicate = async (project: Project) => {
    const response = await fetch(`/api/user/projects/${project.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate" }) });
    notify(response.ok ? "Đã nhân bản project." : "Không thể nhân bản.", response.ok ? "success" : "error");
    if (response.ok) await load();
  };

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        placeholder="Tìm project..."
        className="w-full rounded-lg bg-gray-800 p-3 text-sm"
      />
      {loading ? <p className="text-sm text-gray-400">Đang tải...</p> : projects.length === 0 ? (
        <p className="rounded-lg border border-gray-700 p-4 text-sm">Chưa có project.</p>
      ) : projects.map((project) => (
        <article key={project.id} className="rounded-lg border border-gray-700 p-4">
          <p className="font-semibold">{project.name}</p>
          <p className="text-xs text-gray-500">{new Date(project.updatedAt).toLocaleString()}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/projects/${project.id}`} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold">Open</Link>
            <button onClick={() => void rename(project)} className="rounded-lg bg-gray-700 px-3 py-2 text-xs">Rename</button>
            <button onClick={() => void duplicate(project)} className="rounded-lg bg-indigo-800 px-3 py-2 text-xs">Duplicate</button>
            <button onClick={() => void remove(project)} className="rounded-lg bg-red-900 px-3 py-2 text-xs text-red-200">Delete</button>
          </div>
        </article>
      ))}
      <div className="flex items-center justify-between text-sm">
        <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="disabled:opacity-40">←</button>
        <span>{page}/{totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="disabled:opacity-40">→</button>
      </div>
    </div>
  );
}
