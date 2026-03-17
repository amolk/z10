ALTER TABLE "connect_token" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connect_token" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "last_tx_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "connect_token" ADD CONSTRAINT "connect_token_token_hash_unique" UNIQUE("token_hash");