import { describe, expect, it } from "vitest";
import { toAgentPrompt } from "@/lib/report-text";
import type { LocalAuditReport } from "@/lib/local-project-analyzer";
import type { SecurityScanResult } from "@/lib/security-scanner";

function report(overrides: Partial<LocalAuditReport> = {}): LocalAuditReport {
  return {
    projectName: "fixture",
    origin: "github.com/example/fixture",
    timestamp: new Date().toISOString(),
    analyzable: true,
    filesInspected: ["package.json", "Dockerfile"],
    filesMissing: [],
    filesUnreadable: [],
    findingsCount: 1,
    findings: [
      {
        id: "docker-root-user",
        category: "Security",
        title: "Container runs as root",
        description: "No USER instruction is present.",
        impact: "Medium",
        recommendation: "Add a USER instruction before CMD.",
        evidence: "no USER instruction in Dockerfile",
        source: "Dockerfile",
      },
    ],
    notes: [],
    ...overrides,
  };
}

describe("agent prompt", () => {
  it("carries the file, the evidence and the fix for each finding", () => {
    const text = toAgentPrompt(report());

    expect(text).toContain("github.com/example/fixture");
    expect(text).toContain("Container runs as root");
    expect(text).toContain("`Dockerfile`");
    expect(text).toContain("no USER instruction in Dockerfile");
    expect(text).toContain("Add a USER instruction before CMD.");
  });

  it("tells the agent to confirm before editing", () => {
    // A static check can be wrong; an agent editing on trust makes that worse.
    expect(toAgentPrompt(report())).toContain("confirm the observation still holds");
  });

  it("says so plainly when nothing could be analyzed", () => {
    const text = toAgentPrompt(
      report({ analyzable: false, findings: [], findingsCount: 0, notes: ["no package.json"] }),
    );

    expect(text).toContain("could not analyze");
    expect(text).toContain("no package.json");
    expect(text).not.toContain("## Findings");
  });

  it("does not claim a clean advisory scan when the scan failed", () => {
    const failed: SecurityScanResult = {
      ok: false,
      scannedAt: new Date().toISOString(),
      source: "npm-registry-advisories",
      packagesScanned: 0,
      vulnerabilities: [],
      error: "no lockfile",
    };

    const text = toAgentPrompt(report(), failed);
    expect(text).toContain("Not scanned: no lockfile");
  });

  it("lists advisories when the scan found some", () => {
    const scan: SecurityScanResult = {
      ok: true,
      scannedAt: new Date().toISOString(),
      source: "npm-registry-advisories",
      packagesScanned: 12,
      vulnerabilities: [
        {
          id: "1",
          packageName: "lodash",
          installedVersion: "4.17.15",
          severity: "High",
          cveId: "CVE-2020-8203",
          title: "Prototype pollution",
          vulnerableVersions: "<4.17.20",
          fixedIn: "see advisory",
        },
      ],
    };

    const text = toAgentPrompt(report(), scan);
    expect(text).toContain("lodash 4.17.15");
    expect(text).toContain("CVE-2020-8203");
  });

  it("reports files it could not read separately from findings", () => {
    const text = toAgentPrompt(report({ filesUnreadable: ["tsconfig.json"] }));

    expect(text).toContain("Not measured");
    expect(text).toContain("tsconfig.json");
  });
});
