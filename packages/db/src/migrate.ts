import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const database = drizzle(neon(connectionString));
await migrate(database, { migrationsFolder: "./drizzle" });
console.log("Duna database migrations are current.");
