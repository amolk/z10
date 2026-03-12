"use client";

import { useState } from "react";

type ApiKeyInfo = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export function ApiKeysSection({
  initialKeys,
}: {
  initialKeys: ApiKeyInfo[];
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create key");
      const data = await res.json();
      setRevealedKey(data.key);
      setKeys((prev) => [
        {
          id: data.id,
          name: data.name,
          keyPrefix: data.keyPrefix,
          lastUsedAt: null,
          createdAt: new Date(data.createdAt),
        },
        ...prev,
      ]);
      setNewKeyName("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(date: Date | null) {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">API Keys</h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            Keys for connecting AI agents (Claude Code, Cursor, etc.) to your
            projects via MCP.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          New Key
        </button>
      </div>

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p className="text-sm font-medium text-yellow-400">
            Save this key — it won&apos;t be shown again
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-200 select-all">
              {revealedKey}
            </code>
            <button
              onClick={() => handleCopy(revealedKey)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm transition-colors hover:bg-zinc-800"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Use with:{" "}
            <code className="text-zinc-300">
              claude mcp add zero10 --transport http
              http://localhost:3000/api/projects/&lt;id&gt;/mcp --header
              &quot;Authorization: Bearer {revealedKey}&quot;
            </code>
          </p>
          <button
            onClick={() => setRevealedKey(null)}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold">Create API Key</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Give it a name to remember what it&apos;s used for.
            </p>
            <div className="mt-4">
              <input
                type="text"
                autoFocus
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setShowCreate(false);
                }}
                placeholder='e.g. "Claude Code"'
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewKeyName("");
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys list */}
      <div className="mt-4">
        {keys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 py-12 text-center">
            <p className="text-sm text-zinc-400">No API keys yet</p>
            <p className="mt-1 text-xs text-zinc-500">
              Create one to connect AI agents to your projects
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{key.name}</span>
                    <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-zinc-400">
                      {key.keyPrefix}
                    </code>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Created {formatDate(key.createdAt)}
                    {key.lastUsedAt && (
                      <> · Last used {formatDate(key.lastUsedAt)}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(key.id)}
                  disabled={deletingId === key.id}
                  className="ml-4 rounded-lg px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                >
                  {deletingId === key.id ? "Deleting..." : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
