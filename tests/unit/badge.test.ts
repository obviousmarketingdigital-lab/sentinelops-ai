import { describe, expect, it } from "vitest";
import { BADGE_COLORS, badgeStateFor, renderBadge } from "@/lib/badge";
import type { LocalAuditReport } from "@/lib/local-project-analyzer";

function report(overrides: Partial<LocalAuditReport>): LocalAuditReport {
  return {
    projectName: "fixture",
    origin: "github.com/example/fixture",
    timestamp: new Date().toISOString(),
    analyzable: true,
    filesInspected: [],
    filesMissing: [],
    filesUnreadable: [],
    healthScore: 100,
    findingsCount: 0,
    findings: [],
    notes: [],
    ...overrides,
  };
}

describe("badge state", () => {
  it("shows the score in green when the project is healthy", () => {
    expect(badgeStateFor(report({ healthScore: 92 }))).toEqual({
      label: "92/100",
      color: BADGE_COLORS.good,
    });
  });

  it("warns in amber and in red as the score drops", () => {
    expect(badgeStateFor(report({ healthScore: 70 })).color).toBe(BADGE_COLORS.fair);
    expect(badgeStateFor(report({ healthScore: 40 })).color).toBe(BADGE_COLORS.poor);
  });

  it("never borrows a passing colour for an unmeasured project", () => {
    const unmeasured = badgeStateFor(report({ analyzable: false, healthScore: null }));

    expect(unmeasured.label).toBe("n/a");
    expect(unmeasured.color).toBe(BADGE_COLORS.unknown);
  });

  it("reports n/a even if a score survives on an unanalyzable report", () => {
    expect(badgeStateFor(report({ analyzable: false, healthScore: 100 })).label).toBe("n/a");
  });
});

describe("badge rendering", () => {
  it("widens with the label instead of clipping it", () => {
    const short = renderBadge({ label: "n/a", color: BADGE_COLORS.unknown });
    const long = renderBadge({ label: "unavailable", color: BADGE_COLORS.unknown });

    const widthOf = (svg: string) => Number(svg.match(/width="(\d+)"/)![1]);
    expect(widthOf(long)).toBeGreaterThan(widthOf(short));
  });

  it("escapes text so a label cannot inject markup", () => {
    const svg = renderBadge({ label: '"><script/>', color: BADGE_COLORS.unknown });

    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script");
  });
});
