# Hostinger Deployment

The repository contains two deployable Node.js applications:

- `backend/` - NestJS API and Prisma migrations
- `frontend/` - Next.js application

Use two Hostinger Node.js applications on the same domain: the frontend on the main domain and the backend on an `api` subdomain. Keep MySQL on Hostinger or use a managed MySQL provider.

## GitHub repository

Push the contents of this directory to GitHub. Do not commit `.env` files, `node_modules`, `.next`, `dist`, local uploads, or database credentials. The root `.gitignore` already excludes them.

## SSH setup for Hostinger

On Hostinger SSH, `npm` is often not on the PATH until the Node environment is loaded. Run this before any `npm` command:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use --lts
```

If the shell still cannot find `node` or `npm`, source the project helper script:

```bash
bash /path/to/project/scripts/hostinger-node-env.sh
```

This script loads the correct Node.js environment and verifies that both `node` and `npm` are available.

## Backend Node.js application

Set the application root to `backend/` and configure:

- Build command: `npm ci && npm run build`
- Start command: `npm run migrate:deploy && npm start`
- Node.js: 22 or the latest supported LTS
- Entry point: `dist/main.js`

Add these environment variables in Hostinger. Replace every example value with a production value:

```env
NODE_ENV=production
API_PORT=3001
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
JWT_SECRET=generate-a-long-random-secret
JWT_EXPIRATION=1800s
FRONTEND_URL=https://your-domain.com,https://www.your-domain.com
PAYMENT_MODE=production
PAYMENT_PROVIDER=stripe
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-mailbox@your-domain.com
SMTP_PASS=...
SMTP_FROM=your-mailbox@your-domain.com
ADMIN_NOTIFICATION_EMAIL=admin@your-domain.com
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=User
```

Run `npm run seed:admin` once after the first deployment if the admin account does not exist. Configure payment provider webhooks to use the public API domain before enabling production payments.

The centralized email outbox covers brochure requests, contact acknowledgements, abstract submission receipts and review decisions, registration receipts, verified payment confirmations, payment failures/cancellations, and confirmed refunds. The API retries failed deliveries in-process; keep the backend application running. The existing `email_notifications` table is deployed through `npm run migrate:deploy`. SMTP acceptance is recorded as sent by the transport, but does not guarantee inbox placement.

## Frontend Node.js application

Set the application root to `frontend/` and configure:

- Install command: `npm ci`
- Build command: `npm run build`
- Start command: `npm start`
- Node.js: 22 or the latest supported LTS
- Port: the port assigned by Hostinger through `PORT`

Set this environment variable before building:

```env
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

The brochure is included at `frontend/public/brochure-2027.pdf` and is deployed with the frontend.

## Database

Create the MySQL database and user in Hostinger. Use the Hostinger database host, database name, username, and password in `DATABASE_URL`. Deploy migrations from the backend application with `npm run migrate:deploy`; do not use `prisma migrate dev` in production.

### SQL files for HPanel/phpMyAdmin

- For a brand-new, empty database, import `backend/prisma/hostinger-bootstrap.sql` once. It creates the current schema and records the matching Prisma migration history.
- For an existing application database, use `npm run migrate:deploy` during deployment. Do not import the bootstrap file again.
- If you must apply a schema change manually in phpMyAdmin, use only its pending SQL file from `backend/prisma/hpanel-migrations/`, in filename order. Then, from the backend directory, run `npx prisma migrate resolve --applied <migration-name>` for each manually imported migration so Prisma does not try to apply it again. Back up the database first.
- The Prisma files in `backend/prisma/migrations/` are the source of truth. Whenever a migration is added, run `cd backend && npm run hpanel:export` and include the generated matching SQL copy in `backend/prisma/hpanel-migrations/`.
- The backend build also runs `hpanel:export`, so the HPanel SQL copies are refreshed on redeployment. For every new migration, update `backend/prisma/hostinger-bootstrap.sql` as well so it remains a complete, current import for an empty database.
- Never re-import a migration that is already applied. SQL migrations are not generally safe to run twice.

Before switching traffic, verify:

1. `https://api.your-domain.com/health` returns a healthy response.
2. The frontend can log in and load public content.
3. Registration and abstract submission work.
4. Email, Cloudinary uploads, and signed payment webhooks work.
5. MySQL backups are enabled.

Use a dedicated database user with only the permissions required by this application. Keep database passwords, JWT secrets, payment credentials, and SMTP credentials in Hostinger environment settings; never commit them to the repository.

The helper `scripts/hostinger-deploy.sh` builds both applications and applies pending backend migrations. It does not reset the admin password during normal deployments. Set `SEED_ADMIN=1` only when intentionally creating or resetting the admin account, and ensure the `ADMIN_*` values are configured securely first.

Hostinger account limits and available Node.js application features vary by plan. If the plan cannot run two Node.js processes, host the frontend on Vercel and the backend on Hostinger, or use a separate backend host.