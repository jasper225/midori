import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const checkInSchema = z.object({
  date: dateString, // client's local date
  mood: z.number().int().min(1).max(5),
  note: z.string().trim().max(500).optional(),
});

const rangeSchema = z.object({ from: dateString, to: dateString });

const toDbDate = (s: string) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const select = { date: true, mood: true, note: true, updatedAt: true } as const;
const serialize = (m: { date: Date; mood: number; note: string | null; updatedAt: Date }) => ({
  ...m,
  date: m.date.toISOString().slice(0, 10),
});

// POST /mood  { date, mood: 1-5, note? }
// One check-in per day; posting again for the same day overwrites it.
export const upsertMood = async (req: Request, res: Response) => {
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const date = toDbDate(parsed.data.date);
  if (!date) return res.status(400).json({ error: "Invalid date" });

  const userId = req.userId!;
  const { mood, note } = parsed.data;

  try {
    const checkIn = await prisma.moodCheckIn.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, mood, note: note ?? null },
      update: { mood, ...(note !== undefined && { note }) },
      select,
    });
    res.status(200).json({ checkIn: serialize(checkIn) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// GET /mood?from=2026-10-01&to=2026-10-16
export const listMoods = async (req: Request, res: Response) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const from = toDbDate(parsed.data.from);
  const to = toDbDate(parsed.data.to);
  if (!from || !to || from > to) return res.status(400).json({ error: "Invalid range" });
  if (to.getTime() - from.getTime() > 366 * 86_400_000) {
    return res.status(400).json({ error: "Range too large (max 1 year)" });
  }

  try {
    const rows = await prisma.moodCheckIn.findMany({
      where: { userId: req.userId!, date: { gte: from, lte: to } },
      select,
      orderBy: { date: "asc" },
    });
    res.json({ checkIns: rows.map(serialize) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
