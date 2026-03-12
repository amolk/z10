"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function ProjectSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function handleSearch(value: string) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      router.replace(`/dashboard?${params.toString()}`);
    });
  }

  return (
    <input
      type="text"
      placeholder="Search projects..."
      defaultValue={searchParams.get("q") ?? ""}
      onChange={(e) => handleSearch(e.target.value)}
      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
    />
  );
}
