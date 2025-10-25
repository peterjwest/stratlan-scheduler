DROP INDEX "expire_idx";--> statement-breakpoint
CREATE INDEX "Session_expire_idx" ON "Session" USING btree ("expire");