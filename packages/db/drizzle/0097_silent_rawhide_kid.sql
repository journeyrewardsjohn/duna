ALTER TABLE "orders" ADD COLUMN "checkout_ip_address" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_user_agent" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_surface" varchar(24);