declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                name: string;
                email: string;
                role: "admin" | "teacher" | "student";
                sessionId: string;
                sessionToken: string;
                sessionExpiresAt: Date;
            };
        }
    }
}

export {};
