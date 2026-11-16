import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { dateString, toDbDate } from "../utils/constants.ts";


const usageSchema = z.object({
  date: dateString,
  entries: z
    .array(
      z.object({
        domain: z.string().trim().toLowerCase().min(1).max(253),
        seconds: z.number().int().min(0).max(86_400).default(0),
        scrollPx: z.number().int().min(0).max(10_000_000).default(0),
      })
    )
    .min(1)
    .max(50),
});

const rangeSchema = z.object({ from: dateString, to: dateString });

export const logUsage = async (req: Request, res: Response) => {
  const parsed = usageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const date = toDbDate(parsed.data.date);
  if (!date) return res.status(400).json({ error: "Invalid date" });

  const userId = req.userId!;

  try {
    // Only accept usage for domains this user actually tracks
    const tracked = await prisma.trackedSites.findMany({
      where: { userId, domain: { in: parsed.data.entries.map((e) => e.domain) } },
      select: { domain: true },
    });
    const allowed = new Set(tracked.map((t) => t.domain));
    const entries = parsed.data.entries.filter((e) => allowed.has(e.domain));
    const ignored = parsed.data.entries
      .filter((e) => !allowed.has(e.domain))
      .map((e) => e.domain);

    // Still 200 when everything is ignored, so the client clears its queue
    // (e.g. a site removed while usage for it was pending) instead of retrying forever.
    await prisma.$transaction(
      entries.map(({ domain, seconds, scrollPx }) =>
        prisma.dailyUsage.upsert({
          where: { userId_domain_date: { userId, domain, date } },
          create: { userId, domain, date, seconds, scrollPx },
          update: {
            seconds: { increment: seconds },
            scrollPx: { increment: scrollPx },
          },
        })
      )
    );
    res.status(200).json({ ok: true, ignored });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const todayUsage = async (req: Request, res: Response) => {
  // extension passes its local date: GET /usage/today?date=2026-10-16
  const parsed = dateString.safeParse(req.query.date);
  const date = parsed.success
    ? toDbDate(parsed.data)
    : toDbDate(new Date().toISOString().slice(0, 10)); // fallback: server's UTC day
  if (!date) return res.status(400).json({ error: "Invalid date" });

  try {
    const usage = await prisma.dailyUsage.findMany({
      where: { userId: req.userId!, date },
      select: { domain: true, seconds: true, scrollPx: true },
      orderBy: { seconds: "desc" },
    });
    const totalSeconds = usage.reduce((sum, u) => sum + u.seconds, 0);
    res.json({ date: date.toISOString().slice(0, 10), totalSeconds, usage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const rangeUsage = async (req: Request, res: Response) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  
  const from = toDbDate(parsed.data.from);
  const to = toDbDate(parsed.data.to);

  if (!from || !to || from > to) return res.status(400).json({ error: "Invalid range"});
  if (to.getTime() - from.getTime() > 90 * 86_400_000) return res.status(400).json({ error: "Range too large (max 90 days)" });

  try {
    const rows = await prisma.dailyUsage.findMany({
      where: { userId: req.userId!, date: { gte: from, lte: to } },
      select: { date: true, domain: true, seconds: true, scrollPx: true },
      orderBy: { seconds: "asc" },
    });
    res.json({
      usage: rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

const STREAK_LOOKBACK_DAYS = 365;
const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// GET /usage/summary?date=2026-10-16
// Today's progress against each limit + the current "stayed under every limit" streak.
// Effective limit matches the extension: site.dailyLimitMin ?? user.dailyLimitMin.
export const usageSummary = async (req: Request, res: Response) => {
  const parsed = dateString.safeParse(req.query.date);
  const today = parsed.success
    ? toDbDate(parsed.data)
    : toDbDate(new Date().toISOString().slice(0, 10));
  if (!today) return res.status(400).json({ error: "Invalid date" });

  const userId = req.userId!;
  const since = new Date(today.getTime() - STREAK_LOOKBACK_DAYS * DAY_MS);

  try {
    const [user, sites, rows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { dailyLimitMin: true, createdAt: true },
      }),
      prisma.trackedSites.findMany({
        where: { userId },
        select: { domain: true, dailyLimitMin: true },
      }),
      prisma.dailyUsage.findMany({
        where: { userId, date: { gte: since, lte: today } },
        select: { date: true, domain: true, seconds: true },
      }),
    ]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const limitFor = new Map(
      sites.map((s) => [s.domain, s.dailyLimitMin ?? user.dailyLimitMin])
    );

    // date -> domain -> seconds (only for currently tracked domains)
    const byDay = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!limitFor.has(r.domain)) continue;
      const key = isoDay(r.date);
      if (!byDay.has(key)) byDay.set(key, new Map());
      byDay.get(key)!.set(r.domain, r.seconds);
    }

    const dayIsClean = (key: string) => {
      const usage = byDay.get(key);
      if (!usage) return true; // no usage = under every limit
      for (const [domain, seconds] of usage) {
        if (seconds >= limitFor.get(domain)! * 60) return false;
      }
      return true;
    };

    // Today's progress, one entry per tracked site
    const todayKey = isoDay(today);
    const todayUsage = byDay.get(todayKey);
    const limits = sites
      .map((s) => {
        const limitMin = limitFor.get(s.domain)!;
        const seconds = todayUsage?.get(s.domain) ?? 0;
        return {
          domain: s.domain,
          seconds,
          limitMin,
          pct: Math.min(100, Math.round((seconds / (limitMin * 60)) * 100)),
          over: seconds >= limitMin * 60,
        };
      })
      .sort((a, b) => b.pct - a.pct);

    // Streak: consecutive clean days ending yesterday, plus today if still clean.
    // Never counts days before the account existed.
    const firstDay = toDbDate(isoDay(user.createdAt))!;
    const todayOnTrack = dayIsClean(todayKey);
    let completedDays = 0;
    for (
      let d = new Date(today.getTime() - DAY_MS);
      d >= firstDay && d >= since;
      d = new Date(d.getTime() - DAY_MS)
    ) {
      if (!dayIsClean(isoDay(d))) break;
      completedDays++;
    }

    res.json({
      date: todayKey,
      limits,
      streak: {
        current: todayOnTrack ? completedDays + 1 : 0,
        completedDays, // streak through yesterday, useful for "don't break your N-day streak"
        todayOnTrack,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
