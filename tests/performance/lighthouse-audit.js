const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const { TestApiServer } = require('../../packages/cli/dist/lib/test-api-server.js');

async function runLighthouseAudit() {
  console.log('🚀 Starting Lighthouse Performance Audit\n');
  
  // Start TestApiServer
  console.log('📡 Starting TestApiServer...');
  const server = new TestApiServer();
  await server.start(3333);
  console.log('✅ Server started on port 3333\n');
  
  // The generated UI would typically be served on a different port
  // For this test, we'll audit the posts endpoint directly
  const url = 'http://localhost:3333/posts';
  
  try {
    // Launch Chrome
    console.log('🌐 Launching Chrome...');
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
    });
    
    const options = {
      logLevel: 'info',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      port: chrome.port
    };
    
    console.log(`📊 Running Lighthouse audit on ${url}...\n`);
    const runnerResult = await lighthouse(url, options);
    
    // Extract scores
    const { categories } = runnerResult.lhr;
    const scores = {
      performance: Math.round(categories.performance.score * 100),
      accessibility: Math.round(categories.accessibility.score * 100),
      bestPractices: Math.round(categories['best-practices'].score * 100)
    };
    
    console.log('📈 Lighthouse Audit Results:');
    console.log('   • Performance:     ' + getScoreEmoji(scores.performance) + ' ' + scores.performance + '/100');
    console.log('   • Accessibility:   ' + getScoreEmoji(scores.accessibility) + ' ' + scores.accessibility + '/100');
    console.log('   • Best Practices:  ' + getScoreEmoji(scores.bestPractices) + ' ' + scores.bestPractices + '/100');
    
    // Performance metrics
    const metrics = runnerResult.lhr.audits;
    console.log('\n⚡ Performance Metrics:');
    console.log(`   • First Contentful Paint:  ${metrics['first-contentful-paint'].displayValue}`);
    console.log(`   • Largest Contentful Paint: ${metrics['largest-contentful-paint'].displayValue}`);
    console.log(`   • Total Blocking Time:      ${metrics['total-blocking-time'].displayValue}`);
    console.log(`   • Cumulative Layout Shift:  ${metrics['cumulative-layout-shift'].displayValue}`);
    console.log(`   • Speed Index:              ${metrics['speed-index'].displayValue}`);
    
    // Kill Chrome
    await chrome.kill();
    
    // Determine if audit passed
    const passed = scores.performance >= 70 && 
                   scores.accessibility >= 90 && 
                   scores.bestPractices >= 90;
    
    if (passed) {
      console.log('\n✅ Lighthouse audit passed!');
    } else {
      console.log('\n⚠️  Some scores need improvement');
      if (scores.performance < 70) {
        console.log('   • Performance score below 70');
      }
      if (scores.accessibility < 90) {
        console.log('   • Accessibility score below 90');
      }
      if (scores.bestPractices < 90) {
        console.log('   • Best Practices score below 90');
      }
    }
    
    // Stop server
    server.stop();
    process.exit(passed ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Lighthouse audit failed:', error.message);
    server.stop();
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