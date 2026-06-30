import { Router } from "express";
import {
  addQuestion,
  editCourse,
  getAllCourses,
  getCourseByUser,
  getSingleCourse,
  uploadCourse,
} from "../controllers/course.controller";
import { authorizeRoles, isAuthenticated } from "../middleware/auth";

const router = Router();

router.post(
  "/create-course",
  isAuthenticated,
  authorizeRoles("admin"),
  uploadCourse,
);

router.put(
  "/edit-course/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  editCourse,
);

router.get("/get-single-course/:id", isAuthenticated, getSingleCourse);
router.get("/get-all-courses", isAuthenticated, getAllCourses);
router.get("/get-course-content/:id", isAuthenticated, getCourseByUser);
router.post("/add-question", isAuthenticated, addQuestion);
router.put("/add-question", isAuthenticated, addQuestion);

export default router;
