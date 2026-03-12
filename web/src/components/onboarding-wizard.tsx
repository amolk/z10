"use client";

import { useState } from "react";
import { CreateProjectDialog } from "./create-project-dialog";

const STEPS = [
  {
    number: 1,
    title: "Create your first project",
    description:
      "Start with a blank canvas. Your design is stored as .z10.html — a structured document format built for AI collaboration.",
    action: "create",
  },
  {
    number: 2,
    title: "Connect an AI agent",
    description:
      'Click "Connect Agent" in the editor toolbar. Copy the MCP endpoint into Claude Code, Cursor, or any MCP-compatible tool.',
    tip: "claude mcp add zero10 --transport http <your-endpoint>",
    action: "info",
  },
  {
    number: 3,
    title: "Watch it build",
    description:
      "Ask your agent to design a UI. Watch elements appear in real time with visual highlights. Every edit is logged and undoable.",
    action: "info",
  },
] as const;

export function OnboardingWizard() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="text-center mb-10">
        <div className="inline-block rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400 mb-4">
          Welcome to Zero-10
        </div>
        <h2 className="text-2xl font-bold">Get started in 3 steps</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Zero-10 lets AI agents design interfaces alongside you
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((step, i) => (
          <button
            key={step.number}
            onClick={() => setActiveStep(i)}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              i === activeStep
                ? "bg-white text-black"
                : i < activeStep
                  ? "bg-zinc-800 text-zinc-300"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800"
            }`}
          >
            <span>{step.number}</span>
            <span className="hidden sm:inline">{step.title}</span>
          </button>
        ))}
      </div>

      {/* Active step content */}
      <div className="rounded-xl border border-zinc-800 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 text-lg font-bold mb-4">
          {STEPS[activeStep].number}
        </div>
        <h3 className="text-lg font-semibold">{STEPS[activeStep].title}</h3>
        <p className="mt-3 text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
          {STEPS[activeStep].description}
        </p>

        {"tip" in STEPS[activeStep] && STEPS[activeStep].tip && (
          <pre className="mt-4 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 text-xs text-zinc-300 font-mono overflow-x-auto">
            {STEPS[activeStep].tip}
          </pre>
        )}

        <div className="mt-6 flex justify-center gap-3">
          {activeStep > 0 && (
            <button
              onClick={() => setActiveStep(activeStep - 1)}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 transition-colors"
            >
              Back
            </button>
          )}

          {activeStep === 0 ? (
            <CreateProjectDialog
              trigger={
                <button className="rounded-lg bg-white px-6 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition-colors">
                  Create your first project
                </button>
              }
            />
          ) : activeStep < STEPS.length - 1 ? (
            <button
              onClick={() => setActiveStep(activeStep + 1)}
              className="rounded-lg bg-white px-6 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition-colors"
            >
              Next
            </button>
          ) : (
            <CreateProjectDialog
              trigger={
                <button className="rounded-lg bg-white px-6 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition-colors">
                  Create project & start
                </button>
              }
            />
          )}
        </div>
      </div>

      {/* Skip link */}
      <p className="mt-4 text-center text-xs text-zinc-500">
        Already know how it works?{" "}
        <CreateProjectDialog
          trigger={
            <button className="text-zinc-400 underline hover:text-zinc-300">
              Skip to create project
            </button>
          }
        />
      </p>
    </div>
  );
}
