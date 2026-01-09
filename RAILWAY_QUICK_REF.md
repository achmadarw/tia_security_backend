# 🚂 Railway Deployment - Quick Reference

One-page reference untuk Railway deployment TIA Backend.

---

## 🎯 Essential URLs

-   **Railway Dashboard:** https://railway.app/dashboard
-   **Docs:** https://docs.railway.app
-   **Status:** https://status.railway.app

---

## ⚡ 5-Minute Deploy

```powershell
# 1. Push to GitHub
git add .
git commit -m "Deploy to Railway"
git push origin main

# 2. Railway Web
# - railway.app → New Project → Deploy from GitHub → tia-backend
# - Add PostgreSQL (+ New → Database → PostgreSQL)
# - Set Variables (JWT_SECRET, CORS_ORIGIN)
# - Generate Domain (Settings → Networking)

# 3. Test
# https://your-app.railway.app/health
```

---

## 📝 Required Environment Variables

```env
# Must Set
NODE_ENV=production
JWT_SECRET=min-32-characters-random-string
JWT_REFRESH_SECRET=min-32-characters-random-string
CORS_ORIGIN=https://your-frontend.com

# Auto-Injected (Don't Add)
DATABASE_URL=postgresql://... (from PostgreSQL service)
PORT=3000 (Railway provides)
```

---

## ✅ Success Checklist

```
[✓] Build: Success (green)
[✓] Logs: "Database connected successfully"
[✓] Logs: "Server running on port 3000"
[✓] /health returns 200 OK
[✓] No errors in recent logs
```

---

## 🐛 Quick Fixes

**Build Failed?**

```powershell
git add package-lock.json
git commit -m "Add lock file"
git push
```

**DB Connection Failed?**

-   Check PostgreSQL service is running (green)
-   Verify DATABASE_URL exists in variables
-   Restart deployment

**Puppeteer Crash?**

-   Ensure nixpacks.toml has nodejs_20
-   Add args: --no-sandbox, --disable-setuid-sandbox

---

## 📊 Files Needed

-   `railway.json` ✓
-   `nixpacks.toml` ✓
-   `package.json` (with start:migrate) ✓
-   `src/config/database.js` (DATABASE_URL support) ✓

---

## 💰 Cost Quick Ref

-   **Trial:** $5 free credit (1-2 weeks)
-   **Hobby:** $5/mo + usage
-   **Pro:** $20/mo flat (recommended for Puppeteer)

---

## 🔧 Railway CLI

```powershell
# Install
npm install -g @railway/cli

# Commands
railway login
railway logs
railway variables
railway open
railway status
```

---

## 📞 Help

-   Guide: RAILWAY_DEPLOYMENT_GUIDE.md
-   Checklist: backend/RAILWAY_CHECKLIST.md
-   Files: backend/RAILWAY_FILES_SUMMARY.md

---

**Version:** 1.0 | **Date:** 2026-01-10
