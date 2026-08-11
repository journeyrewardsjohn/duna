ALTER TABLE "conversation_message_reactions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
