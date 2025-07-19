// Generate test data for CloudExpress

const testData = {
  // Waitlist entries
  waitlistUsers: [
    { email: "alice@startup.com", source: "twitter" },
    { email: "bob@tech.io", source: "hackernews" },
    { email: "carol@dev.com", source: "landing" },
  ],

  // Usage events for budget testing
  usageEvents: [
    { metricType: "cpu_seconds", quantity: 3600000 }, // 1000 CPU hours
    { metricType: "memory_gb_hours", quantity: 1000 },
    { metricType: "egress_gb", quantity: 50 },
    { metricType: "requests", quantity: 10000000 }, // 10M requests
  ],

  // Deployment scenarios
  deployments: [
    {
      name: "healthy-deploy",
      errorRate: 0.5,
      p95Latency: 150,
      successRate: 99.5,
    },
    {
      name: "failing-deploy",
      errorRate: 7.2,
      p95Latency: 850,
      successRate: 92.8,
    },
  ],
};

console.log("Test data generated:", JSON.stringify(testData, null, 2));
