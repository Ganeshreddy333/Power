# Conference App

This repository contains a Next.js frontend and a NestJS backend for a conference application.

See `HOSTINGER_DEPLOYMENT.md` for self-hosted deployment instructions using MySQL, Cloudinary, and Hostinger SMTP. Configure the backend SMTP environment variables in the Hostinger application settings; do not expose them to the frontend.

Quick steps to prepare and push to GitHub:

```bash
# From repository root
git add -A
git commit -m "Prepare conference application for deployment"
# Create an empty GitHub repository, then add its remote URL
git remote add origin git@github.com:yourusername/your-repo.git
git branch -M main
git push -u origin main
```

Replace `yourusername/your-repo.git` with your repository URL.

Never commit `.env`, `.env.local`, private keys, database credentials, payment-provider keys, or the `backend/storage/` upload directory. Use the provided `.env.example` files as templates and set real values in your hosting providers' environment-variable settings.
