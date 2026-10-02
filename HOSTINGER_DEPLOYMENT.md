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
RESEND_API_KEY=...
EMAIL_FROM=noreply@your-domain.com
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=User
```

Run `npm run seed:admin` once after the first deployment if the admin account does not exist. Configure payment provider webhooks to use the public API domain before enabling production payments.

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

Before switching traffic, verify:

1. `https://api.your-domain.com/health` returns a healthy response.
2. The frontend can log in and load public content.
3. Registration and abstract submission work.
4. Email, Cloudinary uploads, and signed payment webhooks work.
5. MySQL backups are enabled.

Hostinger account limits and available Node.js application features vary by plan. If the plan cannot run two Node.js processes, host the frontend on Vercel and the backend on Hostinger, or use a separate backend host.