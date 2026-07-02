import express from "express";
import { authorizeRoles, isAuthenticated } from "../middleware/auth";
import {
  getNotification,
  updateNotification,
} from "../controllers/notification.controller";

const router = express.Router();

router.get(
  "/get-all-notification",
  isAuthenticated,
  authorizeRoles("admin"),
  getNotification,
);

router.put(
  "/update-notification/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  updateNotification,
);

export default router;
