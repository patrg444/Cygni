# Cygni Examples

This directory contains example applications demonstrating how to deploy various frameworks and applications on Cygni.

## Available Examples

### Frontend Frameworks

- [Next.js App Router](./nextjs-app-router/) - Modern Next.js 15 with App Router
- [React SPA](./react-spa/) - Single Page Application with Vite
- [Vue.js](./vue-app/) - Vue 3 with Composition API
- [Static Site](./static-site/) - Pure HTML/CSS/JS

### Backend Applications

- [Express API](./express-api/) - RESTful API with Express.js
- [Fastify API](./fastify-api/) - High-performance API
- [GraphQL Server](./graphql-server/) - Apollo Server example
- [WebSocket Server](./websocket-server/) - Real-time communication

### Full-Stack Applications

- [Next.js + Prisma](./nextjs-prisma/) - Full-stack with database
- [T3 Stack](./t3-stack/) - TypeScript, Next.js, tRPC, Prisma
- [MERN Stack](./mern-stack/) - MongoDB, Express, React, Node.js

### Specialized Examples

- [Monorepo](./monorepo/) - Multiple apps in one repository
- [Docker Application](./docker-app/) - Containerized deployment
- [Python Flask](./python-flask/) - Python web application
- [Static Generator](./static-generator/) - Hugo/Jekyll site

## Quick Start

Each example includes:

- Complete source code
- `README.md` with deployment instructions
- Environment variable configuration
- Custom domain setup (where applicable)
- Performance optimization tips

## Deploying an Example

1. Clone the repository:

```bash
git clone https://github.com/patrg444/Cygni
cd Cygni/examples/[example-name]
```

2. Deploy with Cygni:

```bash
cygni deploy
```

3. Follow the example-specific README for additional configuration.

## Contributing

We welcome contributions! To add a new example:

1. Create a new directory under `examples/`
2. Include a complete, working application
3. Add comprehensive README with deployment steps
4. Test the deployment process
5. Submit a pull request

## Support

- Documentation: https://docs.cygni.dev
- Discord: https://discord.gg/cygni
- Issues: https://github.com/patrg444/Cygni/issues
