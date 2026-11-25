DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "role"::text = 'BOARD_MEMBER'
  ) THEN
    RAISE EXCEPTION
      'UserRole migration stopped: review BOARD_MEMBER accounts and assign each an approved ADMIN or ACCOUNTANT role before retrying.';
  END IF;
END $$;

CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'ACCOUNTANT');

ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING ("role"::text::"UserRole_new");

ALTER TABLE "User"
  ALTER COLUMN "role" SET DEFAULT 'ACCOUNTANT';

DROP TYPE "UserRole";

ALTER TYPE "UserRole_new" RENAME TO "UserRole";
