import express from "express";
import { activateUser, loginUser, logoutUser, registrationUser } from "../controllers/user.controlle";

const router = express.Router();

router.post("/register", registrationUser);
router.post("/activate-user", activateUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);

export default router;
