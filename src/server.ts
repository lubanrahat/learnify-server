import http from "http";
import "dotenv/config";
import createApplication from "./app";
import connectDB from "./utils/db";


function main() {
  try {
    const port = Number(process.env.PORT);
    const app = createApplication();
    const server = http.createServer(app);
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      connectDB();
    });
  } catch (error) {
    console.error("Error starting server:", error);
  }
}

main();
