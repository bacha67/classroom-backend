import cors from "cors";
import express from "express";
import departmentRouter from "./routes/department.js";
import enrollmentRouter from "./routes/enrollment.js";
import classRouter from "./routes/class.js";
import subjectRouter from "./routes/subject.js";
import usersRouter from "./routes/users.js";

const app = express();
const PORT = Number(process.env.PORT ?? 8000);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

void import("apminsight")
    .then(({ default: AgentAPI }) => {
        AgentAPI.config();
        console.log("APM initialized");
    })
    .catch((error) => {
        console.warn("APM initialization skipped:", error);
    });

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
app.use("/api/users", usersRouter);
app.use("/api/enrollments", enrollmentRouter);

app.use("/departments", departmentRouter);
app.use("/subjects", subjectRouter);
app.use("/classes", classRouter);
app.use("/users", usersRouter);
app.use("/enrollments", enrollmentRouter);

app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
});

console.log(`Preparing to listen on 0.0.0.0:${PORT}`);

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on 0.0.0.0:${PORT}`);
});
