// Resend email service — zero template setup, fully automated
// Sign up free at resend.com → get an API key → add as RESEND_API_KEY secret
// Free tier: 3,000 emails/month, 100/day

const RESEND_URL = "https://api.resend.com/emails";

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

async function sendEmail(to_email: string, to_name: string, subject: string, body_html: string) {
  if (!isConfigured()) {
    console.log("[email] RESEND_API_KEY not set — skipping send to", to_email);
    return;
  }
  try {
    // EMAIL_FROM_ADDRESS can be overridden via env var.
    // Use onboarding@resend.dev as a fallback while quae.ai DNS is being verified —
    // it only delivers to the Resend account owner's address but prevents hard 403s.
    const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "noreply@quae.ai";
    const fromName = process.env.EMAILJS_FROM_NAME ?? "Quae.ai";
    const from = `${fromName} <${fromAddress}>`;

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to_email], subject, html: body_html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[email] Resend error:", res.status, text);
    } else {
      console.log("[email] Sent:", subject, "→", to_email);
    }
  } catch (err) {
    console.error("[email] Send failed:", err);
  }
}

// ─── Branded HTML wrapper ────────────────────────────────────────────────────
function wrap(content: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <!-- Logo -->
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="display:inline-flex;align-items:center;gap:10px;">
            <span style="display:inline-block;width:36px;height:36px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);border-radius:8px;line-height:36px;text-align:center;font-size:20px;font-weight:900;color:#fff;">Q</span>
            <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Quae<span style="color:#8b5cf6;">.ai</span></span>
          </span>
        </td></tr>
        <!-- Card -->
        <tr><td style="background:#16161f;border:1px solid #2a2a3a;border-radius:16px;padding:40px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding-top:28px;text-align:center;font-size:12px;color:#555;line-height:1.6;">
          © ${new Date().getFullYear()} Quae.ai · AI Video Ads for E-Commerce<br>
          <a href="https://quae.ai" style="color:#8b5cf6;text-decoration:none;">quae.ai</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const btn = (text: string, url: string) =>
  `<a href="${url}" style="display:inline-block;margin-top:24px;padding:14px 32px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;font-weight:700;font-size:15px;border-radius:10px;text-decoration:none;">${text}</a>`;

const h1 = (text: string) =>
  `<h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#fff;line-height:1.3;">${text}</h1>`;

const p = (text: string) =>
  `<p style="margin:0 0 12px;font-size:15px;color:#aaa;line-height:1.7;">${text}</p>`;

const highlight = (text: string) =>
  `<span style="color:#8b5cf6;font-weight:600;">${text}</span>`;

const divider = () =>
  `<hr style="border:none;border-top:1px solid #2a2a3a;margin:24px 0;">`;

// ─── Email types ─────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(email: string, name: string) {
  const firstName = (name || "").split(" ")[0] || "there";
  const html = wrap(`
    ${h1(`Welcome to Quae.ai, ${firstName}! 🎬`)}
    ${p("You're now part of the fastest-growing AI video ad platform for e-commerce. Your account comes with <strong style='color:#fff'>300 free credits</strong> to get started.")}
    ${divider()}
    ${p("<strong style='color:#fff'>Here's how it works:</strong>")}
    ${p("1️⃣ &nbsp;Describe your product — 2️⃣ &nbsp;AI writes the script — 3️⃣ &nbsp;Pick a model — 4️⃣ &nbsp;Download your video ad")}
    ${divider()}
    ${p("Ready to create your first video ad?")}
    ${btn("Create Your First Ad →", "https://quae.ai/studio")}
  `);
  await sendEmail(email, name, "Welcome to Quae.ai 🎬", html);
}

export async function sendRenderDoneEmail(
  email: string,
  name: string,
  projectTitle: string,
  projectId: string,
) {
  const html = wrap(`
    ${h1("Your video is ready! ✅")}
    ${p(`Great news — your video ad ${highlight(`"${projectTitle}"`)} has finished rendering and is ready to download.`)}
    ${divider()}
    ${p("Head to your project to preview and download the MP4.")}
    ${btn("View & Download →", `https://quae.ai/studio/projects/${projectId}`)}
  `);
  await sendEmail(email, name, `✅ Your video "${projectTitle}" is ready`, html);
}

export async function sendRenderFailedEmail(
  email: string,
  name: string,
  projectTitle: string,
  projectId: string,
  creditsRefunded: number,
) {
  const html = wrap(`
    ${h1("Render failed — credits refunded")}
    ${p(`Unfortunately, the render for ${highlight(`"${projectTitle}"`)} encountered an error on the AI provider's end.`)}
    ${divider()}
    ${p(`✅ &nbsp;<strong style='color:#fff'>${creditsRefunded} credits have been automatically refunded</strong> to your account.`)}
    ${p("You can retry the render for free from your project page — your script is saved and ready to go.")}
    ${btn("Retry Render →", `https://quae.ai/studio/projects/${projectId}`)}
    ${divider()}
    ${p("If this keeps happening please reply to this email and we'll fix it for you.")}
  `);
  await sendEmail(email, name, `⚠️ Render failed for "${projectTitle}" — credits refunded`, html);
}

export async function sendPlanUpgradeEmail(
  email: string,
  name: string,
  plan: string,
  credits: number,
) {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const html = wrap(`
    ${h1(`You're now on ${planLabel}! 🚀`)}
    ${p(`Your subscription to ${highlight(`Quae.ai ${planLabel}`)} is now active.`)}
    ${divider()}
    ${p(`<strong style='color:#fff'>Your account has been topped up with ${credits} credits.</strong>`)}
    ${p("You now have access to higher-quality AI models and more video renders per month.")}
    ${btn("Start Creating →", "https://quae.ai/studio")}
    ${divider()}
    ${p("Questions about your plan? Reply to this email anytime.")}
  `);
  await sendEmail(email, name, `🚀 Welcome to Quae.ai ${planLabel}!`, html);
}

export async function sendBroadcastEmail(
  email: string,
  name: string,
  subject: string,
  message: string,
) {
  // message is plain text from admin; convert newlines to <p> tags
  const bodyContent = message
    .split("\n\n")
    .map((para) => p(para.replace(/\n/g, "<br>")))
    .join("");

  const html = wrap(`${bodyContent}`);
  await sendEmail(email, name, subject, html);
}
