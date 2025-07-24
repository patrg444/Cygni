# Next.js App Router Example

A modern Next.js 15 application using the App Router, demonstrating best practices for deploying on Cygni.

## Features

- Next.js 15 with App Router
- React Server Components
- TypeScript
- Tailwind CSS
- SEO optimized
- API routes
- Environment variables
- Database connection example

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
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

### With Environment Variables

```bash
# Add production environment variables
cygni env add NEXT_PUBLIC_API_URL "https://api.example.com" --production
cygni env add DATABASE_URL "postgresql://..." --production --encrypted

# Deploy to production
cygni deploy --prod
```

### Custom Domain

```bash
# Add custom domain
cygni domains add app.yourdomain.com

# Verify DNS configuration
cygni domains verify app.yourdomain.com
```

## Project Structure

```
├── app/
│   ├── api/          # API routes
│   ├── components/   # React components
│   ├── layout.tsx    # Root layout
│   └── page.tsx      # Home page
├── public/           # Static assets
├── lib/              # Utility functions
└── next.config.js    # Next.js configuration
```

## Environment Variables

| Variable               | Description                  | Required |
| ---------------------- | ---------------------------- | -------- |
| `NEXT_PUBLIC_API_URL`  | Public API endpoint          | Yes      |
| `DATABASE_URL`         | PostgreSQL connection string | Yes      |
| `NEXT_PUBLIC_SITE_URL` | Production site URL          | No       |

## Performance Optimization

This example includes:

- Image optimization with next/image
- Font optimization with next/font
- Static generation where possible
- API route caching
- Bundle size optimization

## Monitoring

After deployment:

```bash
# View real-time logs
cygni logs --follow

# Check performance metrics
cygni performance

# Set up alerts
cygni alerts create --type error-rate --threshold 1%
```

## Common Issues

### Build Failures

- Ensure all dependencies are in `package.json`
- Check for TypeScript errors: `npm run type-check`
- Verify environment variables are set

### Performance Issues

- Enable static generation for pages
- Use dynamic imports for large components
- Implement proper caching strategies

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Cygni Documentation](https://docs.cygni.dev)
- [Deploy Next.js on Cygni](https://docs.cygni.dev/frameworks/nextjs)
