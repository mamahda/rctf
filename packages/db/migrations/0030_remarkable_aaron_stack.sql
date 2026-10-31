CREATE TABLE "submission_proofs" (
	"sha256" text PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
