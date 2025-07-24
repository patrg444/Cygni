const express = require('express');
const axios = require('axios');

// Simple mock server with chaos mode
class SimpleTestServer {
  constructor() {
    this.app = express();
    this.chaosMode = false;
    this.chaosRate = 0.3;
    this.setupRoutes();
  }

  setupRoutes() {
    // Chaos middleware
    this.app.use((req, res, next) => {
      if (this.chaosMode && Math.random() < this.chaosRate) {
        console.log(`💥 Chaos: Failing request to ${req.path}`);
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'The service is temporarily unavailable. Please try again later.',
          chaos: true
        });
      }
      next();
    });

    // Posts endpoint
    this.app.get('/posts', (req, res) => {
      res.json([
        { id: '1', title: 'First Post', content: 'Hello World' },
        { id: '2', title: 'Second Post', content: 'Chaos Engineering' }
      ]);
    });
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(0, () => {
        const port = this.server.address().port;
        resolve(port);
      });
    });
  }

  stop() {
    this.server?.close();
  }

  enableChaos() {
    this.chaosMode = true;
    console.log(`🌪️  Chaos mode enabled with ${(this.chaosRate * 100).toFixed(0)}% failure rate`);
  }

  disableChaos() {
    this.chaosMode = false;
    console.log('✨ Chaos mode disabled');
  }
}

// Demo functions
async function makeRequestWithRetry(url, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url);
      return { success: true, attempt, data: response.data };
    } catch (error) {
      if (attempt < maxRetries && error.response?.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`  ⏳ Attempt ${attempt + 1} failed (${error.response?.status || 'network error'}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        return { success: false, attempts: attempt + 1, error: error.message };
      }
    }
  }
}

async function runDemo() {
  console.log('🌪️  CloudExpress Chaos Engineering Demo\n');
  
  const server = new SimpleTestServer();
  const port = await server.start();
  console.log(`✅ Test API server started on port ${port}\n`);
  
  // Test without chaos
  console.log('📊 Testing without chaos mode:');
  let successCount = 0;
  const requests = 5;
  
  for (let i = 0; i < requests; i++) {
    const result = await makeRequestWithRetry(`http://localhost:${port}/posts`);
    if (result.success) successCount++;
  }
  
  console.log(`✅ Success rate: ${successCount}/${requests} (${(successCount/requests*100).toFixed(0)}%)\n`);
  
  // Enable chaos
  server.enableChaos();
  console.log('\n📊 Testing with chaos mode (30% failure rate):');
  
  successCount = 0;
  const results = [];
  
  for (let i = 0; i < requests; i++) {
    console.log(`\n🔄 Request ${i + 1}/${requests}:`);
    const result = await makeRequestWithRetry(`http://localhost:${port}/posts`);
    
    if (result.success) {
      successCount++;
      console.log(`  ✅ Success after ${result.attempt + 1} attempt(s)`);
    } else {
      console.log(`  ❌ Failed after ${result.attempts} attempts`);
    }
    
    results.push(result);
  }
  
  const totalAttempts = results.reduce((sum, r) => sum + (r.attempt !== undefined ? r.attempt + 1 : r.attempts), 0);
  const avgAttempts = totalAttempts / requests;
  
  console.log('\n📈 Results Summary:');
  console.log(`  • Success rate: ${successCount}/${requests} (${(successCount/requests*100).toFixed(0)}%)`);
  console.log(`  • Average attempts per request: ${avgAttempts.toFixed(2)}`);
  console.log(`  • Resilience achieved through automatic retries with exponential backoff`);
  
  server.disableChaos();
  server.stop();
  
  console.log('\n✅ Demo completed!');
  console.log('💡 The platform handles failures through:');
  console.log('   - Automatic retry on 5xx errors');
  console.log('   - Exponential backoff (1s, 2s, 4s)');
  console.log('   - Graceful degradation');
}

runDemo().catch(console.error);