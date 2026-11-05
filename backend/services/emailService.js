const DEFAULT_API_URL = "https://api.brevo.com/v3/smtp/email";

const SEND_TIMEOUT_MS = 15000;

// Render's free plan blocks mail ports, so this uses Brevo's web API
function isEmailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_ADDRESS);
}

async function sendEmail({ to, subject, text }) {
  const response = await fetch(process.env.BREVO_API_URL || DEFAULT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: {
        name: "Connected Vehicle",
        email: process.env.MAIL_FROM_ADDRESS,
      },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Email service replied ${response.status}`);
  }
}

module.exports = { isEmailConfigured, sendEmail };
