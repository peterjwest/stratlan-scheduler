CREATE TYPE "public"."IntroChallengeType" AS ENUM('Login', 'GameActivity', 'OneTimeCode');--> statement-breakpoint
CREATE TABLE "IntroChallenge" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "IntroChallenge_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "type" "IntroChallengeType" NOT NULL,
    "userId" integer NOT NULL,
    "scoreId" integer
);
--> statement-breakpoint
ALTER TABLE "IntroChallenge" ADD CONSTRAINT "IntroChallenge_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "IntroChallenge" ADD CONSTRAINT "IntroChallenge_scoreId_Score_id_fk" FOREIGN KEY ("scoreId") REFERENCES "public"."Score"("id") ON DELETE no action ON UPDATE no action;
