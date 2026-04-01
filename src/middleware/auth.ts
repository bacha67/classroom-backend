import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";

import { db } from "../db/index.js";
import { session, user } from "../db/schema/index.js";

const SESSION_COOKIE_NAMES = [
    "session_token",
    "better-auth.session_token",
    "better_auth_session",
];

const parseCookies = (headerValue: string | undefined) => {
    if (!headerValue) {
        return new Map<string, string>();
    }

    return new Map(
        headerValue
            .split(";")
            .map((cookiePart) => cookiePart.trim())
            .filter(Boolean)
            .map((cookiePart) => {
                const separatorIndex = cookiePart.indexOf("=");
                if (separatorIndex === -1) {
                    return [cookiePart, ""];
                }

                return [
                    cookiePart.slice(0, separatorIndex),
                    decodeURIComponent(cookiePart.slice(separatorIndex + 1)),
                ];
            })
    );
};

const extractSessionToken = (req: Request) => {
    const authorizationHeader = req.header("authorization");

    if (authorizationHeader?.startsWith("Bearer ")) {
        const token = authorizationHeader.slice("Bearer ".length).trim();
        return token.length > 0 ? token : null;
    }

    const cookies = parseCookies(req.header("cookie"));

    for (const cookieName of SESSION_COOKIE_NAMES) {
        const token = cookies.get(cookieName);
        if (token) {
            return token;
        }
    }

    const headerToken = req.header("x-session-token")?.trim();
    return headerToken && headerToken.length > 0 ? headerToken : null;
};

export const attachCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const token = extractSessionToken(req);

    if (!token) {
        return next();
    }

    try {
        const [sessionRecord] = await db
            .select({
                sessionId: session.id,
                sessionToken: session.token,
                sessionExpiresAt: session.expiresAt,
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            })
            .from(session)
            .innerJoin(user, eq(session.userId, user.id))
            .where(and(eq(session.token, token), gt(session.expiresAt, new Date())));

        if (!sessionRecord) {
            return res.status(401).json({ error: "Invalid or expired session" });
        }

        req.user = {
            id: sessionRecord.id,
            name: sessionRecord.name,
            email: sessionRecord.email,
            role: sessionRecord.role,
            sessionId: sessionRecord.sessionId,
            sessionToken: sessionRecord.sessionToken,
            sessionExpiresAt: sessionRecord.sessionExpiresAt,
        };

        return next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        return res.status(500).json({ error: "Failed to validate session" });
    }
};

export const requireAuth = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
    }

    return next();
};

export const requireRole =
    (...roles: Array<"admin" | "teacher" | "student">) =>
    (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: "Authentication required" });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: "Insufficient permissions" });
        }

        return next();
    };
