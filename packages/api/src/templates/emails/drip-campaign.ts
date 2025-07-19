export interface EmailTemplate {
  subject: string;
  html: (data: any) => string;
  text?: (data: any) => string;
}

export const dripCampaignTemplates: Record<string, EmailTemplate> = {
  // Email 1: Welcome (sent immediately)
  welcome: {
    subject: "Welcome to CloudExpress! 🚀",
    html: (data) => `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h1 style="color: #0070f3; font-size: 32px;">Welcome to CloudExpress!</h1>
        
        <p style="font-size: 18px; line-height: 1.6;">Hi ${data.name || "there"},</p>
        
        <p style="font-size: 16px; line-height: 1.6;">
          You're #${data.position} on our early access list! We're building the developer cloud that 
          bridges the gap between Vercel's simplicity and AWS's power.
        </p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <h2 style="margin-top: 0; color: #0070f3;">What makes CloudExpress different?</h2>
          <ul style="line-height: 1.8;">
            <li><strong>5-second deploys</strong> - Push to deploy with zero-downtime rollouts</li>
            <li><strong>Preview environments</strong> - Every PR gets a full-stack environment</li>
            <li><strong>Integrated services</strong> - Postgres, Redis, S3 work out of the box</li>
            <li><strong>No vendor lock-in</strong> - Run on your cloud or ours</li>
          </ul>
        </div>

        <p style="font-size: 16px; line-height: 1.6;">
          <strong>What's next?</strong> We'll reach out when your spot opens up. 
          In the meantime, star us on GitHub to follow development:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://github.com/cygni/cygni" 
             style="display: inline-block; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            ⭐ Star on GitHub
          </a>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 40px;">
          Questions? Just reply to this email - we read everything!<br><br>
          Best,<br>
          The CloudExpress Team
        </p>
      </div>
    `,
  },

  // Email 2: Peak Feature Deep Dive (sent after 3 days)
  peakFeature: {
    subject: "CloudExpress Secret Sauce: Health Gates & Auto-Rollback 🛡️",
    html: (data) => `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h1 style="color: #0070f3; font-size: 32px;">Never Ship a Bad Deploy Again</h1>
        
        <p style="font-size: 16px; line-height: 1.6;">Hi ${data.name || "there"},</p>
        
        <p style="font-size: 16px; line-height: 1.6;">
          Remember that sinking feeling when you deploy on Friday afternoon and errors start spiking? 
          We built CloudExpress to make that impossible.
        </p>

        <div style="margin: 30px 0;">
          <img src="https://beta.cygni.app/images/health-gate-demo.gif" 
               alt="Health Gate Demo" 
               style="width: 100%; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        </div>

        <h2 style="color: #0070f3;">How Health Gates Work</h2>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; line-height: 1.6;">
            <strong>1. You deploy</strong> → 
            <strong>2. We monitor metrics</strong> → 
            <strong>3. Bad metrics = auto rollback</strong>
          </p>
        </div>

        <p style="font-size: 16px; line-height: 1.6;">
          Set thresholds for error rate, P95 latency, and success rate. If your new deployment 
          crosses any threshold, we automatically roll back to the previous version. 
          <strong>Zero manual intervention needed.</strong>
        </p>

        <pre style="background: #1a1a1a; color: #fff; padding: 20px; border-radius: 6px; overflow-x: auto;">
<code>cygni deploy --health-gate strict

✓ Building image...
✓ Running migrations...
✓ Deploying to production...
⚠️  Health gate triggered: Error rate 5.2% (threshold: 5%)
✓ Rolling back to previous version...
✓ Rollback complete. Crisis averted! 🎉</code></pre>

        <p style="font-size: 16px; line-height: 1.6;">
          <strong>Fun fact:</strong> We run "Failure Friday" every week where we intentionally 
          break our own production to test these systems. Sleep easy knowing your app is protected.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://beta.cygni.app/docs/health-gates" 
             style="display: inline-block; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Learn More About Health Gates
          </a>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 40px;">
          Next email: How one startup cut their AWS bill by 73% using CloudExpress<br><br>
          Cheers,<br>
          The CloudExpress Team
        </p>
      </div>
    `,
  },

  // Email 3: Case Study (sent after 7 days)
  caseStudy: {
    subject: "How TechStartup cut cloud costs by 73% (real story)",
    html: (data) => `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h1 style="color: #0070f3; font-size: 32px;">From $4,200 to $1,134/month</h1>
        
        <p style="font-size: 16px; line-height: 1.6;">Hi ${data.name || "there"},</p>
        
        <p style="font-size: 16px; line-height: 1.6;">
          When Alex from TechStartup.io came to us, they were burning $4,200/month on AWS for a 
          simple SaaS app. Here's how CloudExpress cut that by 73%.
        </p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <h3 style="margin-top: 0;">Before CloudExpress (AWS):</h3>
          <ul style="line-height: 1.8;">
            <li>3x over-provisioned EC2 instances ($1,800/mo)</li>
            <li>Idle RDS Multi-AZ for "just in case" ($900/mo)</li>
            <li>Forgotten preview environments ($600/mo)</li>
            <li>NAT Gateway charges ($400/mo)</li>
            <li>CloudWatch, ALB, and mystery charges ($500/mo)</li>
          </ul>
          <p style="margin-bottom: 0;"><strong>Total: $4,200/month</strong></p>
        </div>

        <div style="background: #e6f4ea; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <h3 style="margin-top: 0;">After CloudExpress:</h3>
          <ul style="line-height: 1.8;">
            <li>Auto-scaling from 0 (only pay when running)</li>
            <li>Managed Postgres with automated backups</li>
            <li>Preview envs auto-delete after PR merge</li>
            <li>No NAT gateway needed</li>
            <li>All monitoring included</li>
          </ul>
          <p style="margin-bottom: 0;"><strong>Total: $1,134/month</strong></p>
        </div>

        <blockquote style="border-left: 4px solid #0070f3; padding-left: 20px; margin: 30px 0; font-style: italic;">
          "We spent months trying to optimize AWS costs. With CloudExpress, it just happened 
          automatically. Plus, our deploys went from 15 minutes to 15 seconds."
          <br><br>
          <strong>- Alex Chen, CTO at TechStartup.io</strong>
        </blockquote>

        <h2 style="color: #0070f3;">The Secret? Sane Defaults</h2>
        
        <p style="font-size: 16px; line-height: 1.6;">
          AWS gives you 200+ services and infinite ways to overspend. CloudExpress gives you 
          exactly what you need to run production apps, with pricing that makes sense.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://beta.cygni.app/calculator" 
             style="display: inline-block; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Calculate Your Savings
          </a>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 40px;">
          Your early access spot is reserved. We'll notify you soon!<br><br>
          Best,<br>
          The CloudExpress Team
        </p>
      </div>
    `,
  },

  // Email 4: CTA - Deploy Your First App (sent after 14 days)
  deployNow: {
    subject: "🎉 Your CloudExpress invite is here!",
    html: (data) => `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <div style="text-align: center; margin: 30px 0;">
          <h1 style="color: #0070f3; font-size: 48px; margin: 0;">You're in! 🎉</h1>
        </div>
        
        <p style="font-size: 18px; line-height: 1.6;">Hi ${data.name || "there"},</p>
        
        <p style="font-size: 18px; line-height: 1.6;">
          Your CloudExpress early access is ready! You can now deploy your first app in under 5 minutes.
        </p>

        <div style="background: #0070f3; color: white; padding: 30px; border-radius: 8px; margin: 30px 0; text-align: center;">
          <h2 style="margin-top: 0; font-size: 28px;">Get Started in 3 Steps</h2>
          
          <div style="text-align: left; max-width: 400px; margin: 0 auto;">
            <p style="font-size: 18px; line-height: 1.8;">
              1. Install the CLI<br>
              2. Connect your GitHub<br>
              3. Deploy your app
            </p>
          </div>
          
          <a href="https://app.cygni.app/signup?invite=${data.inviteCode}" 
             style="display: inline-block; margin-top: 20px; padding: 14px 28px; background: white; color: #0070f3; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 18px;">
            Claim Your Account →
          </a>
        </div>

        <h3 style="color: #0070f3;">Your Early Access Perks:</h3>
        
        <ul style="line-height: 1.8; font-size: 16px;">
          <li><strong>$100 free credits</strong> (lasts 2-3 months for most apps)</li>
          <li><strong>Priority support</strong> in our Slack channel</li>
          <li><strong>Early access pricing</strong> locked in forever</li>
          <li><strong>Direct line to founders</strong> for feature requests</li>
        </ul>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <p style="margin: 0; font-size: 16px; line-height: 1.6;">
            <strong>Quick Start:</strong> Have a Node.js, Python, or Go app? You can deploy it 
            in literally one command:
          </p>
          <pre style="background: #1a1a1a; color: #fff; padding: 15px; border-radius: 6px; margin-top: 10px; overflow-x: auto;">
<code>cygni deploy</code></pre>
        </div>

        <p style="font-size: 16px; line-height: 1.6;">
          This invite expires in 7 days, so grab your spot! If you have any questions, 
          just reply to this email or join our Slack.
        </p>

        <div style="text-align: center; margin: 40px 0;">
          <a href="https://app.cygni.app/signup?invite=${data.inviteCode}" 
             style="display: inline-block; padding: 14px 28px; background: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 18px;">
            Start Building →
          </a>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 40px;">
          Welcome to the future of deployment!<br><br>
          Patrick & the CloudExpress Team<br><br>
          P.S. Tweet your first deploy with #CloudExpressLive and we'll send you swag! 🎁
        </p>
      </div>
    `,
  },
};
