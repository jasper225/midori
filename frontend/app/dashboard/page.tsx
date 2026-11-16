"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError, lastNDays, toLocalDate } from "@/lib/api";
import "./dashboard.css";

type Site = { id: string; domain: string; dailyLimitMin: number | null };
type Row = { date: string; domain: string; seconds: number; scrollPx: number };
type LimitProgress = {
  domain: string;
  seconds: number;
  limitMin: number;
  pct: number;
  over: boolean;
};
type Summary = {
  date: string;
  limits: LimitProgress[];
  streak: { current: number; completedDays: number; todayOnTrack: boolean };
};
type CheckIn = { date: string; mood: number; note: string | null };

const MOODS = [
  { value: 1, emoji: "😞", label: "Awful" },
  { value: 2, emoji: "🙁", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];
const moodEmoji = (v: number) => MOODS.find((m) => m.value === v)?.emoji ?? "";

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [usage, setUsage] = useState<Row[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [moodNote, setMoodNote] = useState("");

  // Computed once on mount (client-only, so dates follow the user's timezone)
  useEffect(() => {
    setDays(lastNDays(7));
  }, []);

  const today = days[days.length - 1];
  const todayCheckIn = checkIns.find((c) => c.date === today);

  const load = useCallback(async () => {
    if (days.length === 0) return;
    try {
      const [me, s, u, sum, m] = await Promise.all([
        api<{ user: { email: string } }>("/auth/me"),
        api<{ sites: Site[] }>("/sites"),
        api<{ usage: Row[] }>(`/usage/range?from=${days[0]}&to=${days[6]}`),
        api<Summary>(`/usage/summary?date=${toLocalDate(new Date())}`),
        api<{ checkIns: CheckIn[] }>(`/mood?from=${days[0]}&to=${days[6]}`),
      ]);
      setEmail(me.user.email);
      setSites(s.sites);
      setUsage(u.usage);
      setSummary(sum);
      setCheckIns(m.checkIns);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
      else setError("Could not load data");
    }
  }, [router, days]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = days.map((date) => {
    const rows = usage.filter((r) => r.date === date);
    return {
      day: date.slice(5),
      minutes: Math.round(rows.reduce((s, r) => s + r.seconds, 0) / 60),
    };
  });

  const byDomain = Object.entries(
    usage.reduce<Record<string, { seconds: number; px: number }>>((acc, r) => {
      acc[r.domain] ??= { seconds: 0, px: 0 };
      acc[r.domain].seconds += r.seconds;
      acc[r.domain].px += r.scrollPx;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].seconds - a[1].seconds);

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/sites", {
        method: "POST",
        body: JSON.stringify({ domain: newDomain }),
      });
      setNewDomain("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add site");
    }
  }

  async function setLimit(id: string, value: string) {
    const dailyLimitMin = value === "" ? null : Number(value);
    await api(`/sites/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ dailyLimitMin }),
    });
    load();
  }

  async function checkIn(mood: number) {
    setError("");
    try {
      await api("/mood", {
        method: "POST",
        body: JSON.stringify({
          date: today,
          mood,
          ...(moodNote.trim() && { note: moodNote.trim() }),
        }),
      });
      setMoodNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save check-in");
    }
  }

  async function removeSite(id: string) {
    await api(`/sites/${id}`, { method: "DELETE" });
    load();
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    load();
  }

  return (
    <main>
      <header>
        <h1 className="text-2xl font-semibold">Midori</h1>
        <div className="text-sm">
          {email}{" "}
          <button className="logout-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {error && <p className="error-msg">{error}</p>}

      <section className="streak-card">
        <div className="streak-count">{summary?.streak.current ?? 0}</div>
        <div>
          <div className="font-medium">
            day{summary?.streak.current === 1 ? "" : "s"} under your limits
          </div>
          <div className="no-usage">
            {!summary
              ? "Loading…"
              : summary.streak.todayOnTrack
                ? "On track today. Keep it up."
                : summary.streak.completedDays > 0
                  ? `Limit hit today. Your ${summary.streak.completedDays}-day streak ended.`
                  : "Limit hit today. Tomorrow is a fresh start."}
          </div>
        </div>
      </section>

      <section>
        <h2>Today</h2>
        {!summary || summary.limits.length === 0 ? (
          <p className="no-usage">Add a site below to start tracking limits.</p>
        ) : (
          <ul className="progress-list">
            {summary.limits.map((l) => (
              <li key={l.domain}>
                <div className="progress-label">
                  <span>{l.domain}</span>
                  <span className={l.over ? "over" : ""}>
                    {Math.round(l.seconds / 60)} / {l.limitMin} min
                  </span>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={`${l.domain} usage`}
                  aria-valuenow={l.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`progress-fill ${l.over ? "over" : l.pct >= 80 ? "warn" : ""}`}
                    style={{ width: `${l.pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>How are you feeling?</h2>
        <div className="mood-picker" role="group" aria-label="Mood">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`mood-btn ${todayCheckIn?.mood === m.value ? "selected" : ""}`}
              aria-pressed={todayCheckIn?.mood === m.value}
              title={m.label}
              onClick={() => checkIn(m.value)}
            >
              <span aria-hidden>{m.emoji}</span>
              <span className="mood-label">{m.label}</span>
            </button>
          ))}
        </div>
        <input
          className="mood-note"
          placeholder={todayCheckIn?.note ?? "Add a note (optional), then pick a mood"}
          maxLength={500}
          value={moodNote}
          onChange={(e) => setMoodNote(e.target.value)}
        />
        <ol className="mood-week">
          {days.map((d) => {
            const c = checkIns.find((x) => x.date === d);
            return (
              <li key={d} title={c?.note ?? undefined}>
                <span className="mood-week-emoji">{c ? moodEmoji(c.mood) : "·"}</span>
                <span className="mood-week-day">{d.slice(5)}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Last 7 days (minutes)</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="minutes" fill="#4caf7d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium">By site</h2>
        {byDomain.length === 0 ? (
          <p className="text-sm text-gray-500">No usage yet this week.</p>
        ) : (
          <ul className="divide-y">
            {byDomain.map(([domain, v]) => (
              <li key={domain} className="flex justify-between py-2 text-sm">
                <span>{domain}</span>
                <span>
                  {Math.round(v.seconds / 60)} min · {v.px.toLocaleString()} px
                  scrolled
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Tracked sites</h2>
        <form onSubmit={addSite}  id="site-form" className="flex mb-3 gap-2">
          <input
            className="flex-1 rounded border p-2"
            id="domain-input"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            required
          />
          <button className="rounded --color-brand px-4 text-white">Add</button>
        </form>
        <ul className="divide-y">
          {sites.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm" id="list-item">
              <span className="flex-1">{s.domain}</span>
              <label className="flex items-center gap-1" id="limit-label">
                Limit
                <input
                  type="number"
                  id="limit-input"
                  min={1}
                  max={1440}
                  placeholder="default"
                  defaultValue={s.dailyLimitMin ?? ""}
                  onBlur={(e) => setLimit(s.id, e.target.value)}
                  className="w-20 rounded border p-1"
                />
                min
              </label>
              <button id="remove-site" className="text-red-600" onClick={() => removeSite(s.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
