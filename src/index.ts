import dotenv from "dotenv";
import { fetchAllCommits } from "./github/fetchCommit.js";

dotenv.config();

console.log("NLP Portfolio Project Started");
console.log("GitHub Token Exists:", !!process.env.GITHUB_TOKEN);


async function main() {
    const commits = await fetchAllCommits();
    console.log("Fetched commits:", commits.length);
}

main();
