import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { CatchAsyncError } from "./catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { redis } from "../utils/redis";

interface IJwtPayload extends JwtPayload {
  id: string;
}

export const isAuthenticated = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const accessToken = req.cookies.accessToken;

    if (!accessToken) {
      return next(
        new ErrorHandler("Please login to access this resource", 401)
      );
    }

    const decoded = jwt.verify(
      accessToken,
      process.env.ACCESS_TOKEN as string
    ) as IJwtPayload;

    const user = await redis.get(decoded.id);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    req.user = JSON.parse(user);

    next();
  }
);