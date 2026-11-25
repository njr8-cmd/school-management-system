# School Management System

## Local development

Install dependencies, configure `DATABASE_URL` and `AUTH_SECRET` in an untracked `.env` file, then apply the committed Prisma migrations to the intended development database:

```powershell
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Do not run `prisma/seed.ts` against a database containing school data; that seed is destructive. Before applying migrations, verify the database host and name and take the required backup.

## Provisioning the Accountant

The school uses two roles: `ADMIN` and `ACCOUNTANT`. The provisioning command creates an `ACCOUNTANT` account with a bcrypt-hashed password; it does not reset or modify existing accounts. Only an ADMIN can create accounts or assign roles through the application. Supply values through the current PowerShell session, not source files:

```powershell
$env:ACCOUNTANT_PROVISION_EXPECTED_HOST = "<exact database host>"
$env:ACCOUNTANT_PROVISION_EXPECTED_DATABASE = "<exact database name>"
$env:ACCOUNTANT_NAME = "<account holder name>"
$env:ACCOUNTANT_EMAIL = "<account email>"
$env:ACCOUNTANT_PASSWORD = "<unique password of at least 14 characters>"
$env:ACCOUNTANT_PROVISION_CONFIRMATION = "CREATE_ACCOUNTANT"
npm run provision:accountant
```

The command refuses to connect unless the parsed `DATABASE_URL` host and database exactly match the explicitly approved values. It also refuses to overwrite an account with the same email. Clear the session variables after running the command:

```powershell
Remove-Item Env:ACCOUNTANT_PROVISION_EXPECTED_HOST, Env:ACCOUNTANT_PROVISION_EXPECTED_DATABASE, Env:ACCOUNTANT_NAME, Env:ACCOUNTANT_EMAIL, Env:ACCOUNTANT_PASSWORD, Env:ACCOUNTANT_PROVISION_CONFIRMATION
```

## Bootstrapping a fresh demo database

After applying migrations to a newly created, isolated demo database, provision its first ADMIN from a trusted local PowerShell session. Populate these process environment variables from a secure secret store; do not put credentials in source files or commit them:

```powershell
$env:ADMIN_PROVISION_EXPECTED_HOST = "<exact demo database host>"
$env:ADMIN_PROVISION_EXPECTED_DATABASE = "<exact demo database name>"
$env:ADMIN_NAME = "<administrator name>"
$env:ADMIN_EMAIL = "<administrator email>"
$env:ADMIN_PASSWORD = "<unique password of at least 14 characters>"
$env:ADMIN_PROVISION_CONFIRMATION = "CREATE_ADMIN"
npm run provision:admin
```

The command refuses to proceed unless the PostgreSQL host and database match the explicit expected values and the database contains no users or schools. It creates one ADMIN with a bcrypt-hashed password and does not print or persist the plaintext password. Afterward, clear the process variables and configure the school profile while signed in as that administrator. Do not run the destructive `prisma/seed.ts` against a demo database; it resets application data and contains fixed development credentials.

## Isolated Vercel demo

Use the `demo` branch for a restricted Preview deployment, not Production. Create a new Neon project/database dedicated to this demo; never reuse QA or production. Apply migrations to that database with `npx prisma migrate deploy`, then provision the first ADMIN using the guarded command above. Configure `DATABASE_URL` and a newly generated `AUTH_SECRET` in Vercel's **Preview** environment only. Keep the demo database URL and secret out of Production settings and source control. The `postinstall` script generates the Prisma client for Vercel builds.

## Validation

```powershell
npm run lint
npx tsc --noEmit
npx prisma validate
npx tsx --test tests\grade-scale-validation.test.ts tests\grade-calculation.test.ts
npm run build
```
