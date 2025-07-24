const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    project: process.env.PROJECT_ID || 'unknown'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Hello from shared infrastructure!',
    project: process.env.PROJECT_ID || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API endpoints
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Backend Service',
    project: process.env.PROJECT_ID || 'unknown',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Catch-all for unmatched routes
app.get('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path,
    project: process.env.PROJECT_ID || 'unknown'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Backend service listening on port ${port}`);
  console.log(`Project ID: ${process.env.PROJECT_ID || 'unknown'}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});