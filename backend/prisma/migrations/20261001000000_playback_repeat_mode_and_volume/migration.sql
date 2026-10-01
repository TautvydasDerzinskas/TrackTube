-- AlterTable
ALTER TABLE "users" ADD COLUMN "playbackRepeatMode" TEXT NOT NULL DEFAULT 'off';

-- Backfill: the old boolean only ever meant "repeat current track".
UPDATE "users" SET "playbackRepeatMode" = 'one' WHERE "playbackIsRepeat" = true;

ALTER TABLE "users" DROP COLUMN "playbackIsRepeat";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "playbackVolume" DOUBLE PRECISION NOT NULL DEFAULT 1;
