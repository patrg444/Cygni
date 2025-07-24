import { test, chromium } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';
import path from 'path';

test.describe('Lighthouse Performance Audit', () => {
  test('Generated UI should meet performance standards', async () => {
    // Launch browser with proper flags for Lighthouse
    const browser = await chromium.launch({
      args: ['--remote-debugging-port=9222'],
      headless: true,
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      // Navigate to the test-posts page
      // Note: This uses the preview server on port 4173
      await page.goto('http://localhost:4173/test-posts', {
        waitUntil: 'networkidle',
      });
      
      // Wait for the page to be fully loaded
      await page.waitForLoadState('domcontentloaded');
      
      // Wait for React to hydrate and render
      await page.waitForTimeout(2000);
      
      // Run Lighthouse audit
      const result = await playAudit({
        page,
        thresholds: {
          performance: 90,
          accessibility: 90,
          'best-practices': 90,
          seo: 80,
        },
        port: 9222,
        reports: {
          formats: {
            json: true,
            html: true,
          },
          name: 'lighthouse-report',
          directory: path.join(__dirname, 'lighthouse-results'),
        },
      });
      
      // Log the scores
      console.log('\n📊 Lighthouse Audit Results:');
      console.log(`   • Performance:     ${getScoreEmoji(result.lhr.categories.performance.score * 100)} ${Math.round(result.lhr.categories.performance.score * 100)}/100`);
      console.log(`   • Accessibility:   ${getScoreEmoji(result.lhr.categories.accessibility.score * 100)} ${Math.round(result.lhr.categories.accessibility.score * 100)}/100`);
      console.log(`   • Best Practices:  ${getScoreEmoji(result.lhr.categories['best-practices'].score * 100)} ${Math.round(result.lhr.categories['best-practices'].score * 100)}/100`);
      console.log(`   • SEO:             ${getScoreEmoji(result.lhr.categories.seo.score * 100)} ${Math.round(result.lhr.categories.seo.score * 100)}/100`);
      
      // Log key metrics
      const metrics = result.lhr.audits;
      console.log('\n⚡ Core Web Vitals:');
      console.log(`   • First Contentful Paint:  ${metrics['first-contentful-paint'].displayValue}`);
      console.log(`   • Largest Contentful Paint: ${metrics['largest-contentful-paint'].displayValue}`);
      console.log(`   • Total Blocking Time:      ${metrics['total-blocking-time'].displayValue}`);
      console.log(`   • Cumulative Layout Shift:  ${metrics['cumulative-layout-shift'].displayValue}`);
      console.log(`   • Speed Index:              ${metrics['speed-index'].displayValue}`);
      
      // Check for any failing audits
      const failingAudits = Object.values(result.lhr.audits)
        .filter((audit: any) => audit.score !== null && audit.score < 0.9)
        .map((audit: any) => audit.title);
      
      if (failingAudits.length > 0) {
        console.log('\n⚠️  Audits needing improvement:');
        failingAudits.slice(0, 5).forEach(title => {
          console.log(`   • ${title}`);
        });
      }
      
    } finally {
      await browser.close();
    }
  });
});

function getScoreEmoji(score: number): string {
  if (score >= 90) return '🟢';
  if (score >= 50) return '🟡';
  return '🔴';
}