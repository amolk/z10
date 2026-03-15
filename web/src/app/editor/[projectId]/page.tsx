import Script from "next/script";
import { auth } from "@/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { EditorShell } from "@/components/editor-shell";

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

  const contentLen = project.content?.length ?? 0;
  const hasPages = project.content?.includes("data-z10-page") ?? false;
  const hasHead = project.content?.includes("<head") ?? false;
  console.log(`[editor] Loading project=${project.id} name=${project.name} contentLen=${contentLen} hasPages=${hasPages} hasHead=${hasHead}`);

  return (
    <>
      <Script src="/tailwindcss.js" strategy="beforeInteractive" />
      <EditorShell
        projectId={project.id}
        projectName={project.name}
        initialContent={project.content ?? ""}
      />
    </>
  );
}
