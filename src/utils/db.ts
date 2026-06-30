import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.DB_URI as string);

    console.log(`MongoDB Connected: ${conn.connection.host}:8080 successfully ✅`);
  } catch (error) {
    console.error(
      `MongoDB Error: ${
        error instanceof Error ? error.message : "Unknown Error"
      }`,
    );

    process.exit(1);
  }
};

export default connectDB;
