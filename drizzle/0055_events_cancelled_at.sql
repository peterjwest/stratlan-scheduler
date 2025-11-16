ALTER TABLE "Event" ADD COLUMN "cancelledAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "Event" DROP COLUMN "isCancelled";