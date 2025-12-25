import React, { useEffect, useRef, useState } from "react";
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
  Clock,
  Award,
  MessageSquare,
  GitCommit,
  Activity,
  FileCode,
  RefreshCw,
  Moon,
  Sun,
  X,
  Plus,
  Users,
  ChevronDown,
  ChevronUp,
  Trash2,
  History,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * GitHub Commit Analyzer - Multi-Developer Version
 * - Supports up to 10 developers with separate owner/repo pairs
 * - Side-by-side comparison of experience reports
 * - Individual and batch analysis
 */

const MAX_DEVELOPERS = 10;

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

const DEVELOPER_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
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
  if (consistency >= 70 && totalCommits > 100) score += 20;
  else if (consistency >= 60 && totalCommits > 50) score += 15;
  else if (consistency >= 40 && totalCommits > 20) score += 10;
  else score += 5;

  if (score >= 80) return { level: "Senior", tone: "purple", score };
  if (score >= 60) return { level: "Mid-Level", tone: "blue", score };
  if (score >= 40) return { level: "Junior", tone: "green", score };
  return { level: "Beginner", tone: "yellow", score };
}

function toneClasses(tone) {
  switch (tone) {
    case "purple":
      return { badge: "bg-purple-100 text-purple-700", bg: "bg-purple-500" };
    case "blue":
      return { badge: "bg-blue-100 text-blue-700", bg: "bg-blue-500" };
    case "green":
      return { badge: "bg-green-100 text-green-700", bg: "bg-green-500" };
    default:
      return { badge: "bg-yellow-100 text-yellow-700", bg: "bg-yellow-500" };
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

// Generate unique ID
let nextId = 1;
function generateId() {
  return nextId++;
}

// LocalStorage key for history
const HISTORY_STORAGE_KEY = "github-commit-analyzer-history";

// Load history from localStorage
function loadHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load history:", e);
  }
  return [];
}

// Save history to localStorage
function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

export default function GitHubCommitAnalyzer() {
  // Multi-developer state
  const [developers, setDevelopers] = useState([
    { id: generateId(), username: "", repo: "", token: "" }
  ]);
  const [results, setResults] = useState({}); // { [id]: data }
  const [loadingStates, setLoadingStates] = useState({}); // { [id]: boolean }
  const [phases, setPhases] = useState({}); // { [id]: "idle" | "listing" | "details" | "done" }
  const [progresses, setProgresses] = useState({}); // { [id]: { current, total, pct } }
  const [errors, setErrors] = useState({}); // { [id]: string }
  const [expandedDetails, setExpandedDetails] = useState({}); // { [id]: boolean }

  const [dark, setDark] = useState(false);
  const [analyzingAll, setAnalyzingAll] = useState(false);

  // Search history state
  const [searchHistory, setSearchHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount
  useEffect(() => {
    setSearchHistory(loadHistory());
  }, []);

  // Fixed internals
  const WORK_START = 1;
  const WORK_END = 24;
  const CONCURRENCY = 10;

  const abortRefs = useRef({}); // { [id]: AbortController }

  // Developer management functions
  const addDeveloper = () => {
    if (developers.length >= MAX_DEVELOPERS) return;
    setDevelopers([...developers, { id: generateId(), username: "", repo: "", token: "" }]);
  };

  const removeDeveloper = (id) => {
    if (developers.length <= 1) return;
    // Stop any running analysis
    if (abortRefs.current[id]) {
      abortRefs.current[id].abort();
      delete abortRefs.current[id];
    }
    setDevelopers(developers.filter(d => d.id !== id));
    // Clean up state
    setResults(prev => { const n = { ...prev }; delete n[id]; return n; });
    setLoadingStates(prev => { const n = { ...prev }; delete n[id]; return n; });
    setPhases(prev => { const n = { ...prev }; delete n[id]; return n; });
    setProgresses(prev => { const n = { ...prev }; delete n[id]; return n; });
    setErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
    setExpandedDetails(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const updateDeveloper = (id, field, value) => {
    setDevelopers(developers.map(d =>
      d.id === id ? { ...d, [field]: value } : d
    ));
  };

  const stopAnalysis = (id) => {
    if (abortRefs.current[id]) {
      abortRefs.current[id].abort();
    }
  };

  const stopAll = () => {
    Object.keys(abortRefs.current).forEach(id => {
      if (abortRefs.current[id]) {
        abortRefs.current[id].abort();
      }
    });
  };

  const resetAll = () => {
    stopAll();
    setResults({});
    setLoadingStates({});
    setPhases({});
    setProgresses({});
    setErrors({});
    setExpandedDetails({});
    setAnalyzingAll(false);
  };

  const toggleDetails = (id) => {
    setExpandedDetails(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // History management functions
  const addToHistory = (result) => {
    const historyEntry = {
      id: Date.now(),
      owner: result.owner,
      repo: result.repo,
      analyzedAt: new Date().toISOString(),
      experienceLevel: result.experienceLevel,
      totalCommits: result.totalCommits,
      onTimePercentage: result.onTimePercentage,
      messageQualityScore: result.messageQualityScore,
      consistencyScore: result.consistencyScore,
      avgCommitSize: result.avgCommitSize,
      totalLinesAdded: result.totalLinesAdded,
      totalLinesDeleted: result.totalLinesDeleted,
    };

    setSearchHistory(prev => {
      // Remove duplicate if exists (same owner/repo)
      const filtered = prev.filter(
        h => !(h.owner === historyEntry.owner && h.repo === historyEntry.repo)
      );
      // Add new entry at the beginning, keep max 50 entries
      const updated = [historyEntry, ...filtered].slice(0, 50);
      saveHistory(updated);
      return updated;
    });
  };

  const removeFromHistory = (historyId) => {
    setSearchHistory(prev => {
      const updated = prev.filter(h => h.id !== historyId);
      saveHistory(updated);
      return updated;
    });
  };

  const clearHistory = () => {
    setSearchHistory([]);
    saveHistory([]);
  };

  const loadFromHistory = (historyEntry) => {
    // Add a new developer card with the history entry's owner/repo
    const newDev = { id: generateId(), username: historyEntry.owner, repo: historyEntry.repo, token: "" };
    setDevelopers(prev => {
      // Check if we already have this owner/repo
      const exists = prev.some(d => d.username === historyEntry.owner && d.repo === historyEntry.repo);
      if (exists) return prev;
      if (prev.length >= MAX_DEVELOPERS) return prev;
      return [...prev, newDev];
    });
  };

  // Analysis function for a single developer
  const analyzeCommits = async (devId) => {
    const dev = developers.find(d => d.id === devId);
    if (!dev) return;

    if (!dev.username.trim() || !dev.repo.trim()) {
      setErrors(prev => ({ ...prev, [devId]: "Please enter both owner and repository name" }));
      return;
    }

    setLoadingStates(prev => ({ ...prev, [devId]: true }));
    setPhases(prev => ({ ...prev, [devId]: "listing" }));
    setErrors(prev => ({ ...prev, [devId]: "" }));
    setResults(prev => { const n = { ...prev }; delete n[devId]; return n; });
    setProgresses(prev => ({ ...prev, [devId]: { current: 0, total: 0, pct: 0 } }));

    const controller = new AbortController();
    abortRefs.current[devId] = controller;

    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (dev.token.trim()) headers.Authorization = `Bearer ${dev.token.trim()}`;

    try {
      const owner = encodeURIComponent(dev.username.trim());
      const name = encodeURIComponent(dev.repo.trim());

      // 0) Try repo metadata
      let defaultBranch = "";
      let metaWarning = "";
      try {
        const repoMetaUrl = `https://api.github.com/repos/${owner}/${name}`;
        const metaRes = await fetchJson(repoMetaUrl, { headers, signal: controller.signal });

        if (metaRes.resp.ok && metaRes.json) {
          defaultBranch = metaRes.json.default_branch || "";
        } else {
          const msg = (metaRes.json && (metaRes.json.message || metaRes.json.error)) || metaRes.rawText || "";

          if (metaRes.resp.status === 403) {
            metaWarning = "Repo metadata blocked (403). Falling back to commit listing." + (msg ? ` (${msg})` : "");
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

      if (metaWarning) setErrors(prev => ({ ...prev, [devId]: metaWarning }));

      // 1) Fetch ALL commits
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
            const msg = (json && (json.message || json.error)) || rawText || "GitHub API rate-limited or forbidden";
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

        setProgresses(prev => ({ ...prev, [devId]: { current: allCommits.length, total: 0, pct: 0 } }));

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
      setPhases(prev => ({ ...prev, [devId]: "details" }));
      setProgresses(prev => ({ ...prev, [devId]: { current: 0, total: totalCommits, pct: 0 } }));

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
              setProgresses(prev => ({ ...prev, [devId]: { current: done, total: allCommits.length, pct } }));
              await sleep(0);
            }
          }
        }
      });

      await Promise.all(workers);
      setProgresses(prev => ({ ...prev, [devId]: { current: totalCommits, total: totalCommits, pct: 100 } }));

      // 4) Derived metrics
      const sortedDates = [...commitDates].sort((a, b) => a.getTime() - b.getTime());
      const intervals = [];
      for (let i = 1; i < sortedDates.length; i++) {
        const diffDays = (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
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
        const diffDays = (sortedDates[i + 1].getTime() - sortedDates[i].getTime()) / (1000 * 60 * 60 * 24);
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

      const resultData = {
        owner: dev.username.trim(),
        repo: dev.repo.trim(),
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
      };

      setResults(prev => ({
        ...prev,
        [devId]: resultData
      }));

      // Save to history
      addToHistory(resultData);

      setPhases(prev => ({ ...prev, [devId]: "done" }));
      setTimeout(() => setPhases(prev => ({ ...prev, [devId]: "idle" })), 2000);
    } catch (err) {
      if (err?.name === "AbortError") {
        setErrors(prev => ({ ...prev, [devId]: "Stopped." }));
      } else {
        setErrors(prev => ({ ...prev, [devId]: err?.message || "Something went wrong" }));
      }
      setPhases(prev => ({ ...prev, [devId]: "idle" }));
    } finally {
      setLoadingStates(prev => ({ ...prev, [devId]: false }));
      delete abortRefs.current[devId];
    }
  };

  // Analyze all developers
  const analyzeAllDevelopers = async () => {
    const validDevs = developers.filter(d => d.username.trim() && d.repo.trim());
    if (validDevs.length === 0) {
      return;
    }

    setAnalyzingAll(true);

    // Run all analyses in parallel
    await Promise.all(validDevs.map(d => analyzeCommits(d.id)));

    setAnalyzingAll(false);
  };

  // Check if any developer is loading
  const anyLoading = Object.values(loadingStates).some(Boolean);

  // Get results as array for comparison
  const resultsArray = developers
    .filter(d => results[d.id])
    .map(d => ({ ...results[d.id], devId: d.id, devIndex: developers.findIndex(dev => dev.id === d.id) }));

  const hasResults = resultsArray.length > 0;

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
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg flex items-center justify-center">
                  <Users size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-zinc-100">
                    Multi-Developer Experience Analysis
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-zinc-300">
                    Compare up to {MAX_DEVELOPERS} developers side-by-side
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
                  onClick={resetAll}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-sm hover:shadow transition"
                  title="Reset all"
                >
                  <RefreshCw size={18} className="text-gray-800 dark:text-zinc-200" />
                  <span className="hidden sm:inline text-sm text-gray-700 dark:text-zinc-200">Reset</span>
                </button>
              </div>
            </div>

            {/* Developer Input Cards */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-xl"
            >
              <div className="p-6 md:p-7">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Add Developers to Analyze</h2>
                    <p className="text-sm text-gray-600 dark:text-zinc-300">
                      Enter owner/repo pairs for each developer. Use the same token for all or individual tokens.
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 text-gray-700 dark:text-zinc-200">
                      WORK: 09:00–21:00
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 text-gray-700 dark:text-zinc-200">
                      Max: {MAX_DEVELOPERS} developers
                    </span>
                  </div>
                </div>

                {/* Developer cards */}
                <div className="space-y-4">
                  {developers.map((dev, index) => (
                    <motion.div
                      key={dev.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/50 dark:bg-white/5 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: DEVELOPER_COLORS[index % DEVELOPER_COLORS.length] }}
                          />
                          <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                            Developer {index + 1}
                          </span>
                          {results[dev.id] && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${toneClasses(results[dev.id].experienceLevel.tone).badge}`}>
                              {results[dev.id].experienceLevel.level}
                            </span>
                          )}
                        </div>
                        {developers.length > 1 && (
                          <button
                            onClick={() => removeDeveloper(dev.id)}
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition"
                            title="Remove developer"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input
                          type="text"
                          placeholder="Owner"
                          value={dev.username}
                          onChange={(e) => updateDeveloper(dev.id, "username", e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white/80 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Repository"
                          value={dev.repo}
                          onChange={(e) => updateDeveloper(dev.id, "repo", e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white/80 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <input
                          type="password"
                          placeholder="GitHub Token (optional)"
                          value={dev.token}
                          onChange={(e) => updateDeveloper(dev.id, "token", e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white/80 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => analyzeCommits(dev.id)}
                            disabled={loadingStates[dev.id] || !dev.username.trim() || !dev.repo.trim()}
                            className="flex-1 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition disabled:opacity-50"
                          >
                            {loadingStates[dev.id] ? (
                              <span className="flex items-center justify-center gap-1">
                                <RefreshCw size={14} className="animate-spin" />
                                Analyzing
                              </span>
                            ) : (
                              "Analyze"
                            )}
                          </button>
                          {loadingStates[dev.id] && (
                            <button
                              onClick={() => stopAnalysis(dev.id)}
                              className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 text-sm transition"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar for this developer */}
                      <AnimatePresence>
                        {(phases[dev.id] === "listing" || phases[dev.id] === "details") && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3"
                          >
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-zinc-400 mb-1">
                              <span>
                                {phases[dev.id] === "listing" ? "Fetching commits..." : "Fetching details..."}
                              </span>
                              <span>
                                {phases[dev.id] === "listing"
                                  ? `${formatNumber(progresses[dev.id]?.current || 0)} commits`
                                  : `${formatNumber(progresses[dev.id]?.current || 0)} / ${formatNumber(progresses[dev.id]?.total || 0)}`}
                              </span>
                            </div>
                            <ProgressBar value={phases[dev.id] === "details" ? (progresses[dev.id]?.pct || 0) : 20} />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Error for this developer */}
                      {errors[dev.id] && (
                        <div className={`mt-3 rounded-xl p-3 text-xs ${
                          /(falling back|metadata|blocked|unavailable)/i.test(errors[dev.id])
                            ? "bg-amber-50/70 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200"
                            : "bg-red-50/80 dark:bg-red-500/10 text-red-800 dark:text-red-200"
                        }`}>
                          {errors[dev.id]}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Add developer and Analyze All buttons */}
                <div className="mt-5 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={addDeveloper}
                    disabled={developers.length >= MAX_DEVELOPERS}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border-2 border-dashed border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={18} />
                    Add Developer ({developers.length}/{MAX_DEVELOPERS})
                  </button>

                  <button
                    onClick={analyzeAllDevelopers}
                    disabled={anyLoading || developers.filter(d => d.username.trim() && d.repo.trim()).length === 0}
                    className="relative overflow-hidden flex-1 rounded-2xl px-5 py-3 font-semibold text-white shadow-lg disabled:opacity-60"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600" />
                    <span className="absolute inset-0 opacity-0 hover:opacity-100 transition bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_55%)]" />
                    <span className="relative inline-flex items-center justify-center gap-2">
                      {analyzingAll ? (
                        <>
                          <RefreshCw size={18} className="animate-spin" />
                          Analyzing All...
                        </>
                      ) : (
                        <>
                          <Users size={18} />
                          Analyze All Developers
                        </>
                      )}
                    </span>
                  </button>

                  {anyLoading && (
                    <button
                      onClick={stopAll}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 font-semibold border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-zinc-100 hover:bg-white dark:hover:bg-white/10 transition"
                    >
                      <X size={18} /> Stop All
                    </button>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Search History Section */}
            {searchHistory.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-xl"
              >
                <div className="p-6">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <History size={20} className="text-blue-600" />
                      <div className="text-left">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Search History</h2>
                        <p className="text-sm text-gray-600 dark:text-zinc-300">
                          {searchHistory.length} previous {searchHistory.length === 1 ? "analysis" : "analyses"} saved
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Clear all search history?")) {
                            clearHistory();
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                      >
                        Clear All
                      </button>
                      {showHistory ? (
                        <ChevronUp size={20} className="text-gray-500" />
                      ) : (
                        <ChevronDown size={20} className="text-gray-500" />
                      )}
                    </div>
                  </button>

                  <AnimatePresence>
                    {showHistory && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                          {searchHistory.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-gray-900 dark:text-zinc-100">
                                    {entry.owner}/{entry.repo}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${toneClasses(entry.experienceLevel.tone).badge}`}>
                                    {entry.experienceLevel.level}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-zinc-400">
                                  <span>{entry.totalCommits} commits</span>
                                  <span>Score: {entry.experienceLevel.score}</span>
                                  <span>Quality: {entry.messageQualityScore}</span>
                                  <span className="text-gray-400">
                                    {new Date(entry.analyzedAt).toLocaleDateString()} {new Date(entry.analyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  onClick={() => loadFromHistory(entry)}
                                  disabled={developers.length >= MAX_DEVELOPERS || developers.some(d => d.username === entry.owner && d.repo === entry.repo)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Add to current analysis"
                                >
                                  <RotateCcw size={12} />
                                  Re-analyze
                                </button>
                                <button
                                  onClick={() => removeFromHistory(entry.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition"
                                  title="Remove from history"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* Comparison Table */}
            {hasResults && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-10"
              >
                <div className="mb-4">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Comparison Overview</h3>
                  <p className="text-sm text-gray-600 dark:text-zinc-300">
                    Side-by-side comparison of {resultsArray.length} developer{resultsArray.length > 1 ? "s" : ""}
                  </p>
                </div>

                <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-black/5 dark:border-white/10">
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-zinc-100 bg-black/5 dark:bg-white/5">
                            Metric
                          </th>
                          {resultsArray.map((r) => (
                            <th
                              key={r.devId}
                              className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-zinc-100 bg-black/5 dark:bg-white/5"
                            >
                              <div className="flex items-center justify-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: DEVELOPER_COLORS[r.devIndex % DEVELOPER_COLORS.length] }}
                                />
                                <span>{r.owner}/{r.repo}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Experience Level */}
                        <tr className="border-b border-black/5 dark:border-white/10">
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-zinc-300">
                            <div className="flex items-center gap-2">
                              <Award size={16} className="text-purple-500" />
                              Experience Level
                            </div>
                          </td>
                          {resultsArray.map((r) => (
                            <td key={r.devId} className="px-6 py-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${toneClasses(r.experienceLevel.tone).badge}`}>
                                {r.experienceLevel.level}
                              </span>
                            </td>
                          ))}
                        </tr>
                        {/* Total Commits */}
                        <tr className="border-b border-black/5 dark:border-white/10">
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-zinc-300">
                            <div className="flex items-center gap-2">
                              <GitCommit size={16} className="text-blue-500" />
                              Total Commits
                            </div>
                          </td>
                          {resultsArray.map((r) => (
                            <td key={r.devId} className="px-6 py-4 text-center text-lg font-semibold text-gray-900 dark:text-zinc-100">
                              <AnimatedNumber value={r.totalCommits} />
                            </td>
                          ))}
                        </tr>
                        {/* On-Time Rate */}
                        <tr className="border-b border-black/5 dark:border-white/10">
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-zinc-300">
                            <div className="flex items-center gap-2">
                              <Clock size={16} className="text-emerald-500" />
                              On-Time Rate
                            </div>
                          </td>
                          {resultsArray.map((r) => (
                            <td key={r.devId} className="px-6 py-4 text-center text-lg font-semibold text-emerald-600">
                              {r.onTimePercentage}%
                            </td>
                          ))}
                        </tr>
                        {/* Message Quality */}
                        <tr className="border-b border-black/5 dark:border-white/10">
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-zinc-300">
                            <div className="flex items-center gap-2">
                              <MessageSquare size={16} className="text-purple-500" />
                              Message Quality
                            </div>
                          </td>
                          {resultsArray.map((r) => (
                            <td key={r.devId} className="px-6 py-4 text-center text-lg font-semibold text-purple-600">
                              {r.messageQualityScore}
                            </td>
                          ))}
                        </tr>
                        {/* Consistency */}
                        <tr className="border-b border-black/5 dark:border-white/10">
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-zinc-300">
                            <div className="flex items-center gap-2">
                              <Activity size={16} className="text-blue-500" />
                              Consistency Score
                            </div>
                          </td>
                          {resultsArray.map((r) => (
                            <td key={r.devId} className="px-6 py-4 text-center text-lg font-semibold text-blue-600">
                              {r.consistencyScore}
                            </td>
                          ))}
                        </tr>
                        {/* Avg Commit Size */}
                        <tr className="border-b border-black/5 dark:border-white/10">
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-zinc-300">
                            <div className="flex items-center gap-2">
                              <FileCode size={16} className="text-amber-500" />
                              Avg Commit Size
                            </div>
                          </td>
                          {resultsArray.map((r) => (
                            <td key={r.devId} className="px-6 py-4 text-center text-sm text-gray-900 dark:text-zinc-100">
                              {formatNumber(r.avgCommitSize)} lines
                            </td>
                          ))}
                        </tr>
                        {/* Lines Added */}
                        <tr className="border-b border-black/5 dark:border-white/10">
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-zinc-300">
                            Lines Added
                          </td>
                          {resultsArray.map((r) => (
                            <td key={r.devId} className="px-6 py-4 text-center text-sm text-emerald-600 font-medium">
                              +{formatNumber(r.totalLinesAdded)}
                            </td>
                          ))}
                        </tr>
                        {/* Lines Deleted */}
                        <tr>
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-zinc-300">
                            Lines Deleted
                          </td>
                          {resultsArray.map((r) => (
                            <td key={r.devId} className="px-6 py-4 text-center text-sm text-red-500 font-medium">
                              -{formatNumber(r.totalLinesDeleted)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Individual Developer Details (Expandable) */}
            {resultsArray.map((r) => (
              <motion.div
                key={r.devId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8"
              >
                <button
                  onClick={() => toggleDetails(r.devId)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/70 dark:bg-white/5 border border-black/5 dark:border-white/10 hover:shadow-lg transition"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: DEVELOPER_COLORS[r.devIndex % DEVELOPER_COLORS.length] }}
                    />
                    <span className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                      {r.owner}/{r.repo} - Detailed Charts
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${toneClasses(r.experienceLevel.tone).badge}`}>
                      {r.experienceLevel.level}
                    </span>
                  </div>
                  {expandedDetails[r.devId] ? (
                    <ChevronUp size={20} className="text-gray-500" />
                  ) : (
                    <ChevronDown size={20} className="text-gray-500" />
                  )}
                </button>

                <AnimatePresence>
                  {expandedDetails[r.devId] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {/* Experience Badge */}
                      <motion.div
                        className="mt-4 rounded-3xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-2xl p-6 text-white overflow-hidden relative"
                      >
                        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_55%)]" />
                        <div className="relative flex items-center justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h2 className="text-2xl md:text-3xl font-semibold">Experience: {r.experienceLevel.level}</h2>
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${toneClasses(r.experienceLevel.tone).badge}`}>
                                Score: {r.experienceLevel.score}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-white/80">Total Lines Changed</p>
                                <p className="text-xl font-semibold">
                                  +{formatNumber(r.totalLinesAdded)} / -{formatNumber(r.totalLinesDeleted)}
                                </p>
                              </div>
                              <div>
                                <p className="text-white/80">Avg Commit Size</p>
                                <p className="text-xl font-semibold">{formatNumber(r.avgCommitSize)} lines</p>
                              </div>
                            </div>
                          </div>
                          <Award size={92} className="opacity-20 shrink-0" />
                        </div>
                      </motion.div>

                      {/* Charts Grid */}
                      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* File Type Diversity */}
                        <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                          <div className="flex items-center gap-2 mb-4">
                            <FileCode className="text-blue-600" size={22} />
                            <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">File Type Diversity</h3>
                          </div>
                          <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                              <Pie
                                data={r.fileTypes}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {r.fileTypes.map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={FILE_COLORS[index % FILE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Commit Sizes */}
                        <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                          <div className="flex items-center gap-2 mb-4">
                            <GitCommit className="text-emerald-600" size={22} />
                            <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">Commit Sizes</h3>
                          </div>
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={r.commitSizeDistribution}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                              <YAxis />
                              <Tooltip />
                              <Bar dataKey="count" fill={DEVELOPER_COLORS[r.devIndex % DEVELOPER_COLORS.length]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Commit Frequency */}
                        <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                          <div className="flex items-center gap-2 mb-4">
                            <Activity className="text-purple-600" size={22} />
                            <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">Commit Frequency</h3>
                          </div>
                          <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={r.consistencyTimeline}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="commit" tick={{ fontSize: 10 }} />
                              <YAxis />
                              <Tooltip />
                              <Line type="monotone" dataKey="days" stroke={DEVELOPER_COLORS[r.devIndex % DEVELOPER_COLORS.length]} strokeWidth={2} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Second Row Charts */}
                      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* On-Time vs Late */}
                        <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-4">On-Time vs Late</h3>
                          <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                              <Pie
                                data={[
                                  { name: "On-Time", value: r.onTimeCount },
                                  { name: "Late", value: r.lateCount },
                                ]}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                outerRadius={100}
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

                        {/* Commits by Weekday */}
                        <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-4">Commits by Weekday</h3>
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={r.weekdayData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="day" />
                              <YAxis />
                              <Tooltip />
                              <Bar dataKey="commits" fill={DEVELOPER_COLORS[r.devIndex % DEVELOPER_COLORS.length]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Hourly Distribution */}
                      <div className="mt-6 rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-4">Hourly Distribution</h3>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={r.hourlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="commits" fill={DEVELOPER_COLORS[r.devIndex % DEVELOPER_COLORS.length]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}

            {/* Footer */}
            {hasResults && (
              <div className="mt-10 pb-8 text-center text-xs text-gray-500 dark:text-zinc-500">
                Built with GitHub REST API • Heavy analysis may hit rate limits
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Minimal dev "tests" (no framework)
function runDevTests() {
  console.assert(safeExt("src/index.tsx") === "tsx", "safeExt should return file extension");
  console.assert(safeExt("README") === "(no-ext)", "safeExt should handle no extension");
  console.assert(safeExt("a.b.C") === "c", "safeExt should lowercase extension");
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

if (typeof process !== "undefined" && process?.env?.NODE_ENV !== "production") {
  runDevTests();
}
