CREATE TABLE "catalog_participation_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_session_occurrence_id" uuid NOT NULL,
	"catalog_fulfillment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"payer_person_id" uuid NOT NULL,
	"basis" varchar(24) NOT NULL,
	"headcount" integer NOT NULL,
	"quantity" integer NOT NULL,
	"credits_per_player" integer NOT NULL,
	"reserved_credits" integer NOT NULL,
	"settled_credits" integer NOT NULL,
	"returned_credits" integer NOT NULL,
	"returned_value_minor" bigint DEFAULT 0 NOT NULL,
	"credit_journal_id" uuid,
	"refund_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_participation_settlement_basis_valid" CHECK ("catalog_participation_settlements"."basis" IN ('cutoff', 'attendance')),
	CONSTRAINT "catalog_participation_settlement_amounts_valid" CHECK ("catalog_participation_settlements"."headcount" >= 0 AND "catalog_participation_settlements"."quantity" > 0 AND "catalog_participation_settlements"."credits_per_player" > 0 AND "catalog_participation_settlements"."reserved_credits" >= 0 AND "catalog_participation_settlements"."settled_credits" >= 0 AND "catalog_participation_settlements"."returned_credits" >= 0 AND "catalog_participation_settlements"."settled_credits" + "catalog_participation_settlements"."returned_credits" = "catalog_participation_settlements"."reserved_credits" AND "catalog_participation_settlements"."returned_value_minor" >= 0),
	CONSTRAINT "catalog_participation_settlement_return_journal" CHECK (("catalog_participation_settlements"."returned_credits" = 0 AND "catalog_participation_settlements"."credit_journal_id" IS NULL AND "catalog_participation_settlements"."refund_record_id" IS NULL) OR ("catalog_participation_settlements"."returned_credits" > 0 AND "catalog_participation_settlements"."credit_journal_id" IS NOT NULL AND "catalog_participation_settlements"."refund_record_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "refund_records" ALTER COLUMN "disposition" SET DATA TYPE varchar(48);--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD COLUMN "participation_outcome" varchar(32);--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD COLUMN "participation_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD COLUMN "decided_headcount" integer;--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD COLUMN "settled_headcount" integer;--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD COLUMN "participation_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD COLUMN "returned_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD COLUMN "returned_value_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_participation_settlements" ADD CONSTRAINT "catalog_participation_settlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_participation_settlements" ADD CONSTRAINT "catalog_participation_settlements_catalog_session_occurrence_id_catalog_session_occurrences_id_fk" FOREIGN KEY ("catalog_session_occurrence_id") REFERENCES "public"."catalog_session_occurrences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_participation_settlements" ADD CONSTRAINT "catalog_participation_settlements_catalog_fulfillment_id_catalog_fulfillments_id_fk" FOREIGN KEY ("catalog_fulfillment_id") REFERENCES "public"."catalog_fulfillments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_participation_settlements" ADD CONSTRAINT "catalog_participation_settlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_participation_settlements" ADD CONSTRAINT "catalog_participation_settlements_payer_person_id_people_id_fk" FOREIGN KEY ("payer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_participation_settlements" ADD CONSTRAINT "catalog_participation_settlements_credit_journal_id_ledger_journals_id_fk" FOREIGN KEY ("credit_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_participation_settlements" ADD CONSTRAINT "catalog_participation_settlements_refund_record_id_refund_records_id_fk" FOREIGN KEY ("refund_record_id") REFERENCES "public"."refund_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_participation_settlement_fulfillment_unique" ON "catalog_participation_settlements" USING btree ("catalog_fulfillment_id");--> statement-breakpoint
CREATE INDEX "catalog_participation_settlement_occurrence_idx" ON "catalog_participation_settlements" USING btree ("organization_id","catalog_session_occurrence_id");--> statement-breakpoint
CREATE INDEX "catalog_participation_settlement_payer_idx" ON "catalog_participation_settlements" USING btree ("payer_person_id","created_at");--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD CONSTRAINT "catalog_session_occurrence_participation_outcome_valid" CHECK ("catalog_session_occurrences"."participation_outcome" IS NULL OR "catalog_session_occurrences"."participation_outcome" IN ('minimum-met', 'run-under-minimum', 'cancel-under-minimum'));--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD CONSTRAINT "catalog_session_occurrence_participation_decision_valid" CHECK (("catalog_session_occurrences"."participation_outcome" IS NULL AND "catalog_session_occurrences"."participation_decided_at" IS NULL AND "catalog_session_occurrences"."decided_headcount" IS NULL) OR ("catalog_session_occurrences"."participation_outcome" IS NOT NULL AND "catalog_session_occurrences"."participation_decided_at" IS NOT NULL AND "catalog_session_occurrences"."decided_headcount" >= 0));--> statement-breakpoint
ALTER TABLE "catalog_session_occurrences" ADD CONSTRAINT "catalog_session_occurrence_participation_settlement_valid" CHECK (("catalog_session_occurrences"."participation_settled_at" IS NULL AND "catalog_session_occurrences"."settled_headcount" IS NULL) OR ("catalog_session_occurrences"."participation_settled_at" IS NOT NULL AND "catalog_session_occurrences"."settled_headcount" >= 0 AND "catalog_session_occurrences"."participation_outcome" IN ('minimum-met', 'run-under-minimum')));--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD CONSTRAINT "organization_credit_application_returned_valid" CHECK ("organization_credit_applications"."returned_credits" >= 0 AND "organization_credit_applications"."returned_credits" <= "organization_credit_applications"."credits" AND "organization_credit_applications"."returned_value_minor" >= 0 AND "organization_credit_applications"."returned_value_minor" <= "organization_credit_applications"."value_minor");