import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const startSchema = z.object({
  source: z.string().trim().toLowerCase().min(1).max(1800),
});

const endSchema = z.object({
  mood: z.number().int().min(1).max(5).optional(),
  note: z.string().trim().max(500).optional(),
});

export const startSession = async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  

  try {
      const session = await prisma.scrollSession.create({
        data: {
          userId: req.userId!,
          source: parsed.data.source,
          startedAt: new Date(),
        },
      });
      res.status(201).json(session);
    } catch (err: any) {
      if (err?.code === "P2002") return res.status(409).json({ error: "Session already created" });
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
};

export const endSession = async (req: Request, res: Response) => {
  const parsed = endSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  
  const id = req.params.id;
  if (typeof id !== "string") return res.status(404).json({ message: "Invalid session ID"});

  try {
      const result = await prisma.scrollSession.updateMany({
        where: { id, userId: req.userId!, endedAt: null, },
        data: {
          endedAt: new Date(),
          ...(parsed.data.mood !== undefined ? { mood: parsed.data.mood } : {}),
          ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: "Session not found or already ended"})
      const session = await prisma.scrollSession.findUnique({ where: { id } });
      res.status(200).json(session);
    } catch (err: any) {
      if (err?.code === "P2002") return res.status(409).json({ error: "Email already registered" });
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
};