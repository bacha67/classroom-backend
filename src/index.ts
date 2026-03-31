import cors from "cors";
import express from "express";
import subjectRouter from "./routes/subject.js";

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

app.use("/api/subjects", subjectRouter);
app.use("/subjects", subjectRouter);

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
