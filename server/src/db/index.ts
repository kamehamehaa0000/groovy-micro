import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import * as relations from "./relations";
import dotenv from "dotenv";

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgrespassword@localhost:5432/groovy";

// Connection pool configuration
export const client = postgres(connectionString, {
  max: process.env.DB_MAX_CONNECTIONS
    ? parseInt(process.env.DB_MAX_CONNECTIONS, 10)
    : 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, {
  schema: { ...schema, ...relations },
});

export type Database = typeof db;
export * from "./schema";
export * from "./relations";
