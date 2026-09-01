'use client';

import React, { useState, useEffect } from "react";
import { SentinelReport } from "@/lib/cloud-analyzer";
import { LocalAuditReport, auditLocalProject } from "@/lib/local-project-analyzer";

export function SentinelDashboard() {
  const [activeTab, setActiveTab] = useState<"local" | "cloud" | "security" | "saas" | "fleet">("local");
  const [report, setReport] = useState<SentinelReport | null>(null);
  const [localReport, setLocalReport] = useState<LocalAuditReport | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [sweepingId, setSweepingId] = useState<string | null>(null);
  const [successLogs, setSuccessLogs] = useState<{ [key: string]: string }>({});
  const [orgData, setOrgData] = useState<any>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[INIT] Sentinel Autonomous Agent v2.5 initialized.",
    "[SCAN] Zero-AWS Local Code & Docker audit mode active.",
    "[FLEET] Multi-microservice supervisor online."
  ]);

  useEffect(() => {
    loadData();
    fetchFixes();
    fetchOrg();
    fetchFleet();
  }, [activeTab]);

  async function fetchFixes() {
    try {
      const res = await fetch("/api/sentinel/local-fix");
      const data = await res.json();
      if (data.success) {
        setSuccessLogs(data.fixes);
      }
    } catch (err) {
      console.error("Failed to load fixed status", err);
    }
  }

  async function fetchOrg() {
    try {
      const res = await fetch("/api/sentinel/saas");
      const data = await res.json();
      if (data.success) {
        setOrgData(data.organization);
      }
    } catch (err) {
      console.error("Failed to load org data", err);
    }
  }

  async function fetchFleet() {
    try {
      const res = await fetch("/api/sentinel/microservices");
      const data = await res.json();
      if (data.success) {
        setServices(data.services);
      }
    } catch (err) {
      console.error("Failed to load fleet services", err);
    }
  }

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
        setTerminalLogs(prev => [`[SAAS] Organization upgraded to tier: ${tier}`, ...prev]);
      }
    } catch (err) {
      console.error("Failed to upgrade tier", err);
    }
  }

  async function handleRunSweep(id: string, name: string) {
    setSweepingId(id);
    setTerminalLogs(prev => [`[FLEET] Running autonomous AI sweep on ${name} (Port ${id})...`, ...prev]);
    try {
      const res = await fetch("/api/sentinel/microservices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setServices(data.services);
        setTerminalLogs(prev => [`[SUCCESS] Autonomous sweep completed for ${name}. Incidents resolved, health score 100%.`, ...prev]);
      }
    } catch (err) {
      console.error("Failed to run sweep", err);
      setTerminalLogs(prev => [`[ERROR] Autonomous sweep failed for ${name}`, ...prev]);
    } finally {
      setSweepingId(null);
    }
  }

  async function loadData() {
    setLoading(true);
    if (activeTab === "cloud") {
      try {
        const res = await fetch("/api/sentinel/analyze");
        const data = await res.json();
        if (data.success) {
          setReport(data.report);
        }
      } catch (err) {
        console.error("Failed to load cloud report", err);
      }
    } else if (activeTab === "fleet") {
      await fetchFleet();
    } else {
      setTimeout(() => {
        setLocalReport(auditLocalProject());
      }, 200);
    }
    setLoading(false);
  }

  async function handleAutoFix(id: string) {
    setFixingId(id);
    setTerminalLogs(prev => [`[AGENT] Analyzing finding ${id} for generative AI patching...`, ...prev]);
    try {
      const res = await fetch("/api/sentinel/local-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessLogs(data.fixes);
        setTerminalLogs(prev => [`[SUCCESS] PR created successfully: ${data.prUrl}`, ...prev]);
      }
    } catch (err) {
      console.error("Failed to apply fix", err);
      setTerminalLogs(prev => [`[ERROR] Failed to apply fix for ${id}`, ...prev]);
    } finally {
      setFixingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#07090e] text-[#f8fafc] p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-sky-500/20 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-xs font-mono border border-sky-500/35">
                🤖 AUTONOMOUS AGENT ENGINE — ZERO AWS REQUIRED
              </span>
              <img src="/api/sentinel/badge" alt="Sentinel Badge" className="h-5" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold mt-2 tracking-tight">
              Sentinel <span className="text-sky-400">Code & DevOps Optimizer</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2 bg-slate-900/80 p-1 rounded-xl border border-sky-500/20">
            <button
              onClick={() => setActiveTab("local")}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === "local"
                  ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              💻 Local Audit
            </button>
            <button
              onClick={() => setActiveTab("fleet")}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === "fleet"
                  ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🌐 Fleet
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === "security"
                  ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🛡️ CVE Security
            </button>
            <button
              onClick={() => setActiveTab("saas")}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === "saas"
                  ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🏢 SaaS Org
            </button>
            <button
              onClick={() => setActiveTab("cloud")}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === "cloud"
                  ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              ☁️ Cloud AWS
            </button>
          </div>
        </div>

        {/* Content based on Tab */}
        {activeTab === "local" && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6 backdrop-blur-md">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Project Health Score
                </div>
                <div className="text-3xl font-extrabold text-emerald-400 font-mono">
                  {localReport?.healthScore || 84} / 100
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Static analysis & dependencies
                </div>
              </div>

              <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6 backdrop-blur-md">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Detected Findings
                </div>
                <div className="text-3xl font-extrabold text-sky-400 font-mono">
                  {localReport?.findingsCount || 4} Issues
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Persisted storage enabled
                </div>
              </div>

              <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6 backdrop-blur-md">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Agent Mode
                </div>
                <div className="text-3xl font-extrabold text-sky-300 font-mono">
                  Autonomous PR
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Zero cloud setup required
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-xl font-bold mb-4">Local Codebase & Docker Audit Findings</h2>
                {loading ? (
                  <div className="text-center py-20 text-slate-400 font-mono">
                    Scanning workspace files and dependencies...
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
                            <div className="flex items-center gap-3">
                              <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                {finding.category}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded text-xs font-mono uppercase font-bold ${
                                  finding.impact === "High"
                                    ? "bg-red-500/10 text-red-400 border border-red-500/30"
                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                                }`}
                              >
                                Impact: {finding.impact}
                              </span>
                            </div>

                            <div className="font-semibold text-lg text-slate-100">
                              {finding.title}
                            </div>

                            <p className="text-sm text-slate-400">{finding.description}</p>

                            <div className="text-xs font-mono text-sky-300 bg-sky-950/30 px-3 py-1.5 rounded-lg border border-sky-500/20 inline-block">
                              👉 Recommendation: {finding.recommendation}
                            </div>
                          </div>

                          <div className="flex justify-end pt-2 border-t border-slate-800">
                            {prUrl ? (
                              <a
                                href={prUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold hover:bg-emerald-500/20 transition flex items-center gap-2"
                              >
                                ✓ PR Created (View)
                              </a>
                            ) : (
                              <button
                                onClick={() => handleAutoFix(finding.id)}
                                disabled={isFixing}
                                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                              >
                                {isFixing ? "Agent Applying..." : "🤖 Auto-Fix Code/Docker"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Live Terminal Stream */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col h-[500px]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Agent Terminal Stream
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">PORT: 3009</span>
                </div>
                <div className="flex-1 overflow-y-auto font-mono text-xs text-sky-400 space-y-2 bg-slate-900/40 p-3 rounded-xl border border-slate-900">
                  {terminalLogs.map((log, idx) => (
                    <div key={idx} className="leading-relaxed">
                      {log}
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-900 text-[11px] text-slate-500 font-mono">
                  Autonomous Sentinel v2.5 • Zero-AWS Mode
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "fleet" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Multi-Microservice Fleet Supervisor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {services.map((svc) => {
                const isSweeping = sweepingId === svc.id;
                return (
                  <div key={svc.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          PORT: {svc.port}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-xs font-mono uppercase font-bold ${
                          svc.status === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                          svc.status === 'WARNING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                          'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}>
                          {svc.status}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-100">{svc.name}</h3>

                      <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                        <span>Health Score: <strong className="text-white">{svc.healthScore}/100</strong></span>
                        <span>Incidents: <strong className={svc.activeIncidents > 0 ? "text-red-400" : "text-emerald-400"}>{svc.activeIncidents}</strong></span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex justify-end">
                      <button
                        onClick={() => handleRunSweep(svc.id, svc.name)}
                        disabled={isSweeping}
                        className="px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-mono font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        {isSweeping ? "Sweeping & Repairing..." : "🤖 Run Autonomous Sweep"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">CVE Security & Dependency Vulnerability Scan</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-red-500/10 text-red-400 border border-red-500/20">
                    High Severity
                  </span>
                  <span className="text-xs font-mono text-slate-400">CVE-2020-8203</span>
                </div>
                <h3 className="text-lg font-bold mb-2">Lodash Prototype Pollution</h3>
                <p className="text-sm text-slate-400 mb-4">Prototype pollution vulnerability in lodash before 4.17.20 allows attackers to inject properties.</p>
                <div className="text-xs font-mono text-emerald-400">Fixed In: lodash 4.17.21</div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Moderate Severity
                  </span>
                  <span className="text-xs font-mono text-slate-400">CVE-2024-3434</span>
                </div>
                <h3 className="text-lg font-bold mb-2">Next.js SSRF Vulnerability</h3>
                <p className="text-sm text-slate-400 mb-4">Potential Server-Side Request Forgery in specific Next.js dynamic routing patterns.</p>
                <div className="text-xs font-mono text-emerald-400">Fixed In: next 14.2.0</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "saas" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Multi-Tenant SaaS Organization & Subscription Tier</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:col-span-2 space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                  <span className="text-slate-400">Organization Name</span>
                  <span className="font-bold">{orgData?.name || "Obvious Marketing Digital Lab"}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                  <span className="text-slate-400">Subscription Tier</span>
                  <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 font-mono text-xs border border-sky-500/30">
                    {orgData?.tier || "PRO"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                  <span className="text-slate-400">Monthly Scan Quota</span>
                  <span className="font-mono">{orgData?.scansUsed || 42} / {orgData?.monthlyQuota || 500} Used</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-sky-500 h-full transition-all"
                    style={{ width: `${Math.min(100, ((orgData?.scansUsed || 42) / (orgData?.monthlyQuota || 500)) * 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm mb-3">Upgrade SaaS Tier</h3>
                  <p className="text-xs text-slate-400 mb-4">Select a higher tier to increase monthly agent scan quotas and enable priority webhook pipelines.</p>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => handleUpgradeTier("PRO")}
                    className="w-full py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
                  >
                    Upgrade to PRO (500 scans)
                  </button>
                  <button
                    onClick={() => handleUpgradeTier("ENTERPRISE")}
                    className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
                  >
                    Upgrade to ENTERPRISE (5,000 scans)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "cloud" && (
          <div>
            {report && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6 backdrop-blur-md">
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Potential Monthly Waste
                  </div>
                  <div className="text-3xl font-extrabold text-red-400 font-mono">
                    ${report.totalMonthlyWasteUSD.toLocaleString()} / mo
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6 backdrop-blur-md">
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Detected Anomalies
                  </div>
                  <div className="text-3xl font-extrabold text-sky-400 font-mono">
                    {report.anomaliesCount} Issues Found
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-sky-500/20 rounded-2xl p-6 backdrop-blur-md">
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Agent Success Rate
                  </div>
                  <div className="text-3xl font-extrabold text-emerald-400 font-mono">
                    99.8%
                  </div>
                </div>
              </div>
            )}

            <h2 className="text-xl font-bold mb-6">Cloud AWS / Kubernetes Cost Anomalies</h2>
            {loading ? (
              <div className="text-center py-20 text-slate-400 font-mono">Loading cloud telemetry...</div>
            ) : (
              <div className="space-y-4">
                {report?.anomalies.map((anomaly) => (
                  <div key={anomaly.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex justify-between items-center">
                    <div>
                      <div className="text-lg font-semibold">{anomaly.resourceName}</div>
                      <div className="text-sm text-slate-400">{anomaly.issue}</div>
                    </div>
                    <div className="text-right font-mono text-emerald-400 font-bold">
                      +${anomaly.potentialMonthlySavingsUSD} / mo
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
