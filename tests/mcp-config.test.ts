import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../opencode.json", import.meta.url), "utf8"));

describe("project-local inspection connections", () => {
  it("limits Supabase to the selected project and read-only database/docs tools", () => {
    const server = config.mcp.servers.apa_supabase;
    expect(server).toBeDefined();
    expect(server.type).toBe("remote");
    const url = new URL(server.url);
    expect(url.origin + url.pathname).toBe("https://mcp.supabase.com/mcp");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      project_ref: "ydbhxqxbnwritsgbitei", read_only: "true", features: "database,docs"
    });
    expect(Object.keys(server).sort()).toEqual(["type", "url"]);
  });

  it("preserves the official Vercel endpoint without embedding credentials", () => {
    expect(config.mcp.servers.apa_vercel).toEqual({
      type: "remote", url: "https://mcp.vercel.com"
    });
  });

  it("denies both tool groups by default and only permits approval of inspection or explicit team consent", () => {
    const inspections: Record<string, string[]> = {
      apa_supabase: ["list_tables", "list_extensions", "list_migrations", "search_docs"],
      apa_vercel: ["get_project", "list_deployments", "get_deployment", "authorize_team_access"]
    };
    for (const [server, tools] of Object.entries(inspections)) {
      const rules = config.permissions.filter((rule: { action: string }) => rule.action.startsWith(`${server}_`));
      expect(rules[0]).toEqual({ action: `${server}_*`, resource: "*", effect: "deny" });
      expect(rules.slice(1)).toEqual(tools.map(tool => ({
        action: `${server}_${tool}`, resource: "*", effect: "ask"
      })));
    }
  });
});
