-- Existing customers receive the tutorial through the durable email outbox.
-- The deterministic id plus the checksummed migration make this exactly once.
INSERT INTO email_queue (id, "to", to_name, subject, html, status, attempts)
SELECT
  'tutorial-onboarding:' || id,
  email,
  COALESCE(name, ''),
  'Your step-by-step Quae.ai tutorial',
  $tutorial_email$
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding-bottom:32px;text-align:center;font-size:22px;font-weight:800;color:#fff;">Quae<span style="color:#8b5cf6;">.ai</span></td></tr>
        <tr><td style="background:#16161f;border:1px solid #2a2a3a;border-radius:16px;padding:40px;">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#fff;line-height:1.3;">Your Quae.ai tutorial is ready</h1>
          <p style="margin:0 0 12px;font-size:15px;color:#aaa;line-height:1.7;">Watch the simple, narrated walkthrough showing exactly how to build a campaign from your Business Profile through Creative and Download.</p>
          <p style="margin:0 0 12px;font-size:15px;color:#aaa;line-height:1.7;">You can open it whenever you need help. Watching the tutorial does not use campaign credits.</p>
          <a href="https://quae.ai/how-to" style="display:inline-block;margin-top:24px;padding:14px 32px;background:#7c3aed;color:#fff;font-weight:700;font-size:15px;border-radius:10px;text-decoration:none;">Watch the Step-by-Step Tutorial →</a>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;font-size:12px;color:#777;line-height:1.6;">Quae.ai · Your AI Marketing Department</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  $tutorial_email$,
  'pending',
  0
FROM users
WHERE account_status = 'active'
ON CONFLICT (id) DO NOTHING;
