import { describe, expect, it } from "vitest";
import { BADGE_COLORS, badgeStateFor, renderBadge } from "@/lib/badge";
import type { LocalAuditFinding, LocalAuditReport } from "@/lib/local-project-analyzer";

function report(overrides: Partial<LocalAuditReport>): LocalAuditReport {
  return {
    projectName: "fixture",
    origin: "github.com/example/fixture",
    timestamp: new Date().toISOString(),
    analyzable: true,
    filesInspected: [],
    filesMissing: [],
    filesUnreadable: [],
    findingsCount: 0,
    findings: [],
    notes: [],
    ...overrides,
  };
}

function finding(id: string): LocalAuditFinding {
  return {
    id,
    category: "Docker",
    title: id,
    description: "",
    impact: "Medium",
    recommendation: "",
    evidence: "",
    source: "Dockerfile",
  };
}

describe("badge state", () => {
  it("says so plainly when the checks found nothing", () => {
    expect(badgeStateFor(report({}))).toEqual({
      label: "no findings",
      color: BADGE_COLORS.clean,
    });
  });

  it("counts the findings and how many carry a fix", () => {
    // docker-root-user and ts-strict-off have fixers; docker-single-stage does not.
    const state = badgeStateFor(
      report({
        findings: [
          finding("docker-root-user"),
          finding("ts-strict-off"),
          finding("docker-single-stage"),
        ],
        findingsCount: 3,
      }),
    );

    expect(state.label).toBe("3 findings · 2 patchable");
    expect(state.color).toBe(BADGE_COLORS.findings);
  });

  it("drops the second count when nothing can be patched", () => {
    const state = badgeStateFor(
      report({ findings: [finding("docker-single-stage")], findingsCount: 1 }),
    );

    expect(state.label).toBe("1 finding");
  });

  it("never borrows a passing colour for an unmeasured project", () => {
    const unmeasured = badgeStateFor(report({ analyzable: false }));

    expect(unmeasured.label).toBe("n/a");
    expect(unmeasured.color).toBe(BADGE_COLORS.unknown);
  });

  it("reports n/a even when findings survive on an unanalyzable report", () => {
    const state = badgeStateFor(
      report({ analyzable: false, findings: [finding("docker-root-user")], findingsCount: 1 }),
    );

    expect(state.label).toBe("n/a");
  });

  it("states no number the audit did not produce", () => {
    const state = badgeStateFor(
      report({ findings: [finding("docker-root-user")], findingsCount: 1 }),
    );

    // The old badge read "85/100" from a penalty table. Nothing on it now is
    // anything but a count of findings the audit can point at.
    expect(state.label).not.toMatch(/\/100|\d{2,}%/);
  });
});

describe("badge rendering", () => {
  it("widens with the label instead of clipping it", () => {
    const short = renderBadge({ label: "n/a", color: BADGE_COLORS.unknown });
    const long = renderBadge({ label: "12 findings · 7 patchable", color: BADGE_COLORS.findings });

    const widthOf = (svg: string) => Number(svg.match(/width="(\d+)"/)![1]);
    expect(widthOf(long)).toBeGreaterThan(widthOf(short));
  });

  it("escapes text so a label cannot inject markup", () => {
    const svg = renderBadge({ label: '"><script/>', color: BADGE_COLORS.unknown });

    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script");
  });
});
