# 🚀 Quick Start - Deployment Setup

This guide helps you get your application live in ~30 minutes.

## Prerequisites

1. GitHub account with your code pushed
2. MySQL database ready locally or via a managed provider
3. Accounts created on: Render, Vercel, Cloudinary, Resend, Hostinger

---

## 🔑 Get Your API Keys

### MySQL

1. Create a MySQL database and user for the app
2. Copy the MySQL connection string
3. Store the `DATABASE_URL`

### Cloudinary

1. [Sign up free](https://cloudinary.com/users/register)
2. Dashboard → Copy Cloud Name, API Key, API Secret
3. Store all three

### Resend

1. [Create free account](https://resend.com)
2. API Keys → Create key
3. Add domain to verified senders
4. Store `RESEND_API_KEY`

---

## Backend Deployment (5 minutes)

### On Render

1. Go to [render.com](https://render.com)
2. New Web Service → Connect GitHub → Select repo
3. Configuration:
   ```
   Name: conference-api
   Environment: Node
   Build Command: npm ci && npm run build
   Start Command: npm start
   ```

4. Add Environment Variables:
   ```
   DATABASE_URL=mysql://user:password@host:3306/conference_db
   JWT_SECRET=generate-random-secret
   FRONTEND_URL=https://yourdomain.com,https://www.yourdomain.com
   CLOUDINARY_CLOUD_NAME=your_name
   CLOUDINARY_API_KEY=your_key
   CLOUDINARY_API_SECRET=your_secret
   RESEND_API_KEY=re_xxxxx
   EMAIL_FROM=noreply@yourdomain.com
   NODE_ENV=production
   API_PORT=3001
   ```

5. Deploy!

6. After deployment, run migrations:
   - Click "Shell"
   - Run: `npm run migrate:deploy && npm run seed:admin`

---

## Frontend Deployment (5 minutes)

### On Vercel

1. Go to [vercel.com](https://vercel.com)
2. Add New Project → Select repo
3. Select framework (Next.js - auto-detected)
4. Add Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_name
   NEXT_PUBLIC_APP_NAME=Conference
   ```

5. Deploy!

---

## Domain Setup (10 minutes)

### On Hostinger DNS

1. Your domain → DNS Management
2. Add records:

   **For Frontend**:
   - Type: CNAME
   - Name: yourdomain.com
   - Value: cname.vercel-dns.com.

   **For Backend**:
   - Type: CNAME
   - Name: api
   - Value: (get from Render dashboard)

3. Wait 5-15 minutes for DNS to propagate

---

## Test Everything

```bash
# Backend health
curl https://api.yourdomain.com/health

# Frontend
Visit https://yourdomain.com in browser

# Try registering
Go to /registration and complete registration

# Check email
Look for confirmation email in your inbox
```

---

## All Done! 🎉

Your application is now live!

For detailed troubleshooting, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
