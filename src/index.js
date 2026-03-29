import express, {} from "express";
const app = express();
const PORT = 8000;
app.use(express.json());
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});
app.get("/", (_req, res) => {
    res.status(200).json({
        message: "Classroom backend is running.",
    });
});
app.listen(PORT, () => {
    console.log(`Server started at http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map