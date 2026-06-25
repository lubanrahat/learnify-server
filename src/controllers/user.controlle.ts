import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import User from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import jwt, { Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "node:path";
import sendMail from "../utils/sendMail";

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
