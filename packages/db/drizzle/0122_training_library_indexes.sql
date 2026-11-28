CREATE INDEX "training_drill_org_scope_updated_idx" ON "training_drills" USING btree ("organization_id","scope","updated_at");--> statement-breakpoint
CREATE INDEX "training_drill_title_trgm_idx" ON "training_drills" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "training_drill_summary_trgm_idx" ON "training_drills" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "training_event_plan_version_idx" ON "training_events" USING btree ("practice_plan_version_id") WHERE "training_events"."practice_plan_version_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "training_plan_block_drill_version_idx" ON "training_practice_plan_blocks" USING btree ("drill_version_id") WHERE "training_practice_plan_blocks"."drill_version_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "training_drill_purchase_buyer_person_idx" ON "training_drill_purchases" USING btree ("buyer_person_id") WHERE "training_drill_purchases"."buyer_person_id" IS NOT NULL;