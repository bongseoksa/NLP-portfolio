import dotenv from "dotenv";
dotenv.config();

import { runPipeline } from "./pipeline/runPipeline.js";

console.log("🚀 NLP Portfolio Project Started");
console.log("GitHub Token Exists:", !!process.env.GITHUB_TOKEN);

runPipeline();