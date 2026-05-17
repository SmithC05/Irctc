# 🚀 Deployment Guide - NammaRail

Complete instructions to deploy NammaRail to production.

---

## 📊 Deployment Options Comparison

| Platform | Cost | Ease | Auto-Deploy | Best For |
|----------|------|------|-------------|----------|
| **Render** | Free tier | ⭐⭐⭐ | ✅ | Beginners |
| **Railway** | Free tier | ⭐⭐⭐ | ✅ | Quick setup |
| **Vercel** | Free tier | ⭐⭐⭐ | ✅ | Frontend only |
| **Heroku** | Paid only | ⭐⭐ | ✅ | Legacy projects |
| **Docker** | Self-hosted | ⭐ | ❌ | Full control |

---

## ⭐ Option 1: Render.app (RECOMMENDED)

### Why Render?
- ✅ Free tier available
- ✅ Automatic deployments on git push
- ✅ No credit card required to start
- ✅ Easy environment variables
- ✅ Great documentation

### Backend Deployment (5 minutes)

#### Step 1: Create Render Account
1. Visit [render.com](https://render.com)
2. Click "Sign up" → Sign up with GitHub
3. Authorize GitHub access

#### Step 2: Create Backend Service

1. Click **"New +"** button (top-right)
2. Select **"Web Service"**
3. Click **"Deploy from GitHub repo"**
4. Search for `Irctc` and select it
5. Click **"Connect"**

#### Step 3: Configure Service

| Field | Value |
|-------|-------|
| **Name** | `nammarail-api` |
| **Environment** | `Node` |
| **Region** | `Singapore` (or closest) |
| **Branch** | `master` |
| **Build Command** | `cd nammarail/server && npm install` |
| **Start Command** | `npm start` |
| **Root Directory** | `nammarail/server` |

#### Step 4: Add Environment Variables

Click **"Environment"** tab and add:

```
PORT=5000
NODE_ENV=production
JWT_SECRET=generate_a_very_long_random_string_here_at_least_32_characters
CLIENT_URL=https://nammarail-app.onrender.com
DATABASE_PATH=./db/nammarail.db
```

**🔐 Generate JWT_SECRET:**
```bash
# On your computer, run:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste into `JWT_SECRET`.

#### Step 5: Deploy

Click **"Create Web Service"** and wait 2-3 minutes.

✅ Your backend URL: `https://nammarail-api.onrender.com`

#### ⚠️ Note on Database
SQLite will be stored in Render's temporary storage. For persistent database:
- Consider migrating to PostgreSQL (paid)
- Or backup database regularly

---

### Frontend Deployment (3 minutes)

#### Step 1: Create Static Site

1. On Render dashboard, click **"New +"**
2. Select **"Static Site"**
3. Click **"Deploy from GitHub repo"**
4. Select `Irctc` repository

#### Step 2: Configure Static Site

| Field | Value |
|-------|-------|
| **Name** | `nammarail-app` |
| **Branch** | `master` |
| **Build Command** | `cd nammarail/client && npm install && npm run build` |
| **Publish Directory** | `nammarail/client/dist` |
| **Root Directory** | `nammarail` |

#### Step 3: Set Environment Variable

Click **"Environment"** and add:

```
VITE_API_URL=https://nammarail-api.onrender.com
```

#### Step 4: Deploy

Click **"Create Static Site"** and wait 1-2 minutes.

✅ Your frontend URL: `https://nammarail-app.onrender.com`

#### Step 5: Update Backend URL

Go back to backend service settings and update:

```
CLIENT_URL=https://nammarail-app.onrender.com
```

Save and redeploy.

---

### ✅ Post-Deployment Checklist

- [ ] Test health endpoint: `https://nammarail-api.onrender.com/api/health`
- [ ] Load frontend: `https://nammarail-app.onrender.com`
- [ ] Test user registration
- [ ] Test login
- [ ] Check if backend URL is correct
- [ ] Monitor logs for errors

---

## Option 2: Railway.app

### Backend

1. Visit [railway.app](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Select `Irctc` and connect
5. Railway auto-detects Node.js
6. Go to **"Variables"** tab
7. Add environment variables
8. Deploy automatically ✅

### Frontend

1. Create new service
2. Root directory: `nammarail/client`
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`

---

## Option 3: Vercel (Frontend Only)

Use Vercel for just the frontend, and use another service for backend.

1. Visit [vercel.com](https://vercel.com)
2. Click **"New Project"**
3. Import GitHub repository
4. Select root directory: `nammarail/client`
5. Add environment variable: `VITE_API_URL`
6. Deploy ✅

---

## Option 4: Docker (Self-Hosted)

### Prerequisites
- Docker installed on your server
- SSH access to server

### Create Docker Compose File

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: nammarail/server/Dockerfile
    container_name: nammarail-api
    ports:
      - "5000:5000"
    environment:
      - PORT=5000
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - CLIENT_URL=${CLIENT_URL}
      - DATABASE_PATH=/app/db/nammarail.db
    volumes:
      - ./nammarail/server/db:/app/db
    restart: unless-stopped

  frontend:
    build:
      context: nammarail/client
      dockerfile: Dockerfile
    container_name: nammarail-app
    ports:
      - "80:80"
    environment:
      - VITE_API_URL=http://localhost:5000
    depends_on:
      - backend
    restart: unless-stopped
```

### Create Dockerfile (Backend)

`nammarail/server/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start server
CMD ["npm", "start"]
```

### Create Dockerfile (Frontend)

`nammarail/client/Dockerfile`:

```dockerfile
# Build stage
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Create Nginx Config

`nammarail/client/nginx.conf`:

```nginx
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

### Deploy

```bash
# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

---

## 🔐 Production Best Practices

### 1. Environment Variables

**NEVER** commit `.env` file to GitHub!

```bash
# Add to .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

Use `.env.example` template instead.

### 2. Database Migration

Move from SQLite to PostgreSQL for production:

```bash
# Create database
createdb nammarail_prod

# Update DATABASE_URL environment variable
DATABASE_URL=postgresql://user:password@host:5432/nammarail_prod
```

### 3. Enable HTTPS

All modern platforms provide free HTTPS:
- Render: ✅ Automatic
- Railway: ✅ Automatic
- Vercel: ✅ Automatic

### 4. Monitor Application

Set up monitoring:
- **Render**: Built-in logs
- **Railway**: Dashboard monitoring
- **Docker**: Use tools like Prometheus + Grafana

### 5. Backup Database

Schedule regular backups:

```bash
# Backup SQLite
cp db/nammarail.db backups/nammarail_$(date +%Y%m%d).db

# Or use cron job
0 0 * * * cp /app/db/nammarail.db /backups/nammarail_$(date +\%Y\%m\%d).db
```

### 6. Update Node.js

Keep Node.js updated:
```bash
node -v  # Check current version
npm update -g npm  # Update npm
```

---

## 📊 Monitoring & Debugging

### View Logs

**Render:**
```
Dashboard → Service → Logs
```

**Railway:**
```
Dashboard → Logs
```

**Docker:**
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Test Deployment

```bash
# Health check
curl https://nammarail-api.onrender.com/api/health

# Login test
curl -X POST https://nammarail-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

---

## 🐛 Common Issues & Solutions

### Issue: "Cannot find module"
**Solution:**
```bash
# Rebuild without cache
docker-compose build --no-cache
```

### Issue: CORS errors in frontend
**Solution:**
- Update `CLIENT_URL` in backend environment
- Verify API URL in frontend `.env`
- Clear browser cache (Ctrl+Shift+Del)

### Issue: Database locked
**Solution:**
```bash
# Delete and recreate database
rm db/nammarail.db

# Restart server (auto-creates new database)
npm start
```

### Issue: Port already in use
**Solution:**
```bash
# Find and kill process
lsof -i :5000
kill -9 <PID>
```

---

## 📈 Scaling for Production

### Database
- Migrate to PostgreSQL
- Enable connection pooling
- Create indexes on frequently queried columns

### Caching
- Implement Redis for train searches
- Cache user sessions
- Cache common queries

### Load Balancing
- Use Render/Railway auto-scaling
- Or Nginx reverse proxy for Docker

### CDN
- Use Cloudflare for static assets
- Serves content from closest location

---

## 🔄 Continuous Deployment

All platforms support auto-deployment on git push:

```bash
# Commit and push changes
git add .
git commit -m "Fix: update deployment settings"
git push origin master
```

Deployment automatically starts! ✅

---

## 📞 Deployment Support

- **Render Support**: [docs.render.com](https://docs.render.com)
- **Railway Support**: [railway.app/docs](https://railway.app/docs)
- **Vercel Support**: [vercel.com/docs](https://vercel.com/docs)
- **Docker Support**: [docker.com/docs](https://docker.com/docs)

---

## ✅ Deployment Checklist

- [ ] Create GitHub repository
- [ ] Add `.env.example` file
- [ ] Add `.gitignore` (exclude `.env`, `node_modules`, `dist`)
- [ ] Test locally: `npm run dev`
- [ ] Choose deployment platform
- [ ] Set up environment variables
- [ ] Deploy frontend
- [ ] Deploy backend
- [ ] Test health endpoint
- [ ] Test user registration
- [ ] Monitor logs
- [ ] Set up backup strategy
- [ ] Configure custom domain (optional)

---

Made with ❤️ by [SmithC05](https://github.com/SmithC05)
