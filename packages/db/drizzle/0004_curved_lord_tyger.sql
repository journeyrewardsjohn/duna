CREATE TABLE "rate_limit_buckets" (
	"key" varchar(256) PRIMARY KEY NOT NULL,
	"tokens" double precision NOT NULL,
	"capacity" integer NOT NULL,
	"refill_per_second" double precision NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
