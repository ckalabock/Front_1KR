process.env.SERVER_ID = process.argv[2] || process.env.SERVER_ID || "backend-local";
process.env.PORT = process.argv[3] || process.env.PORT || "3000";

const { startServer } = require("../app");

startServer().catch((error) => {
  console.error("Failed to start backend instance:", error);
  process.exitCode = 1;
});
