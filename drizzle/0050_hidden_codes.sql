CREATE TABLE "HiddenCode" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "HiddenCode_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar NOT NULL,
	"lanId" integer NOT NULL,
	"code" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "IntroChallenge" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."IntroChallengeType";--> statement-breakpoint
CREATE TYPE "public"."IntroChallengeType" AS ENUM('Login', 'GameActivity', 'HiddenCode');--> statement-breakpoint
ALTER TABLE "IntroChallenge" ALTER COLUMN "type" SET DATA TYPE "public"."IntroChallengeType" USING "type"::"public"."IntroChallengeType";--> statement-breakpoint
ALTER TABLE "Score" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."ScoreType";--> statement-breakpoint
CREATE TYPE "public"."ScoreType" AS ENUM('Awarded', 'CommunityGame', 'HiddenCode', 'Achievement', 'IntroChallenge');--> statement-breakpoint
ALTER TABLE "Score" ALTER COLUMN "type" SET DATA TYPE "public"."ScoreType" USING "type"::"public"."ScoreType";--> statement-breakpoint
ALTER TABLE "Score" ADD COLUMN "hiddenCodeId" integer;--> statement-breakpoint
ALTER TABLE "HiddenCode" ADD CONSTRAINT "HiddenCode_lanId_Lan_id_fk" FOREIGN KEY ("lanId") REFERENCES "public"."Lan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Score" ADD CONSTRAINT "Score_hiddenCodeId_HiddenCode_id_fk" FOREIGN KEY ("hiddenCodeId") REFERENCES "public"."HiddenCode"("id") ON DELETE no action ON UPDATE no action;