import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

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

// "2026-10-16" -> Date at UTC midnight, which is what a @db.Date column stores
const toDbDate = (s: string) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const logUsage = async (req: Request, res: Response) => {
  const parsed = usageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const date = toDbDate(parsed.data.date);
  if (!date) return res.status(400).json({ error: "Invalid date" });

  const userId = req.userId!;

  try {
    await prisma.$transaction(
      parsed.data.entries.map(({ domain, seconds, scrollPx }) =>
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
    res.status(200).json({ ok: true });
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