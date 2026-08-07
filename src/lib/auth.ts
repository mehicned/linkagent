import { betterAuth } from "better-auth";
import { Pool } from "pg";

const connectionString = (process.env.DATABASE_URL ?? "").replace(/\s+/g, "");

export const auth = betterAuth({
  database: new Pool({ connectionString, max: 3 }),
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "",
    "https://linkagent.app",
    "https://www.linkagent.app",
    "https://linkagent-mehicneds-projects.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
  ].filter(Boolean),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
});
