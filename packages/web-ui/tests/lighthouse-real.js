const chromeLauncher = require('chrome-launcher');
const lighthouse = require('lighthouse');
const fs = require('fs');
const path = require('path');

async function runLighthouseAudit() {
  console.log('🚀 Starting Real Lighthouse Performance Audit\n');
  
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
    
    const url = 'http://localhost:3000/lighthouse-test';
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
    
    await chrome.kill();
    process.exit(passed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Error running Lighthouse:', error.message);
    await chrome.kill();
    process.exit(1);
  }
}

function getScoreEmoji(score) {
  if (score >= 90) return '🟢';
  if (score >= 50) return '🟡';
  return '🔴';
}

// Check if lighthouse is installed
try {
  require.resolve('lighthouse');
  require.resolve('chrome-launcher');
} catch (e) {
  console.error('❌ Please install dependencies first:');
  console.error('   npm install lighthouse chrome-launcher');
  process.exit(1);
}

// Run the audit
runLighthouseAudit().catch(console.error);