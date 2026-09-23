import { client } from "../src/db";

async function run() {
  console.log("Applying catalog taxonomy and skip telemetry migration...");
  try {
    await client.unsafe(`
      ALTER TABLE albums ADD COLUMN IF NOT EXISTS primary_genre varchar(60);
      ALTER TABLE albums ADD COLUMN IF NOT EXISTS sub_genre varchar(80);
      ALTER TABLE albums ADD COLUMN IF NOT EXISTS moods jsonb DEFAULT '[]'::jsonb;
      ALTER TABLE albums ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;

      ALTER TABLE songs ADD COLUMN IF NOT EXISTS primary_genre varchar(60);
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS sub_genre varchar(80);
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS moods jsonb DEFAULT '[]'::jsonb;
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS bpm integer;
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS musical_key varchar(20);
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS energy real;

      ALTER TABLE listening_history ADD COLUMN IF NOT EXISTS skipped boolean DEFAULT false NOT NULL;
      ALTER TABLE listening_history ADD COLUMN IF NOT EXISTS skip_duration_seconds integer;
    `);
    console.log("Migration applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
