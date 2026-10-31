import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) =>
    s
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#:]/)[0]
  )
  .pipe(
    z
      .string()
      .min(1)
      .max(253)
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a domain like x.com")
  );

const siteSchema = z.object({
  domain: domainSchema,
  dailyLimitMin: z.number().int().min(1).max(1440).optional(),
});

export const addSite = async (req: Request, res: Response) => {
  const parsed = siteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    const site = await prisma.trackedSites.create({
      data: {
        userId: req.userId!,
        domain: parsed.data.domain,
        ...(parsed.data.dailyLimitMin !== undefined && {
          dailyLimitMin: parsed.data.dailyLimitMin,
        }),
      },
      select: { id: true, domain: true, dailyLimitMin: true },
    });
    res.status(201).json({ site });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Site already tracked" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const getSites = async (req: Request, res: Response) => {
  try {
    const sites = await prisma.trackedSites.findMany({
      where: { userId: req.userId! },
      select: { id: true, domain: true, dailyLimitMin: true },
      orderBy: { domain: "asc" },
    });
    res.json({ sites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

export const updateSite = async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid site ID" });
  }
  const parsed = z
    .object({ dailyLimitMin: z.number().int().min(1).max(1440).nullable() })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    const result = await prisma.trackedSites.updateMany({
      where: { id, userId: req.userId! },
      data: { dailyLimitMin: parsed.data.dailyLimitMin }
    });
    if (result.count === 0) return res.status(404).json({ error: "Site not found" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
  
}

export const deleteSite = async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid site ID" });
  }

  try {
    const result = await prisma.trackedSites.deleteMany({
      where: { id, userId: req.userId! },
    });
    if (result.count === 0) return res.status(404).json({ error: "Site not found" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};