import http from "http";
import "dotenv/config";
import createApplication from "./app";
import connectDB from "./utils/db";
import { v2 as cloudinary } from "cloudinary";
import cron from "node-cron";
import NotificationModel from "./models/notification.model";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function main() {
  try {
    const port = Number(process.env.PORT);
    const app = createApplication();
    const server = http.createServer(app);
    server.listen(port, () => {
      console.log(`Server is running on port ${port} ✅ 🚀`);
      connectDB();
    });
  } catch (error) {
    console.error("Error starting server:", error);
  }
}

main();

cron.schedule(
  "0 0 0 * * *",
  async () => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const result = await NotificationModel.deleteMany({
        status: "read",
        createdAt: {
          $lt: thirtyDaysAgo,
        },
      });

      console.log(`🗑️ Deleted ${result.deletedCount} old notifications`);
    } catch (error) {
      console.error("Cron job failed:", error);
    }
  },
  {
    timezone: "Asia/Dhaka",
  },
);
