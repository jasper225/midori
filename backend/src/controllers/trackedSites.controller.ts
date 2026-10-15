import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const siteSchema = z.object({
    domain: z.string().trim().toLowerCase().min(1).max(1800),
    dailyLimitMin: z.number().int().min(1).max(30).optional(),
});

export const addSite = async (req: Request, res: Response) => {
    const parsed = siteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

};

export const getSites = async (req: Request, res: Response) => {

};

export const deleteSite = async (req: Request, res: Response) => {

};