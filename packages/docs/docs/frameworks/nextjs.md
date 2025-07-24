---
sidebar_position: 1
---

# Deploy Next.js Apps

Cygni provides first-class support for Next.js applications with zero configuration needed.

## Quick Deploy

Deploy any Next.js app with a single command:

```bash
cygni deploy
```

Cygni automatically:
- Detects Next.js version
- Builds your application
- Optimizes for production
- Deploys globally with CDN

## Features

### 🚀 Server-Side Rendering (SSR)
Full support for Next.js SSR and API routes with automatic scaling.

### 📦 Static Site Generation (SSG)
Pre-rendered pages are served from our global CDN for maximum performance.

### 🔄 Incremental Static Regeneration (ISR)
ISR pages update automatically based on your revalidation settings.

### 🖼️ Image Optimization
Next.js Image component works out of the box with automatic optimization.

### 🌍 Internationalization
i18n routing is fully supported with locale detection.

## Project Structure

Standard Next.js project structure:

```
my-nextjs-app/
├── pages/           # or app/ for App Router
├── public/
├── styles/
├── components/
├── next.config.js
└── package.json
```

## Configuration

### next.config.js

Your existing Next.js configuration works without changes:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['example.com'],
  },
  i18n: {
    locales: ['en', 'fr', 'de'],
    defaultLocale: 'en',
  },
}

module.exports = nextConfig
```

### Environment Variables

Set environment variables for your Next.js app:

```bash
# Set build-time variables
cygni env set NEXT_PUBLIC_API_URL=https://api.example.com

# Set runtime variables
cygni env set DATABASE_URL=postgresql://...
```

### Build Settings

Customize build settings in `cygni.json`:

```json
{
  "framework": "nextjs",
  "build": {
    "command": "npm run build",
    "output": ".next"
  },
  "env": {
    "NODE_ENV": "production"
  }
}
```

## App Router Support

Full support for Next.js 13+ App Router:

```typescript
// app/page.tsx
export default function Home() {
  return <h1>Welcome to Cygni!</h1>
}

// app/api/hello/route.ts
export async function GET() {
  return Response.json({ message: 'Hello from Cygni!' })
}
```

## API Routes

API routes work seamlessly:

```typescript
// pages/api/users.ts or app/api/users/route.ts
export default async function handler(req, res) {
  const users = await getUsers()
  res.status(200).json(users)
}
```

## Middleware

Edge middleware runs close to your users:

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
 
export function middleware(request) {
  return NextResponse.redirect(new URL('/home', request.url))
}
 
export const config = {
  matcher: '/about/:path*',
}
```

## Database Connections

Use connection pooling for serverless:

```typescript
// lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

## Performance Optimization

### Automatic Optimizations

- Static assets served from CDN
- Brotli compression
- HTTP/2 push
- Smart caching headers

### Manual Optimizations

```javascript
// next.config.js
module.exports = {
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  
  // Optimize for Cygni
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['lodash', 'date-fns'],
  },
}
```

## Common Patterns

### Authentication

```typescript
// Using NextAuth.js
import NextAuth from 'next-auth'
import GithubProvider from 'next-auth/providers/github'

export default NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    })
  ],
})
```

### Data Fetching

```typescript
// App Router
async function getData() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 } // Revalidate every hour
  })
  return res.json()
}

export default async function Page() {
  const data = await getData()
  return <div>{data.title}</div>
}
```

## Monitoring

View Next.js-specific metrics:

```bash
# View build output
cygni logs --build

# Monitor server logs
cygni logs --runtime

# Check performance
cygni metrics
```

## Troubleshooting

### Build Failures

```bash
# Check build logs
cygni logs --build --verbose

# Common fixes:
# 1. Ensure all dependencies are in package.json
# 2. Check for missing environment variables
# 3. Verify next.config.js syntax
```

### Runtime Errors

```bash
# Stream live logs
cygni logs --follow

# Filter errors
cygni logs --level error
```

### Performance Issues

1. Enable caching for data fetching
2. Use static generation where possible
3. Optimize images and fonts
4. Minimize client-side JavaScript

## Example Projects

- [Next.js Blog](https://github.com/cygni/examples/tree/main/nextjs-blog)
- [E-commerce Store](https://github.com/cygni/examples/tree/main/nextjs-commerce)
- [SaaS Starter](https://github.com/cygni/examples/tree/main/nextjs-saas)

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Cygni Next.js Examples](https://github.com/cygni/examples)
- [Performance Best Practices](/docs/monitoring/performance)