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
import { api, ApiError, lastNDays } from "@/lib/api";

type Site = { id: string; domain: string; dailyLimitMin: number | null };
type Row = { date: string; domain: string; seconds: number; scrollPx: number };

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [usage, setUsage] = useState<Row[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [error, setError] = useState("");

  const days = lastNDays(7);

  const load = useCallback(async () => {
    try {
      const [me, s, u] = await Promise.all([
        api<{ user: { email: string } }>("/auth/me"),
        api<{ sites: Site[] }>("/sites"),
        api<{ usage: Row[] }>(`/usage/range?from=${days[0]}&to=${days[6]}`),
      ]);
      setEmail(me.user.email);
      setSites(s.sites);
      setUsage(u.usage);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace("/login");
      else setError("Could not load data");
    }
  }, [router]);

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
        method: "POST",
        body: JSON.stringify({ dailyLimitMin }),
    });
    load();
  }

  async function removeSite(id: string) {
    await api(`/sites/${id}`, { method: "DELETE"});
    load();
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    load();
  }

  return (
    <main>
        <header>
            <h1>Midori</h1>
            <div className="text-sm">
                {email} <button className="ml-3 underline" onClick={logout}>Log out</button>
            </div>
        </header>

        {error && <p className="text-sm text-red-600">{error}</p>}

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
            <h2 className="mb-2 font-medium">Tracked sites</h2>
            <form onSubmit={addSite} className="mb-3 flex gap-2">
                <input 
                    className="flex-1 rounded border p-2" 
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    required
                />
                <button className="rounded bg-green-600 px-4 text-white">
                    Add
                </button>
            </form>
            <ul className="divide-y">
              {sites.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">{s.domain}</span>
              <label className="flex items-center gap-1">
                Limit
                <input
                  type="number" min={1} max={1440} placeholder="default"
                  defaultValue={s.dailyLimitMin ?? ""}
                  onBlur={(e) => setLimit(s.id, e.target.value)}
                  className="w-20 rounded border p-1"
                />
                min
              </label>
              <button className="text-red-600" onClick={() => removeSite(s.id)}>Remove</button>
            </li>
          ))}  
            </ul>
        </section>
    </main>
  )

}
