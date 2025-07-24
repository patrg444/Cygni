import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // Main documentation sidebar
  tutorialSidebar: [
    'intro',
    'quickstart',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/first-deployment',
        'getting-started/concepts',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: [
        'deployment/overview',
        'deployment/build-process',
        'deployment/environments',
        'deployment/rollbacks',
      ],
    },
    {
      type: 'category',
      label: 'Configuration',
      items: [
        'configuration/environment-variables',
        'configuration/secrets',
        'configuration/domains',
        'configuration/ssl-certificates',
      ],
    },
    {
      type: 'category',
      label: 'Frameworks',
      items: [
        'frameworks/nextjs',
        'frameworks/react',
        'frameworks/vue',
        'frameworks/express',
        'frameworks/static',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      items: [
        'security/overview',
        'security/authentication',
        'security/rbac',
        'security/audit-logs',
        'security/compliance',
      ],
    },
    {
      type: 'category',
      label: 'Monitoring',
      items: [
        'monitoring/metrics',
        'monitoring/logs',
        'monitoring/alerts',
        'monitoring/performance',
      ],
    },
    {
      type: 'category',
      label: 'Team Management',
      items: [
        'teams/overview',
        'teams/members',
        'teams/permissions',
        'teams/billing',
      ],
    },
    'troubleshooting',
    'faq',
  ],
  
  // CLI Reference sidebar
  cliSidebar: [
    'cli/overview',
    'cli/installation',
    {
      type: 'category',
      label: 'Commands',
      items: [
        'cli/deploy',
        'cli/list',
        'cli/logs',
        'cli/env',
        'cli/domains',
        'cli/delete',
        'cli/rollback',
      ],
    },
    'cli/configuration',
    'cli/troubleshooting',
  ],
  
  // API Reference sidebar
  apiSidebar: [
    'api/overview',
    'api/authentication',
    'api/rate-limits',
    {
      type: 'category',
      label: 'Endpoints',
      items: [
        'api/projects',
        'api/deployments',
        'api/domains',
        'api/env',
        'api/teams',
        'api/billing',
        'api/metrics',
        'api/logs',
        'api/audit',
        'api/webhooks',
      ],
    },
    'api/errors',
    'api/sdks',
  ],
};

export default sidebars;
