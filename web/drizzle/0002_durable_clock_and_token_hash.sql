-- Add lastTxId to projects for durable Lamport clock recovery
ALTER TABLE "project" ADD COLUMN "last_tx_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Add tokenHash column to connect_token for hashed lookups
ALTER TABLE "connect_token" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "connect_token" ADD CONSTRAINT "connect_token_token_hash_unique" UNIQUE("token_hash");--> statement-breakpoint

-- Make token column nullable (will be dropped after migration backfill)
ALTER TABLE "connect_token" ALTER COLUMN "token" DROP NOT NULL;
