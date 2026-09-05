import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { auditLocalProject } from "@/lib/local-project-analyzer";

const created: string[] = [];

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-audit-"));
  created.push(root);
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(root, name), content, "utf8");
  }
  return root;
}

afterEach(async () => {
  while (created.length) {
    const dir = created.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

const MULTI_STAGE_DOCKERFILE = [
  "FROM node:20-alpine AS builder",
  "RUN npm ci",
  "FROM node:20-alpine AS runner",
  "USER node",
  'CMD ["node", "server.js"]',
].join("\n");

describe("local project audit", () => {
  it("does not report strict mode when tsconfig enables it", async () => {
    // "@/*" contains the characters that open a block comment, which is what
    // broke the previous regex-based parser and produced a false finding.
    const root = await makeProject({
      "package.json": JSON.stringify({ name: "fixture", engines: { node: ">=20" } }),
      "package-lock.json": "{}",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true, paths: { "@/*": ["./*"] } },
      }),
    });

    const report = await auditLocalProject(root);

    expect(report.analyzable).toBe(true);
    expect(report.findings.map((f) => f.id)).not.toContain("ts-strict-off");
  });

  it("reports strict mode when it is actually off", async () => {
    const root = await makeProject({
      "package.json": JSON.stringify({ name: "fixture", engines: { node: ">=20" } }),
      "package-lock.json": "{}",
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: false } }),
    });

    const report = await auditLocalProject(root);
    expect(report.findings.map((f) => f.id)).toContain("ts-strict-off");
  });

  it("does not report a multi-stage Dockerfile as single-stage", async () => {
    const root = await makeProject({
      "package.json": JSON.stringify({ name: "fixture", engines: { node: ">=20" } }),
      "package-lock.json": "{}",
      Dockerfile: MULTI_STAGE_DOCKERFILE,
    });

    const report = await auditLocalProject(root);
    const ids = report.findings.map((f) => f.id);

    expect(ids).not.toContain("docker-single-stage");
    expect(ids).not.toContain("docker-heavy-base");
    expect(ids).not.toContain("docker-root-user");
  });

  it("flags a single-stage Dockerfile that runs as root", async () => {
    const root = await makeProject({
      "package.json": JSON.stringify({ name: "fixture", engines: { node: ">=20" } }),
      "package-lock.json": "{}",
      Dockerfile: "FROM node:20\nRUN npm install\nCMD [\"node\", \"server.js\"]",
    });

    const report = await auditLocalProject(root);
    const ids = report.findings.map((f) => f.id);

    expect(ids).toContain("docker-single-stage");
    expect(ids).toContain("docker-root-user");
    expect(ids).toContain("docker-npm-install");
  });

  it("reports nothing instead of inventing findings when there is no project", async () => {
    const root = await makeProject({});
    const report = await auditLocalProject(root);

    expect(report.analyzable).toBe(false);
    expect(report.findings).toHaveLength(0);
  });

  it("reports the findings it produced and grades none of them", async () => {
    const root = await makeProject({
      "package.json": JSON.stringify({ name: "fixture" }),
      "package-lock.json": "{}",
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
    });

    const report = await auditLocalProject(root);

    expect(report.findings.map((f) => f.id)).toEqual(["deps-no-engines"]);
    expect(report.findingsCount).toBe(1);
    // No aggregate number is produced: a count and the findings themselves are
    // the whole report, because a score traced to nothing in any file.
    expect(report).not.toHaveProperty("healthScore");
  });
});
