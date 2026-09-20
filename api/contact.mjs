/* ============================================================
   CONTACT FORM -> EMAIL  (Vercel serverless function)

   The site itself is static. This file is the one piece that runs on a
   server, and it exists for a single reason: the Resend API key must never
   reach the browser. Anyone holding that key can send email as our own
   domain, so it lives in Vercel's environment variables and only this
   function ever reads it.

   Environment variables (Vercel -> Project -> Settings -> Environment Variables):

     RESEND_API_KEY   required.  From resend.com/api-keys
     MAIL_FROM        required.  The address enquiries are sent FROM. Must sit
                                 on a domain verified in Resend. Until the DNS
                                 records are added, use onboarding@resend.dev
                                 (test mode - see the note on auto-replies).
     CONTACT_TO       optional.  Where enquiries land. Defaults to the address
                                 printed on the site.

   !! Until arbabadvisory.com is verified in Resend, the visitor auto-reply
   will not send. Resend's test domain is only allowed to deliver to the
   account owner's own address, which is a deliberate anti-abuse rule rather
   than a bug. The enquiry notification still arrives, and a failed auto-reply
   is logged but never fails the request - an enquiry must never be lost
   because a courtesy email could not go out.
   ============================================================ */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TO = 'abdur@arbabadvisory.com';
const LOGO_URL = 'https://arbabadvisory.com/images/logo.png';

/* shared shell: the site's surface/card/hairline palette, so a transactional
   email still reads as Arbab Advisory rather than a generic notification */
function emailShell(bodyHtml){
  return (
    '<div style="background:#f4f4f4;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif">' +
      '<div style="max-width:520px;margin:0 auto">' +
        '<img src="' + LOGO_URL + '" width="132" alt="Arbab Advisory" ' +
          'style="display:block;margin:0 auto 28px;width:132px;height:auto" />' +
        '<div style="background:#ffffff;border:1px solid #e6e8ec;border-radius:24px;padding:36px 32px">' +
          bodyHtml +
        '</div>' +
        '<p style="margin:24px 0 0;text-align:center;color:#a3a9b3;font-size:11px;letter-spacing:.04em">' +
          '&copy; ' + new Date().getFullYear() + ' Arbab Advisory' +
        '</p>' +
      '</div>' +
    '</div>'
  );
}

/* everything the visitor typed ends up inside an HTML email, so it is escaped
   before it reaches the markup - their name is not our markup */
function esc(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* keeps the paragraph breaks from the textarea without trusting its contents */
function escMultiline(value){
  return esc(value).replace(/\r?\n/g, '<br />');
}

function isEmail(value){
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function safeParse(body){
  try { return JSON.parse(body); } catch (e) { return null; }
}

async function sendEmail(payload){
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok){
    const detail = await res.text().catch(() => '');
    throw new Error('Resend responded ' + res.status + ': ' + detail);
  }
  return res.json();
}

/* ---------- the enquiry, to us ---------- */
function notificationEmail(d, from, to){
  const rows = [
    ['Name', esc(d.name)],
    ['Email', '<a href="mailto:' + esc(d.email) + '">' + esc(d.email) + '</a>'],
    ['Phone', '<a href="tel:' + esc(d.phone) + '">' + esc(d.phone) + '</a>'],
    ['Based in', esc(d.country)],
    ['Best time to call', esc(d.best_time)],
    ['Pricing seen', esc(d.region || 'Not recorded')],
  ].map(function(pair){
    return '<tr>' +
      '<td style="padding:8px 16px 8px 0;color:#717784;font-size:13px;white-space:nowrap;vertical-align:top">' + pair[0] + '</td>' +
      '<td style="padding:8px 0;color:#0a0a0a;font-size:14px">' + pair[1] + '</td>' +
      '</tr>';
  }).join('');

  const message = d.message
    ? '<div style="margin-top:28px;padding-top:24px;border-top:1px solid #e6e8ec">' +
        '<p style="margin:0 0 8px;color:#717784;font-size:13px">What they need help with</p>' +
        '<p style="margin:0;color:#0a0a0a;font-size:14px;line-height:1.6">' + escMultiline(d.message) + '</p>' +
      '</div>'
    : '';

  return {
    from: from,
    to: [to],
    /* hitting reply in the mail client answers the enquirer, not ourselves */
    reply_to: d.email,
    subject: 'Consultation request - ' + d.name + ' (' + d.country + ')',
    html: emailShell(
      '<p style="margin:0 0 4px;color:#2563c9;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase">New enquiry</p>' +
      '<h1 style="margin:0 0 24px;color:#0f2f63;font-size:22px;font-weight:600">' + esc(d.name) + ' would like a call</h1>' +
      '<table style="width:100%;border-collapse:collapse">' + rows + '</table>' +
      message +
      '<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e6e8ec;color:#717784;font-size:12px">' +
        'Sent from the enquiry form at arbabadvisory.com. Reply to this email to answer ' + esc(d.name) + ' directly.' +
      '</p>'
    ),
    text: [
      'New enquiry from ' + d.name, '',
      'Email: ' + d.email,
      'Phone: ' + d.phone,
      'Based in: ' + d.country,
      'Best time to call: ' + d.best_time,
      'Pricing seen: ' + (d.region || 'Not recorded'),
      d.message ? '\nWhat they need help with:\n' + d.message : '',
    ].join('\n'),
  };
}

/* ---------- the confirmation, to them ---------- */
function autoReplyEmail(d, from){
  const first = String(d.name).trim().split(/\s+/)[0] || 'there';
  const when = String(d.best_time).toLowerCase();
  return {
    from: from,
    to: [d.email],
    reply_to: process.env.CONTACT_TO || DEFAULT_TO,
    subject: 'We have got your enquiry - Arbab Advisory',
    html: emailShell(
      '<h1 style="margin:0 0 20px;color:#0f2f63;font-size:22px;font-weight:600">Thanks, ' + esc(first) + '.</h1>' +
      '<p style="margin:0 0 16px;color:#0a0a0a;font-size:15px;line-height:1.65">' +
        'Your request has come through and I have it in front of me. I will call you within ' +
        'one business day, ' + esc(when) + ' as you asked.' +
      '</p>' +
      '<p style="margin:0 0 16px;color:#0a0a0a;font-size:15px;line-height:1.65">' +
        'It is a free 30-minute call with no obligation. If it turns out you do not need us, ' +
        'I will tell you that honestly rather than sell you something.' +
      '</p>' +
      '<p style="margin:0 0 24px;color:#0a0a0a;font-size:15px;line-height:1.65">' +
        'If anything changes in the meantime, just reply to this email.' +
      '</p>' +
      '<p style="margin:0;padding-top:20px;border-top:1px solid #e6e8ec;color:#0f2f63;font-size:14px;font-weight:600">Arbab Abdur Rahman</p>' +
      '<p style="margin:2px 0 0;color:#717784;font-size:13px">Founder &middot; Arbab Advisory</p>'
    ),
    text:
      'Thanks, ' + first + '.\n\n' +
      'Your request has come through and I have it in front of me. I will call you within ' +
      'one business day, ' + when + ' as you asked.\n\n' +
      'It is a free 30-minute call with no obligation. If it turns out you do not need us, ' +
      'I will tell you that honestly rather than sell you something.\n\n' +
      'If anything changes in the meantime, just reply to this email.\n\n' +
      'Arbab Abdur Rahman\nFounder - Arbab Advisory',
  };
}

export default async function handler(req, res){
  if (req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM){
    console.error('Contact form: RESEND_API_KEY or MAIL_FROM is not set.');
    return res.status(500).json({ error: 'Email is not configured' });
  }

  const d = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!d || typeof d !== 'object') return res.status(400).json({ error: 'Malformed request' });

  /* the same spam trap the page uses, checked again here - the client-side
     guards stop bots driving the form, not bots posting at this endpoint */
  if (d._gotcha) return res.status(200).json({ ok: true });

  /* validated here as well as in the page, for exactly the same reason */
  if (!d.name || !String(d.name).trim())   return res.status(400).json({ error: 'Name is required' });
  if (!isEmail(d.email))                   return res.status(400).json({ error: 'A valid email is required' });
  if (!d.phone || !String(d.phone).trim()) return res.status(400).json({ error: 'Phone is required' });

  const clean = {
    name:      String(d.name).trim().slice(0, 120),
    email:     String(d.email).trim().slice(0, 200),
    phone:     String(d.phone).trim().slice(0, 60),
    country:   String(d.country || 'Not given').slice(0, 80),
    best_time: String(d.best_time || 'Any time').slice(0, 40),
    message:   String(d.message || '').trim().slice(0, 4000),
    region:    String(d.region || '').slice(0, 40),
  };

  const from = process.env.MAIL_FROM;
  const to = process.env.CONTACT_TO || DEFAULT_TO;

  /* the enquiry itself must land. If this throws, the visitor is told to email
     directly rather than shown a success screen for something that never sent */
  try {
    await sendEmail(notificationEmail(clean, from, to));
  } catch (err) {
    console.error('Contact form: enquiry notification failed.', err);
    return res.status(502).json({ error: 'Could not send' });
  }

  /* the courtesy reply is best-effort on purpose, and cannot succeed at all
     while MAIL_FROM is still Resend's test domain */
  try {
    await sendEmail(autoReplyEmail(clean, from));
  } catch (err) {
    console.error('Contact form: auto-reply to visitor failed (enquiry still delivered).', err);
  }

  return res.status(200).json({ ok: true });
}
