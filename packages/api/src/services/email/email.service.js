"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
async function sendEmail(options) {
    const from = options.from || process.env.FROM_EMAIL || "noreply@cygni.app";
    console.log(" Email would be sent:");
    console.log(`  From: ${from}`);
    console.log(`  To: ${options.to}`);
    console.log(`  Subject: ${options.subject}`);
    // In production, this would use SendGrid, AWS SES, or similar:
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to: options.to,
      from: from,
      subject: options.subject,
      text: options.text || 'Text version not provided',
      html: options.html,
    };
    
    await sgMail.send(msg);
    */
    // For now, just log to console
    if (process.env.NODE_ENV === "development") {
        console.log("  Preview: First 200 chars of HTML:");
        console.log("  " + options.html.substring(0, 200) + "...");
    }
}
//# sourceMappingURL=email.service.js.map