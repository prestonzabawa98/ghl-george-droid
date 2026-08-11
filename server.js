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
const FROM_EMAIL = process.env.FROM_EMAIL || 'pzabawa@westoeast.biz'; // must be a verified sender in GHL
const FROM_NAME = 'Preston WestOEast GEO';
const FROM_PHONE = process.env.FROM_PHONE || '+13156403611'; // must be a number set up in GHL

// ---- 1. Webhook endpoint GHL calls when the audit form is submitted ----
app.post('/webhook/audit-form', async (req, res) => {
  try {
    // GHL sends form data in req.body — field names depend on how you set up
    // the "Webhook" workflow action. Log a real payload once and adjust below.
    const lead = {
      contactId: req.body.contact_id || req.body.contactId,
      firstName: req.body.first_name || req.body.firstName || 'there',
      email: req.body.email,
      phone: req.body.phone || req.body.phone_number || '',
      // Whatever qualifying questions your audit form asks — adjust field keys
      businessType: req.body.business_type || '',
      biggestChallenge: req.body.biggest_challenge || '',
      revenue: req.body.revenue_range || ''
    };

    if (!lead.email || !lead.contactId) {
      return res.status(400).json({ error: 'Missing required lead fields' });
    }

    // ---- 2. Build the email from your fixed template ----
    const emailBody = buildEmail(lead);

    // ---- 3. Send it through GHL so it threads into their contact record ----
    // (Delay is handled by a "Wait" step in the GHL workflow, before this webhook fires)
    await sendEmailViaGHL(lead, emailBody);

    // ---- 4. Send an instant SMS too — speed matters more than email here ----
    if (lead.phone) {
      await sendSMSViaGHL(lead);
    }

    // Respond fast — GHL doesn't need to wait on anything else
    res.status(200).json({ status: 'sent' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---- Fixed template, written by hand. firstName is the only merge field. ----
function buildEmail(lead) {
  return `Hey ${lead.firstName},

This is Preston, client success specialist from westOeast, just saw your request come through on my end so I wanted to write you a personal email to connect while our specialists work on your audit.

I took a look at your website and I think we would have a great time working together. I noticed that you didn't book in a time to chat with our GEO specialist Ethan. I want to make sure everything goes smoothly… are there any questions you'd like answered before you have a chat with him or were you just planning on booking it in once you get the report?

I'll drop the scheduling link right here for your convenience.

P.S. he only has a few spots open this week, so if you want to lock one in before they fill up, grab a time here: ${ETHAN_CALENDAR_LINK}

Talk soon,
Preston WestOEast`;
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
      emailFrom: `${FROM_NAME} <${FROM_EMAIL}>`,
      subject: `Quick Question About Your Free Audit (URGENT)`,
      html: emailBody.replace(/\n/g, '<br>')
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GHL send failed: ${errText}`);
  }
}

// ---- Fixed SMS templates, written by hand — sent as two separate texts. firstName is the only merge field. ----
function buildSMS(lead) {
  return [
    `Hey ${lead.firstName}, Preston here with westOeast, I'm the client success manager and I noticed that you just requested a free audit from our team. I took a quick look at your company website and I think things could be real interesting.`,
    `Looks like you didn't get a chance to book a meeting yet so I also wanted to use this as an opportunity to answer any/all questions you have regarding this. I also included the booking link here for your convenience! ${ETHAN_CALENDAR_LINK}`
  ];
}

// ---- Send both SMS texts through GHL's API, a few seconds apart ----
async function sendSMSViaGHL(lead) {
  const messages = buildSMS(lead);

  for (let i = 0; i < messages.length; i++) {
    const response = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': '2021-04-15'
      },
      body: JSON.stringify({
        type: 'SMS',
        contactId: lead.contactId,
        locationId: GHL_LOCATION_ID,
        fromNumber: FROM_PHONE,
        message: messages[i]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GHL SMS send failed: ${errText}`);
    }

    // Small gap before the second text so it reads as two natural messages
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 40000));
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lead bot listening on port ${PORT}`));
