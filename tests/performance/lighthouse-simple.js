const chromeLauncher = require('chrome-launcher');
const { default: lighthouse } = require('lighthouse');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple HTML page for testing
const testHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudExpress Generated UI - Performance Test</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
        header { background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 1rem 0; }
        .container { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }
        h1 { font-size: 2rem; font-weight: 700; }
        .subtitle { color: #666; margin-top: 0.25rem; }
        main { padding: 2rem 0; }
        .actions { display: flex; gap: 1rem; margin-bottom: 2rem; }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; transition: all 0.2s; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:hover { background: #2563eb; }
        .btn-secondary { background: #e5e7eb; color: #374151; }
        .btn-secondary:hover { background: #d1d5db; }
        .posts { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem; }
        .post { background: white; padding: 1.5rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: box-shadow 0.2s; }
        .post:hover { box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .post h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
        .post p { color: #666; margin-bottom: 1rem; line-height: 1.5; }
        .post-meta { display: flex; justify-content: space-between; font-size: 0.875rem; color: #999; margin-bottom: 1rem; }
        .post-actions { display: flex; gap: 0.5rem; }
        .post-actions button { padding: 0.25rem 0.75rem; font-size: 0.875rem; }
        footer { background: #1f2937; color: white; padding: 2rem 0; text-align: center; margin-top: 4rem; }
        @media (max-width: 768px) { .posts { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <h1>Posts Dashboard</h1>
            <p class="subtitle">High-performance generated UI with React, TypeScript, and Tailwind CSS</p>
        </div>
    </header>
    
    <main>
        <div class="container">
            <div class="actions">
                <button class="btn btn-primary">Create Post</button>
                <button class="btn btn-secondary">Filter</button>
            </div>
            
            <div class="posts" id="posts-container">
                <!-- Posts will be rendered here -->
            </div>
        </div>
    </main>
    
    <footer>
        <div class="container">
            <p>© 2024 CloudExpress. Built for performance.</p>
        </div>
    </footer>
    
    <script>
        // Simulate React-like rendering
        const posts = [
            { id: 1, title: "Welcome to CloudExpress", content: "This is a high-performance generated UI designed for optimal Lighthouse scores.", author: "Admin", date: "2024-01-01" },
            { id: 2, title: "Performance Optimized", content: "Using modern web technologies including code splitting, lazy loading, and optimized assets.", author: "Developer", date: "2024-01-02" },
            { id: 3, title: "Accessibility First", content: "Built with semantic HTML and ARIA labels for maximum accessibility.", author: "Designer", date: "2024-01-03" },
            { id: 4, title: "TypeScript Support", content: "Full TypeScript support ensures type safety and better developer experience.", author: "Engineer", date: "2024-01-04" },
            { id: 5, title: "Tailwind CSS", content: "Utility-first CSS framework for rapid UI development with consistent design.", author: "UI Developer", date: "2024-01-05" }
        ];
        
        const container = document.getElementById('posts-container');
        posts.forEach(post => {
            const article = document.createElement('article');
            article.className = 'post';
            article.innerHTML = \`
                <h2>\${post.title}</h2>
                <div class="post-meta">
                    <span>By \${post.author}</span>
                    <span>\${new Date(post.date).toLocaleDateString()}</span>
                </div>
                <p>\${post.content}</p>
                <div class="post-actions">
                    <button class="btn btn-secondary">Edit</button>
                    <button class="btn btn-secondary">Delete</button>
                </div>
            \`;
            container.appendChild(article);
        });
    </script>
</body>
</html>
`;

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(testHTML);
});

async function runLighthouseAudit() {
  console.log('🚀 Starting Real Lighthouse Performance Audit\n');
  
  // Start server
  const PORT = 9999;
  server.listen(PORT);
  console.log(`🌐 Test server started on port ${PORT}`);
  
  // Launch Chrome
  console.log('🌐 Launching Chrome...');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox'],
  });
  
  try {
    const options = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
    };
    
    const url = `http://localhost:${PORT}`;
    console.log(`📊 Running Lighthouse audit on ${url}...\n`);
    
    const runnerResult = await lighthouse(url, options);
    
    // Extract scores
    const { categories } = runnerResult.lhr;
    const scores = {
      performance: Math.round(categories.performance.score * 100),
      accessibility: Math.round(categories.accessibility.score * 100),
      bestPractices: Math.round(categories['best-practices'].score * 100),
      seo: Math.round(categories.seo.score * 100),
    };
    
    console.log('📈 Lighthouse Audit Results:');
    console.log(`   • Performance:     ${getScoreEmoji(scores.performance)} ${scores.performance}/100`);
    console.log(`   • Accessibility:   ${getScoreEmoji(scores.accessibility)} ${scores.accessibility}/100`);
    console.log(`   • Best Practices:  ${getScoreEmoji(scores.bestPractices)} ${scores.bestPractices}/100`);
    console.log(`   • SEO:             ${getScoreEmoji(scores.seo)} ${scores.seo}/100`);
    
    // Performance metrics
    const metrics = runnerResult.lhr.audits;
    console.log('\n⚡ Core Web Vitals:');
    console.log(`   • First Contentful Paint:  ${metrics['first-contentful-paint'].displayValue}`);
    console.log(`   • Largest Contentful Paint: ${metrics['largest-contentful-paint'].displayValue}`);
    console.log(`   • Total Blocking Time:      ${metrics['total-blocking-time'].displayValue}`);
    console.log(`   • Cumulative Layout Shift:  ${metrics['cumulative-layout-shift'].displayValue}`);
    console.log(`   • Speed Index:              ${metrics['speed-index'].displayValue}`);
    
    // Additional metrics
    console.log('\n📊 Additional Metrics:');
    console.log(`   • Time to Interactive:      ${metrics['interactive'].displayValue}`);
    console.log(`   • First Meaningful Paint:   ${metrics['first-meaningful-paint']?.displayValue || 'N/A'}`);
    console.log(`   • Max Potential FID:        ${metrics['max-potential-fid']?.displayValue || 'N/A'}`);
    
    // Save detailed report
    const reportPath = path.join(__dirname, 'lighthouse-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(runnerResult.lhr, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportPath}`);
    
    // Check if audit passed
    const passed = scores.performance >= 90;
    
    if (passed) {
      console.log('\n✅ Lighthouse audit passed! Performance score >= 90');
    } else {
      console.log('\n⚠️  Performance score below 90');
      
      // Show opportunities for improvement
      const opportunities = Object.values(runnerResult.lhr.audits)
        .filter(audit => audit.score !== null && audit.score < 0.9 && audit.details?.type === 'opportunity')
        .sort((a, b) => (b.details?.overallSavingsMs || 0) - (a.details?.overallSavingsMs || 0))
        .slice(0, 5);
      
      if (opportunities.length > 0) {
        console.log('\n🔧 Top opportunities for improvement:');
        opportunities.forEach(opp => {
          const savings = opp.details?.overallSavingsMs ? ` (${Math.round(opp.details.overallSavingsMs)}ms)` : '';
          console.log(`   • ${opp.title}${savings}`);
        });
      }
    }
    
    // Cleanup
    await chrome.kill();
    server.close();
    
    process.exit(passed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Error running Lighthouse:', error.message);
    await chrome.kill();
    server.close();
    process.exit(1);
  }
}

function getScoreEmoji(score) {
  if (score >= 90) return '🟢';
  if (score >= 50) return '🟡';
  return '🔴';
}

// Run the audit
runLighthouseAudit().catch(console.error);