import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import cloudinary from "cloudinary";
import { createCourse } from "../services/course.service";
import CourseModel from "../models/course.model";
import ErrorHandler from "../utils/ErrorHandler";
import { redis } from "../utils/redis";

export const uploadCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = req.body;
    if (data.thumbnail) {
      const myCloud = await cloudinary.v2.uploader.upload(data.thumbnail, {
        folder: "courses",
      });
      data.thumbnail = {
        public_id: myCloud.public_id,
        url: myCloud.secure_url,
      };
    }
    const course = await createCourse(data);
    res.status(201).json({
      success: true,
      message: "Course created successfully!",
      course,
    });
  },
);

export const editCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = req.body;
    const thumbnail = data.thumbnail;
    if (thumbnail) {
      await cloudinary.v2.uploader.destroy(data.thumbnail.public_id);
      const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
        folder: "courses",
      });
      data.thumbnail = {
        public_id: myCloud.public_id,
        url: myCloud.secure_url,
      };
    }
    const courseId = req.params.id;
    if (!courseId) {
      throw new ErrorHandler("Course not found", 404);
    }
    const course = await CourseModel.findByIdAndUpdate(courseId, data, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({
      success: true,
      message: "Course updated successfully!",
      course,
    });
  },
);

export const getSingleCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const courseId = req.params.id;

    const isCachedCourse = await redis.get(courseId as string);
    if (isCachedCourse) {
      return res.status(200).json({
        success: true,
        message: "Course fetched successfully!",
        course: JSON.parse(isCachedCourse),
      });
    }

    if (!courseId) {
      throw new ErrorHandler("Course not found", 404);
    } else {
      const course = await CourseModel.findById(courseId).select(
        "-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links",
      );
      if (!course) {
        throw new ErrorHandler("Course not found", 404);
      }
      await redis.set(courseId as string, JSON.stringify(course));
      res.status(200).json({
        success: true,
        message: "Course fetched successfully!",
        course,
      });
    }
  },
);

export const getAllCourses = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isCachedCourses = await redis.get("allCourses");
      if (isCachedCourses) {
        return res.status(200).json({
          success: true,
          courses: JSON.parse(isCachedCourses),
          message: "Courses fetched successfully!",
        });
      } else {
        const courses = await CourseModel.find().select(
          "-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links",
        );
        await redis.set("allCourses", JSON.stringify(courses));
        res.status(200).json({
          success: true,
          courses,
          message: "Courses fetched successfully!",
        });
      }
    } catch (error) {
      next(new ErrorHandler("Failed to get courses", 500));
    }
  },
);
