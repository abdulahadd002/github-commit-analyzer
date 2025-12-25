import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import {
  Calendar,
  Clock,
  Award,
  MessageSquare,
  GitCommit,
  Activity,
  FileCode,
  RefreshCw,
  ShieldAlert,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * GitHub Commit Analyzer (JSX / Option B)
 * - Pulls ALL commits via pagination.
 * - Fetches commit details for ALL commits (no sampling) for realistic stats/file diversity.
 * - Fixed work window and concurrency (inputs removed per earlier request).
 */

const COLORS = ["#10b981", "#ef4444"]; // On-time, Late
const FILE_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#6b7280",
  "#14b8a6",
  "#a855f7",
];

function safeExt(filename) {
  const base = (filename || "").split("/").pop() || "";
  const parts = base.split(".");
  if (parts.length < 2) return "(no-ext)";
  const ext = parts.pop();
  return (ext || "(no-ext)").toLowerCase();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};
  const links = {};
  const parts = linkHeader.split(",");
  for (const p of parts) {
    const seg = p.split(";");
    const url = seg[0]?.trim()?.replace(/^<|>$/g, "");
    const rel = seg[1]?.trim()?.match(/rel="(.*)"/)?.[1];
    if (url && rel) links[rel] = url;
  }
  return links;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function calculateExperienceLevel(totalCommits, onTimePercentage, messageQuality, consistency) {
  let score = 0;

  // Commit volume (35)
  if (totalCommits > 200) score += 35;
  else if (totalCommits > 150) score += 30;
  else if (totalCommits > 100) score += 25;
  else if (totalCommits > 50) score += 20;
  else score += 10;

  // Work pattern (15)
  if (onTimePercentage >= 60) score += 15;
  else if (onTimePercentage >= 50) score += 10;
  else if (onTimePercentage >= 30) score += 5;
  else score += 2;

  // Message quality (30)
  if (messageQuality >= 50) score += 30;
  else if (messageQuality >= 40) score += 25;
  else if (messageQuality >= 30) score += 20;
  else score += 15;

  // Consistency (20)
  if (consistency >= 70) score += 20;
  else if (consistency >= 60) score += 15;
  else if (consistency >= 40) score += 10;
  else score += 5;

  if (score >= 80) return { level: "Senior", tone: "purple" };
  if (score >= 60) return { level: "Mid-Level", tone: "blue" };
  if (score >= 40) return { level: "Junior", tone: "green" };
  return { level: "Beginner", tone: "yellow" };
}

function toneClasses(tone) {
  switch (tone) {
    case "purple":
      return { badge: "bg-purple-100 text-purple-700" };
    case "blue":
      return { badge: "bg-blue-100 text-blue-700" };
    case "green":
      return { badge: "bg-green-100 text-green-700" };
    default:
      return { badge: "bg-yellow-100 text-yellow-700" };
  }
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat().format(n);
}

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    const to = Number(value) || 0;
    prev.current = to;

    const duration = 600;
    const start = performance.now();
    let raf = 0;

    const tick = (t) => {
      const p = clamp((t - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{formatNumber(Math.round(display))}</>;
}

function ProgressBar({ value }) {
  return (
    <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
      <motion.div
        className="h-full bg-blue-600 dark:bg-blue-400"
        initial={{ width: 0 }}
        animate={{ width: `${clamp(value, 0, 100)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      />
    </div>
  );
}

async function fetchJson(url, { headers, signal }) {
  const resp = await fetch(url, { headers, signal });
  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { resp, json, rawText: text };
}

export default function GitHubCommitAnalyzer() {
  const [username, setUsername] = useState("");
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");

  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("idle"); // "idle" | "listing" | "details" | "done"
  const [progress, setProgress] = useState({ current: 0, total: 0, pct: 0 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const [dark, setDark] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  // Fixed internals (inputs removed from UI)
  const WORK_START = 9;
  const WORK_END = 21; // 9pm
  const CONCURRENCY = 6;

  const abortRef = useRef(null);

  const headers = useMemo(() => {
    const h = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token.trim()) h.Authorization = `Bearer ${token.trim()}`;
    return h;
  }, [token]);

  const stop = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const reset = () => {
    stop();
    setLoading(false);
    setPhase("idle");
    setProgress({ current: 0, total: 0, pct: 0 });
    setError("");
    setData(null);
  };

  const analyzeCommits = async () => {
    if (!username.trim() || !repo.trim()) {
      setError("Please enter both username and repository name");
      return;
    }

    setLoading(true);
    setPhase("listing");
    setError("");
    setData(null);
    setProgress({ current: 0, total: 0, pct: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const owner = encodeURIComponent(username.trim());
      const name = encodeURIComponent(repo.trim());

      // 0) Try repo metadata to pin to default branch. If blocked, continue without it.
      let defaultBranch = "";
      let metaWarning = "";
      try {
        const repoMetaUrl = `https://api.github.com/repos/${owner}/${name}`;
        const metaRes = await fetchJson(repoMetaUrl, { headers, signal: controller.signal });

        if (metaRes.resp.ok && metaRes.json) {
          defaultBranch = metaRes.json.default_branch || "";
        } else {
          const msg =
            (metaRes.json && (metaRes.json.message || metaRes.json.error)) || metaRes.rawText || "";

          if (metaRes.resp.status === 403) {
            metaWarning =
              "Repo metadata blocked (403). Falling back to commit listing." +
              (msg ? ` (${msg})` : "");
          } else if (metaRes.resp.status === 404) {
            throw new Error("Repo not found (check owner/repo spelling and access)");
          } else if (metaRes.resp.status === 401) {
            metaWarning = "Token unauthorized (401). Falling back to unauthenticated commit listing.";
          } else {
            metaWarning = `Repo metadata unavailable (${metaRes.resp.status}). Falling back to commit listing.`;
          }
        }
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        metaWarning = "Could not read repo metadata. Falling back to commit listing.";
      }

      if (metaWarning) setError(metaWarning);

      // 1) Fetch ALL commits (pagination)
      const allCommits = [];
      const seenShas = new Set();
      const seenPageUrls = new Set();
      let nextUrl = `https://api.github.com/repos/${owner}/${name}/commits?per_page=100${
        defaultBranch ? `&sha=${encodeURIComponent(defaultBranch)}` : ""
      }`;

      let pageCount = 0;
      while (nextUrl) {
        if (seenPageUrls.has(nextUrl)) break;
        seenPageUrls.add(nextUrl);

        pageCount++;
        const { resp, json, rawText } = await fetchJson(nextUrl, { headers, signal: controller.signal });

        if (!resp.ok) {
          if (resp.status === 404) throw new Error("Repo not found (check owner/repo spelling and access)");
          if (resp.status === 401) throw new Error("Unauthorized: token invalid or missing required scopes");
          if (resp.status === 403) {
            const resetTs = resp.headers.get("x-ratelimit-reset");
            const remaining = resp.headers.get("x-ratelimit-remaining");
            const msg =
              (json && (json.message || json.error)) || rawText || "GitHub API rate-limited or forbidden";
            throw new Error(
              `${msg}${remaining !== null ? ` (remaining: ${remaining})` : ""}${
                resetTs ? ` (reset: ${new Date(Number(resetTs) * 1000).toLocaleString()})` : ""
              }`
            );
          }
          throw new Error(`GitHub API error: ${resp.status}`);
        }

        if (!Array.isArray(json) || json.length === 0) break;

        for (const c of json) {
          const sha = c?.sha;
          if (sha && seenShas.has(sha)) continue;
          if (sha) seenShas.add(sha);
          allCommits.push(c);
        }

        setProgress({ current: allCommits.length, total: 0, pct: 0 });

        const links = parseLinkHeader(resp.headers.get("link"));
        nextUrl = links.next || "";

        if (pageCount % 3 === 0) await sleep(0);
      }

      if (allCommits.length === 0) throw new Error("No commits found");

      // 2) Base distributions
      let onTimeCount = 0;
      let lateCount = 0;
      const hourlyDistribution = Array(24).fill(0);
      const weekdayDistribution = Array(7).fill(0);
      const commitDates = [];
      let totalMessageScore = 0;

      for (const c of allCommits) {
        const dateStr = c?.commit?.author?.date;
        if (!dateStr) continue;
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) continue;

        const hour = date.getHours();
        const day = date.getDay();
        commitDates.push(date);

        hourlyDistribution[hour]++;
        weekdayDistribution[day]++;

        if (hour >= WORK_START && hour < WORK_END) onTimeCount++;
        else lateCount++;

        const message = String(c?.commit?.message || "");
        let messageScore = 0;
        if (message.length > 10) messageScore += 25;
        if (message.length > 30) messageScore += 25;
        if (/^(feat|fix|docs|refactor|test|chore|style|perf):/i.test(message)) messageScore += 25;
        if (/#\d+/.test(message)) messageScore += 25;
        totalMessageScore += messageScore;
      }

      const totalCommits = allCommits.length;
      const onTimePercentage = totalCommits ? (onTimeCount / totalCommits) * 100 : 0;
      const messageQualityScore = totalCommits ? Math.round(totalMessageScore / totalCommits) : 0;

      // 3) Fetch details for ALL commits
      setPhase("details");
      setProgress({ current: 0, total: totalCommits, pct: 0 });

      let totalLinesAdded = 0;
      let totalLinesDeleted = 0;
      const fileExtensions = {};
      const commitSizes = [];

      let idx = 0;
      const workerCount = clamp(CONCURRENCY, 1, 12);

      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const my = idx++;
          if (my >= allCommits.length) break;
          const c = allCommits[my];

          try {
            const { resp, json } = await fetchJson(c.url, { headers, signal: controller.signal });
            if (resp.ok && json) {
              if (json?.stats) {
                const adds = json.stats.additions || 0;
                const dels = json.stats.deletions || 0;
                // NOTE: technically non-atomic across workers; acceptable for UI analytics.
                totalLinesAdded += adds;
                totalLinesDeleted += dels;
                commitSizes.push(adds + dels);
              }

              if (Array.isArray(json?.files)) {
                json.files.forEach((f) => {
                  const ext = safeExt(f?.filename);
                  fileExtensions[ext] = (fileExtensions[ext] || 0) + 1;
                });
              }
            }
          } catch (e) {
            if (e?.name === "AbortError") throw e;
          } finally {
            if (my % 6 === 0) {
              const done = Math.min(my + 1, allCommits.length);
              const pct = (done / allCommits.length) * 100;
              setProgress({ current: done, total: allCommits.length, pct });
              await sleep(0);
            }
          }
        }
      });

      await Promise.all(workers);
      setProgress({ current: totalCommits, total: totalCommits, pct: 100 });

      // 4) Derived metrics
      const sortedDates = [...commitDates].sort((a, b) => a.getTime() - b.getTime());
      const intervals = [];
      for (let i = 1; i < sortedDates.length; i++) {
        const diffDays =
          (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(diffDays) && diffDays >= 0) intervals.push(diffDays);
      }
      const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
      const consistencyScore = clamp(100 - avgInterval * 5, 0, 100);

      const avgCommitSize = commitSizes.length
        ? Math.round(commitSizes.reduce((a, b) => a + b, 0) / commitSizes.length)
        : 0;

      const topFileTypes = Object.entries(fileExtensions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([ext, count]) => ({ name: ext, value: count }));

      const sizeRanges = [
        { range: "0-50", count: 0 },
        { range: "51-100", count: 0 },
        { range: "101-200", count: 0 },
        { range: "201-500", count: 0 },
        { range: "500+", count: 0 },
      ];

      commitSizes.forEach((size) => {
        if (size <= 50) sizeRanges[0].count++;
        else if (size <= 100) sizeRanges[1].count++;
        else if (size <= 200) sizeRanges[2].count++;
        else if (size <= 500) sizeRanges[3].count++;
        else sizeRanges[4].count++;
      });

      const consistencyTimeline = [];
      for (let i = 0; i < Math.min(sortedDates.length - 1, 30); i++) {
        const diffDays =
          (sortedDates[i + 1].getTime() - sortedDates[i].getTime()) / (1000 * 60 * 60 * 24);
        consistencyTimeline.push({
          commit: `#${i + 1}`,
          days: Number.isFinite(diffDays) ? Number(diffDays.toFixed(1)) : 0,
        });
      }

      const experienceLevel = calculateExperienceLevel(
        totalCommits,
        onTimePercentage,
        messageQualityScore,
        Math.round(consistencyScore)
      );

      const hourlyData = hourlyDistribution.map((count, hour) => ({ hour: `${hour}:00`, commits: count }));
      const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weekdayData = weekdayDistribution.map((count, day) => ({ day: weekdayNames[day], commits: count }));

      setData({
        totalCommits,
        onTimeCount,
        lateCount,
        onTimePercentage: onTimePercentage.toFixed(1),
        messageQualityScore,
        consistencyScore: Math.round(consistencyScore),
        avgCommitSize,
        totalLinesAdded,
        totalLinesDeleted,
        fileTypes: topFileTypes.length ? topFileTypes : [{ name: "(no data)", value: 1 }],
        commitSizeDistribution: sizeRanges,
        consistencyTimeline: consistencyTimeline.length ? consistencyTimeline : [{ commit: "#1", days: 0 }],
        experienceLevel,
        hourlyData,
        weekdayData,
      });

      setPhase("done");

      setShowComplete(true);
      setTimeout(() => setShowComplete(false), 2500);
      setTimeout(() => setPhase("idle"), 2600);
    } catch (err) {
      if (err?.name === "AbortError") setError("Stopped.");
      else setError(err?.message || "Something went wrong");
      setPhase("idle");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const expTone = data?.experienceLevel?.tone || "blue";
  const expClasses = toneClasses(expTone);
  const isWarning = !!error && /(falling back|metadata|blocked|unavailable)/i.test(error);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100 via-white to-purple-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="absolute top-32 -right-24 h-80 w-80 rounded-full bg-purple-400/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
        </div>

        <div className="relative p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg" />
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-zinc-100">
                    Experience Analysis for GitHub Commits
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-zinc-300">
                    Full-history of the repository
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDark((d) => !d)}
                  className="group inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-sm hover:shadow transition"
                  title="Toggle theme"
                >
                  {dark ? <Sun size={18} className="text-zinc-100" /> : <Moon size={18} className="text-gray-900" />}
                  <span className="hidden sm:inline text-sm text-gray-700 dark:text-zinc-200">Theme</span>
                </button>

                <button
                  onClick={reset}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-sm hover:shadow transition"
                  title="Reset"
                >
                  <RefreshCw size={18} className="text-gray-800 dark:text-zinc-200" />
                  <span className="hidden sm:inline text-sm text-gray-700 dark:text-zinc-200">Reset</span>
                </button>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-xl"
            >
              <div className="p-6 md:p-7">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Analyze a repository</h2>
                    <p className="text-sm text-gray-600 dark:text-zinc-300">
                      Enter owner/repo and an optional token for higher rate limits.
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 text-gray-700 dark:text-zinc-200">
                      WORK: 09:00–21:00
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 text-gray-700 dark:text-zinc-200">
                      Concurrency: 6
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Owner"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-white/80 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-zinc-500">
                      owner
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Repository"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-white/80 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-zinc-500">
                      repo
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="password"
                      placeholder="GitHub Token (recommended)"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-white/80 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-zinc-500">
                      token
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={analyzeCommits}
                    disabled={loading}
                    className="relative overflow-hidden flex-1 rounded-2xl px-5 py-3 font-semibold text-white shadow-lg disabled:opacity-60"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600" />
                    <span className="absolute inset-0 opacity-0 hover:opacity-100 transition bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_55%)]" />
                    <span className="relative inline-flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <motion.span
                            className="inline-block"
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          >
                            <RefreshCw size={18} />
                          </motion.span>
                          Analyzing…
                        </>
                      ) : (
                        <>Analyze all commits</>
                      )}
                    </span>
                  </button>

                  <button
                    onClick={stop}
                    disabled={!loading}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 font-semibold border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-zinc-100 hover:bg-white dark:hover:bg-white/10 transition disabled:opacity-50"
                    title="Stop"
                  >
                    <X size={18} /> Stop
                  </button>
                </div>

                <AnimatePresence>
                  {(phase === "listing" || phase === "details") && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                          {phase === "listing" && "Fetching commit list…"}
                          {phase === "details" && "Fetching commit details…"}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-zinc-400">
                          {phase === "listing"
                            ? `commits so far: ${formatNumber(progress.current)}`
                            : `${formatNumber(progress.current)} / ${formatNumber(progress.total)}`}
                        </div>
                      </div>
                      <ProgressBar value={phase === "details" ? progress.pct : 20} />
                      <div className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                        Tip: Tokens increase limits. Large repos may still hit GitHub limits.
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <div
                    className={
                      "mt-5 rounded-2xl border p-4 " +
                      (isWarning
                        ? "bg-amber-50/70 dark:bg-amber-500/10 border-amber-200/70 dark:border-amber-400/20 text-amber-900 dark:text-amber-200"
                        : "bg-red-50/80 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-200")
                    }
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldAlert size={18} />
                      {isWarning ? "Notice" : "Error"}
                    </div>
                    <div className="mt-1 text-sm leading-relaxed">{error}</div>
                  </div>
                )}

                <AnimatePresence>
                  {showComplete && !error && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mt-5 rounded-2xl border border-emerald-200/60 dark:border-emerald-400/20 bg-emerald-50/70 dark:bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 text-sm"
                    >
                      ✅ Complete
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {data && (
              <>
                <div className="mt-10 mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Overview</h3>
                    <p className="text-sm text-gray-600 dark:text-zinc-300">
                      Key indicators from the repository history.
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-gray-700 dark:text-zinc-200">
                      {username.trim()}/{repo.trim()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    {
                      label: "Total Commits",
                      value: data.totalCommits,
                      icon: <Calendar className="text-blue-600" size={32} />,
                      valueClass: "text-gray-900 dark:text-zinc-100",
                    },
                    {
                      label: "On‑Time Rate",
                      value: `${data.onTimePercentage}%`,
                      icon: <Clock className="text-emerald-600" size={32} />,
                      valueClass: "text-emerald-600",
                    },
                    {
                      label: "Message Quality",
                      value: data.messageQualityScore,
                      icon: <MessageSquare className="text-purple-600" size={32} />,
                      valueClass: "text-purple-600",
                    },
                    {
                      label: "Consistency",
                      value: data.consistencyScore,
                      icon: <Activity className="text-blue-600" size={32} />,
                      valueClass: "text-blue-600",
                    },
                  ].map((m, i) => (
                    <motion.div
                      key={m.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 + i * 0.05 }}
                      className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                            {m.label}
                          </p>
                          <div className={`mt-2 text-3xl font-semibold ${m.valueClass}`}>
                            {typeof m.value === "number" ? <AnimatedNumber value={m.value} /> : m.value}
                          </div>
                        </div>
                        <div className="mt-1">{m.icon}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 rounded-3xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-2xl p-6 text-white overflow-hidden relative"
                >
                  <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_55%)]" />
                  <div className="relative flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl md:text-3xl font-semibold">Experience: {data.experienceLevel.level}</h2>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${expClasses.badge}`}>
                          Full details
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-white/80">Total Lines Changed</p>
                          <p className="text-xl font-semibold">
                            +{formatNumber(data.totalLinesAdded)} / -{formatNumber(data.totalLinesDeleted)}
                          </p>
                        </div>
                        <div>
                          <p className="text-white/80">Avg Commit Size</p>
                          <p className="text-xl font-semibold">{formatNumber(data.avgCommitSize)} lines</p>
                        </div>
                      </div>
                    </div>
                    <Award size={92} className="opacity-20 shrink-0" />
                  </div>
                </motion.div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <FileCode className="text-blue-600" size={22} />
                      <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">File Type Diversity</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={data.fileTypes}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {data.fileTypes.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={FILE_COLORS[index % FILE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <GitCommit className="text-emerald-600" size={22} />
                      <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">Commit Sizes</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.commitSizeDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">Lines changed per commit</p>
                  </div>

                  <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="text-purple-600" size={22} />
                      <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">Commit Frequency</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data.consistencyTimeline}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="commit" tick={{ fontSize: 10 }} />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="days" stroke="#8b5cf6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                    <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">Days between commits (first 30 intervals)</p>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-4">On‑Time vs Late</h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: "On‑Time", value: data.onTimeCount },
                            { name: "Late", value: data.lateCount },
                          ]}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={110}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {COLORS.map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-4">Commits by Weekday</h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={data.weekdayData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="commits" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="mt-8 rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-4">Hourly Distribution</h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={data.hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="commits" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-10 pb-8 text-center text-xs text-gray-500 dark:text-zinc-500">
                  Built with GitHub REST API • Heavy analysis may hit rate limits
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Minimal dev “tests” (no framework) — helps catch regressions in helpers.
// These run only in development and do not affect the UI.
function runDevTests() {
  // Existing tests (kept)
  console.assert(safeExt("src/index.tsx") === "tsx", "safeExt should return file extension");
  console.assert(safeExt("README") === "(no-ext)", "safeExt should handle no extension");

  // Fixed: ensure the string literal is properly terminated
  console.assert(safeExt("a.b.C") === "c", "safeExt should lowercase extension");

  // Added tests
  console.assert(safeExt("a/b/c") === "(no-ext)", "safeExt should handle paths without extension");
  console.assert(safeExt("src/App.jsx") === "jsx", "safeExt should support jsx");
  console.assert(safeExt("src/styles.css") === "css", "safeExt should support css");

  console.assert(clamp(5, 0, 10) === 5, "clamp should keep value in range");
  console.assert(clamp(-1, 0, 10) === 0, "clamp should clamp low");
  console.assert(clamp(99, 0, 10) === 10, "clamp should clamp high");

  const links = parseLinkHeader(
    '<https://api.github.com/repositories/1/commits?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1/commits?per_page=100&page=10>; rel="last"'
  );
  console.assert(!!links.next && !!links.last, "parseLinkHeader should parse next/last");
  console.assert(parseLinkHeader(null).next === undefined, "parseLinkHeader should handle null");
  console.assert(
    parseLinkHeader('<https://x.test?page=3>; rel="prev"').prev === "https://x.test?page=3",
    "parseLinkHeader should parse single link"
  );
  console.assert(Object.keys(parseLinkHeader("")).length === 0, "parseLinkHeader should handle empty string");
}

// Guarded dev execution (some environments don’t define process)
if (typeof process !== "undefined" && process?.env?.NODE_ENV !== "production") {
  runDevTests();
}
