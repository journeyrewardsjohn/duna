ALTER TABLE "agent_drafts" ADD COLUMN "input_hash" varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD COLUMN "confirmation_nonce_hash" varchar(128);