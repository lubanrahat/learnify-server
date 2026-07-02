import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import cloudinary from "cloudinary";
import { createCourse } from "../services/course.service";
import CourseModel from "../models/course.model";
import ErrorHandler from "../utils/ErrorHandler";
import { redis } from "../utils/redis";
import mongoose from "mongoose";
import ejs from "ejs";
import path from "node:path";
import sendMail from "../utils/sendMail";
import NotificationModel from "../models/notification.model";

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

      await NotificationModel.create({
        userId: req.user._id,
        title: "New Question Received",
        message: `You have a new question in ${courseContent.title}`,
      });

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

      if (!courseContent) {
        return next(new ErrorHandler("Invalid content id", 400));
      }

      const question = courseContent?.questions?.find((item: any) =>
        item._id.equals(questionId),
      );

      if (!courseContent) {
        return next(new ErrorHandler("Invalid question id", 400));
      }

      const newAnswer: any = {
        user: req.user,
        answer,
      };

      question?.questionReplies?.push(newAnswer);

      await course?.save();

      if (req.user._id === question?.user._id) {
        //create a notification
        await NotificationModel.create({
          userId: req.user._id,
          title: "New Question Reply Received",
          message: `You have a new question reply in ${courseContent.title}`,
        });
      } else {
        const data = {
          name: question?.user.name,
          title: courseContent.title,
        };

        const html = await ejs.renderFile(
          path.join(__dirname, "..src/mails/question-reply.ejs"),
          data,
        );

        try {
          await sendMail({
            email: question?.user.email as string,
            subject: "Question reply",
            template: "question-reply.ejs",
            data,
          });
        } catch (error: any) {
          return next(new ErrorHandler(error.message, 400));
        }
      }

      res.status(200).json({ success: true, course });
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

interface IAddReviewData {
  review: string;
  rating: number;
  userId: string;
}

export const addReview = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userCoursesList = req.user?.courses;
      const courseId = req.params.id;
      const courseExist = userCoursesList?.some(
        (course: any) => course.toString() === courseId.toString(),
      );
      if (!courseExist) {
        return next(
          new ErrorHandler("You are not enrolled in this course", 400),
        );
      }

      const course = await CourseModel.findById(courseId);

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const { review, rating } = req.body as IAddReviewData;

      const reviewData: any = {
        user: req.user,
        comment: review,
        rating,
      };

      course?.reviews.push(reviewData);
      await course?.save();

      const totalReviews = course?.reviews.length;
      const totalRating = course?.reviews.reduce(
        (acc, review) => acc + review.rating,
        0,
      );
      const averageRating = totalRating / totalReviews;
      course.ratings = averageRating;

      await course?.save();

      const notification = {
        title: "New review",
        message: `${req.user.name} has given a review to your course`,
      };

      res.status(200).json({
        success: true,
        message: "Review added successfully",
        course,
      });
    } catch (error) {
      next(
        new ErrorHandler(
          error instanceof Error ? error.message : "Failed to add review",
          500,
        ),
      );
    }
  },
);

interface IAddReplyToReviewData {
  comment: string;
  courseId: string;
  reviewId: string;
}

export const addReplyToReview = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { comment, courseId, reviewId } = req.body as IAddReplyToReviewData;

      if (!comment || !courseId || !reviewId) {
        return next(new ErrorHandler("All fields are required", 400));
      }

      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return next(new ErrorHandler("Invalid course id", 400));
      }

      if (!mongoose.Types.ObjectId.isValid(reviewId)) {
        return next(new ErrorHandler("Invalid review id", 400));
      }

      const course = await CourseModel.findById(courseId);

      if (!course) {
        return next(new ErrorHandler("Course not found", 404));
      }

      const review = course?.reviews?.find(
        (review: any) => review._id.toString() === reviewId.toString(),
      );

      if (!review) {
        return next(new ErrorHandler("Review not found", 404));
      }

      const newReply: any = {
        user: req.user,
        comment,
      };

      review?.commentReplies?.push(newReply);
      await course?.save();

      res
        .status(200)
        .json({ success: true, message: "Reply added successfully", course });
    } catch (error) {
      next(
        new ErrorHandler(
          error instanceof Error
            ? error.message
            : "Failed to add reply to review",
          500,
        ),
      );
    }
  },
);
