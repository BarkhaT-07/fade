const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const envPath = path.join(__dirname, "..", ".env");
const examplePath = path.join(__dirname, "..", ".env.example");

if (fs.existsSync(envPath)) {
  console.log("[setup] .env already exists so leaving it as is.");
} else {
  const key = crypto.randomBytes(32).toString("hex");
  let contents = fs.readFileSync(examplePath, "utf8");
  contents = contents.replace(
    /NOTE_KEY="[^"]*"/,
    `NOTE_KEY="${key}"`
  );
  fs.writeFileSync(envPath, contents);
  console.log("[setup] Created .env with a freshly generated NOTE_KEY.");
}

console.log("[setup] Running database migration...");
execSync("npx prisma migrate dev --name init", { stdio: "inherit" });

console.log("[setup] Done. Run: npm run dev");
