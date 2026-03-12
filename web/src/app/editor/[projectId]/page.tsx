import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { EditorShell } from "@/components/editor-shell";
import { ConnectAgentButton } from "@/components/connect-agent-button";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { projectId } = await params;

  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      content: projects.content,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.ownerId, session.user.id))
    );

  if (!project) notFound();

  return (
    <div className="flex h-screen flex-col">
      {/* Editor toolbar */}
      <header className="flex items-center justify-between border-b border-[var(--ed-panel-border)] px-4 py-1.5" style={{ backgroundColor: "var(--ed-panel-bg)" }}>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-[12px] transition-colors hover:text-[var(--ed-text)]"
            style={{ color: "var(--ed-text-secondary)" }}
          >
            ← Back
          </Link>
          <span style={{ color: "var(--ed-panel-border)" }}>|</span>
          <span className="text-[13px] font-medium">{project.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <ConnectAgentButton projectId={project.id} />
        </div>
      </header>

      {/* Editor body — wrapped in EditorProvider for shared state */}
      <EditorShell
        projectId={project.id}
        initialContent={project.content ?? ""}
      />
    </div>
  );
}
