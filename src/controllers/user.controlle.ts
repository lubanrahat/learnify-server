import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import User from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import jwt, { Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "node:path";
import sendMail from "../utils/sendMail";
import sendToken from "../utils/jwt";

interface IRegistirationBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}

export const registrationUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body;
      const isEmailExist = await User.findOne({ email });

      if (isEmailExist) {
        next(new ErrorHandler("Email already exist", 400));
      }

      const user: IRegistirationBody = {
        name,
        email,
        password,
      };

      const activationToken = createActivationToken(user);
      const activationCode = activationToken.activationCode;

      const data = { user: { name: user.name }, activationCode };

      const templatePath = path.resolve(
        process.cwd(),
        "src/mails/activation-mail.ejs",
      );

      const html = await ejs.renderFile(templatePath, data);

      try {
        await sendMail({
          email: user.email,
          subject: "Account Activation",
          template: templatePath,
          data,
        });

        res.status(201).json({
          success: true,
          message: "Activation email sent successfully",
          activationToken: activationToken.token,
        });
      } catch (error) {
        next(new ErrorHandler("Failed to send activation email", 500));
      }
    } catch (error) {
      next(
        new ErrorHandler(
          error instanceof Error ? error.message : "Something went wrong",
          400,
        ),
      );
    }
  },
);

interface IActivationToken {
  token: string;
  activationCode: string;
}

export const createActivationToken = (user: any): IActivationToken => {
  const activationCode = Math.floor(1000 + Math.random() + 900).toString();
  const token = jwt.sign(
    { user, activationCode },
    process.env.ACTIVATION_SECRET as Secret,
    { expiresIn: "5m" },
  );

  return { token, activationCode };
};

interface IActivationRequestBody {
  activationToken: string;
  activationCode: string;
}

export const activateUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { activationToken, activationCode } =
        req.body as IActivationRequestBody;

      const decoded = jwt.verify(
        activationToken,
        process.env.ACTIVATION_SECRET as Secret,
      ) as { user: IRegistirationBody; activationCode: string };

      if (decoded.activationCode !== activationCode) {
        return next(new ErrorHandler("Invalid activation code", 400));
      }

      const { name, email, password } = decoded.user;

      const isEmailExist = await User.findOne({ email });

      if (isEmailExist) {
        return next(new ErrorHandler("Email already exist", 400));
      }

      const newUser = await User.create({
        name,
        email,
        password,
      });

      res.status(201).json({
        success: true,
        message: "User activated successfully",
        user: newUser,
      });
    } catch (error) {
      next(
        new ErrorHandler(
          error instanceof Error ? error.message : "Something went wrong",
          400,
        ),
      );
    }
  },
);

interface ILoginRequest {
  email: string;
  password: string;
}

export const loginUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as ILoginRequest;

      const user = await User.findOne({ email }).select("+password");

      if (!user) {
        return next(new ErrorHandler("Invalid email or password", 401));
      }

      const isPasswordMatched = await user.comparePassword(password);

      if (!isPasswordMatched) {
        return next(new ErrorHandler("Invalid email or password", 401));
      }

      await sendToken(user, 200, res);

    } catch (error) {
      next(
        new ErrorHandler(
          error instanceof Error ? error.message : "Something went wrong",
          400,
        ),
      );
    }
  },
);


export const logoutUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.cookie("accessToken","",{maxAge: 1});
      res.cookie("refreshToken","",{maxAge: 1});
      res.status(200).json({
        success: true,
        message: "User logged out successfully",
      });
    } catch (error) {
      next(
        new ErrorHandler(
          error instanceof Error ? error.message : "Something went wrong",
          400,
        ),
      );
    }
  },
);
