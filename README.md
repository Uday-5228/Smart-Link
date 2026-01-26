#  Smart Link Hub

> A modern, full-stack link management platform for creating dynamic, personalized link pages with smart display rules, real-time analytics, and QR code generation.

![Landing Page](screenshots/landing.png)

---

##  Deployment Details

| Service | URL |
|---------|-----|
| **Live Application** | [https://smart-link-hub-3fph.onrender.com](https://smart-link-hub-3fph.onrender.com) |
| **Backend API** | [https://smart-link-hub-api.onrender.com](https://smart-link-hub-api.onrender.com) |
| **GitHub Repository** | [https://github.com/Shubham-Nemade-24/Smart-Link](https://github.com/Shubham-Nemade-24/Smart-Link) |

---

##  Solution Overview

**Smart Link Hub** solves the problem of creating and managing personalized link pages (similar to Linktree) with advanced features:

### Problem Statement
Content creators, businesses, and professionals need a single, shareable link that consolidates all their online presence. Existing solutions lack smart targeting and analytics.

### Our Solution
Smart Link Hub provides:
- **Dynamic Link Pages**: Create beautiful, branded link pages in minutes
- **Smart Display Rules**: Show different links based on time, device, or location
- **Real-Time Analytics**: Track clicks, views, and user engagement
- **QR Code Generation**: Easily share your link page offline

### Key Differentiators
1. **Smart Rules Engine**: Time-based and device-based conditional link display
2. **Complete Analytics**: Detailed insights with CSV export
3. **Modern Stack**: Built with React, Express.js, and PostgreSQL
4. **Free Deployment**: Works on Render's free tier

---

##  Features

###  Link Hub Management
- Create unlimited personalized link pages
- Drag-and-drop link reordering
- Custom icons for each link (emoji support)
- Enable/disable links without deleting

###  Smart Display Rules
- **Time-based rules**: Show links only during specific hours (e.g., business hours only)
- **Device-based rules**: Display different links for mobile, tablet, or desktop users

###  Real-Time Analytics Dashboard
![Dashboard](screenshots/dashboard.png)
- Track page views and link clicks
- Device breakdown visualization
- Interactive charts with daily/weekly/monthly views
- Export analytics data as CSV

###  Custom Themes
- Default (Black/Green)
- Midnight Purple
- Ocean Teal
- Sunset Red

###  QR Code Generation
- Generate QR codes for any hub
- Download as PNG for print materials

---

##  Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, React Router, Vanilla CSS |
| **Backend** | Express.js, Node.js |
| **Database** | PostgreSQL with pg connection pooling |
| **Authentication** | Token-based authentication |
| **Deployment** | Render (Static Site + Web Service + PostgreSQL) |
| **Other** | QRCode.js, UUID |

---

##  Project Structure

```
smart-link-hub/
├── src/                    # Frontend source code
│   ├── pages/
│   │   ├── Landing.jsx     # Home/marketing page
│   │   ├── Login.jsx       # Authentication (login/register)
│   │   ├── Dashboard.jsx   # User dashboard with hub management
│   │   ├── HubEditor.jsx   # Create/edit hubs with drag-drop
│   │   ├── Analytics.jsx   # Analytics dashboard with charts
│   │   └── PublicHub.jsx   # Public-facing link page
│   ├── api.js              # API URL configuration
│   ├── App.jsx             # Main app with routing & context
│   ├── main.jsx            # Entry point
│   └── index.css           # Global styles & themes
├── server/
│   └── index.js            # Express API server (all endpoints)
├── screenshots/            # Project screenshots
├── docs/
│   └── API.md              # API documentation
├── package.json
├── vite.config.js
└── README.md
```

---

##  Setup & Installation

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Git

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Shubham-Nemade-24/Smart-Link.git
   cd Smart-Link
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up PostgreSQL database**
   ```bash
   # Create database (if using local PostgreSQL)
   createdb smartlinkhub
   ```

4. **Configure environment variables**
   ```bash
   # Create .env file
   cp .env.example .env
   
   # Edit .env and set:
   # DATABASE_URL=postgresql://localhost/smartlinkhub
   # VITE_API_URL=  (leave empty for local)
   ```

5. **Start the development servers**

   **Terminal 1 - Backend:**
   ```bash
   DATABASE_URL="postgresql://localhost/smartlinkhub" npm run server
   ```

   **Terminal 2 - Frontend:**
   ```bash
   npm run dev
   ```

6. **Open in browser**
   ```
   http://localhost:5173
   ```

### Production Deployment on Render

See [Deployment Guide](#-deployment-on-render) below.

---

##  API Documentation

Full API documentation is available in [docs/API.md](docs/API.md).

### Quick Reference

#### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login and get token |

#### Hubs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/hubs` | List all user hubs |
| `POST` | `/api/hubs` | Create new hub |
| `GET` | `/api/hubs/:id` | Get hub details |
| `PUT` | `/api/hubs/:id` | Update hub |
| `DELETE` | `/api/hubs/:id` | Delete hub |
| `GET` | `/api/hubs/:id/qr` | Generate QR code |

#### Public Access
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/public/:slug` | Get public hub by slug |

#### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analytics/track` | Track view/click event |
| `GET` | `/api/analytics/:hubId` | Get hub analytics |
| `GET` | `/api/analytics/:hubId/export` | Export CSV/JSON |

---

##  Deployment on Render

### Step 1: Create PostgreSQL Database
1. Go to [render.com](https://render.com) → New → PostgreSQL
2. Select Free plan
3. Copy **Internal Database URL**

### Step 2: Deploy Backend (Web Service)
1. New → Web Service → Connect GitHub repo
2. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = *(Internal Database URL)*

### Step 3: Deploy Frontend (Static Site)
1. New → Static Site → Connect GitHub repo
2. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
3. Add Environment Variable:
   - `VITE_API_URL` = *(Backend URL from Step 2)*

---

##  Screenshots

### Landing Page
![Landing](screenshots/landing.png)

### Dashboard
![Dashboard](screenshots/dashboard.png)

### Hub Created
![Hub](screenshots/hub-created.png)

---

##  Environment Variables

### Backend
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NODE_ENV` | Yes | `production` or `development` |
| `PORT` | No | Server port (default: 3001) |
| `FRONTEND_URL` | No | Frontend URL for CORS |

### Frontend
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes* | Backend API URL (*required for production) |

---

##  Usage Instructions

### Creating Your First Hub

1. **Register/Login**: Create an account or login
2. **Create Hub**: Click "Create Hub" button
3. **Add Details**: Enter title, slug, and description
4. **Add Links**: Click "Add Link" and enter URL and title
5. **Add Rules** (Optional): Click ⚙️ to add time/device rules
6. **Save**: Click "Create Hub" to publish
7. **Share**: Copy your public URL or download QR code

### Viewing Analytics

1. Go to Dashboard
2. Click "Analytics" on any hub
3. View charts, device breakdown, and top performers
4. Export data as CSV if needed

---

##  Git Commit Practices

This project follows conventional commit practices for clear and trackable history.

### Commit Message Format
```
<type>: <short description>

[optional body]
```

### Commit Types
| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Examples
```bash
feat: Add QR code generation for hubs
fix: Resolve CORS issue in production deployment
docs: Update README with deployment instructions
refactor: Migrate database from SQLite to PostgreSQL
style: Format code with consistent indentation
chore: Update dependencies
```

### Commit History Highlights
- `feat: Initial Smart Link Hub implementation`
- `feat: Add smart display rules (time/device-based)`
- `feat: Implement real-time analytics dashboard`
- `refactor: Migrate from SQLite to PostgreSQL`
- `fix: Configure CORS for production deployment`
- `docs: Add comprehensive README and API documentation`

---

##  Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/NewFeature`)
3. Commit changes (`git commit -m 'feat: Add NewFeature'`)
4. Push to branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

##  Authors

**Uday Patil**, 
**Shubham Nemade**, 
**Shivraj Patil**

---
Thank you !
Star this repo if you found it helpful!
