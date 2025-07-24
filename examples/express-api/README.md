# Express API Example

A production-ready Express.js API demonstrating best practices for deploying on Cygni.

## Features

- Express.js with TypeScript
- RESTful API design
- JWT authentication
- Rate limiting
- CORS configuration
- Database integration (PostgreSQL)
- Health checks
- Structured logging
- API documentation

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
JWT_SECRET=your-secret-key
NODE_ENV=development
```

3. Run development server:

```bash
npm run dev
```

## Deploy to Cygni

### Quick Deploy

```bash
cygni deploy
```

### Production Deployment

```bash
# Set environment variables
cygni env add DATABASE_URL "postgresql://..." --production --encrypted
cygni env add JWT_SECRET "production-secret" --production --encrypted
cygni env add NODE_ENV "production" --production

# Deploy
cygni deploy --prod
```

### API Endpoint

Your API will be available at:

- Preview: `https://[project-name]-[hash].cygni.app`
- Production: `https://[project-name].cygni.app`

## Project Structure

```
├── src/
│   ├── routes/       # API routes
│   ├── middleware/   # Express middleware
│   ├── services/     # Business logic
│   ├── models/       # Database models
│   ├── utils/        # Utility functions
│   └── index.ts      # Entry point
├── tests/            # Test files
└── package.json
```

## API Endpoints

| Method | Endpoint         | Description                |
| ------ | ---------------- | -------------------------- |
| GET    | `/health`        | Health check               |
| POST   | `/auth/register` | User registration          |
| POST   | `/auth/login`    | User login                 |
| GET    | `/users`         | List users (authenticated) |
| GET    | `/users/:id`     | Get user by ID             |
| PUT    | `/users/:id`     | Update user                |
| DELETE | `/users/:id`     | Delete user                |

## Environment Variables

| Variable         | Description                          | Required |
| ---------------- | ------------------------------------ | -------- |
| `PORT`           | Server port (default: 3000)          | No       |
| `DATABASE_URL`   | PostgreSQL connection string         | Yes      |
| `JWT_SECRET`     | Secret for JWT signing               | Yes      |
| `NODE_ENV`       | Environment (development/production) | Yes      |
| `RATE_LIMIT_MAX` | Max requests per window              | No       |

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting per IP
- CORS configuration
- SQL injection prevention
- Input validation

## Testing

Run tests locally:

```bash
npm test
```

## Monitoring

After deployment:

```bash
# View logs
cygni logs --follow

# Check API health
curl https://your-api.cygni.app/health

# Monitor performance
cygni metrics --metric response-time

# Set up alerts
cygni alerts create --type response-time --threshold 500ms
```

## Scaling

Cygni automatically scales your API based on traffic. For manual scaling:

```bash
# View current scaling
cygni status

# Force scale (Enterprise plan)
cygni scale --instances 3
```

## Common Issues

### Connection Timeouts

- Check DATABASE_URL is correct
- Ensure database allows connections from Cygni IPs
- Verify connection pool settings

### High Response Times

- Add database indexes
- Implement caching with Redis
- Use connection pooling

### Authentication Errors

- Verify JWT_SECRET is set
- Check token expiration settings
- Ensure CORS is properly configured

## Learn More

- [Express Documentation](https://expressjs.com/)
- [Cygni API Docs](https://docs.cygni.dev/frameworks/express)
- [REST API Best Practices](https://docs.cygni.dev/guides/rest-api)
