import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp up to 20 users over 10s
    { duration: '60s', target: 20 }, // Stay at 20 users for 60s
    { duration: '10s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.25'],   // Allow up to 25% failed requests (404s are expected)
    errors: ['rate<0.01'],            // Custom error rate must be below 1%
  },
};

// Test setup
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3333';
const PROJECT_ID = __ENV.PROJECT_ID || 'test-project';

// Helper function to generate random data
function generateRandomPost() {
  const randomId = Math.floor(Math.random() * 10000);
  return {
    title: `Performance Test Post ${randomId}`,
    content: `This is a test post created during load testing. ID: ${randomId}`,
    author: `k6-user-${__VU}`, // __VU is the virtual user ID
  };
}

function generateRandomDeployment() {
  const randomId = Math.floor(Math.random() * 10000);
  return {
    projectId: PROJECT_ID,
    environment: 'production',
    version: `v1.0.${randomId}`,
    status: 'pending',
    services: [
      {
        name: 'backend',
        status: 'deploying',
        url: `https://backend-${randomId}.test.com`,
      },
      {
        name: 'frontend',
        status: 'deploying',
        url: `https://frontend-${randomId}.test.com`,
      },
    ],
  };
}

export default function () {
  // Randomly choose between endpoints
  const choice = Math.random();
  
  if (choice < 0.4) {
    // 40% - GET posts
    const response = http.get(`${BASE_URL}/posts`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const success = check(response, {
      'GET /posts status is 200': (r) => r.status === 200,
      'GET /posts response time < 200ms': (r) => r.timings.duration < 200,
      'GET /posts has valid JSON': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body);
        } catch (e) {
          return false;
        }
      },
    });
    
    errorRate.add(!success);
    
  } else if (choice < 0.6) {
    // 20% - POST deployment (CloudExpress format)
    const payload = JSON.stringify({
      cloudexpressConfig: {
        services: [
          {
            name: 'backend',
            type: 'backend',
          },
          {
            name: 'frontend',
            type: 'frontend',
          },
        ],
      },
      environment: 'production',
      provider: 'cloudexpress',
    });
    
    const response = http.post(`${BASE_URL}/deployments`, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const success = check(response, {
      'POST /deployments status is 200': (r) => r.status === 200,
      'POST /deployments response time < 300ms': (r) => r.timings.duration < 300,
      'POST /deployments returns deployment ID': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.deploymentId !== undefined;
        } catch (e) {
          return false;
        }
      },
    });
    
    errorRate.add(!success);
    
  } else if (choice < 0.8) {
    // 20% - POST post
    const payload = JSON.stringify(generateRandomPost());
    
    const response = http.post(`${BASE_URL}/posts`, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const success = check(response, {
      'POST /posts status is 201': (r) => r.status === 201,
      'POST /posts response time < 300ms': (r) => r.timings.duration < 300,
      'POST /posts returns post ID': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.id !== undefined;
        } catch (e) {
          return false;
        }
      },
    });
    
    errorRate.add(!success);
    
  } else {
    // 20% - GET deployment status
    const deploymentId = `cx-deploy-${Math.floor(Math.random() * 1000)}`;
    const response = http.get(`${BASE_URL}/deployments/${deploymentId}/status`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // For status checks, 404 is expected for random IDs
    const success = check(response, {
      'GET /deployments/:id/status responds': (r) => r.status === 200 || r.status === 404,
      'GET /deployments/:id/status response time < 200ms': (r) => r.timings.duration < 200,
    });
    
    errorRate.add(!success);
  }
  
  // Small random sleep between requests (10-50ms)
  sleep(Math.random() * 0.04 + 0.01);
}

// Handle test summary
export function handleSummary(data) {
  const totalRequests = data.metrics.http_reqs.values.count;
  const duration = data.state.testRunDurationMs / 1000;
  const requestsPerSecond = totalRequests / duration;
  
  console.log('');
  console.log('=== Performance Test Summary ===');
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Duration: ${duration.toFixed(1)}s`);
  console.log(`Requests/sec: ${requestsPerSecond.toFixed(1)}`);
  console.log(`Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%`);
  console.log(`95th Percentile Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(0)}ms`);
  console.log('');
  
  // Return the default summary plus our custom data
  return {
    'stdout': JSON.stringify(data, null, 2),
    'summary.json': JSON.stringify({
      totalRequests,
      duration,
      requestsPerSecond,
      errorRate: data.metrics.errors.values.rate,
      p95ResponseTime: data.metrics.http_req_duration.values['p(95)'],
      thresholdsPassed: !data.thresholdFailures,
    }, null, 2),
  };
}