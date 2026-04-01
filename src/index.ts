import cors from "cors";
import express from "express";
import classRouter from "./routes/class.js";
import departmentRouter from "./routes/department.js";
import enrollmentRouter from "./routes/enrollment.js";
import subjectRouter from "./routes/subject.js";
import userRouter from "./routes/user.js";
import { attachCurrentUser, requireAuth } from "./middleware/auth.js";
import securityMiddleware from "./middleware/security.js";
import { auth } from "./lib/auth.js";
import { toNodeHandler } from "better-auth/node";

const app = express();
const PORT = Number(process.env.PORT ?? 8000);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

if (TRUST_PROXY) {
    app.set("trust proxy", 1);
}

app.use(
    cors({
        origin: FRONTEND_URL,
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);
app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json({ limit: "100kb" }));
app.use(attachCurrentUser);
app.use(securityMiddleware);

app.get("/api/auth/me", requireAuth, (req, res) => {
    res.status(200).json({ data: req.user });
});

app.use("/api/departments", requireAuth, departmentRouter);
app.use("/api/subjects", requireAuth, subjectRouter);
app.use("/api/classes", requireAuth, classRouter);
app.use("/api/users", requireAuth, userRouter);
app.use("/api/enrollments", requireAuth, enrollmentRouter);

app.get("/", (req, res) => {
    res.send("Backend server is running!");
});

app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
