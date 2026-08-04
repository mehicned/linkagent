import { betterAuth } from "better-auth";
import { Pool } from "pg";

const connectionString = (process.env.DATABASE_URL ?? "").replace(/\s+/g, "");

export const auth = betterAuth({
  database: new Pool({ connectionString, max: 3 }),
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
