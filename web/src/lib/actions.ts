"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { eq, and, desc, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createDefaultContent } from "./default-project";
import { checkProjectLimit } from "./usage";
import type { PlanId } from "./plans";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const name = formData.get("name") as string;

  if (!name || name.trim().length === 0) {
    throw new Error("Project name is required");
  }

  // Enforce project limit based on plan
  const [dbUser] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, user.id!));
  const planId = (dbUser?.plan ?? "free") as PlanId;
  const { allowed, current, limit } = await checkProjectLimit(user.id!, planId);
  if (!allowed) {
    throw new Error(
      `Project limit reached (${current}/${limit}). Upgrade your plan to create more projects.`
    );
  }

  const trimmedName = name.trim();
  const slug = slugify(trimmedName) || "project";

  const [project] = await db
    .insert(projects)
    .values({
      name: trimmedName,
      slug,
      ownerId: user.id!,
      content: createDefaultContent(trimmedName),
    })
    .returning();

  revalidatePath("/dashboard");
  redirect(`/editor/${project.id}`);
}

export async function listProjects(search?: string) {
  const user = await requireUser();

  const conditions = [eq(projects.ownerId, user.id!)];

  if (search && search.trim().length > 0) {
    conditions.push(ilike(projects.name, `%${search.trim()}%`));
  }

  return db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      thumbnail: projects.thumbnail,
      updatedAt: projects.updatedAt,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt));
}

export async function renameProject(projectId: string, formData: FormData) {
  const user = await requireUser();
  const name = formData.get("name") as string;

  if (!name || name.trim().length === 0) {
    throw new Error("Project name is required");
  }

  const trimmedName = name.trim();

  await db
    .update(projects)
    .set({
      name: trimmedName,
      slug: slugify(trimmedName) || "project",
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id!)));

  revalidatePath("/dashboard");
}

export async function deleteProject(projectId: string) {
  const user = await requireUser();

  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id!)));

  revalidatePath("/dashboard");
}

export async function duplicateProject(projectId: string) {
  const user = await requireUser();

  // Enforce project limit based on plan
  const [dbUser] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, user.id!));
  const planId = (dbUser?.plan ?? "free") as PlanId;
  const { allowed, current, limit } = await checkProjectLimit(user.id!, planId);
  if (!allowed) {
    throw new Error(
      `Project limit reached (${current}/${limit}). Upgrade your plan to create more projects.`
    );
  }

  const [original] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id!)));

  if (!original) {
    throw new Error("Project not found");
  }

  const newName = `${original.name} (copy)`;

  await db.insert(projects).values({
    name: newName,
    slug: slugify(newName) || "project",
    ownerId: user.id!,
    content: original.content,
    teamId: original.teamId,
  });

  revalidatePath("/dashboard");
}
