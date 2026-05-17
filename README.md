# 🚂 NammaRail - IRCTC Railway Booking System

<div align="center">

[![Status](https://img.shields.io/badge/status-active-brightgreen?style=flat-square)](https://github.com/SmithC05/Irctc)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-98.5%25-yellow?style=flat-square)](https://github.com/SmithC05/Irctc)
![GitHub last commit](https://img.shields.io/github/last-commit/SmithC05/Irctc?style=flat-square)

**An IRCTC-style railway booking platform built for Tamil Nadu routes** 🎫

*Book trains • Check PNR • Manage Passengers • Easy Deployment*

[Features](#features) • [Quick Start](#quick-start) • [Deployment](#deployment) • [API Docs](#api-routes) • [Tech Stack](#tech-stack)

</div>

---

## ✨ Features

- 🚆 **Train Search** - Search available trains by route and date
- 🎫 **Easy Booking** - Secure ticket booking with seat selection
- 📋 **PNR Tracking** - Check booking status using PNR number
- 👤 **User Accounts** - JWT-based authentication
- 🔒 **Secure Payments** - Password hashing with bcrypt
- 📱 **Responsive UI** - React + Vite frontend
- ⚡ **Fast API** - Node.js + Express backend
- 💾 **SQLite Database** - Lightweight, file-based storage

---

## 🏗️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React 18 + Vite |
| **Backend** | Node.js + Express |
| **Database** | SQLite (better-sqlite3) |
| **Authentication** | JWT + bcrypt |
| **Styling** | CSS3 (Modern & Responsive) |
| **Package Manager** | npm |

---

## 📂 Project Structure

```
Irctc/
├── nammarail/
│   ├── client/                    → React Vite Frontend
│   │   ├── src/
│   │   │   ├── components/        → Reusable React components
│   │   │   ├── pages/             → Page components
│   │   │   ├── assets/            → Images, icons
│   │   │   └── App.jsx
│   │   ├── package.json
│   │   └── vite.config.js
│   │
│   ├── server/                    → Express API Backend
│   │   ├── index.js               → Server entry point
│   │   ├── routes/                → API route definitions
│   │   ├── controllers/           → Business logic
│   │   ├── middleware/            → Auth, validation
│   │   ├── db/
│   │   │   ├── database.js        → SQLite setup
│   │   │   └── nammarail.db       → SQLite file (auto-created)
│   │   ├── package.json
│   │   └── .env.example
│   │
│   ├── db/
│   │   └── migrations/            → SQL schema files
│   │
│   └── README.md
│
└── README.md (this file)
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js** v14+ ([Download](https://nodejs.org/))
- **npm** v6+ (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))

### Step 1: Clone the Repository

```bash
git clone https://github.com/SmithC05/Irctc.git
cd Irctc/nammarail
```

### Step 2: Set Up Backend

```bash
cd server
npm install
```

Create a `.env` file in the server directory:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
JWT_SECRET=your_super_secret_key_here_change_in_production
NODE_ENV=development
DATABASE_PATH=./db/nammarail.db
```

Start the backend:

```bash
# Development (with auto-reload via nodemon)
npm run dev

# OR Production
npm start
```

✅ Server running on `http://localhost:5000`

### Step 3: Set Up Frontend

In a new terminal:

```bash
cd ../client
npm install
npm run dev
```

✅ Frontend running on `http://localhost:5173`

### Step 4: Test the Application

1. Open browser: `http://localhost:5173`
2. Register a new account
3. Search and book trains
4. Check your PNR status

Test API health check:
```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "project": "NammaRail",
  "timestamp": "2026-05-17T..."
}
```

---

## 🌐 Deployment Guide

### Option 1: Deploy on Render (Free Tier Available) ⭐ Recommended

#### Backend Deployment

1. **Push to GitHub**
   ```bash
   git push origin master
   ```

2. **Create Render Account**
   - Visit [render.com](https://render.com)
   - Sign up with GitHub

3. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select `SmithC05/Irctc`

4. **Configure Service**
   - **Name**: `nammarail-api`
   - **Runtime**: Node
   - **Build Command**: 
     ```bash
     cd nammarail/server && npm install
     ```
   - **Start Command**: 
     ```bash
     npm start
     ```

5. **Add Environment Variables**
   - Click "Environment"
   - Add variables:
     ```
     PORT=5000
     CLIENT_URL=https://your-frontend.onrender.com
     JWT_SECRET=your_secure_random_key
     NODE_ENV=production
     ```

6. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (2-3 minutes)
   - Your API URL: `https://nammarail-api.onrender.com`

#### Frontend Deployment

1. **Create Static Site**
   - On Render: "New +" → "Static Site"
   - Connect repository

2. **Configure**
   - **Name**: `nammarail-app`
   - **Build Command**: 
     ```bash
     cd nammarail/client && npm install && npm run build
     ```
   - **Publish Directory**: `nammarail/client/dist`

3. **Add Environment Variables**
   - `VITE_API_URL=https://nammarail-api.onrender.com`

4. **Deploy**
   - Click "Create Static Site"
   - Your app URL: `https://nammarail-app.onrender.com`

---

### Option 2: Deploy on Railway.app

1. **Create Account**: [railway.app](https://railway.app)

2. **Backend Setup**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `SmithC05/Irctc`

3. **Add Service Configuration**
   - Root Directory: `nammarail/server`
   - Railway auto-detects Node.js
   - Set environment variables in Railway dashboard

4. **Get Backend URL**
   - Railway provides a public URL automatically

5. **Frontend**
   - Add another service for frontend
   - Root Directory: `nammarail/client`
   - Build: `npm install && npm run build`

---

### Option 3: Deploy on Vercel (Frontend Only)

1. **Sign Up**: [vercel.com](https://vercel.com)

2. **Import Project**
   - Click "New Project"
   - Import your GitHub repository

3. **Configuration**
   - **Root Directory**: `nammarail/client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

4. **Environment**
   - Add `VITE_API_URL` with your backend URL

5. **Deploy** ✅

---

### Option 4: Docker Deployment (Production)

#### Create Docker Files

**`nammarail/server/Dockerfile`**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000
CMD ["npm", "start"]
```

**`nammarail/client/Dockerfile`**
```dockerfile
FROM node:18-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**`docker-compose.yml`** (root directory)
```yaml
version: '3.8'

services:
  backend:
    build: ./nammarail/server
    ports:
      - "5000:5000"
    environment:
      - PORT=5000
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
    restart: unless-stopped

  frontend:
    build: ./nammarail/client
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
```

**Run locally:**
```bash
docker-compose up -d
```

---

## 📡 API Routes

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Server health check | ❌ |
| POST | `/api/auth/register` | Create new user | ❌ |
| POST | `/api/auth/login` | User login | ❌ |
| GET | `/api/trains/search` | Search trains | ✅ |
| POST | `/api/bookings` | Create booking | ✅ |
| GET | `/api/bookings/:pnr` | Get booking by PNR | ✅ |
| GET | `/api/bookings/user/:id` | Get user bookings | ✅ |
| DELETE | `/api/bookings/:id` | Cancel booking | ✅ |

---

## 🚂 Supported Tamil Nadu Routes

- Chennai Central → Coimbatore
- Chennai → Madurai
- Chennai → Trichy
- Coimbatore → Madurai
- Chennai → Salem
- Trichy → Thanjavur
- Bangalore → Chennai
- Salem → Kanyakumari

---

## 🔧 Development Commands

### Backend
```bash
cd nammarail/server

# Development with hot reload
npm run dev

# Production
npm start

# Run tests
npm test

# Format code
npm run format
```

### Frontend
```bash
cd nammarail/client

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

---

## 🐛 Troubleshooting

### Port 5000 already in use
```bash
# Find and kill the process
lsof -i :5000
kill -9 <PID>
```

### CORS Issues
- Check `.env` file `CLIENT_URL` matches your frontend URL
- Ensure frontend and backend are running on correct ports

### SQLite Lock Error
- Close all running instances
- Delete `nammarail.db` and restart server (data will reset)

### Module Not Found
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 📦 Environment Variables Reference

### Backend (.env)
```env
PORT=5000
CLIENT_URL=http://localhost:5173
JWT_SECRET=your_secret_key_min_32_chars
NODE_ENV=development
DATABASE_PATH=./db/nammarail.db
JWT_EXPIRES_IN=7d
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=NammaRail
```

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 📞 Support & Contact

- **GitHub Issues**: [Report a bug](https://github.com/SmithC05/Irctc/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/SmithC05/Irctc/discussions)
- **Author**: [@SmithC05](https://github.com/SmithC05)

---

## 🎯 Roadmap

- [ ] Payment gateway integration (Stripe/Razorpay)
- [ ] SMS notifications
- [ ] Email confirmations
- [ ] Seat map visualization
- [ ] Admin dashboard
- [ ] Mobile app (React Native)
- [ ] Analytics dashboard
- [ ] Redis caching for train searches
- [ ] Multi-language support

---

<div align="center">

### ⭐ If you found this helpful, please star the repository!

Made with ❤️ by [SmithC05](https://github.com/SmithC05)

</div>
