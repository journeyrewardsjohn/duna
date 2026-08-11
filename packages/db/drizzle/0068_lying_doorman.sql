CREATE TABLE "messaging_attachment_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"provider_upload_id" text NOT NULL,
	"kind" varchar(16) NOT NULL,
	"media_type" varchar(80) NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" integer NOT NULL,
	"part_size_bytes" integer NOT NULL,
	"total_parts" integer NOT NULL,
	"status" varchar(24) DEFAULT 'initiated' NOT NULL,
	"attached_message_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_attachment_uploads_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "messaging_attachment_upload_kind_valid" CHECK ("messaging_attachment_uploads"."kind" IN ('image', 'video', 'file')),
	CONSTRAINT "messaging_attachment_upload_status_valid" CHECK ("messaging_attachment_uploads"."status" IN ('initiated', 'uploaded', 'attached', 'aborted')),
	CONSTRAINT "messaging_attachment_upload_size_valid" CHECK ("messaging_attachment_uploads"."byte_size" > 0 AND "messaging_attachment_uploads"."byte_size" <= 1073741824),
	CONSTRAINT "messaging_attachment_upload_parts_valid" CHECK ("messaging_attachment_uploads"."part_size_bytes" >= 5242880 AND "messaging_attachment_uploads"."total_parts" > 0 AND "messaging_attachment_uploads"."total_parts" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" DROP CONSTRAINT "conversation_message_content_present";--> statement-breakpoint
ALTER TABLE "conversation_message_attachments" ADD COLUMN "kind" varchar(16);--> statement-breakpoint
UPDATE "conversation_message_attachments"
SET "kind" = CASE
	WHEN "media_type" LIKE 'image/%' THEN 'image'
	WHEN "media_type" LIKE 'video/%' THEN 'video'
	ELSE 'file'
END;--> statement-breakpoint
ALTER TABLE "conversation_message_attachments" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messaging_attachment_uploads" ADD CONSTRAINT "messaging_attachment_uploads_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_attachment_uploads" ADD CONSTRAINT "messaging_attachment_uploads_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_attachment_uploads" ADD CONSTRAINT "messaging_attachment_uploads_attached_message_id_conversation_messages_id_fk" FOREIGN KEY ("attached_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_attachment_upload_owner_idx" ON "messaging_attachment_uploads" USING btree ("owner_person_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "messaging_attachment_upload_conversation_idx" ON "messaging_attachment_uploads" USING btree ("conversation_id","status");--> statement-breakpoint
ALTER TABLE "conversation_message_attachments" ADD CONSTRAINT "conversation_attachment_kind_valid" CHECK ("conversation_message_attachments"."kind" IN ('image', 'video', 'file'));
