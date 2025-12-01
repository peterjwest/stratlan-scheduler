CREATE TABLE "Game" (
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "GameActivity" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "GameActivity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "userId" integer NOT NULL,
    "gameId" varchar NOT NULL,
    "startTime" timestamp NOT NULL,
    "endTime" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "GameActivity" ADD CONSTRAINT "GameActivity_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GameActivity" ADD CONSTRAINT "GameActivity_gameId_Game_id_fk" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE no action ON UPDATE no action;
