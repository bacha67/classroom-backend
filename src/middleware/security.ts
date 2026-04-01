import type { NextFunction, Request, Response } from "express";

type RateWindow = {
    count: number;
    resetAt: number;
};

const RATE_LIMITS: Record<RateLimitRole, number> = {
    admin: 240,
    teacher: 120,
    student: 120,
    guest: 60,
};

const WINDOW_MS = 60_000;
const requestWindows = new Map<string, RateWindow>();

const getClientIp = (req: Request) => {
    const forwardedFor = req.header("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0]?.trim() ?? req.ip;
    }

    return req.ip || req.socket.remoteAddress || "unknown";
};

const setSecurityHeaders = (res: Response) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
};

const cleanupExpiredWindows = (now: number) => {
    for (const [key, window] of requestWindows.entries()) {
        if (window.resetAt <= now) {
            requestWindows.delete(key);
        }
    }
};

const securityMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (process.env.NODE_ENV === "test") {
        return next();
    }

    setSecurityHeaders(res);

    const now = Date.now();
    cleanupExpiredWindows(now);

    const role: RateLimitRole = req.user?.role ?? "guest";
    const ipAddress = getClientIp(req);
    const windowKey = `${role}:${ipAddress}`;
    const currentWindow = requestWindows.get(windowKey);

    if (!currentWindow || currentWindow.resetAt <= now) {
        requestWindows.set(windowKey, {
            count: 1,
            resetAt: now + WINDOW_MS,
        });
        return next();
    }

    currentWindow.count += 1;

    if (currentWindow.count > RATE_LIMITS[role]) {
        const retryAfterSeconds = Math.ceil((currentWindow.resetAt - now) / 1000);
        res.setHeader("Retry-After", retryAfterSeconds.toString());
        return res.status(429).json({
            error: "Too Many Requests",
            message: `Rate limit exceeded for ${role} requests`,
        });
    }

    return next();
};

export default securityMiddleware;
