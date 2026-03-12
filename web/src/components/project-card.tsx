"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { renameProject, deleteProject, duplicateProject } from "@/lib/actions";

type Project = {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  updatedAt: Date;
  createdAt: Date;
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function ProjectCard({ project }: { project: Project }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pending, setPending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  async function handleRename(formData: FormData) {
    setPending(true);
    try {
      await renameProject(project.id, formData);
    } finally {
      setPending(false);
      setRenaming(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setPending(true);
    try {
      await deleteProject(project.id);
    } finally {
      setPending(false);
      setMenuOpen(false);
    }
  }

  async function handleDuplicate() {
    setPending(true);
    try {
      await duplicateProject(project.id);
    } finally {
      setPending(false);
      setMenuOpen(false);
    }
  }

  return (
    <div className="group relative">
      <Link
        href={`/editor/${project.id}`}
        className="block rounded-xl border border-zinc-800 transition-colors hover:border-zinc-600"
      >
        {/* Thumbnail */}
        <div className="flex h-40 items-center justify-center rounded-t-xl bg-zinc-900">
          {project.thumbnail ? (
            <img
              src={project.thumbnail}
              alt={project.name}
              className="h-full w-full rounded-t-xl object-cover"
            />
          ) : (
            <div className="text-3xl text-zinc-700">📐</div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          {renaming ? (
            <form action={handleRename} onClick={(e) => e.preventDefault()}>
              <input
                ref={inputRef}
                name="name"
                defaultValue={project.name}
                disabled={pending}
                onBlur={() => setRenaming(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="w-full rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-sm focus:border-zinc-400 focus:outline-none"
              />
            </form>
          ) : (
            <h3 className="truncate text-sm font-medium">{project.name}</h3>
          )}
          <p className="mt-0.5 text-xs text-zinc-500">
            Edited {timeAgo(project.updatedAt)}
          </p>
        </div>
      </Link>

      {/* Context menu trigger */}
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="rounded-md bg-zinc-800/80 p-1.5 text-zinc-400 backdrop-blur transition-colors hover:bg-zinc-700 hover:text-zinc-200"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>
      </div>

      {/* Context menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-2 top-10 z-10 w-44 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
        >
          <button
            onClick={() => {
              setMenuOpen(false);
              setRenaming(true);
            }}
            className="flex w-full items-center px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Rename
          </button>
          <button
            onClick={handleDuplicate}
            disabled={pending}
            className="flex w-full items-center px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Duplicate
          </button>
          <div className="my-1 border-t border-zinc-800" />
          <button
            onClick={handleDelete}
            disabled={pending}
            className="flex w-full items-center px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
