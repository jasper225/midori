import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      userId?: string | undefined;
    }
  }
}

export const requireAuth = async ( req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = req.cookies?.token ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    req.userId = payload.sub;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};
