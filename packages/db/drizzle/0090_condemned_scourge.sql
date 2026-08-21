ALTER TABLE "promo_codes" ADD COLUMN "lineage_root_id" uuid;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "supersedes_promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "revision" integer;--> statement-breakpoint
UPDATE "promo_codes"
SET "lineage_root_id" = "id", "revision" = 1
WHERE "lineage_root_id" IS NULL OR "revision" IS NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "lineage_root_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "revision" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "revision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_lineage_root_id_promo_codes_id_fk" FOREIGN KEY ("lineage_root_id") REFERENCES "public"."promo_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_supersedes_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("supersedes_promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_lineage_revision_unique" ON "promo_codes" USING btree ("lineage_root_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_supersedes_unique" ON "promo_codes" USING btree ("supersedes_promo_code_id") WHERE "promo_codes"."supersedes_promo_code_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_revision_positive" CHECK ("promo_codes"."revision" > 0);
