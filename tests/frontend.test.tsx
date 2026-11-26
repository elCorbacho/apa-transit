import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "../src/app/page";
import { classifyHistoryFailure, HistoryList, LoginPanel } from "../src/app/transit-app";
import { ApiFailure } from "../src/lib/client-api";

afterEach(() => vi.unstubAllEnvs());

describe("frontend presentation", () => {
  it("invalidates the current session on 401 even if the history tab changed", () => {
    expect(classifyHistoryFailure(new ApiFailure(401), 1, 2, 3, 3)).toBe("expired");
    expect(classifyHistoryFailure(new ApiFailure(401), 1, 1, 3, 4)).toBe("ignore");
    expect(classifyHistoryFailure(new ApiFailure(503), 1, 2, 3, 3)).toBe("ignore");
    expect(classifyHistoryFailure(new ApiFailure(503), 2, 2, 3, 3)).toBe("retry");
  });

  it("keeps setup mode when unconfigured and shows no private data before session validation", () => {
    vi.stubEnv("APP_ORIGIN", "");
    expect(renderToStaticMarkup(<Home />)).toContain("Aplicación en construcción");
    for (const [name, value] of Object.entries({
      APP_ENV: "development",
      APP_ORIGIN: "https://app.example.invalid",
      DATABASE_URL: "postgresql://apa_runtime:synthetic@db.example.invalid/postgres",
      SUPABASE_URL: "https://auth.example.invalid",
      SUPABASE_AUTH_KEY: "synthetic",
      SUPABASE_ADMIN_KEY: "synthetic",
      APP_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64")
    })) vi.stubEnv(name, value);
    const markup = renderToStaticMarkup(<Home />);
    expect(markup).toContain("Comprobando sesión");
    expect(markup).not.toContain("Synthetic Operator");
    expect(markup).not.toContain("Iniciar sesión");
  });

  it("provides an accessible login form without rendering credentials", () => {
    const markup = renderToStaticMarkup(<LoginPanel pending={false} error={null} onSubmit={() => {}} />);
    expect(markup).toContain('name="username"');
    expect(markup).toContain('name="password"');
    expect(markup.toLowerCase()).toContain('autocomplete="current-password"');
    expect(markup).toContain("Iniciar sesión");
    expect(markup).toContain("Usuario");
    expect(markup).toContain("Contraseña");
    expect(markup).not.toContain("synthetic-password");
  });

  it("announces an empty shared history and renders dates in Santiago", () => {
    const empty = renderToStaticMarkup(<HistoryList items={[]} />);
    expect(empty).toContain("Todavía no hay movimientos");
    const markup = renderToStaticMarkup(<HistoryList items={[{
      id: "synthetic-id", locationId: "synthetic-location", locationName: "Recepción Principal",
      userName: "Synthetic Operator", recordedAt: "2026-11-26T14:05:00.000Z"
    }]} />);
    expect(markup).toContain("Recepción Principal");
    expect(markup).toContain("Synthetic Operator");
    expect(markup).toContain("11:05");
  });
});
