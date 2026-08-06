ALTER TABLE "organization_themes" ALTER COLUMN "palette" SET DEFAULT '{"primary":"#517986","accent":"#BDD2D9","sand":"#E5F1F5","ink":"#2D4D57","canvas":"#F6F5F1","success":"#2F6B3A","clubHue":220.25,"clubChroma":0.0489}'::jsonb;--> statement-breakpoint
ALTER TABLE "organization_themes" ALTER COLUMN "typography" SET DEFAULT '{"heading":"Fellix","body":"Fellix"}'::jsonb;--> statement-breakpoint
ALTER TABLE "player_public_profiles" ADD COLUMN "accent_id" varchar(32) DEFAULT 'dune-gold' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_public_profiles" ADD CONSTRAINT "player_public_profile_accent_valid" CHECK ("player_public_profiles"."accent_id" IN ('dune-gold', 'marine', 'deep-coral', 'moss', 'terracotta', 'slate-blue', 'ochre', 'plum', 'sea-green', 'ink'));
