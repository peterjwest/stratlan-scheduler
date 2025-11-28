ALTER TYPE "public"."ScoreType" ADD VALUE 'AttendedEvent' BEFORE 'Achievement';--> statement-breakpoint
ALTER TABLE "Score" ADD COLUMN "attendedEvent" boolean DEFAULT false NOT NULL;