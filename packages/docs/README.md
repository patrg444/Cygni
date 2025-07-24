# Cygni Documentation

This is the official documentation site for Cygni, built with [Docusaurus](https://docusaurus.io/).

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Local Development

```bash
npm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Documentation Structure

```
docs/
├── intro.md                 # Introduction page
├── quickstart.md           # Quick start guide
├── getting-started/        # Getting started guides
├── deployment/             # Deployment documentation
├── configuration/          # Configuration guides
├── frameworks/             # Framework-specific guides
├── security/               # Security documentation
├── monitoring/             # Monitoring and metrics
├── teams/                  # Team management
├── cli/                    # CLI reference
└── api/                    # API reference
```

## Writing Documentation

### Front Matter

All documentation files should include front matter:

```markdown
---
sidebar_position: 1
title: My Document
description: A brief description
---
```

### Code Examples

Use language-specific code blocks:

````markdown
```bash
cygni deploy
```

```javascript
const deployment = await cygni.deploy({
  project: 'my-app'
});
```
````

### Admonitions

Use admonitions for important information:

```markdown
:::tip
This is a helpful tip!
:::

:::warning
Be careful with this operation.
:::

:::danger
This action cannot be undone.
:::
```

### Links

- Internal links: `[Quick Start](/docs/quickstart)`
- External links: `[GitHub](https://github.com/patrg444/Cygni)`

## Adding New Pages

1. Create a new `.md` file in the appropriate directory
2. Add front matter with `sidebar_position`
3. Update `sidebars.ts` if needed
4. Write your content using Markdown

## Deployment

The documentation is automatically deployed when changes are pushed to the main branch.

### Manual Deployment

```bash
npm run build
npm run serve
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

### Style Guide

- Use clear, concise language
- Include code examples where helpful
- Add screenshots for UI-related docs
- Keep paragraphs short and scannable
- Use proper heading hierarchy

## Resources

- [Docusaurus Documentation](https://docusaurus.io/docs)
- [Markdown Guide](https://www.markdownguide.org/)
- [MDX Documentation](https://mdxjs.com/)