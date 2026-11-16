import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1).max(72),
});


export const register = async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { email, password } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { passwordHash, email },
      select: { id: true, email: true, dailyLimitMin: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");

// Secure is always on: browsers treat http://localhost as a secure context,
// so the cookie still works in local dev while never going over plain HTTP elsewhere.
const baseCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

const cookieOptions = {
  ...baseCookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const login = async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    const match = user && await bcrypt.compare(password, user.passwordHash);
    if (!user || !match) return res.status(401).json({ error: "Invalid credentials" });
    
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, cookieOptions);
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        dailyLimitMin: user.dailyLimitMin,
        createdAt: user.createdAt,
      },
    });


  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const extensionLogin = async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    const match = user && await bcrypt.compare(password, user.passwordHash);
    if (!user || !match) return res.status(401).json({ error: "Invalid credentials" });
    
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "30d" });
    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        dailyLimitMin: user.dailyLimitMin,
        createdAt: user.createdAt,
      },
    });


  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const logout = async (_req: Request, res: Response) => {
  try {
    res.clearCookie("token", baseCookieOptions);
    return res.status(200).json({ message: "Logged out successfully"})
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, dailyLimitMin: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
