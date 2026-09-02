"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { LocalAuditReport } from "@/lib/local-project-analyzer";
import type { SecurityScanResult } from "@/lib/security-scanner";

type Tab = "findings" | "advisories";

/**
 * The palette is deliberately almost colourless. This tool's only claim is that
 * what it shows was measured, and a dashboard that shouts reads like a demo.
 * One warm hue is reserved for a high-impact finding and for anything the audit
 * could not measure.
 */
const THEME = {
  "--ground": "#0b0e11",
  "--line": "#1f262c",
  "--line-soft": "#171d22",
  "--ink": "#e6eaed",
  "--ink-dim": "#8a959d",
  "--ink-faint": "#5b666e",
  "--flag": "#c8763e",
  "--ok": "#7c9c88",
} as React.CSSProperties;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "findings", label: "findings" },
  { id: "advisories", label: "advisories" },
];

const HEAVY = new Set(["High", "Critical"]);

export function SentinelDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("findings");
  const [report, setReport] = useState<LocalAuditReport | null>(null);
  const [scan, setScan] = useState<SecurityScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [pullRequests, setPullRequests] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState<string[]>([]);
  const [repoInput, setRepoInput] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);
  // When set, both tabs describe this repository instead of the server's own
  // directory, so the panels can never disagree about what they are showing.
  const [target, setTarget] = useState<{ owner: string; repo: string } | null>(null);

  const log = useCallback((line: string) => {
    setActivity((prev) => [line, ...prev].slice(0, 40));
  }, []);

  const loadPullRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/sentinel/local-fix");
      const data = await res.json();
      if (data.success) setPullRequests(data.fixes);
    } catch {
      log("Could not read the pull request history.");
    }
  }, [log]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (target) {
        // One request feeds both tabs, so switching between them cannot swap
        // the repository for this project.
        log(`Reading github.com/${target.owner}/${target.repo}`);
        const res = await fetch("/api/sentinel/audit-repo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        });
        const data = await res.json();

        if (!data.success) {
          setRepoError(data.error ?? "The repository could not be audited.");
          log(data.error ?? "The repository could not be audited.");
          setTarget(null);
          return;
        }

        setReport(data.report);
        setScan(data.scan);
        log(
          data.report.analyzable
            ? `${data.report.findingsCount} finding(s) in ${data.report.origin}`
            : `Could not analyze ${data.report.origin}`,
        );
        return;
      }

      if (activeTab === "advisories") {
        const res = await fetch("/api/sentinel/security");
        const data = await res.json();
        setScan(data.result);
        log(
          data.result?.ok
            ? `${data.result.packagesScanned} packages checked against the npm advisory database`
            : `Advisory scan unavailable: ${data.result?.error ?? "unknown error"}`,
        );
        return;
      }

      const res = await fetch("/api/sentinel/local-audit");
      const data = await res.json();
      if (data.success) {
        setReport(data.report);
        log(
          data.report.analyzable
            ? `Read ${data.report.filesInspected.length} file(s) in ${data.report.origin}`
            : "No source tree reachable from the running process",
        );
      }
    } catch {
      log("Request failed.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, target, log]);

  useEffect(() => {
    load();
    loadPullRequests();
  }, [load, loadPullRequests]);

  function auditRepository() {
    const match = repoInput
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);

    if (!match) {
      setRepoError("Use the owner/repo form, for example vercel/next.js.");
      return;
    }

    setRepoError(null);
    setTarget({ owner: match[1], repo: match[2] });
  }

  function auditThisProject() {
    setRepoInput("");
    setRepoError(null);
    setTarget(null);
  }

  async function openPullRequest(id: string) {
    setFixingId(id);
    log(`Preparing a pull request for ${id}`);
    try {
      const res = await fetch("/api/sentinel/local-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setPullRequests(data.fixes);
        log(`Pull request opened: ${data.prUrl}`);
      } else {
        log(data.error);
      }
    } catch {
      log(`Request failed for ${id}.`);
    } finally {
      setFixingId(null);
    }
  }

  return (
    <div
      style={THEME}
      className="relative min-h-dvh bg-[var(--ground)] text-[var(--ink)] font-sans antialiased selection:bg-[var(--ink)] selection:text-[var(--ground)]"
    >
      {/* globals.css paints the body in the light palette that belongs to the
          other product in this repo, which would show through on short pages
          and when overscrolling. */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-[var(--ground)]" />

      <div className="mx-auto w-full max-w-5xl px-6 py-12 md:px-10 md:py-16">
        <header className="flex flex-col gap-8 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex items-baseline gap-4">
            <span className="font-mono text-sm lowercase tracking-[0.42em]">sentinel</span>
            <img
              src="/api/sentinel/badge?repo=obviousmarketingdigital-lab/sentinelops-ai"
              alt="Sentinel health badge for this repository"
              className="h-5 opacity-70"
            />
          </div>

          <nav className="flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`font-mono text-xs tracking-wide transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink)] ${
                  activeTab === tab.id
                    ? "text-[var(--ink)] underline decoration-[var(--flag)] decoration-1 underline-offset-8"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        <section className="mt-16">
          <h1 className="max-w-xl text-2xl font-normal leading-snug tracking-tight md:text-3xl">
            Point it at a repository. It reads the files and reports only what it found.
          </h1>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input
              id="repo-input"
              value={repoInput}
              onChange={(event) => setRepoInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") auditRepository();
              }}
              placeholder="owner/repo"
              aria-label="Public GitHub repository"
              className="w-full flex-1 border-b border-[var(--line)] bg-transparent pb-2 font-mono text-base placeholder:text-[var(--ink-faint)] focus:border-[var(--ink-dim)] focus:outline-none sm:max-w-sm"
            />
            <div className="flex gap-3">
              <button
                onClick={auditRepository}
                disabled={loading}
                className="border border-[var(--ink)] px-5 py-2 font-mono text-xs transition-colors hover:bg-[var(--ink)] hover:text-[var(--ground)] disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                {loading ? "reading" : "audit"}
              </button>
              <button
                onClick={auditThisProject}
                className="px-2 py-2 font-mono text-xs text-[var(--ink-faint)] transition-colors hover:text-[var(--ink-dim)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                this project
              </button>
            </div>
          </div>

          {repoError && <p className="mt-4 font-mono text-xs text-[var(--flag)]">{repoError}</p>}

          {activeTab === "findings" && (
            <>
              {report && (
                <p className="mt-14 font-mono text-xs leading-relaxed text-[var(--ink-dim)]">
                  <span className="text-[var(--ink)]">{report.origin}</span>
                  {report.analyzable && (
                    <>
                      {" · "}
                      {report.findingsCount === 0
                        ? "no findings"
                        : `${report.findingsCount} finding${report.findingsCount === 1 ? "" : "s"}`}
                      {" · "}
                      {report.filesInspected.length} file
                      {report.filesInspected.length === 1 ? "" : "s"} read
                      {report.healthScore !== null && <> · health {report.healthScore}</>}
                    </>
                  )}
                  {report.filesUnreadable.length > 0 && (
                    <span className="text-[var(--flag)]">
                      {" · "}
                      {report.filesUnreadable.length} unreadable
                    </span>
                  )}
                </p>
              )}

              <div className="mt-6">
                {loading ? (
                  <p className="py-16 font-mono text-xs text-[var(--ink-faint)]">reading files…</p>
                ) : report && !report.analyzable ? (
                  <div className="border-t border-[var(--line)] pt-6">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--flag)]">
                      Nothing measured
                    </p>
                    {report.notes.map((note) => (
                      <p key={note} className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                        {note}
                      </p>
                    ))}
                  </div>
                ) : report && report.findings.length === 0 ? (
                  <div className="border-t border-[var(--line)] pt-6">
                    <p className="text-sm text-[var(--ok)]">
                      Every check passed: Docker, TypeScript, dependencies and exposed secrets.
                    </p>
                    {report.notes.map((note) => (
                      <p key={note} className="mt-3 text-sm text-[var(--ink-faint)]">
                        {note}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div>
                    {report?.findings.map((finding) => {
                      const prUrl = pullRequests[finding.id];

                      return (
                        <article key={finding.id} className="border-t border-[var(--line)] py-8">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                            <div className="flex items-baseline gap-4">
                              <span
                                className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
                                  HEAVY.has(finding.impact)
                                    ? "text-[var(--flag)]"
                                    : "text-[var(--ink-faint)]"
                                }`}
                              >
                                {finding.impact}
                              </span>
                              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                                {finding.category}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                              {finding.source}
                            </span>
                          </div>

                          <h2 className="mt-4 text-lg font-normal tracking-tight">{finding.title}</h2>

                          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                            {finding.description}
                          </p>

                          <p className="mt-5 border-l border-[var(--line)] pl-4 font-mono text-xs leading-relaxed text-[var(--ink-dim)] break-words">
                            <span className="text-[var(--ink-faint)]">observed </span>
                            <span className="text-[var(--ink)]">{finding.evidence}</span>
                          </p>

                          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                            <p className="max-w-xl text-sm text-[var(--ink-dim)]">
                              {finding.recommendation}
                            </p>
                            {prUrl ? (
                              <a
                                href={prUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-xs text-[var(--ok)] underline decoration-1 underline-offset-4"
                              >
                                view pull request
                              </a>
                            ) : (
                              <button
                                onClick={() => openPullRequest(finding.id)}
                                disabled={fixingId === finding.id}
                                className="border border-[var(--line)] px-4 py-1.5 font-mono text-xs text-[var(--ink-dim)] transition-colors hover:border-[var(--ink-dim)] hover:text-[var(--ink)] disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                              >
                                {fixingId === finding.id ? "opening" : "open pull request"}
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    <div className="h-px bg-[var(--line)]" />
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "advisories" && (
            <div className="mt-14">
              <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                Versions come from the lockfile and are checked against the public npm advisory
                database.
              </p>

              <div className="mt-8">
                {loading ? (
                  <p className="py-16 font-mono text-xs text-[var(--ink-faint)]">
                    querying advisories…
                  </p>
                ) : !scan ? null : !scan.ok ? (
                  <div className="border-t border-[var(--line)] pt-6">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--flag)]">
                      Scan unavailable
                    </p>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                      {scan.error}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="font-mono text-xs text-[var(--ink-dim)]">
                      {scan.packagesScanned} packages checked ·{" "}
                      {new Date(scan.scannedAt).toLocaleString()}
                    </p>

                    <div className="mt-6">
                      {scan.vulnerabilities.length === 0 ? (
                        <div className="border-t border-[var(--line)] pt-6">
                          <p className="text-sm text-[var(--ok)]">
                            No known advisories for this dependency tree.
                          </p>
                        </div>
                      ) : (
                        <>
                          {scan.vulnerabilities.map((vuln) => (
                            <article key={vuln.id} className="border-t border-[var(--line)] py-8">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                                <span
                                  className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
                                    HEAVY.has(vuln.severity)
                                      ? "text-[var(--flag)]"
                                      : "text-[var(--ink-faint)]"
                                  }`}
                                >
                                  {vuln.severity}
                                </span>
                                {vuln.cveId && (
                                  <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                                    {vuln.cveId}
                                  </span>
                                )}
                              </div>

                              <h2 className="mt-4 max-w-2xl text-lg font-normal tracking-tight">
                                {vuln.title}
                              </h2>

                              <dl className="mt-4 grid gap-1 font-mono text-xs text-[var(--ink-dim)] sm:grid-cols-[7rem_1fr]">
                                <dt className="text-[var(--ink-faint)]">package</dt>
                                <dd className="text-[var(--ink)]">{vuln.packageName}</dd>
                                <dt className="text-[var(--ink-faint)]">installed</dt>
                                <dd>{vuln.installedVersion}</dd>
                                <dt className="text-[var(--ink-faint)]">vulnerable</dt>
                                <dd>{vuln.vulnerableVersions}</dd>
                              </dl>

                              {vuln.advisoryUrl && (
                                <a
                                  href={vuln.advisoryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-5 inline-block font-mono text-xs text-[var(--ink-dim)] underline decoration-1 underline-offset-4 hover:text-[var(--ink)]"
                                >
                                  read the advisory
                                </a>
                              )}
                            </article>
                          ))}
                          <div className="h-px bg-[var(--line)]" />
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {activity.length > 0 && (
          <footer className="mt-20 border-t border-[var(--line-soft)] pt-6">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Activity
            </h2>
            <ul className="mt-3 space-y-1.5">
              {activity.slice(0, 6).map((line, index) => (
                <li key={index} className="font-mono text-xs leading-relaxed text-[var(--ink-faint)]">
                  {line}
                </li>
              ))}
            </ul>
          </footer>
        )}
      </div>
    </div>
  );
}
