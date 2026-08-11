// AI Lead Bot — GoHighLevel webhook -> Claude personalization -> GHL email send
// Deploy this to Render/Railway/Vercel (Node hosting), then point your GHL
// workflow's webhook action at https://your-deployed-url.com/webhook/audit-form

const express = require('express');
const app = express();
app.use(express.json());

// ---- CONFIG (set these as environment variables on your host, never hardcode) ----
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GHL_API_KEY = process.env.GHL_API_KEY;           // GHL Private Integration token
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;   // Your sub-account/location ID
const ETHAN_CALENDAR_LINK = process.env.ETHAN_CALENDAR_LINK; // e.g. https://link.yourcrm.com/widget/booking/ethan

// ---- 1. Webhook endpoint GHL calls when the audit form is submitted ----
app.post('/webhook/audit-form', async (req, res) => {
  try {
    // GHL sends form data in req.body — field names depend on how you set up
    // the "Webhook" workflow action. Log a real payload once and adjust below.
    const lead = {
      contactId: req.body.contact_id || req.body.contactId,
      firstName: req.body.first_name || req.body.firstName || 'there',
      email: req.body.email,
      // Whatever qualifying questions your audit form asks — adjust field keys
      businessType: req.body.business_type || '',
      biggestChallenge: req.body.biggest_challenge || '',
      revenue: req.body.revenue_range || ''
    };

    if (!lead.email || !lead.contactId) {
      return res.status(400).json({ error: 'Missing required lead fields' });
    }

    // ---- 2. Generate the personalized email with Claude ----
    const emailBody = await generatePersonalizedEmail(lead);

    // ---- 3. Send it through GHL so it threads into their contact record ----
    await sendEmailViaGHL(lead, emailBody);

    // Respond fast — GHL doesn't need to wait on anything else
    res.status(200).json({ status: 'sent' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---- Claude call: draft a short, specific, non-templated email ----
async function generatePersonalizedEmail(lead) {
  const prompt = `You're writing a short email on behalf of a sales setter to a lead who just requested a free audit.

Lead details:
- Name: ${lead.firstName}
- Business type: ${lead.businessType || 'not specified'}
- Biggest challenge they mentioned: ${lead.biggestChallenge || 'not specified'}
- Revenue range: ${lead.revenue || 'not specified'}

Write a warm, specific, non-salesy email (under 120 words) that:
1. References their specific answer(s) above naturally, not as a list
2. Confirms their free audit request
3. Creates urgency to book a call with Ethan (our strategist) this week
4. Ends with a clear single call-to-action to book — I will insert the booking link myself, so end with the placeholder [BOOKING_LINK] exactly where the link should go

Do not use generic phrases like "I hope this email finds you well." Sound like a real person, not a template. Output ONLY the email body, no subject line, no preamble.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  let text = data.content?.[0]?.text || '';
  text = text.replace('[BOOKING_LINK]', ETHAN_CALENDAR_LINK);
  return text;
}

// ---- Send the email through GHL's API so it logs on the contact ----
async function sendEmailViaGHL(lead, emailBody) {
  const response = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-04-15'
    },
    body: JSON.stringify({
      type: 'Email',
      contactId: lead.contactId,
      locationId: GHL_LOCATION_ID,
      subject: `${lead.firstName}, your free audit is confirmed`,
      html: emailBody.replace(/\n/g, '<br>')
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GHL send failed: ${errText}`);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lead bot listening on port ${PORT}`));
