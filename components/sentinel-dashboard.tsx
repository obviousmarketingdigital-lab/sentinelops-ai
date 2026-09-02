"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { SentinelReport } from "@/lib/cloud-analyzer";
import type { LocalAuditReport } from "@/lib/local-project-analyzer";
import type { SecurityScanResult } from "@/lib/security-scanner";

type Tab = "local" | "cloud" | "security" | "saas" | "fleet";

/**
 * The palette is deliberately almost colourless. This tool's only claim is that
 * what it shows was measured, and a dashboard that shouts reads like a demo.
 * One warm hue is reserved for two meanings and nothing else: a high-impact
 * finding, and data that was not measured.
 */
const THEME = {
  "--ground": "#0b0e11",
  "--panel": "#12161a",
  "--line": "#1f262c",
  "--line-soft": "#171d22",
  "--ink": "#e6eaed",
  "--ink-dim": "#8a959d",
  "--ink-faint": "#5b666e",
  "--flag": "#c8763e",
  "--ok": "#7c9c88",
} as React.CSSProperties;

function NotMeasured({ notice }: { notice: string }) {
  return (
    <div className="mb-10 border-l-2 border-[var(--flag)] pl-5 py-1">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--flag)]">
        Not measured
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">{notice}</p>
    </div>
  );
}

function Rule() {
  return <div className="h-px bg-[var(--line)]" />;
}

export function SentinelDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("local");
  const [report, setReport] = useState<SentinelReport | null>(null);
  const [localReport, setLocalReport] = useState<LocalAuditReport | null>(null);
  const [scan, setScan] = useState<SecurityScanResult | null>(null);
  const [services, setServices] = useState<Array<Record<string, never> | any>>([]);
  const [fleetNotice, setFleetNotice] = useState("");
  const [saasNotice, setSaasNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [sweepingId, setSweepingId] = useState<string | null>(null);
  const [successLogs, setSuccessLogs] = useState<Record<string, string>>({});
  const [orgData, setOrgData] = useState<any>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [repoInput, setRepoInput] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);
  // When set, every tab describes this repository instead of the server's own
  // directory, so the panels can never disagree about what they are showing.
  const [auditTarget, setAuditTarget] = useState<{ owner: string; repo: string } | null>(null);

  const log = useCallback((line: string) => {
    setTerminalLogs((prev) => [line, ...prev].slice(0, 40));
  }, []);

  const fetchFixes = useCallback(async () => {
    try {
      const res = await fetch("/api/sentinel/local-fix");
      const data = await res.json();
      if (data.success) setSuccessLogs(data.fixes);
    } catch {
      log("Could not read the pull request history.");
    }
  }, [log]);

  const fetchOrg = useCallback(async () => {
    try {
      const res = await fetch("/api/sentinel/saas");
      const data = await res.json();
      if (data.success) {
        setOrgData(data.organization);
        setSaasNotice(data.notice ?? "");
      }
    } catch {
      log("Could not read organization data.");
    }
  }, [log]);

  const fetchFleet = useCallback(async () => {
    try {
      const res = await fetch("/api/sentinel/microservices");
      const data = await res.json();
      if (data.success) {
        setServices(data.services);
        setFleetNotice(data.notice ?? "");
      }
    } catch {
      log("Could not read fleet data.");
    }
  }, [log]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "cloud") {
        const res = await fetch("/api/sentinel/analyze");
        const data = await res.json();
        if (data.success) setReport(data.report);
      } else if (activeTab === "fleet") {
        await fetchFleet();
      } else if (auditTarget) {
        // One request feeds both the audit and the advisory tab, so switching
        // between them cannot replace the repository with this project.
        log(`Reading github.com/${auditTarget.owner}/${auditTarget.repo}`);
        const res = await fetch("/api/sentinel/audit-repo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(auditTarget),
        });
        const data = await res.json();

        if (!data.success) {
          setRepoError(data.error ?? "The repository could not be audited.");
          log(data.error ?? "The repository could not be audited.");
          setAuditTarget(null);
          return;
        }

        setLocalReport(data.report);
        setScan(data.scan);
        log(
          data.report.analyzable
            ? `${data.report.findingsCount} finding(s) in ${data.report.origin}`
            : `Could not analyze ${data.report.origin}`,
        );
      } else if (activeTab === "security") {
        const res = await fetch("/api/sentinel/security");
        const data = await res.json();
        setScan(data.result);
        log(
          data.result?.ok
            ? `${data.result.packagesScanned} packages checked against the npm advisory database`
            : `Advisory scan unavailable: ${data.result?.error ?? "unknown error"}`,
        );
      } else {
        const res = await fetch("/api/sentinel/local-audit");
        const data = await res.json();
        if (data.success) {
          setLocalReport(data.report);
          log(
            data.report.analyzable
              ? `Read ${data.report.filesInspected.length} file(s) in ${data.report.origin}`
              : "No source tree reachable from the running process",
          );
        }
      }
    } catch {
      log("Request failed.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, auditTarget, fetchFleet, log]);

  useEffect(() => {
    loadData();
    fetchFixes();
    fetchOrg();
  }, [loadData, fetchFixes, fetchOrg]);

  async function handleUpgradeTier(tier: string) {
    try {
      const res = await fetch("/api/sentinel/saas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upgrade", tier }),
      });
      const data = await res.json();
      if (data.success) {
        setOrgData(data.organization);
        log(`Tier set to ${tier} in memory only.`);
      }
    } catch {
      log("Tier change failed.");
    }
  }

  async function handleRunSweep(id: string, name: string) {
    setSweepingId(id);
    try {
      const res = await fetch("/api/sentinel/microservices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setServices(data.services);
        log(`Reset the sample record for ${name}. No service was contacted.`);
      }
    } catch {
      log(`Could not update ${name}.`);
    } finally {
      setSweepingId(null);
    }
  }

  function handleAuditRepo() {
    const match = repoInput
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);

    if (!match) {
      setRepoError("Use the owner/repo form, for example vercel/next.js.");
      return;
    }

    // Setting the target is enough: the effect reloads whichever tab is open.
    setRepoError(null);
    setAuditTarget({ owner: match[1], repo: match[2] });
  }

  function handleAuditThisProject() {
    setRepoInput("");
    setRepoError(null);
    setAuditTarget(null);
  }

  async function handleAutoFix(id: string) {
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
        setSuccessLogs(data.fixes);
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

  const tabs: Array<{ id: Tab; label: string; sample?: boolean }> = [
    { id: "local", label: "findings" },
    { id: "security", label: "advisories" },
    { id: "fleet", label: "fleet", sample: true },
    { id: "saas", label: "organization", sample: true },
    { id: "cloud", label: "cloud", sample: true },
  ];

  const isHeavy = (level: string) => level === "High" || level === "Critical";

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
            <span className="font-mono text-sm lowercase tracking-[0.42em] text-[var(--ink)]">
              sentinel
            </span>
            <img src="/api/sentinel/badge" alt="Repository health badge" className="h-5 opacity-70" />
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {tabs.map((tab) => (
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
                {tab.sample && <span className="ml-1 text-[var(--flag)]">*</span>}
              </button>
            ))}
          </nav>
        </header>

        <div className="mt-16">
          {activeTab === "local" && (
            <section>
              <h1 className="max-w-xl text-2xl font-normal leading-snug tracking-tight md:text-3xl">
                Point it at a repository. It reads the files and reports only what it found.
              </h1>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <input
                  id="repo-input"
                  value={repoInput}
                  onChange={(event) => setRepoInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAuditRepo();
                  }}
                  placeholder="owner/repo"
                  aria-label="Public GitHub repository"
                  className="w-full flex-1 border-b border-[var(--line)] bg-transparent pb-2 font-mono text-base text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--ink-dim)] focus:outline-none sm:max-w-sm"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleAuditRepo}
                    disabled={loading}
                    className="border border-[var(--ink)] px-5 py-2 font-mono text-xs text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--ground)] disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                  >
                    {loading ? "reading" : "audit"}
                  </button>
                  <button
                    onClick={handleAuditThisProject}
                    className="px-2 py-2 font-mono text-xs text-[var(--ink-faint)] transition-colors hover:text-[var(--ink-dim)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                  >
                    this project
                  </button>
                </div>
              </div>

              {repoError && (
                <p className="mt-4 font-mono text-xs text-[var(--flag)]">{repoError}</p>
              )}

              {localReport && (
                <p className="mt-14 font-mono text-xs leading-relaxed text-[var(--ink-dim)]">
                  <span className="text-[var(--ink)]">{localReport.origin}</span>
                  {localReport.analyzable && (
                    <>
                      {" · "}
                      {localReport.findingsCount === 0
                        ? "no findings"
                        : `${localReport.findingsCount} finding${localReport.findingsCount === 1 ? "" : "s"}`}
                      {" · "}
                      {localReport.filesInspected.length} file
                      {localReport.filesInspected.length === 1 ? "" : "s"} read
                      {localReport.healthScore !== null && <> · health {localReport.healthScore}</>}
                    </>
                  )}
                  {localReport.filesUnreadable.length > 0 && (
                    <span className="text-[var(--flag)]">
                      {" · "}
                      {localReport.filesUnreadable.length} unreadable
                    </span>
                  )}
                </p>
              )}

              <div className="mt-6">
                {loading ? (
                  <p className="py-16 font-mono text-xs text-[var(--ink-faint)]">reading files…</p>
                ) : localReport && !localReport.analyzable ? (
                  <div className="border-t border-[var(--line)] pt-6">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--flag)]">
                      Nothing measured
                    </p>
                    {localReport.notes.map((note) => (
                      <p key={note} className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                        {note}
                      </p>
                    ))}
                  </div>
                ) : localReport && localReport.findings.length === 0 ? (
                  <div className="border-t border-[var(--line)] pt-6">
                    <p className="text-sm text-[var(--ok)]">
                      Every check passed: Docker, TypeScript, lockfile and exposed secrets.
                    </p>
                    {localReport.notes.map((note) => (
                      <p key={note} className="mt-3 text-sm text-[var(--ink-faint)]">
                        {note}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div>
                    {localReport?.findings.map((finding) => {
                      const prUrl = successLogs[finding.id];
                      const heavy = isHeavy(finding.impact);

                      return (
                        <article key={finding.id} className="border-t border-[var(--line)] py-8">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                            <div className="flex items-baseline gap-4">
                              <span
                                className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
                                  heavy ? "text-[var(--flag)]" : "text-[var(--ink-faint)]"
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

                          <h2 className="mt-4 text-lg font-normal tracking-tight text-[var(--ink)]">
                            {finding.title}
                          </h2>

                          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                            {finding.description}
                          </p>

                          <p className="mt-5 border-l border-[var(--line)] pl-4 font-mono text-xs leading-relaxed text-[var(--ink-dim)]">
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
                                onClick={() => handleAutoFix(finding.id)}
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
                    <Rule />
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === "security" && (
            <section>
              <h1 className="max-w-xl text-2xl font-normal leading-snug tracking-tight md:text-3xl">
                Known advisories for the versions this project actually installs.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                Versions come from the lockfile and are checked against the public npm advisory
                database.
              </p>

              <div className="mt-14">
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
                                    isHeavy(vuln.severity)
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
                          <Rule />
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {activeTab === "fleet" && (
            <section>
              {fleetNotice && <NotMeasured notice={fleetNotice} />}
              <h1 className="text-2xl font-normal tracking-tight md:text-3xl">Fleet</h1>

              <div className="mt-10">
                {services.map((svc) => (
                  <article
                    key={svc.id}
                    className="flex flex-wrap items-baseline justify-between gap-4 border-t border-[var(--line)] py-6"
                  >
                    <div>
                      <h2 className="font-mono text-sm text-[var(--ink)]">{svc.name}</h2>
                      <p className="mt-1 font-mono text-xs text-[var(--ink-faint)]">
                        port {svc.port} · health {svc.healthScore} · {svc.activeIncidents} incident
                        {svc.activeIncidents === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <span
                        className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
                          svc.status === "HEALTHY" ? "text-[var(--ok)]" : "text-[var(--flag)]"
                        }`}
                      >
                        {svc.status}
                      </span>
                      <button
                        onClick={() => handleRunSweep(svc.id, svc.name)}
                        disabled={sweepingId === svc.id}
                        className="border border-[var(--line)] px-4 py-1.5 font-mono text-xs text-[var(--ink-dim)] transition-colors hover:border-[var(--ink-dim)] hover:text-[var(--ink)] disabled:opacity-40"
                      >
                        {sweepingId === svc.id ? "resetting" : "reset sample"}
                      </button>
                    </div>
                  </article>
                ))}
                <Rule />
              </div>
            </section>
          )}

          {activeTab === "saas" && (
            <section>
              {saasNotice && <NotMeasured notice={saasNotice} />}
              <h1 className="text-2xl font-normal tracking-tight md:text-3xl">Organization</h1>

              <dl className="mt-10 max-w-2xl font-mono text-sm">
                <div className="flex justify-between border-t border-[var(--line)] py-4">
                  <dt className="text-[var(--ink-faint)]">name</dt>
                  <dd>{orgData?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between border-t border-[var(--line)] py-4">
                  <dt className="text-[var(--ink-faint)]">tier</dt>
                  <dd>{orgData?.tier ?? "—"}</dd>
                </div>
                <div className="flex justify-between border-t border-b border-[var(--line)] py-4">
                  <dt className="text-[var(--ink-faint)]">scans</dt>
                  <dd>
                    {orgData ? `${orgData.scansUsed} of ${orgData.monthlyQuota}` : "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => handleUpgradeTier("PRO")}
                  className="border border-[var(--line)] px-4 py-1.5 font-mono text-xs text-[var(--ink-dim)] transition-colors hover:border-[var(--ink-dim)] hover:text-[var(--ink)]"
                >
                  set pro
                </button>
                <button
                  onClick={() => handleUpgradeTier("ENTERPRISE")}
                  className="border border-[var(--line)] px-4 py-1.5 font-mono text-xs text-[var(--ink-dim)] transition-colors hover:border-[var(--ink-dim)] hover:text-[var(--ink)]"
                >
                  set enterprise
                </button>
              </div>
            </section>
          )}

          {activeTab === "cloud" && (
            <section>
              {report && <NotMeasured notice={report.notice} />}
              <h1 className="text-2xl font-normal tracking-tight md:text-3xl">Cloud cost</h1>

              {report && (
                <p className="mt-4 font-mono text-xs text-[var(--ink-dim)]">
                  {report.anomaliesCount} illustrative anomalies · $
                  {report.totalMonthlyWasteUSD.toLocaleString()} per month
                </p>
              )}

              <div className="mt-10">
                {report?.anomalies.map((anomaly) => (
                  <article
                    key={anomaly.id}
                    className="flex flex-wrap items-baseline justify-between gap-4 border-t border-[var(--line)] py-6"
                  >
                    <div className="max-w-xl">
                      <h2 className="font-mono text-sm">{anomaly.resourceName}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">
                        {anomaly.issue}
                      </p>
                    </div>
                    <span className="font-mono text-sm text-[var(--ink-faint)]">
                      ${anomaly.potentialMonthlySavingsUSD}/mo
                    </span>
                  </article>
                ))}
                <Rule />
              </div>
            </section>
          )}
        </div>

        {terminalLogs.length > 0 && (
          <footer className="mt-20 border-t border-[var(--line-soft)] pt-6">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Activity
            </h2>
            <ul className="mt-3 space-y-1.5">
              {terminalLogs.slice(0, 6).map((line, index) => (
                <li
                  key={index}
                  className="font-mono text-xs leading-relaxed text-[var(--ink-faint)]"
                >
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
