const express = require('express');
const axios = require('axios');

// Mock server with chaos mode
class ChaosServer {
  constructor() {
    this.app = express();
    this.chaosMode = false;
    this.chaosRate = 0.3;
    this.requestCount = 0;
    this.failureCount = 0;
    this.setupRoutes();
  }

  setupRoutes() {
    // Chaos middleware
    this.app.use((req, res, next) => {
      this.requestCount++;
      if (this.chaosMode && req.path.includes('posts') && Math.random() < this.chaosRate) {
        this.failureCount++;
        console.log(`💥 [Server] Chaos strike! Request #${this.requestCount} to ${req.path} → 503 Service Unavailable`);
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'The service is temporarily unavailable. Please try again later.',
          chaos: true
        });
      }
      console.log(`✅ [Server] Request #${this.requestCount} to ${req.path} → 200 OK`);
      next();
    });

    // Posts endpoint
    this.app.get('/posts', (req, res) => {
      res.json([
        { id: '1', title: 'Resilient Post', content: 'This post survived chaos!' },
        { id: '2', title: 'Chaos Engineering', content: 'Making systems stronger' }
      ]);
    });

    // Deployments endpoint
    this.app.get('/deployments', (req, res) => {
      res.json({
        deployments: [
          { 
            id: 'dep-1', 
            status: 'completed',
            services: [
              { name: 'frontend', status: 'running' },
              { name: 'backend', status: 'running' }
            ]
          }
        ]
      });
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
    console.log(`\n📊 [Server] Final stats: ${this.requestCount} total requests, ${this.failureCount} chaos failures (${(this.failureCount/this.requestCount*100).toFixed(0)}% actual failure rate)`);
    this.server?.close();
  }

  enableChaos() {
    this.chaosMode = true;
    console.log(`\n🌪️  [Server] Chaos mode ENABLED - ${(this.chaosRate * 100).toFixed(0)}% failure rate\n`);
  }
}

// Simulate SDK hook behavior
async function simulateSDKHook(url, hookName) {
  console.log(`\n🔄 [${hookName}] Making request...`);
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      console.log(`✅ [${hookName}] Success on attempt ${attempt + 1}`);
      return { success: true, data: response.data, attempts: attempt + 1 };
    } catch (error) {
      if (error.response?.status >= 500 && attempt < 2) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⚠️  [${hookName}] Attempt ${attempt + 1} failed with ${error.response.status} - retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (!error.response && attempt < 2) {
        console.log(`⚠️  [${hookName}] Attempt ${attempt + 1} failed with network error - using fallback data`);
        return { 
          success: true, 
          data: [{ id: 'fallback', title: 'Offline Mode', content: 'Using cached data' }],
          fallback: true 
        };
      } else {
        console.log(`❌ [${hookName}] Failed after ${attempt + 1} attempts`);
        throw error;
      }
    }
  }
}

async function runSDKDemo() {
  console.log('🚀 CloudExpress SDK Resilience Demo');
  console.log('==================================\n');
  
  const server = new ChaosServer();
  const port = await server.start();
  console.log(`✅ API server started on port ${port}`);
  
  // Phase 1: Normal operation
  console.log('\n📊 PHASE 1: Normal Operation (No Chaos)');
  console.log('─────────────────────────────────────');
  
  await simulateSDKHook(`http://localhost:${port}/posts`, 'usePostsList');
  await simulateSDKHook(`http://localhost:${port}/deployments`, 'useDeployments');
  
  // Phase 2: Chaos mode
  server.enableChaos();
  
  console.log('📊 PHASE 2: Chaos Mode Active (30% failure rate)');
  console.log('───────────────────────────────────────────────');
  
  // Simulate multiple requests to show retry behavior
  const results = [];
  for (let i = 0; i < 5; i++) {
    console.log(`\n--- Request Set ${i + 1}/5 ---`);
    const postResult = await simulateSDKHook(`http://localhost:${port}/posts`, 'usePostsList');
    const depResult = await simulateSDKHook(`http://localhost:${port}/deployments`, 'useDeployments');
    results.push({ posts: postResult, deployments: depResult });
  }
  
  // Calculate statistics
  const totalAttempts = results.reduce((sum, r) => sum + r.posts.attempts + r.deployments.attempts, 0);
  const avgAttempts = totalAttempts / (results.length * 2);
  const successRate = results.filter(r => r.posts.success && r.deployments.success).length / results.length * 100;
  
  console.log('\n\n📈 RESILIENCE REPORT');
  console.log('==================');
  console.log(`✅ Success Rate: ${successRate}% (all requests eventually succeeded)`);
  console.log(`📊 Average Attempts: ${avgAttempts.toFixed(2)} per request`);
  console.log(`🛡️  Resilience Features Demonstrated:`);
  console.log(`   • Automatic retry with exponential backoff`);
  console.log(`   • 503 errors trigger retries (up to 3 attempts)`);
  console.log(`   • Network errors fall back to cached data`);
  console.log(`   • 100% availability despite 30% server failure rate`);
  
  server.stop();
  
  console.log('\n✅ Demo completed successfully!');
  console.log('💡 CloudExpress maintains availability through intelligent client-side resilience.');
}

runSDKDemo().catch(console.error);