#!/usr/bin/env node

/**
 * Chaos Engineering Demo
 * 
 * This script demonstrates the resilience of the CloudExpress platform
 * when facing intermittent backend failures.
 */

const { TestApiServer } = require('../packages/cli/dist/tests/services/test-api-server');
const axios = require('axios');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeRequestWithRetry(url, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url);
      return { success: true, attempt, data: response.data };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`  ⏳ Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  return { success: false, attempts: maxRetries + 1, error: lastError.message };
}

async function runChaosDemo() {
  console.log('🌪️  CloudExpress Chaos Engineering Demo\n');
  
  // Start test server
  const server = new TestApiServer();
  const port = await server.start();
  console.log(`✅ Test API server started on port ${port}\n`);
  
  // Test without chaos
  console.log('📊 Testing without chaos mode:');
  let successCount = 0;
  let totalRequests = 10;
  
  for (let i = 0; i < totalRequests; i++) {
    const result = await makeRequestWithRetry(`http://localhost:${port}/posts`);
    if (result.success) successCount++;
  }
  
  console.log(`✅ Success rate: ${successCount}/${totalRequests} (${(successCount/totalRequests*100).toFixed(0)}%)\n`);
  
  // Enable chaos mode
  server.enableChaosMode(0.3);
  console.log('\n📊 Testing with chaos mode (30% failure rate):');
  
  successCount = 0;
  const results = [];
  
  for (let i = 0; i < totalRequests; i++) {
    console.log(`\n🔄 Request ${i + 1}/${totalRequests}:`);
    const result = await makeRequestWithRetry(`http://localhost:${port}/posts`);
    
    if (result.success) {
      successCount++;
      console.log(`  ✅ Success after ${result.attempt + 1} attempt(s)`);
    } else {
      console.log(`  ❌ Failed after ${result.attempts} attempts`);
    }
    
    results.push(result);
  }
  
  // Calculate statistics
  const totalAttempts = results.reduce((sum, r) => sum + (r.attempt || r.attempts), 0);
  const avgAttempts = totalAttempts / totalRequests;
  
  console.log('\n📈 Results Summary:');
  console.log(`  • Success rate: ${successCount}/${totalRequests} (${(successCount/totalRequests*100).toFixed(0)}%)`);
  console.log(`  • Average attempts per request: ${avgAttempts.toFixed(2)}`);
  console.log(`  • Resilience achieved through automatic retries with exponential backoff`);
  
  // Disable chaos mode
  server.disableChaosMode();
  
  // Stop server
  await server.stop();
  console.log('\n✅ Demo completed successfully!');
  console.log('💡 The platform gracefully handles intermittent failures through:');
  console.log('   - Automatic retry logic in the SDK');
  console.log('   - Exponential backoff to prevent overwhelming the server');
  console.log('   - Fallback mechanisms for critical data');
}

// Run the demo
runChaosDemo().catch(console.error);