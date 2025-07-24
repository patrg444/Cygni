# Cygni Production Dashboard

A modern, real-time dashboard for monitoring and managing your Cygni platform.

## Features

- 📊 **Real-time Metrics**: Monitor key performance indicators
- 💰 **Billing Overview**: Track revenue and subscriptions
- 🚨 **Alert Management**: View and respond to system alerts
- 👥 **User Management**: Manage team members and permissions
- 📈 **Analytics**: Detailed insights into platform usage
- 🛡️ **Security Monitoring**: Track security events and compliance
- 📝 **Audit Logs**: Complete activity tracking
- 🔧 **System Health**: Monitor service uptime and performance

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **UI**: Tailwind CSS
- **Data Fetching**: React Query
- **Charts**: Recharts
- **Icons**: Lucide React
- **API Client**: Axios

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Cygni API running locally or accessible

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

### Development

```bash
# Run the development server
npm run dev

# Open http://localhost:3000
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
│   ├── dashboard/   # Dashboard-specific components
│   ├── layout/      # Layout components
│   └── ui/          # Reusable UI components
├── lib/             # Utilities and API client
└── styles/          # Global styles
```

## Key Components

### Dashboard Layout
- Sidebar navigation
- User profile section
- Responsive design

### Metrics Overview
- Real-time KPIs
- Trend indicators
- Interactive charts

### System Health
- Service status monitoring
- Uptime tracking
- Performance metrics

### Billing Overview
- MRR tracking
- Subscription analytics
- Churn rate monitoring

### Alerts Summary
- Critical alerts
- Warning notifications
- System events

## API Integration

The dashboard connects to the Cygni API for all data. Key endpoints:

- `/api/metrics/overview` - Platform metrics
- `/api/health` - System health status
- `/api/billing/overview` - Billing statistics
- `/api/audit/recent` - Recent activity
- `/api/alerts/active` - Active alerts

## Authentication

The dashboard uses JWT authentication. Users must log in through the Cygni API to access the dashboard.

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT