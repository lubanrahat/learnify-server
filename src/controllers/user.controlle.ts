import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import User from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "node:path";
import sendMail from "../utils/sendMail";
import sendToken, {
  accessTokenOptions,
  refreshTokenOptions,
} from "../utils/jwt";
import { redis } from "../utils/redis";
import { getUserById } from "../services/user.service";

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
      res.cookie("accessToken", "", { maxAge: 1 });
      res.cookie("refreshToken", "", { maxAge: 1 });
      redis.del(req.user._id);
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

export const updateAccessToken = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const refresh_Token = req.cookies.refreshToken as string;

    const decoded = jwt.verify(
      refresh_Token,
      process.env.REFRESH_TOKEN as string,
    ) as JwtPayload;

    console.log(decoded);

    if (!decoded) {
      return next(new ErrorHandler("Could not refresh token", 400));
    }

    const session = await redis.get(decoded.id as string);

    if (!session) {
      return next(new ErrorHandler("Could not refresh token", 400));
    }

    const user = JSON.parse(session);

    const accessToken = jwt.sign(
      { id: user._id },
      process.env.ACCESS_TOKEN as string,
      {
        expiresIn: "5m",
      },
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.REFRESH_TOKEN as string,
      {
        expiresIn: "3d",
      },
    );

    req.user = user;

    res
      .status(200)
      .cookie("accessToken", accessToken, accessTokenOptions)
      .cookie("refreshToken", refreshToken, refreshTokenOptions)
      .json({
        success: true,
        message: "Access token!",
        user,
        accessToken,
        refreshToken,
      });
  },
);

export const getUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      getUserById(userId, res);
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

interface ISocialAuthRequestBody {
  name: string;
  email: string;
  avatar: string;
}

export const socialAuth = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, avatar } = req.body as ISocialAuthRequestBody;

      let user = await User.findOne({ email });

      if (!user) {
        user = await User.create({
          name,
          email,
          avatar: {
            url: avatar,
          },
        });
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

interface IUpdateUserInfo {
  name?: string;
  email?: string;
}

export const updateUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const { name, email } = req.body as IUpdateUserInfo;

    const user = await User.findById(userId);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (email) {
      const isEmailExist = await User.findOne({ email });

      if (isEmailExist && isEmailExist._id.toString() !== userId.toString()) {
        return next(new ErrorHandler("Email already exists", 400));
      }

      user.email = email;
    }

    if (name) {
      user.name = name;
    }

    await user.save();

    await redis.set(userId.toString(), JSON.stringify(user));

    res.status(200).json({
      success: true,
      message: "User information updated successfully",
      user,
    });
  },
);
