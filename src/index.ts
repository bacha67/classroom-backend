import express, { type NextFunction, type Request, type Response } from "express";

const app = express();
const PORT = 8000;

app.use(express.json());

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    message: "Classroom backend is running.",
  });
});

app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
