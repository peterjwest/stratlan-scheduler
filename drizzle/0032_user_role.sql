CREATE TABLE "UserRole" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "UserRole_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"role" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;