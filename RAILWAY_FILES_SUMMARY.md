# 📦 Railway Deployment Files - Summary

Ringkasan semua files yang dibutuhkan untuk Railway deployment.

---

## ✅ Files Created/Modified

### 1. **backend/railway.json** ✓

Railway platform configuration.

```json
{
    "$schema": "https://railway.app/railway.schema.json",
    "build": {
        "builder": "NIXPACKS"
    },
    "deploy": {
        "numReplicas": 1,
        "sleepApplication": false,
        "restartPolicyType": "ON_FAILURE",
        "restartPolicyMaxRetries": 10
    }
}
```

**Purpose:**

-   Defines Railway deployment settings
-   Disables sleep (never sleep)
-   Sets restart policy for failures

---

### 2. **backend/nixpacks.toml** ✓

Build and start commands configuration.

```toml
[phases.setup]
nixPkgs = ["nodejs_20", "postgresql"]

[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = ["echo 'Build phase - migrations will run on start'"]

[start]
cmd = "npm run start:migrate"
```

**Purpose:**

-   Installs Node.js 20 and PostgreSQL client
-   Runs npm install
-   Starts server with auto-migration (`npm run start:migrate`)

---

### 3. **backend/package.json** (Modified)

Added migration script.

```json
"scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "start:migrate": "node src/database/migrate.js && node src/server.js",
    "db:migrate": "node src/database/migrate.js",
    "db:seed": "node src/database/seed.js",
    "test": "jest"
}
```

**Changes:**

-   Added `start:migrate` script
-   Runs migrations before starting server
-   Used by Railway deploy process

---

### 4. **backend/src/config/database.js** (Modified) ✓

Added Railway DATABASE_URL support.

```javascript
const { Pool } = require('pg');
require('dotenv').config();

// Railway provides DATABASE_URL, local dev uses individual params
const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: {
                  rejectUnauthorized: false,
              },
          }
        : {
              host: process.env.DB_HOST || 'localhost',
              port: process.env.DB_PORT || 5432,
              database: process.env.DB_NAME || 'tia_db',
              user: process.env.DB_USER || 'postgres',
              password: process.env.DB_PASSWORD,
          }
);
```

**Changes:**

-   Detects `DATABASE_URL` from Railway
-   Falls back to individual params for local dev
-   Adds SSL support for Railway PostgreSQL
-   Maintains backward compatibility

---

### 5. **backend/.gitignore** (Existing) ✓

Ensures sensitive files not committed.

```ignore
node_modules/
.env
uploads/
*.log
.DS_Store
dist/
coverage/
```

**Critical:**

-   `node_modules/` - Too large, reinstalled by Railway
-   `.env` - Contains secrets, never commit
-   `uploads/` - User-generated files, not in Git

---

## 📚 Documentation Files

### 1. **RAILWAY_DEPLOYMENT_GUIDE.md** ✓

Complete step-by-step deployment guide.

**Sections:**

-   Prerequisites
-   9 detailed deployment steps
-   Environment variables setup
-   Testing & verification
-   Troubleshooting
-   Cost breakdown
-   Monitoring & logs
-   Custom domain setup
-   Mobile/Frontend integration

---

### 2. **backend/RAILWAY_CHECKLIST.md** ✓

Deployment verification checklist.

**Categories:**

-   Pre-deployment checks
-   Railway setup verification
-   Testing checklist
-   Integration checks
-   Security verification
-   Post-deployment tasks

---

## 🔄 Deployment Flow

```
1. Local Development
   ├── Code changes
   ├── Test locally
   └── Git commit

2. Git Push
   ├── Push to GitHub
   └── Trigger Railway deploy

3. Railway Build
   ├── Clone repository
   ├── Read nixpacks.toml
   ├── Install dependencies (npm install)
   └── Build completed

4. Railway Deploy
   ├── Run migrations (start:migrate)
   ├── Start server
   ├── Inject DATABASE_URL
   └── Service running

5. Production
   ├── Public URL active
   ├── Database connected
   └── Application live ✅
```

---

## 🧪 Verification Steps

### After Deployment, Verify:

1. **Build Success**

    ```
    Railway Dashboard → Backend Service → Deployments
    Status: ✓ Success (green)
    ```

2. **Database Connected**

    ```
    Logs should show: "✅ Database connected successfully"
    ```

3. **Migrations Completed**

    ```
    Logs should show: "✅ Database migrations completed successfully"
    ```

4. **Server Running**

    ```
    Logs should show: "✅ Server running on port 3000"
    ```

5. **Health Endpoint**
    ```bash
    curl https://your-app.railway.app/health
    # Should return: {"status":"OK",...}
    ```

---

## 🔧 Configuration Summary

### Railway Environment Variables

**Required:**

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=<generate-32-chars>
JWT_REFRESH_SECRET=<generate-32-chars>
CORS_ORIGIN=https://your-frontend.com
```

**Auto-Injected by Railway:**

```env
DATABASE_URL=postgresql://user:pass@host:port/db
PORT=3000 (default)
```

**Optional:**

```env
JWT_EXPIRE=1h
JWT_REFRESH_EXPIRE=7d
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=5242880
FACE_MATCH_THRESHOLD=0.6
MIN_FACE_CONFIDENCE=0.95
```

---

## ⚡ Quick Commands

### Local Testing Before Deploy

```powershell
# Test migrations
npm run db:migrate

# Test start:migrate script
npm run start:migrate

# Verify database connection
node -e "require('./src/config/database').query('SELECT NOW()')"
```

### After Deploy - Railway CLI

```powershell
# Install CLI
npm install -g @railway/cli

# Login
railway login

# View logs
railway logs

# Check variables
railway variables

# Open in browser
railway open
```

---

## 📊 File Checklist

Before deploying, ensure these files exist:

-   [x] `backend/railway.json`
-   [x] `backend/nixpacks.toml`
-   [x] `backend/package.json` (with start:migrate)
-   [x] `backend/src/config/database.js` (with DATABASE_URL support)
-   [x] `backend/.gitignore`
-   [x] `backend/src/database/migrate.js`
-   [x] `backend/src/server.js`
-   [x] `RAILWAY_DEPLOYMENT_GUIDE.md`
-   [x] `backend/RAILWAY_CHECKLIST.md`

---

## 🎯 Success Indicators

**✅ Deployment Successful When:**

1. Build completes without errors
2. Migrations run successfully
3. Server starts and listens on PORT
4. Health endpoint returns 200 OK
5. Database queries work
6. No crash loops in logs
7. Memory usage stable
8. Public URL accessible

---

## 🚨 Common Issues & Fixes

### Issue: DATABASE_URL not working

**Fix:** Verify `src/config/database.js` has Railway support (check file above)

### Issue: Migrations not running

**Fix:** Check `package.json` has `start:migrate` script

### Issue: Port binding error

**Fix:** Ensure server uses `process.env.PORT` (Railway provides this)

### Issue: Build timeout

**Fix:** Check `nixpacks.toml` syntax, verify package-lock.json committed

---

## 📞 Support

**Railway Documentation:** https://docs.railway.app  
**Railway Discord:** https://discord.gg/railway  
**Deployment Guide:** See RAILWAY_DEPLOYMENT_GUIDE.md  
**Checklist:** See backend/RAILWAY_CHECKLIST.md

---

**Last Updated:** 2026-01-10  
**Backend Version:** 1.0.0  
**Railway Config Version:** 1.0
