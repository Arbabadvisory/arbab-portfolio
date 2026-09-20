# Contact form setup

The enquiry form posts to `/api/contact`, a Vercel serverless function that sends
the email through Resend. Everything it needs lives in Vercel's environment
variables — nothing secret is ever in the repo or in the page.

## 1. Environment variables

Vercel → your project → **Settings → Environment Variables**. Add all three to
**Production, Preview and Development** so previews work too.

| Name | Value | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_...` | From [resend.com/api-keys](https://resend.com/api-keys). Treat it like a password. |
| `MAIL_FROM` | see below | The address enquiries are sent **from**. |
| `CONTACT_TO` | `abdur@arbabadvisory.com` | Where enquiries land. Optional — this is the default. |

Redeploy after adding them. Environment variables are only read at deploy time,
so an existing deployment will not pick them up on its own.

## 2. `MAIL_FROM`, before and after DNS

**Before the domain is verified** (works right now):

```
MAIL_FROM=onboarding@resend.dev
```

Resend's shared test address. It can **only deliver to the email address on the
Resend account itself**. So the enquiry notification reaches that inbox, but the
confirmation email to the visitor will not send. That is Resend's anti-abuse
rule, not a fault in the code — the function logs the failure and still returns
success, because an enquiry must never be lost over a courtesy email.

**After the domain is verified** (the real setup):

```
MAIL_FROM=Arbab Advisory <hello@arbabadvisory.com>
```

Both emails then work, and both come from the practice's own domain.

## 3. Verifying arbabadvisory.com in Resend

1. Resend → **Domains → Add Domain** → enter `arbabadvisory.com`.
2. Resend shows a set of DNS records — an `MX` and `TXT` pair for receiving and
   SPF, plus a `TXT` record for DKIM.
3. Add them at whoever hosts the domain's DNS — often the registrar, or
   Cloudflare. Copy the values exactly; a trailing dot or a missing one is the
   usual reason verification stalls.
4. Wait for propagation (usually minutes, occasionally a few hours) and press
   **Verify**.
5. Change `MAIL_FROM` to the real address and redeploy.

Worth doing at the same time, once DKIM and SPF are live: add a **DMARC** record
(`_dmarc.arbabadvisory.com`, `TXT`, starting at `v=DMARC1; p=none;`). It is not
required to send, but it measurably improves the odds of landing in the inbox
rather than spam — which matters when the email is a confirmation somebody is
waiting on.

## 4. Logo in the emails

Both templates load the header logo from `https://arbabadvisory.com/images/logo.png`
(see `LOGO_URL` in `contact.mjs`). That URL only resolves once the domain itself
is pointed at this Vercel deployment — until then the logo will show as a
broken image in any email sent. Not a blocker for verifying Resend or sending
mail, just something to know about if a test email looks logo-less.

## 5. Testing it

- **Locally:** `npx vercel dev` runs the function on your machine. It reads a
  `.env.local` file in the project root — same three variables. Do not commit
  that file.
- **In production:** submit the form, then check Resend → **Emails** for the
  delivery log, and Vercel → your project → **Logs** for anything the function
  printed.

## If it stops working

The visitor never hits a dead end: if the enquiry email fails, the function
returns an error, and the form shows *"please email us directly at
abdur@arbabadvisory.com"* rather than a false success screen. So a failure is
visible and recoverable, but it will not announce itself to you — check the
Resend dashboard occasionally, or set a billing/usage alert there.

Common causes, in the order they usually happen:

- **500, "Email is not configured"** — `RESEND_API_KEY` or `MAIL_FROM` is
  missing, or was added but not redeployed.
- **502, and the Resend log shows a domain error** — `MAIL_FROM` is on a domain
  that is not verified.
- **Notification arrives, confirmation does not** — expected while `MAIL_FROM`
  is still `onboarding@resend.dev`. See step 2.
