import { Response } from "express";
import User from "../models/user.model";
import { redis } from "../utils/redis";

export const getUserById = async (id: string, res: Response) => {
  const userJson = await redis.get(id);

  if (!userJson) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  const user = JSON.parse(userJson);

  res.status(200).json({
    success: true,
    user,
  });
};
