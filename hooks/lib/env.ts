import { config } from "dotenv";
import path from "node:path";

const home = process.env.HOME || "";
const envPath = path.join(home, ".env.local");

// Load non-secret env vars deterministically for hook execution
config({ path: envPath });

