# ✅ Railway Deployment Checklist

Quick checklist untuk memastikan deployment sukses.

## 📋 Pre-Deployment

### Local Preparation

-   [ ] Backend tested locally (`npm run dev` works)
-   [ ] Database migrations tested
-   [ ] All dependencies in `package.json`
-   [ ] `.gitignore` configured (node_modules, .env, uploads)
-   [ ] `railway.json` exists
-   [ ] `nixpacks.toml` exists
-   [ ] `package.json` has `start:migrate` script
-   [ ] `src/config/database.js` supports `DATABASE_URL`

### GitHub Repository

-   [ ] GitHub repository created
-   [ ] Local commits pushed to GitHub
-   [ ] Repository accessible (private/public)
-   [ ] `package-lock.json` committed

## 🚂 Railway Setup

### Account & Project

-   [ ] Railway account created (railway.app)
-   [ ] GitHub connected to Railway
-   [ ] New project created from GitHub repo
-   [ ] Repository selected and linked

### Database

-   [ ] PostgreSQL service added to project
-   [ ] PostgreSQL status: Running (green)
-   [ ] `DATABASE_URL` auto-generated
-   [ ] `DATABASE_URL` linked to backend service

### Environment Variables

Required variables added:

-   [ ] `NODE_ENV=production`
-   [ ] `PORT=3000`
-   [ ] `JWT_SECRET` (32+ characters)
-   [ ] `JWT_REFRESH_SECRET` (32+ characters)
-   [ ] `JWT_EXPIRE=1h`
-   [ ] `JWT_REFRESH_EXPIRE=7d`
-   [ ] `CORS_ORIGIN` (with frontend URLs)
-   [ ] `UPLOAD_DIR=./uploads`
-   [ ] `MAX_FILE_SIZE=5242880`
-   [ ] `FACE_MATCH_THRESHOLD=0.6`
-   [ ] `MIN_FACE_CONFIDENCE=0.95`

**Auto-injected (don't add manually):**

-   [ ] `DATABASE_URL` (from PostgreSQL service)

### Deployment

-   [ ] Initial build completed successfully
-   [ ] Deployment status: Active (green)
-   [ ] Database migrations ran successfully
-   [ ] Server started successfully
-   [ ] No errors in deployment logs

### Networking

-   [ ] Public domain generated
-   [ ] Domain accessible in browser
-   [ ] SSL certificate active (https)
-   [ ] Custom domain configured (optional)

## 🧪 Testing

### API Endpoints

-   [ ] `/health` returns 200 OK
-   [ ] `/api/auth/login` accessible (may return 400/401, that's OK)
-   [ ] No CORS errors when testing

### Database

-   [ ] Database connection successful (check logs)
-   [ ] Tables created from migrations
-   [ ] Can query database via Railway dashboard

### Functionality

-   [ ] Admin user created (optional for demo)
-   [ ] Sample data seeded (optional)
-   [ ] File uploads working (if tested)
-   [ ] PDF generation working (if tested)

## 📱 Integration

### Mobile App

-   [ ] `baseUrl` updated to Railway URL
-   [ ] Mobile app can connect to backend
-   [ ] Authentication working
-   [ ] API calls successful

### Frontend (if applicable)

-   [ ] `NEXT_PUBLIC_API_URL` updated
-   [ ] Frontend deployed
-   [ ] Frontend can call backend API
-   [ ] CORS configured correctly

## 📊 Monitoring

### Railway Dashboard

-   [ ] Metrics visible (CPU, Memory, Network)
-   [ ] Logs accessible and readable
-   [ ] Deployment history visible
-   [ ] No crashed deployments

### Performance

-   [ ] Response times acceptable
-   [ ] Memory usage stable (not climbing)
-   [ ] CPU usage normal
-   [ ] No memory leaks detected

## 🔐 Security

### Production Readiness

-   [ ] JWT secrets changed from defaults
-   [ ] `NODE_ENV=production` set
-   [ ] CORS restricted to known domains (not `*`)
-   [ ] Sensitive data not in logs
-   [ ] `.env` not committed to Git

### Access Control

-   [ ] Railway project access controlled
-   [ ] Database access restricted
-   [ ] Admin credentials secure
-   [ ] API rate limiting enabled (if configured)

## 💰 Billing

### Cost Management

-   [ ] Payment method added (if using paid plan)
-   [ ] Plan selected (Trial/$5/$20)
-   [ ] Usage alerts configured (optional)
-   [ ] Budget limits understood

## 📝 Documentation

### Deployment Info Recorded

-   [ ] Railway project URL saved
-   [ ] Backend domain URL saved
-   [ ] Database connection string backed up
-   [ ] Environment variables documented
-   [ ] Deployment date recorded
-   [ ] Git commit hash noted

## 🎯 Post-Deployment

### Team Communication

-   [ ] Backend URL shared with team
-   [ ] Mobile developers notified
-   [ ] Frontend developers notified
-   [ ] Demo/testing timeline communicated

### Continuous Deployment

-   [ ] Auto-deploy enabled on `main` branch
-   [ ] Team knows: `git push` = auto-deploy
-   [ ] Rollback procedure understood

### Next Steps

-   [ ] Monitor for 24-48 hours
-   [ ] Collect initial feedback
-   [ ] Performance optimization planned
-   [ ] Backup strategy confirmed

---

## 🚨 Red Flags to Watch

⚠️ **Immediate action needed if:**

-   Deployment keeps failing/crashing
-   Memory usage > 90% sustained
-   Database connection errors
-   SSL certificate not active
-   500 errors in production
-   CORS blocking legitimate requests

---

## ✅ Success Criteria

**Deployment is successful when:**

1. ✅ Build status: Success (green)
2. ✅ Health endpoint returns 200
3. ✅ Database connected and migrations complete
4. ✅ Mobile/Frontend can authenticate
5. ✅ No critical errors in logs
6. ✅ Memory and CPU usage stable

---

**Last Updated:** 2026-01-10  
**Platform:** Railway.app  
**Backend:** TIA Security Management System
