# Full-Stack Demo App

A complete todo application showcasing Cygni's ability to deploy full-stack applications with:
- **Frontend**: React + Vite
- **Backend**: Express API
- **Database**: SQLite
- **Production**: Single container serving both frontend and API

## 🚀 Deploy to AWS in 3 Minutes

```bash
cx deploy --aws --name my-todo-app
```

That's it! You'll get:
- ✅ HTTPS endpoint
- ✅ Auto-scaling
- ✅ Health monitoring
- ✅ Persistent SQLite database
- ✅ Production-optimized build

## 🏃 Local Development

```bash
# Install dependencies
npm install

# Run both frontend and backend
npm run dev

# Frontend: http://localhost:3000
# Backend: http://localhost:3001
```

## 📁 Project Structure

```
fullstack-demo/
├── frontend/          # React app
│   ├── src/
│   └── vite.config.js
├── backend/           # Express API
│   └── index.js
├── Dockerfile         # Multi-stage build
└── package.json       # Workspace root
```

## 🔧 How It Works

1. **Development**: Frontend (Vite) proxies API calls to backend
2. **Production**: Backend serves built frontend as static files
3. **Database**: SQLite file persists in container volume

## 🌟 Features

- **Todo Management**: Create, complete, delete todos
- **Real-time Stats**: Track progress
- **API Health Check**: Monitor backend status
- **Responsive Design**: Works on all devices

## 🔗 API Endpoints

- `GET /health` - Health check
- `GET /api/todos` - List todos
- `POST /api/todos` - Create todo
- `PATCH /api/todos/:id` - Update todo
- `DELETE /api/todos/:id` - Delete todo
- `GET /api/stats` - Get statistics

## 🎯 Perfect for Demos

This app demonstrates:
- Full-stack deployment simplicity
- Database persistence
- Production best practices
- Zero-config HTTPS