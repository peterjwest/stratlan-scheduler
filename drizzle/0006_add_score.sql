CREATE TYPE "public"."ScoreType" AS ENUM('Awarded', 'CommunityGame', 'OneTimeCode', 'Achievement');--> statement-breakpoint
CREATE TABLE "scores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Score_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"teamId" integer,
	"type" "ScoreType" NOT NULL,
	"userId" integer,
	"assignerId" integer,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teamId" integer;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_teamId_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_assignerId_users_id_fk" FOREIGN KEY ("assignerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_teamId_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
