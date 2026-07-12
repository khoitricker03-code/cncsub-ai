"use client";

import { useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  language: string;
  createdAt: string;
};

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects");
      const data = await res.json();

if (
  data.success &&
  Array.isArray(data.projects)
) {
  setProjects(data.projects);
}
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadProjects();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-700 p-4">
        Đang tải dự án...
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 p-4">
        Chưa có dự án nào.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700">
      {projects.map((project) => (
        <div
          key={project.id}
          className="border-b border-gray-700 p-4 last:border-b-0"
        >
          <div className="font-semibold">{project.name}</div>

          <div className="mt-1 text-sm text-gray-400">
            {project.language}
          </div>

          <div className="text-xs text-gray-500">
            {new Date(project.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}