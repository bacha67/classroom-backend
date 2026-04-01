import AgentAPI  from "apminsight";
AgentAPI.config()
import cors from "cors";
import express from "express";
import departmentRouter from "./routes/department.js";
import enrollmentRouter from "./routes/enrollment.js";
import classRouter from "./routes/class.js";
import subjectRouter from "./routes/subject.js";
import userRouter from "./routes/user.js";

const app = express();
const PORT = Number(process.env.PORT ?? 8000);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

app.use(
    cors({
        origin: FRONTEND_URL,
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Backend server is running!");
});

app.use("/api/departments", departmentRouter);
app.use("/api/subjects", subjectRouter);
app.use("/api/classes", classRouter);
app.use("/api/users", userRouter);
app.use("/api/enrollments", enrollmentRouter);

app.use("/departments", departmentRouter);
app.use("/subjects", subjectRouter);
app.use("/classes", classRouter);
app.use("/users", userRouter);
app.use("/enrollments", enrollmentRouter);

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
