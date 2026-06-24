import cookieParser from "cookie-parser";
import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import ErrorMiddleware from "./middleware/error";

function createApplication(): Application {
  const app: Application = express();

  app.use(
    cors({
      origin: process.env.ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "Cookie", "cookie"],
    }),
  );

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.get("/test", (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: "Api is working!",
    });
  });

  app.all("/{*any}", (req: Request, res: Response, next: NextFunction) => {
    const error = new Error(
      `Cannot ${req.method} ${req.originalUrl}. The requested route does not exist.`,
    ) as any;

    error.statusCode = 404;
    next(error);
  });

  app.use(ErrorMiddleware);

  return app;
}

export default createApplication;
