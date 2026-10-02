# Deployment Guide

This application is configured for **cloud-first deployment** on free-tier services.

**Stack:**
- `backend/`: NestJS API, Prisma, MySQL
- `frontend/`: Next.js UI (Vercel)
- `database/`: MySQL database
- `storage/`: Cloudinary
- `email/`: Resend

---

## 🚀 Production Deployment

### Quick Start (30 minutes)
See [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) for rapid setup instructions.

### Detailed Guide (45 minutes)
See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for complete step-by-step instructions with troubleshooting.

---

## 📋 What's Included

✅ **Prisma ORM** - Configured for MySQL
✅ **Cloudinary Integration** - Image storage (replaces local storage)
✅ **Resend Integration** - Transactional email service
✅ **Environment Variables** - .env.example files with all required keys
✅ **Vercel Config** - vercel.json for frontend deployment
✅ **Render Config** - render.yaml for backend deployment

---

## 🏗️ Local Development

### Prerequisites
- Node.js 18+
- MySQL (local or managed)

### Setup

1. Install dependencies:
```bash
cd backend && npm install
cd ../frontend && npm install
```

2. Configure environment variables:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

3. Update `.env` files with your local/cloud credentials

4. Run database migrations:
```bash
cd backend
npm run migrate:deploy
npm run seed:admin
```

5. Start development servers:
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Frontend: http://localhost:3000
Backend: http://localhost:3001

---

## 🐳 Docker Compose (Local)

For testing containerized setup locally:

```bash
docker compose up --build
```

**Note**: This uses local MySQL. For production, use a managed MySQL service or your preferred hosting provider.

---

## 📦 Deployment Platforms

| Component | Platform | Tier | Cost |
|-----------|----------|------|------|
| Frontend | Vercel | Free | Free* |
| Backend | Render | Free | Free (with limits) |
| Database | MySQL | Managed or local | Varies |
| Storage | Cloudinary | Free | Free* |
| Email | Resend | Free | Free (limited) |
| Domain | Hostinger | .com | ~$3/year |

*Free tier has limitations - see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for details.

---

## 🔐 Environment Variables Required

### Backend (.env)
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Random secret for token signing
- `FRONTEND_URL` - Your domain (for CORS)
- `CLOUDINARY_*` - Cloudinary credentials
- `RESEND_API_KEY` - Resend email service key
- `EMAIL_FROM` - Sender email address

### Frontend (.env.local / .env.production)
- `NEXT_PUBLIC_API_URL` - Backend URL
- `NEXT_PUBLIC_CLOUDINARY_*` - Cloudinary config

### Payments and webhooks

The backend creates provider checkout sessions itself; do not use a static payment link in production. Set `PAYMENT_MODE=production`, then configure only the provider(s) you offer:

- Stripe: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. In Stripe, send `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `payment_intent.succeeded` to `https://api.yourdomain.com/webhooks/payment/stripe`.
- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and the dashboard-generated `PAYPAL_WEBHOOK_ID`. Subscribe to `PAYMENT.CAPTURE.COMPLETED` at `https://api.yourdomain.com/webhooks/payment/paypal`.

Webhook signatures are mandatory. A browser return URL never marks a registration paid; only a verified provider event (or verified PayPal server-side capture) can do so. Test with each provider's sandbox before switching `PAYMENT_MODE` to `production`.

---

## ✅ Deployment Checklist

- [ ] All accounts created (Render or Hostinger, Vercel or Hostinger, etc.)
- [ ] Environment variables configured on each platform
- [ ] Database migrations run on Render
- [ ] Admin user seeded
- [ ] Domain DNS records updated
- [ ] CORS configured correctly
- [ ] Health checks passing
- [ ] Email delivery tested
- [ ] Image upload tested
- [ ] Authentication tested
- [ ] A signed Stripe or PayPal sandbox webhook changes a test registration to `paid`
- [ ] The corresponding production webhook URL and secret/webhook ID are configured

---

## 🆘 Troubleshooting

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for common issues and solutions.

---

## 📞 Support

For platform-specific issues:
- Render: https://render.com/docs
- Vercel: https://vercel.com/docs
- MySQL: https://dev.mysql.com/doc/
- Cloudinary: https://cloudinary.com/documentation
- Resend: https://resend.com/docs

If your Docker install uses the legacy Compose CLI, run:

```bash
docker-compose up --build
```

Before production use, change:

- MySQL passwords in `docker-compose.yml`
- `JWT_SECRET`
- `FRONTEND_URL`
- frontend build arg `NEXT_PUBLIC_API_URL`

## Health Check

The API exposes:

```text
GET /health
```

Expected response contains `status: "ok"`.

## Deploying Separately

Backend:

- Install dependencies with `npm ci`
- Set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and `API_PORT`
- Run `npm run migrate:deploy`
- Run `npm run build`
- Start with `npm start`

Frontend:

- Set `NEXT_PUBLIC_API_URL` to the deployed API origin
- Run `npm ci`
- Run `npm run build`
- Start with `npm start`
