ALTER TYPE "public"."ScoreType" ADD VALUE 'Secret';--> statement-breakpoint
ALTER TABLE "Score" ADD COLUMN "secretNumber" integer;
