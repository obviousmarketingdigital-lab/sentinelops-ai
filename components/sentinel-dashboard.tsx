"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { LocalAuditFinding, LocalAuditReport } from "@/lib/local-project-analyzer";
import type { SecurityScanResult } from "@/lib/security-scanner";
import { toAgentPrompt } from "@/lib/report-text";
import { hasFixer } from "@/lib/fix-engine";

type Tab = "findings" | "advisories";

/**
 * The palette is deliberately almost colourless. This tool's only claim is that
 * what it shows was measured, and a dashboard that shouts reads like a demo.
 * One warm hue is reserved for a high-impact finding, for anything the audit
 * could not measure, and for the score a repository has not earned yet.
 *
 * The two diff hues are the exception, and they are dim on purpose: a patch is
 * read line by line, so the ink has to carry the meaning, not the background.
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
  "--add": "#83b494",
  "--del": "#bf7a70",
  "--add-bg": "rgba(131, 180, 148, 0.09)",
  "--del-bg": "rgba(191, 122, 112, 0.09)",
} as React.CSSProperties;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "findings", label: "findings" },
  { id: "advisories", label: "advisories" },
];

const HEAVY = new Set(["High", "Critical"]);

interface PreviewFile {
  filePath: string;
  created: boolean;
  diff: string;
  findingIds: string[];
}

interface PreviewPlan {
  analyzable: boolean;
  findingsCount?: number;
  patchedCount?: number;
  files: PreviewFile[];
  applied: Array<{ findingId: string; filePath: string; rationale: string }>;
  refused: Array<{ findingId: string; reason: string }>;
  unavailable: Array<{ findingId: string; reason: string }>;
}

/**
 * What the fixer concluded about one finding.
 *
 * "refuse" and "unavailable" are kept apart on screen for the same reason they
 * are kept apart in the engine: one is a judgement about the repository, the
 * other is the absence of one.
 */
type Verdict =
  | { kind: "fix"; rationale: string }
  | { kind: "refuse"; reason: string }
  | { kind: "unavailable"; reason: string };

const VERDICT_PRESENTATION: Record<
  Verdict["kind"],
  { state: string; tone: string; label: string }
> = {
  fix: { state: "patched", tone: "text-[var(--add)]", label: "patch" },
  refuse: { state: "needs you", tone: "text-[var(--ink-faint)]", label: "refused" },
  unavailable: { state: "not measured", tone: "text-[var(--flag)]", label: "not measured" },
};

/* ------------------------------------------------------------------ *
 * The measure
 * ------------------------------------------------------------------ */

/**
 * One mark per finding.
 *
 * This replaced a 0-100 meter, and the reason is the same one that governs
 * everything else here. That number was 100 minus a penalty per finding, so it
 * traced to no line in any file and answered "compared to what" with nothing.
 * A tally cannot overstate: every mark is one finding the audit produced, and
 * a filled mark is one the plan actually closes. The picture is countable
 * against the list below it, which is the only claim it makes.
 */
function FindingTally({
  findings,
  verdicts,
  planned,
}: {
  findings: LocalAuditFinding[];
  verdicts: Map<string, Verdict>;
  planned: boolean;
}) {
  const closed = findings.filter((f) => verdicts.get(f.id)?.kind === "fix").length;
  const fixable = findings.filter((f) => hasFixer(f.id)).length;
  const shown = planned ? closed : fixable;

  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          findings
        </span>
        <span className="font-mono text-sm tabular-nums">
          <span className="text-[var(--ink)]">{findings.length}</span>
          {shown > 0 && (
            <>
              <span className="px-1.5 text-[var(--ink-faint)]">·</span>
              <span className="text-[var(--add)]">{shown}</span>
              <span className="pl-1.5 text-[var(--ink-faint)]">
                {planned ? "patched" : "patchable"}
              </span>
            </>
          )}
        </span>
      </figcaption>

      <div
        className="mt-3 flex flex-wrap gap-1.5"
        role="img"
        aria-label={`${findings.length} finding${findings.length === 1 ? "" : "s"}, ${shown} ${
          planned ? "patched by this plan" : "with a fix available"
        }.`}
      >
        {findings.map((finding) => {
          const verdict = verdicts.get(finding.id);
          const filled = verdict ? verdict.kind === "fix" : hasFixer(finding.id);
          const unmeasured = verdict?.kind === "unavailable";

          return (
            <span
              key={finding.id}
              title={finding.title}
              className={`h-3 w-3 border ${
                unmeasured
                  ? "border-[var(--flag)] border-dashed"
                  : filled
                    ? "border-[var(--add)] bg-[var(--add)]"
                    : "border-[var(--ink-faint)]"
              }`}
            />
          );
        })}
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ *
 * The patch
 * ------------------------------------------------------------------ */

type DiffLineKind = "add" | "del" | "hunk" | "context";

function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

const DIFF_LINE_STYLE: Record<DiffLineKind, string> = {
  add: "bg-[var(--add-bg)] text-[var(--add)]",
  del: "bg-[var(--del-bg)] text-[var(--del)]",
  hunk: "text-[var(--ink-faint)]",
  context: "text-[var(--ink-dim)]",
};

/**
 * Renders one file's patch.
 *
 * The `---` and `+++` header lines are dropped: this component already names
 * the file above the diff, and repeating it in a colour that means "removed"
 * reads, for a second, like the file itself is being deleted.
 */
function DiffFile({ file }: { file: PreviewFile }) {
  const lines = file.diff.split("\n").filter((line) => !/^(---|\+\+\+) /.test(line));

  return (
    <article className="border-t border-[var(--line)] py-7">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="font-mono text-sm text-[var(--ink)]">{file.filePath}</h3>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          {file.created ? "created" : "modified"}
        </span>
      </header>

      <pre className="mt-4 overflow-x-auto border-l border-[var(--line)] font-mono text-xs leading-[1.7]">
        <code>
          {lines.map((line, index) => (
            <span
              key={index}
              className={`block whitespace-pre pl-4 pr-3 ${DIFF_LINE_STYLE[classifyDiffLine(line)]}`}
            >
              {line === "" ? " " : line}
            </span>
          ))}
        </code>
      </pre>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * A finding
 * ------------------------------------------------------------------ */

interface FindingRowProps {
  finding: LocalAuditFinding;
  /** Set once a plan has been computed: what the fixer decided about this one. */
  verdict: Verdict | null;
  prUrl?: string;
}

function FindingRow({ finding, verdict, prUrl }: FindingRowProps) {
  const heavy = HEAVY.has(finding.impact);

  // Severity is carried by the rule down the left edge as well as by the word,
  // so a page of findings can be skimmed without reading any of them.
  const stripe = heavy
    ? "border-[var(--flag)]"
    : finding.impact === "Medium"
      ? "border-[var(--ink-faint)]"
      : "border-[var(--line)]";

  const presentation = verdict ? VERDICT_PRESENTATION[verdict.kind] : null;

  const state = presentation
    ? { label: presentation.state, tone: presentation.tone }
    : hasFixer(finding.id)
      ? { label: "fixable", tone: "text-[var(--ink-dim)]" }
      : { label: "needs you", tone: "text-[var(--ink-faint)]" };

  return (
    <article className={`border-t border-l-2 ${stripe} border-t-[var(--line)] py-7 pl-5`}>
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
        <div className="flex items-baseline gap-4">
          <span className={`font-mono text-[11px] uppercase tracking-[0.2em] ${state.tone}`}>
            {state.label}
          </span>
          <span className="font-mono text-[11px] text-[var(--ink-faint)]">{finding.source}</span>
        </div>
      </div>

      <h2 className="mt-4 text-lg font-normal tracking-tight">{finding.title}</h2>

      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
        {finding.description}
      </p>

      {/* The claim and the text that produced it, on the same screen. */}
      <p className="mt-5 border-l border-[var(--line)] pl-4 font-mono text-xs leading-relaxed break-words text-[var(--ink-dim)]">
        <span className="text-[var(--ink-faint)]">observed </span>
        <span className="text-[var(--ink)]">{finding.evidence}</span>
      </p>

      {verdict && presentation ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed">
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.2em] ${presentation.tone}`}
          >
            {presentation.label}{" "}
          </span>
          <span className="text-[var(--ink-dim)]">
            {verdict.kind === "fix" ? verdict.rationale : verdict.reason}
          </span>
        </p>
      ) : (
        <p className="mt-4 max-w-2xl text-sm text-[var(--ink-dim)]">{finding.recommendation}</p>
      )}

      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block font-mono text-xs text-[var(--ok)] underline decoration-1 underline-offset-4"
        >
          view pull request
        </a>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

/** What one load produced. Plain data — nothing here can touch component state. */
type AuditOutcome =
  | { kind: "repo"; report: LocalAuditReport; scan: SecurityScanResult; note: string }
  | { kind: "rejected"; error: string }
  | { kind: "advisories"; scan: SecurityScanResult; note: string }
  | { kind: "local"; report: LocalAuditReport; note: string }
  | { kind: "failed"; note: string };

/**
 * Fetches, and returns what it found.
 *
 * Reading and recording are separated on purpose. While this runs, the reader
 * can type another repository and start a second load; if this one applied its
 * own results it would race the newer one and could win. Returning the outcome
 * lets the caller check, once the answer is back, whether it is still the
 * answer to the question being asked.
 */
async function fetchAudit(
  target: { owner: string; repo: string } | null,
  tab: Tab,
): Promise<AuditOutcome> {
  try {
    if (target) {
      // One request feeds both tabs, so switching between them cannot swap the
      // repository for this project.
      const res = await fetch("/api/sentinel/audit-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const data = await res.json();

      if (!data.success) {
        return { kind: "rejected", error: data.error ?? "The repository could not be audited." };
      }

      return {
        kind: "repo",
        report: data.report,
        scan: data.scan,
        note: data.report.analyzable
          ? `${data.report.findingsCount} finding(s) in ${data.report.origin}`
          : `Could not analyze ${data.report.origin}`,
      };
    }

    if (tab === "advisories") {
      const res = await fetch("/api/sentinel/security");
      const data = await res.json();
      return {
        kind: "advisories",
        scan: data.result,
        note: data.result?.ok
          ? `${data.result.packagesScanned} packages checked against the npm advisory database`
          : `Advisory scan unavailable: ${data.result?.error ?? "unknown error"}`,
      };
    }

    const res = await fetch("/api/sentinel/local-audit");
    const data = await res.json();

    if (!data.success) return { kind: "failed", note: "The audit could not be read." };

    return {
      kind: "local",
      report: data.report,
      note: data.report.analyzable
        ? `Read ${data.report.filesInspected.length} file(s) in ${data.report.origin}`
        : "No source tree reachable from the running process",
    };
  } catch {
    return { kind: "failed", note: "Request failed." };
  }
}

async function fetchPullRequests(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch("/api/sentinel/local-fix");
    const data = await res.json();
    return data.success ? (data.fixes as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export function SentinelDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("findings");
  const [report, setReport] = useState<LocalAuditReport | null>(null);
  const [scan, setScan] = useState<SecurityScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PreviewPlan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pullRequests, setPullRequests] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState<string[]>([]);
  const [repoInput, setRepoInput] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);
  // When set, both tabs describe this repository instead of the server's own
  // directory, so the panels can never disagree about what they are showing.
  const [target, setTarget] = useState<{ owner: string; repo: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const log = useCallback((line: string) => {
    setActivity((prev) => [line, ...prev].slice(0, 40));
  }, []);

  /**
   * Records a load once it comes back, and only if it is still the current one.
   *
   * The `settled` flag is what makes a stale answer harmless: when the reader
   * changes target mid-flight, the effect that started the earlier request has
   * already been cleaned up, and its result is dropped instead of overwriting
   * the newer one.
   */
  useEffect(() => {
    let settled = false;

    fetchAudit(target, activeTab).then((outcome) => {
      if (settled) return;

      setLoading(false);
      log(outcome.kind === "rejected" ? outcome.error : outcome.note);

      switch (outcome.kind) {
        case "repo":
          setReport(outcome.report);
          setScan(outcome.scan);
          break;
        case "rejected":
          setRepoError(outcome.error);
          setTarget(null);
          break;
        case "advisories":
          setScan(outcome.scan);
          break;
        case "local":
          setReport(outcome.report);
          break;
        case "failed":
          break;
      }
    });

    fetchPullRequests().then((fixes) => {
      if (!settled && fixes) setPullRequests(fixes);
    });

    return () => {
      settled = true;
    };
  }, [target, activeTab, log]);

  /** How many findings have a fixer at all, before any precondition is tested. */
  const fixableCount = useMemo(
    () => report?.findings.filter((finding) => hasFixer(finding.id)).length ?? 0,
    [report],
  );

  const verdicts = useMemo(() => {
    const map = new Map<string, Verdict>();
    if (!plan) return map;
    for (const fix of plan.applied) map.set(fix.findingId, { kind: "fix", rationale: fix.rationale });
    for (const refusal of plan.refused) {
      map.set(refusal.findingId, { kind: "refuse", reason: refusal.reason });
    }
    for (const item of plan.unavailable) {
      map.set(item.findingId, { kind: "unavailable", reason: item.reason });
    }
    return map;
  }, [plan]);

  // Pull requests are opened against the repository this deployment is
  // configured for, which is only the same tree when no remote target is set.
  const canOpenPullRequest = target === null;

  /**
   * A plan describes one tree, so it is dropped whenever the tree changes.
   * Showing a patch for files the panel above is no longer reporting on would
   * be the one kind of lie this tool exists to avoid.
   */
  function startLoading() {
    setLoading(true);
    setPlan(null);
  }

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
    startLoading();
    log(`Reading github.com/${match[1]}/${match[2]}`);
    setTarget({ owner: match[1], repo: match[2] });
  }

  function auditThisProject() {
    setRepoInput("");
    setRepoError(null);
    // Setting the same value would not re-run the effect, leaving the spinner
    // on forever with nothing on its way to turn it off.
    if (target === null) return;
    startLoading();
    setTarget(null);
  }

  async function previewFixes() {
    setPreviewing(true);
    log("Computing the patch from the files as they are.");
    try {
      const res = await fetch("/api/sentinel/preview-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target ?? { local: true }),
      });
      const data = await res.json();

      if (!data.success) {
        log(data.error ?? "The patch could not be computed.");
        return;
      }

      setPlan(data);

      const unread = (data.unavailable ?? []).length;
      const summary =
        data.files.length === 0
          ? "No change could be computed safely. Every finding is explained below."
          : `${data.applied.length} fix(es) across ${data.files.length} file(s).`;

      log(unread > 0 ? `${summary} ${unread} could not be read.` : summary);
    } catch {
      log("The patch request failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function copyForAgent() {
    if (!report) return;
    const text = toAgentPrompt(report, scan);

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      log("Report copied. Paste it into a coding agent.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the report is useless if it cannot
      // leave the page, so fall back to a window the reader can select from.
      const blob = new Blob([text], { type: "text/plain" });
      window.open(URL.createObjectURL(blob), "_blank");
      log("Clipboard unavailable. Opened the report in a new tab instead.");
    }
  }

  async function openPullRequest() {
    setOpening(true);
    log("Opening a pull request with the patch.");
    try {
      const res = await fetch("/api/sentinel/local-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (data.success) {
        setPullRequests(data.fixes);
        log(`Pull request opened: ${data.prUrl}`);
      } else {
        log(data.error);
      }
    } catch {
      log("The pull request request failed.");
    } finally {
      setOpening(false);
    }
  }


  return (
    <div
      style={THEME}
      className="min-h-dvh bg-[var(--ground)] font-sans text-[var(--ink)] antialiased selection:bg-[var(--ink)] selection:text-[var(--ground)]"
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-12 md:px-10 md:py-16">
        <header className="flex flex-col gap-8 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex items-baseline gap-4">
            {/* The caret is what a compiler prints under the exact token it is
                talking about. It says "this one", which is the whole claim. */}
            <span className="relative font-mono text-sm lowercase tracking-[0.42em]">
              sentinel
              <span
                aria-hidden
                className="absolute top-full left-0 -mt-0.5 text-base leading-none text-[var(--flag)]"
              >
                ^
              </span>
            </span>
            {/* The badge is an SVG generated per request by a route in this app,
                and it is the same URL a README embeds. next/image would route a
                already-tiny vector through an optimizer that cannot improve it,
                and would hide the exact URL this page is demonstrating. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/sentinel/badge?repo=obviousmarketingdigital-lab/sentinelops-ai"
              alt="Sentinel findings badge for this repository"
              className="h-5 opacity-70"
            />
          </div>

          <nav className="flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (activeTab === tab.id) return;
                  startLoading();
                  setActiveTab(tab.id);
                }}
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
          <h1 className="max-w-2xl text-3xl leading-[1.15] font-semibold tracking-[-0.025em] md:text-5xl">
            Point it at a repository.
            <span className="block text-[var(--ink-dim)]">
              It reads the files, reports only what it found, and writes the patch.
            </span>
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
                className="border border-[var(--ink)] px-5 py-2 font-mono text-xs transition-colors hover:bg-[var(--ink)] hover:text-[var(--ground)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-40"
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
              {report?.analyzable && (
                <div className="mt-14 grid gap-x-12 gap-y-8 border-t border-[var(--line)] pt-8 md:grid-cols-[1fr_18rem]">
                  <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-1.5 self-start font-mono text-xs">
                    <dt className="text-[var(--ink-faint)]">source</dt>
                    <dd className="break-words text-[var(--ink)]">{report.origin}</dd>
                    <dt className="text-[var(--ink-faint)]">checks</dt>
                    <dd className="text-[var(--ink-dim)]">
                      Docker · TypeScript · dependencies · secrets
                    </dd>
                    <dt className="text-[var(--ink-faint)]">files read</dt>
                    <dd className="text-[var(--ink-dim)]">{report.filesInspected.length}</dd>
                    {report.filesUnreadable.length > 0 && (
                      <>
                        <dt className="text-[var(--ink-faint)]">unreadable</dt>
                        <dd className="text-[var(--flag)]">{report.filesUnreadable.length}</dd>
                      </>
                    )}
                  </dl>

                  {report.findings.length > 0 && (
                    <FindingTally
                      findings={report.findings}
                      verdicts={verdicts}
                      planned={plan !== null}
                    />
                  )}
                </div>
              )}

              {report?.analyzable && report.findings.length > 0 && (
                <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
                  {fixableCount > 0 && (
                    <button
                      onClick={previewFixes}
                      disabled={previewing}
                      className="border border-[var(--ink)] px-5 py-2 font-mono text-xs transition-colors hover:bg-[var(--ink)] hover:text-[var(--ground)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-40"
                    >
                      {previewing
                        ? "computing the patch"
                        : plan
                          ? "recompute the patch"
                          : `write the patch for ${fixableCount} finding${fixableCount === 1 ? "" : "s"}`}
                    </button>
                  )}

                  <button
                    onClick={copyForAgent}
                    className="border border-[var(--line)] px-4 py-2 font-mono text-xs text-[var(--ink-dim)] transition-colors hover:border-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                  >
                    {copied ? "copied" : "copy for your agent"}
                  </button>

                  {plan && plan.files.length > 0 && canOpenPullRequest && (
                    <button
                      onClick={openPullRequest}
                      disabled={opening}
                      className="border border-[var(--line)] px-4 py-2 font-mono text-xs text-[var(--ink-dim)] transition-colors hover:border-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-40"
                    >
                      {opening ? "opening" : "open pull request"}
                    </button>
                  )}

                  {plan && plan.files.length > 0 && !canOpenPullRequest && (
                    <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                      pull requests open on the repository this deployment is configured for
                    </span>
                  )}
                </div>
              )}

              {/* The patch, in full, before anything is written anywhere. */}
              {plan && plan.files.length > 0 && (
                <section className="mt-14">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                    The patch
                    <span className="text-[var(--ink-faint)]">
                      {" · "}
                      {plan.files.length} file{plan.files.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                    Computed from these files as they are now. Nothing has been written.
                  </p>
                  <div className="mt-6">
                    {plan.files.map((file) => (
                      <DiffFile key={file.filePath} file={file} />
                    ))}
                    <div className="h-px bg-[var(--line)]" />
                  </div>
                </section>
              )}

              {plan && plan.files.length === 0 && (
                <div className="mt-14 border-t border-[var(--line)] pt-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--flag)]">
                    Nothing patched
                  </p>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]">
                    No edit could be computed safely from these files. Each finding below carries
                    the reason it was left alone.
                  </p>
                </div>
              )}

              <div className="mt-14">
                {loading ? (
                  <p className="py-16 font-mono text-xs text-[var(--ink-faint)]">reading files…</p>
                ) : report && !report.analyzable ? (
                  <div className="border-t border-[var(--line)] pt-6">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--flag)]">
                      Nothing measured
                    </p>
                    {report.notes.map((note) => (
                      <p
                        key={note}
                        className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-dim)]"
                      >
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
                    <h2 className="mb-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                      Findings
                    </h2>
                    {report?.findings.map((finding) => (
                      <FindingRow
                        key={finding.id}
                        finding={finding}
                        verdict={verdicts.get(finding.id) ?? null}
                        prUrl={pullRequests[finding.id] ?? pullRequests.all}
                      />
                    ))}
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
                            <article
                              key={vuln.id}
                              className={`border-t border-l-2 border-t-[var(--line)] py-7 pl-5 ${
                                HEAVY.has(vuln.severity)
                                  ? "border-l-[var(--flag)]"
                                  : "border-l-[var(--line)]"
                              }`}
                            >
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
