import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import cloudinary from "cloudinary";
import { createCourse } from "../services/course.service";
import CourseModel from "../models/course.model";
import ErrorHandler from "../utils/ErrorHandler";
import { redis } from "../utils/redis";
import mongoose from "mongoose";

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

export const getCourseByUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userCourses = req.user?.courses;
      const courseId = req.params.id;
      const courseExist = userCourses?.find(
        (course: any) => course.toString() === courseId.toString(),
      );
      if (!courseExist) {
        return next(
          new ErrorHandler("You are not enrolled in this course", 404),
        );
      }
      const course = await CourseModel.findById(courseId);

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }
      res.status(200).json({
        success: true,
        course,
        message: "Course fetched successfully!",
      });
    } catch (error) {
      next(new ErrorHandler("Failed to get courses", 500));
    }
  },
);

interface IAddQuestionData {
  questions: string;
  courseId: string;
  contentId?: string;
}

export const addQuestion = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { questions, courseId, contentId } = req.body as IAddQuestionData;

      if (!questions) {
        return next(new ErrorHandler("Question is required", 400));
      }

      if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
        return next(new ErrorHandler("Invalid course id", 400));
      }

      if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
        return next(new ErrorHandler("Invalid content id", 400));
      }

      await CourseModel.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(courseId) },
        [
          {
            $set: {
              courseData: {
                $map: {
                  input: { $ifNull: ["$courseData", []] },
                  as: "item",
                  in: {
                    $mergeObjects: [
                      "$$item",
                      {
                        questions: {
                          $cond: [
                            { $isArray: "$$item.questions" },
                            "$$item.questions",
                            [],
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      );

      // Load the sanitized course through Mongoose
      const course = await CourseModel.findById(courseId);

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const courseContent = course.courseData?.find(
        (item) => item._id?.toString() === contentId.toString(),
      );

      if (!courseContent) {
        return next(new ErrorHandler("Content not found", 404));
      }

      courseContent.questions.push({
        user: req.user._id,
        questions,
        questionReplies: [],
      } as any);

      course.markModified("courseData");
      await course.save();

      res.status(200).json({
        success: true,
        message: "Question added successfully",
        course,
      });
    } catch (error) {
      next(
        new ErrorHandler(
          error instanceof Error ? error.message : "Failed to add question",
          500,
        ),
      );
    }
  },
);

interface IAddAnswerData {
  answer: string;
  courseId: string;
  contentId: string;
  questionId: string;
}

export const addAnswer = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { answer, courseId, contentId, questionId }: IAddAnswerData =
        req.body;

      const course = await CourseModel.findById(courseId);

      if (!mongoose.Types.ObjectId.isValid(contentId)) {
        return next(new ErrorHandler("Invalid content id", 400));
      }

      const courseContent = course?.courseData?.find((item: any) =>
        item._id.equals(contentId),
      );

      if(!courseContent) {
        return next(new ErrorHandler("Invalid content id",400))
      }

      const question = courseContent?.questions?.find((item: any) => item._id.equals(questionId))

      if(!courseContent) {
        return next(new ErrorHandler("Invalid question id",400))
      }

      const newAnswer:any = {
        user: req.user,
        answer
      }

      question?.questionReplies?.push(newAnswer)

      await course?.save();

    } catch (error) {
      next(
        new ErrorHandler(
          error instanceof Error ? error.message : "Failed to add answer",
          500,
        ),
      );
    }
  },
);
