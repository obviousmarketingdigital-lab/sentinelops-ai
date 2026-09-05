import { describe, expect, it } from "vitest";
import { ignoresPath } from "@/lib/gitignore";

describe("ignoresPath", () => {
  it("matches the bare name", () => {
    expect(ignoresPath("node_modules\n", "node_modules")).toBe(true);
  });

  it("matches the rooted spelling every Next and CRA template writes", () => {
    expect(ignoresPath("/node_modules\n", "node_modules")).toBe(true);
  });

  it("matches a trailing slash and a **/ prefix", () => {
    expect(ignoresPath("node_modules/\n", "node_modules")).toBe(true);
    expect(ignoresPath("**/node_modules\n", "node_modules")).toBe(true);
    expect(ignoresPath("/node_modules/\n", "node_modules")).toBe(true);
  });

  it("does not treat .envrc as covering .env", () => {
    // The bug this file exists for: the audit tested /^\s*\.env/m, so a direnv
    // entry silently satisfied the secrets check on a repository that had a
    // real .env committed.
    expect(ignoresPath(".envrc\n", ".env")).toBe(false);
    expect(ignoresPath(".envrc\n", ".env.local")).toBe(false);
  });

  it("expands a * the way the ecosystem writes it", () => {
    expect(ignoresPath(".env*\n", ".env")).toBe(true);
    expect(ignoresPath(".env*\n", ".env.local")).toBe(true);
    expect(ignoresPath(".env*\n", ".environment")).toBe(true);
    expect(ignoresPath("*.pem\n", "key.pem")).toBe(true);
  });

  it("keeps a glob from crossing a path separator", () => {
    expect(ignoresPath("build/*\n", "build/app/main.js")).toBe(false);
  });

  it("answers per file, so ignoring .env says nothing about .env.local", () => {
    expect(ignoresPath(".env\n", ".env")).toBe(true);
    expect(ignoresPath(".env\n", ".env.local")).toBe(false);
  });

  it("treats a directory rule as covering what is under it", () => {
    expect(ignoresPath("dist\n", "dist/mcp/server.js")).toBe(true);
    expect(ignoresPath("/dist\n", "dist/mcp/server.js")).toBe(true);
  });

  it("lets a later negation win, as git does", () => {
    expect(ignoresPath(".env*\n!.env.example\n", ".env.example")).toBe(false);
    expect(ignoresPath(".env*\n!.env.example\n", ".env.local")).toBe(true);
  });

  it("ignores comments, blanks and a lone slash", () => {
    expect(ignoresPath("# node_modules\n\n", "node_modules")).toBe(false);
    expect(ignoresPath("/\n", "node_modules")).toBe(false);
  });

  it("treats regex metacharacters in a rule as literal text", () => {
    expect(ignoresPath("a.b\n", "axb")).toBe(false);
    expect(ignoresPath("a.b\n", "a.b")).toBe(true);
  });

  it("says no rather than guessing when there is no .gitignore", () => {
    expect(ignoresPath(null, "node_modules")).toBe(false);
    expect(ignoresPath("", ".env")).toBe(false);
  });

  it("accepts this repository's own .gitignore for node_modules", () => {
    const real = [
      "# dependencies",
      "/node_modules",
      "/.pnp",
      ".pnp.*",
      ".yarn/*",
      "!.yarn/releases",
      "",
      "# env files (can opt-in for committing if needed)",
      ".env*",
    ].join("\n");

    expect(ignoresPath(real, "node_modules")).toBe(true);
    expect(ignoresPath(real, ".env")).toBe(true);
    expect(ignoresPath(real, ".env.local")).toBe(true);
  });
});
