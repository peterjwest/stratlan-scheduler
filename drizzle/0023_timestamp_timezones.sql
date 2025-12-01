ALTER TABLE "Event" ALTER COLUMN "startTime" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "Event" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "Event" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "EventTimeslot" ALTER COLUMN "time" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "GameActivity" ALTER COLUMN "startTime" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "GameActivity" ALTER COLUMN "endTime" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "Score" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "Score" ALTER COLUMN "createdAt" SET DEFAULT now();
