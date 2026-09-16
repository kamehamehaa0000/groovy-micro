import { client, db } from "../src/db";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Altering albums.cover_image_url to DROP NOT NULL...");
  await db.execute(sql`ALTER TABLE albums ALTER COLUMN cover_image_url DROP NOT NULL;`);
  console.log("Done!");
  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
