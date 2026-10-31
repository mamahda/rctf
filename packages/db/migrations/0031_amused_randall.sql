CREATE TABLE "participant_accounts" (
	"nrp" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"assigned_team_id" text NOT NULL,
	"invite_hash" text NOT NULL,
	"password_hash" text,
	"joined" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participant_accounts" ADD CONSTRAINT "participant_accounts_assigned_team_id_users_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;