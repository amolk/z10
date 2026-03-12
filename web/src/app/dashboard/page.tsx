import Image from "next/image";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { listProjects } from "@/lib/actions";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { ProjectCard } from "@/components/project-card";
import { ProjectSearch } from "@/components/project-search";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { Suspense } from "react";
import Link from "next/link";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;
  const { q } = await searchParams;
  const projectList = await listProjects(q);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Zero-10</h1>
        </div>
        <div className="flex items-center gap-3">
          <CreateProjectDialog
            trigger={
              <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200">
                New Project
              </button>
            }
          />
          <Link
            href="/dashboard/settings"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Settings
          </Link>
          <div className="flex items-center gap-2">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name ?? "User"}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium">
                {user.name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Projects</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Your .z10.html design files
            </p>
          </div>
          <Suspense>
            <ProjectSearch />
          </Suspense>
        </div>

        {projectList.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {projectList.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : q ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-20">
            <h3 className="mt-4 text-lg font-medium">No matching projects</h3>
            <p className="mt-1 text-sm text-zinc-400">
              {`No projects matching "${q}"`}
            </p>
          </div>
        ) : (
          <OnboardingWizard />
        )}
      </main>
    </div>
  );
}
