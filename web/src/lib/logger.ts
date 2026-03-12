/**
 * Structured server-side logger for Zero-10.
 *
 * Outputs JSON log lines for easy parsing by log aggregation services
 * (e.g., Datadog, Grafana Loki, CloudWatch). Falls back to console in dev.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Project created", { projectId, userId });
 *   logger.error("MCP tool failed", { tool, error: err.message });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? "info"] ?? 1;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < MIN_LEVEL) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: "z10-web",
    ...meta,
  };

  if (IS_PRODUCTION) {
    // Structured JSON for log aggregation
    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  } else {
    // Human-readable in development
    const prefix = `[${level.toUpperCase()}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    if (level === "error") {
      console.error(`${prefix} ${message}${metaStr}`);
    } else if (level === "warn") {
      console.warn(`${prefix} ${message}${metaStr}`);
    } else {
      console.log(`${prefix} ${message}${metaStr}`);
    }
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
