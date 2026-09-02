"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { SentinelReport } from "@/lib/cloud-analyzer";
import type { LocalAuditReport } from "@/lib/local-project-analyzer";
import type { SecurityScanResult } from "@/lib/security-scanner";

type Tab = "local" | "cloud" | "security" | "saas" | "fleet";

function SampleBanner({ notice }: { notice: string }) {
  return (
    <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
      <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
        Sample data — not measured
      </div>
      <p className="mt-2 text-sm text-amber-200/80">{notice}</p>
    </div>
  );
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
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[INIT] Sentinel audit agent ready.",
  ]);
  const [repoInput, setRepoInput] = useState("");
  const [auditingRepo, setAuditingRepo] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  const log = useCallback((line: string) => {
    setTerminalLogs((prev) => [line, ...prev].slice(0, 60));
  }, []);

  const fetchFixes = useCallback(async () => {
    try {
      const res = await fetch("/api/sentinel/local-fix");
      const data = await res.json();
      if (data.success) setSuccessLogs(data.fixes);
    } catch {
      log("[ERROR] Could not read the applied-fix history.");
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
      log("[ERROR] Could not read organization data.");
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
      log("[ERROR] Could not read fleet data.");
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
      } else if (activeTab === "security") {
        log("[SCAN] Querying the npm advisory database for the installed dependency tree...");
        const res = await fetch("/api/sentinel/security");
        const data = await res.json();
        setScan(data.result);
        if (data.result?.ok) {
          log(
            `[SCAN] ${data.result.packagesScanned} packages checked, ${data.result.vulnerabilities.length} advisories returned.`,
          );
        } else {
          log(`[SCAN] Scan unavailable: ${data.result?.error ?? "unknown error"}`);
        }
      } else {
        const res = await fetch("/api/sentinel/local-audit");
        const data = await res.json();
        if (data.success) {
          setLocalReport(data.report);
          log(
            data.report.analyzable
              ? `[AUDIT] Inspected ${data.report.filesInspected.length} file(s): ${data.report.filesInspected.join(", ")}.`
              : "[AUDIT] Source tree not reachable from the running process; nothing was analyzed.",
          );
        }
      }
    } catch {
      log("[ERROR] Request failed.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchFleet, log]);

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
        log(`[SAMPLE] Tier switched to ${tier} in memory only.`);
      }
    } catch {
      log("[ERROR] Tier change failed.");
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
        log(`[SAMPLE] Reset the sample record for ${name}. No service was contacted.`);
      }
    } catch {
      log(`[ERROR] Could not update ${name}.`);
    } finally {
      setSweepingId(null);
    }
  }

  async function handleAuditRepo() {
    const match = repoInput.trim().replace(/^https?:\/\/github\.com\//i, "").match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
    if (!match) {
      setRepoError("Use the owner/repo form, for example vercel/next.js.");
      return;
    }

    const [, owner, repo] = match;
    setAuditingRepo(true);
    setRepoError(null);
    log(`[AUDIT] Reading github.com/${owner}/${repo}...`);

    try {
      const res = await fetch("/api/sentinel/audit-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      const data = await res.json();

      if (!data.success) {
        setRepoError(data.error ?? "The repository could not be audited.");
        log(`[AUDIT] Failed: ${data.error}`);
        return;
      }

      setLocalReport(data.report);
      setScan(data.scan);
      log(
        data.report.analyzable
          ? `[AUDIT] ${data.report.findingsCount} finding(s) from ${data.report.filesInspected.length} file(s) in ${data.report.origin}.`
          : `[AUDIT] No package.json found in ${data.report.origin}.`,
      );
    } catch {
      setRepoError("The request failed.");
    } finally {
      setAuditingRepo(false);
    }
  }

  async function handleAutoFix(id: string) {
    setFixingId(id);
    log(`[AGENT] Preparing a pull request for ${id}...`);
    try {
      const res = await fetch("/api/sentinel/local-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessLogs(data.fixes);
        log(`[SUCCESS] Pull request opened: ${data.prUrl}`);
      } else {
        log(`[BLOCKED] ${data.error}`);
      }
    } catch {
      log(`[ERROR] Request failed for ${id}.`);
    } finally {
      setFixingId(null);
    }
  }

  const severityClass: Record<string, string> = {
    Critical: "bg-red-500/10 text-red-400 border-red-500/30",
    High: "bg-red-500/10 text-red-400 border-red-500/30",
    Moderate: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    Low: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "local", label: "Local Audit" },
    { id: "security", label: "CVE Security" },
    { id: "fleet", label: "Fleet" },
    { id: "saas", label: "SaaS Org" },
    { id: "cloud", label: "Cloud AWS" },
  ];

  return (
    <div className="min-h-screen bg-[#07090e] text-[#f8fafc] p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-sky-500/20 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-xs font-mono border border-sky-500/35">
                STATIC AUDIT AGENT — NO CLOUD CREDENTIALS REQUIRED
              </span>
              <img src="/api/sentinel/badge" alt="Sentinel health badge" className="h-5" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold mt-2 tracking-tight">
              Sentinel <span className="text-sky-400">Code &amp; DevOps Optimizer</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2 bg-slate-900/80 p-1 rounded-xl border border-sky-500/20">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "local" && (
          <div>
            <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <label
                htmlFor="repo-input"
                className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-3"
              >
                Audit any public GitHub repository
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="repo-input"
                  value={repoInput}
                  onChange={(event) => setRepoInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAuditRepo();
                  }}
                  placeholder="owner/repo"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/60"
                />
                <button
                  onClick={handleAuditRepo}
                  disabled={auditingRepo}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {auditingRepo ? "Reading..." : "Run audit"}
                </button>
                <button
                  onClick={() => {
                    setRepoInput("");
                    setRepoError(null);
                    loadData();
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-mono text-xs hover:border-slate-500 transition cursor-pointer whitespace-nowrap"
                >
                  This project
                </button>
              </div>
              {repoError && <p className="mt-3 text-sm text-red-400">{repoError}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Project health score
                </div>
                <div className="text-3xl font-extrabold text-emerald-400 font-mono">
                  {!localReport || localReport.healthScore === null
                    ? "—"
                    : `${localReport.healthScore} / 100`}
                </div>
                <div className="text-xs text-slate-500 mt-1">100 minus a penalty per finding</div>
              </div>

              <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Detected findings
                </div>
                <div className="text-3xl font-extrabold text-sky-400 font-mono">
                  {localReport ? localReport.findingsCount : "—"}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {localReport?.filesInspected.length
                    ? `From ${localReport.filesInspected.length} file(s) read on disk`
                    : "Awaiting scan"}
                </div>
              </div>

              <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Source
                </div>
                <div className="text-2xl font-extrabold text-sky-300 font-mono truncate">
                  {localReport?.projectName ?? "—"}
                </div>
                <div className="text-xs text-slate-500 mt-1 truncate">
                  {localReport?.origin ?? ""}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-xl font-bold mb-4">Local codebase &amp; Docker audit</h2>
                {loading ? (
                  <div className="text-center py-20 text-slate-400 font-mono">
                    Reading project files...
                  </div>
                ) : localReport && !localReport.analyzable ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-sm space-y-2">
                    <div className="font-bold text-slate-100">Nothing to report</div>
                    {localReport.notes.map((note) => (
                      <p key={note} className="text-slate-400">
                        {note}
                      </p>
                    ))}
                  </div>
                ) : localReport && localReport.findings.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-sm text-emerald-200">
                    No findings. Every check this agent knows how to run passed.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {localReport?.findings.map((finding) => {
                      const prUrl = successLogs[finding.id];
                      const isFixing = fixingId === finding.id;

                      return (
                        <div
                          key={finding.id}
                          className="bg-slate-900/80 border border-slate-800 hover:border-sky-500/40 rounded-2xl p-6 transition flex flex-col justify-between gap-4"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                {finding.category}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded text-xs font-mono uppercase font-bold border ${
                                  finding.impact === "High"
                                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                                    : finding.impact === "Medium"
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                      : "bg-slate-500/10 text-slate-300 border-slate-500/30"
                                }`}
                              >
                                Impact: {finding.impact}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500">
                                {finding.source}
                              </span>
                            </div>

                            <div className="font-semibold text-lg text-slate-100">
                              {finding.title}
                            </div>

                            <p className="text-sm text-slate-400">{finding.description}</p>

                            <div className="text-xs font-mono text-slate-300 bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800 break-words">
                              Observed: {finding.evidence}
                            </div>

                            <div className="text-xs font-mono text-sky-300 bg-sky-950/30 px-3 py-1.5 rounded-lg border border-sky-500/20 inline-block">
                              Recommendation: {finding.recommendation}
                            </div>
                          </div>

                          <div className="flex justify-end pt-2 border-t border-slate-800">
                            {prUrl ? (
                              <a
                                href={prUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold hover:bg-emerald-500/20 transition"
                              >
                                Pull request opened (view)
                              </a>
                            ) : (
                              <button
                                onClick={() => handleAutoFix(finding.id)}
                                disabled={isFixing}
                                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                              >
                                {isFixing ? "Opening..." : "Open pull request"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col h-[500px]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    Agent log
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto font-mono text-xs text-sky-400 space-y-2 bg-slate-900/40 p-3 rounded-xl border border-slate-900">
                  {terminalLogs.map((line, idx) => (
                    <div key={idx} className="leading-relaxed break-words">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Dependency vulnerability scan</h2>
            <p className="text-sm text-slate-400">
              Queries the public npm advisory database with the versions resolved in this
              project&apos;s package-lock.json.
            </p>

            {loading ? (
              <div className="text-center py-20 text-slate-400 font-mono">Querying advisories...</div>
            ) : !scan ? null : !scan.ok ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
                <div className="font-bold text-slate-100 mb-1">Scan unavailable</div>
                <p className="text-sm text-slate-400">{scan.error}</p>
              </div>
            ) : (
              <>
                <div className="text-xs font-mono text-slate-400">
                  {scan.packagesScanned} packages checked · {new Date(scan.scannedAt).toLocaleString()}
                </div>
                {scan.vulnerabilities.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-sm text-emerald-200">
                    No known advisories for the installed dependency tree.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {scan.vulnerabilities.map((vuln) => (
                      <div
                        key={vuln.id}
                        className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6"
                      >
                        <div className="flex items-center justify-between mb-4 gap-3">
                          <span
                            className={`px-2.5 py-0.5 rounded text-xs font-mono border ${
                              severityClass[vuln.severity] ?? severityClass.Low
                            }`}
                          >
                            {vuln.severity}
                          </span>
                          {vuln.cveId && (
                            <span className="text-xs font-mono text-slate-400">{vuln.cveId}</span>
                          )}
                        </div>
                        <h3 className="text-base font-bold mb-2">{vuln.title}</h3>
                        <div className="text-xs font-mono text-slate-400 space-y-1">
                          <div>
                            Package: <span className="text-slate-200">{vuln.packageName}</span>
                          </div>
                          <div>Installed: {vuln.installedVersion}</div>
                          <div>Vulnerable range: {vuln.vulnerableVersions}</div>
                        </div>
                        {vuln.advisoryUrl && (
                          <a
                            href={vuln.advisoryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-block text-xs font-mono text-sky-400 hover:text-sky-300"
                          >
                            Read the advisory
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "fleet" && (
          <div className="space-y-6">
            {fleetNotice && <SampleBanner notice={fleetNotice} />}
            <h2 className="text-xl font-bold">Fleet supervisor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {services.map((svc) => {
                const isSweeping = sweepingId === svc.id;
                return (
                  <div
                    key={svc.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          PORT: {svc.port}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded text-xs font-mono uppercase font-bold border ${
                            svc.status === "HEALTHY"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : svc.status === "WARNING"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                : "bg-red-500/10 text-red-400 border-red-500/30"
                          }`}
                        >
                          {svc.status}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-100">{svc.name}</h3>

                      <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                        <span>
                          Health: <strong className="text-white">{svc.healthScore}/100</strong>
                        </span>
                        <span>
                          Incidents:{" "}
                          <strong
                            className={svc.activeIncidents > 0 ? "text-red-400" : "text-emerald-400"}
                          >
                            {svc.activeIncidents}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex justify-end">
                      <button
                        onClick={() => handleRunSweep(svc.id, svc.name)}
                        disabled={isSweeping}
                        className="px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-mono font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        {isSweeping ? "Resetting..." : "Reset sample record"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "saas" && (
          <div className="space-y-6">
            {saasNotice && <SampleBanner notice={saasNotice} />}
            <h2 className="text-xl font-bold">Organization &amp; subscription tier</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:col-span-2 space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                  <span className="text-slate-400">Organization</span>
                  <span className="font-bold">{orgData?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                  <span className="text-slate-400">Tier</span>
                  <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 font-mono text-xs border border-sky-500/30">
                    {orgData?.tier ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                  <span className="text-slate-400">Monthly scan quota</span>
                  <span className="font-mono">
                    {orgData ? `${orgData.scansUsed} / ${orgData.monthlyQuota} used` : "—"}
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-sky-500 h-full transition-all"
                    style={{
                      width: orgData
                        ? `${Math.min(100, (orgData.scansUsed / orgData.monthlyQuota) * 100)}%`
                        : "0%",
                    }}
                  ></div>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm mb-3">Change tier</h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Changes apply to the in-memory sample only. No billing is connected.
                  </p>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => handleUpgradeTier("PRO")}
                    className="w-full py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
                  >
                    PRO (500 scans)
                  </button>
                  <button
                    onClick={() => handleUpgradeTier("ENTERPRISE")}
                    className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
                  >
                    ENTERPRISE (5,000 scans)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "cloud" && (
          <div>
            {report && <SampleBanner notice={report.notice} />}
            {report && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6">
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Illustrative monthly waste
                  </div>
                  <div className="text-3xl font-extrabold text-red-400 font-mono">
                    ${report.totalMonthlyWasteUSD.toLocaleString()} / mo
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6">
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Sample anomalies
                  </div>
                  <div className="text-3xl font-extrabold text-sky-400 font-mono">
                    {report.anomaliesCount}
                  </div>
                </div>
              </div>
            )}

            <h2 className="text-xl font-bold mb-6">Cloud cost anomalies</h2>
            {loading ? (
              <div className="text-center py-20 text-slate-400 font-mono">Loading...</div>
            ) : (
              <div className="space-y-4">
                {report?.anomalies.map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex justify-between items-center gap-4"
                  >
                    <div>
                      <div className="text-lg font-semibold">{anomaly.resourceName}</div>
                      <div className="text-sm text-slate-400">{anomaly.issue}</div>
                    </div>
                    <div className="text-right font-mono text-emerald-400 font-bold whitespace-nowrap">
                      ${anomaly.potentialMonthlySavingsUSD} / mo
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
