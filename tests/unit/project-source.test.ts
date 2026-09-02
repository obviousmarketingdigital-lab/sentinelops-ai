import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { auditProject } from "@/lib/local-project-analyzer";
import { createInMemorySource } from "@/lib/project-source";
import { isSignatureValid } from "@/app/api/webhooks/github/route";

describe("source-agnostic auditing", () => {
  it("audits files that never touch the local disk", async () => {
    const source = createInMemorySource(
      {
        "package.json": JSON.stringify({ name: "remote-project" }),
        "package-lock.json": "{}",
        Dockerfile: "FROM node:20\nRUN npm install\n",
      },
      "github.com/example/remote-project",
    );

    const report = await auditProject(source);
    const ids = report.findings.map((finding) => finding.id);

    expect(report.projectName).toBe("remote-project");
    expect(report.origin).toBe("github.com/example/remote-project");
    expect(ids).toContain("docker-single-stage");
    expect(ids).toContain("docker-npm-install");
  });

  it("does not demand package-lock.json from a pnpm project", async () => {
    const source = createInMemorySource({
      "package.json": JSON.stringify({ name: "pnpm-project", engines: { node: ">=20" } }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });

    const report = await auditProject(source);
    expect(report.findings.map((finding) => finding.id)).not.toContain("deps-no-lockfile");
  });

  it("flags a project with no lockfile at all", async () => {
    const source = createInMemorySource({
      "package.json": JSON.stringify({ name: "no-lock", engines: { node: ">=20" } }),
    });

    const report = await auditProject(source);
    expect(report.findings.map((finding) => finding.id)).toContain("deps-no-lockfile");
  });

  it("says it could not analyze rather than inventing findings", async () => {
    const report = await auditProject(createInMemorySource({}, "empty-source"));

    expect(report.analyzable).toBe(false);
    expect(report.healthScore).toBeNull();
    expect(report.findings).toHaveLength(0);
    expect(report.notes.join(" ")).toContain("empty-source");
  });
});

describe("github webhook signature", () => {
  const secret = "s3cr3t";
  const body = JSON.stringify({ action: "opened" });
  const valid = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts a signature computed with the shared secret", () => {
    expect(isSignatureValid(body, valid, secret)).toBe(true);
  });

  it("rejects a missing signature", () => {
    expect(isSignatureValid(body, null, secret)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const forged = `sha256=${crypto.createHmac("sha256", "wrong").update(body).digest("hex")}`;
    expect(isSignatureValid(body, forged, secret)).toBe(false);
  });

  it("rejects a signature of a different body", () => {
    expect(isSignatureValid(JSON.stringify({ action: "closed" }), valid, secret)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(isSignatureValid(body, "sha256=short", secret)).toBe(false);
  });
});
