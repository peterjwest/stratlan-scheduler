ALTER TABLE "Event" ADD COLUMN "isProcessed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "EventTimeslot" ADD COLUMN "isProcessed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Event" DROP COLUMN "timeslotCount";
