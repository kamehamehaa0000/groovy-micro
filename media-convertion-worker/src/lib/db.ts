import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import * as schema from "./schema";

export const pgClient = postgres(config.DATABASE_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(pgClient, { schema });
export * from "./schema";
