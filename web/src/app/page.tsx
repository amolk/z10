import Link from "next/link";
import { PLANS } from "@/lib/plans";

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
        <span className="text-lg font-bold tracking-tight">Zero-10</span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <div className="inline-block rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400 mb-6">
          Now with MCP agent integration
        </div>
        <h1 className="text-5xl font-bold tracking-tight leading-tight sm:text-6xl">
          Design UIs with
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            AI agents
          </span>
        </h1>
        <p className="mt-6 text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed">
          Zero-10 is the visual editor where AI agents build interfaces alongside you.
          Connect Claude, Cursor, or any MCP-compatible agent and watch your UI evolve in real time.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-white px-6 py-3 font-medium text-black hover:bg-zinc-200 transition-colors"
          >
            Start building free
          </Link>
          <a
            href="#how-it-works"
            className="rounded-lg border border-zinc-700 px-6 py-3 font-medium hover:border-zinc-500 hover:bg-zinc-900 transition-colors"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-zinc-800/50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold">How it works</h2>
          <p className="mt-3 text-center text-zinc-400">Three steps to AI-powered design</p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Create a project",
                desc: "Start with a blank canvas or template. Your design is stored as .z10.html — a structured document format purpose-built for AI collaboration.",
              },
              {
                step: "2",
                title: "Connect an agent",
                desc: "Add your MCP endpoint to Claude Code, Cursor, or any MCP-compatible tool. The agent gets full read/write access to your design.",
              },
              {
                step: "3",
                title: "Watch it build",
                desc: "See changes stream in real time. Every edit is highlighted, logged, and undoable. You stay in control while the agent does the heavy lifting.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 text-sm font-bold">
                  {item.step}
                </div>
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-800/50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold">Built for the agent era</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {[
              { title: "12 MCP tools", desc: "Full design vocabulary: nodes, text, styles, components, tokens, batch operations, and more." },
              { title: "Real-time streaming", desc: "See agent edits appear instantly via SSE. Every change is highlighted with visual feedback." },
              { title: "Component system", desc: "Define reusable components with props, variants, and slots. Agents can instantiate and repeat them." },
              { title: "Design tokens", desc: "Primitive and semantic token collections. Agents use tokens to maintain consistent design language." },
              { title: "Code export", desc: "Export to React + Tailwind, Vue 3 SFCs, or Svelte components with a single tool call." },
              { title: "Governance controls", desc: "Lock nodes from agent editing with scoped-edit mode. Full-edit, scoped-edit, and propose-approve levels." },
            ].map((f) => (
              <div key={f.title} className="rounded-lg border border-zinc-800 p-5">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-zinc-800/50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold">Simple pricing</h2>
          <p className="mt-3 text-center text-zinc-400">Start free, upgrade as you grow</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {(["free", "pro", "team"] as const).map((planId) => {
              const plan = PLANS[planId];
              const isPro = planId === "pro";
              return (
                <div
                  key={planId}
                  className={`rounded-lg border p-6 ${isPro ? "border-blue-500/50 ring-1 ring-blue-500/20" : "border-zinc-800"}`}
                >
                  {isPro && (
                    <span className="text-xs font-medium text-blue-400">Most popular</span>
                  )}
                  <h3 className="mt-1 text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{plan.description}</p>
                  <p className="mt-4">
                    <span className="text-3xl font-bold">
                      {plan.priceMonthly === 0 ? "$0" : `$${(plan.priceMonthly / 100).toFixed(0)}`}
                    </span>
                    {plan.priceMonthly > 0 && (
                      <span className="text-sm text-zinc-400">/mo</span>
                    )}
                  </p>
                  <ul className="mt-6 space-y-2 text-sm text-zinc-400">
                    {plan.features.map((f) => (
                      <li key={f}>
                        <span className="mr-2 text-green-500">&#10003;</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/dashboard"
                    className={`mt-6 block w-full rounded-lg py-2.5 text-center text-sm font-medium transition-colors ${
                      isPro
                        ? "bg-blue-600 hover:bg-blue-500 text-white"
                        : "bg-zinc-800 hover:bg-zinc-700"
                    }`}
                  >
                    {plan.priceMonthly === 0 ? "Get started" : "Start free trial"}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-8">
        <div className="mx-auto max-w-4xl px-6 flex items-center justify-between text-sm text-zinc-500">
          <span>Zero-10</span>
          <div className="flex gap-4">
            <Link href="/legal/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
