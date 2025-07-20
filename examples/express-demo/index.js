const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'express-demo',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Hello from Cygni!',
    service: 'express-demo',
    version: '1.0.0',
    features: [
      'Auto-deployed to AWS Fargate',
      'HTTPS enabled',
      'Health checks configured',
      'Ready for production'
    ]
  });
});

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    region: process.env.AWS_REGION || 'unknown',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(port, () => {
  console.log(`Express demo app listening on port ${port}`);
  console.log(`Health check available at http://localhost:${port}/health`);
});