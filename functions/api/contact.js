// Reject accidental GETs cleanly (so /api/contact in the browser isn't "Server error")
export const onRequestGet = async () =>
  new Response("Method Not Allowed", { status: 405 });

export const onRequestPost = async ({ request, env }) => {
  try {
    // --- read form ---
    const form = await request.formData();
    const name = (form.get("name") || "").toString().trim();
    const email = (form.get("email") || "").toString().trim();
    const message = (form.get("message") || "").toString().trim();
    const token = (form.get("cf-turnstile-response") || "").toString();

    if (!name || !email || !message || !token) {
      return new Response("Missing fields", { status: 400 });
    }

    // --- verify Turnstile ---
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET || "",
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || "",
      }),
    });

    let verify;
    try { verify = await verifyRes.json(); }
    catch { return new Response("Turnstile error", { status: 502 }); }

    if (!verify?.success) return new Response("Turnstile failed", { status: 400 });

    // --- send via SendGrid ---
    const subject = `New message from ${name}`;
    const text = `From: ${name} <${email}>\n\n${message}`;

    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: env.TO_EMAIL }] }],
        from: { email: env.FROM_EMAIL, name: "Contact Form" }, // must match your verified Single Sender
        reply_to: { email, name },
        subject,
        content: [{ type: "text/plain", value: text }],
      }),
    });

    if (!sgRes.ok) {
      const detail = await sgRes.text();
      return new Response(`SendGrid error: ${detail}`, { status: 502 });
    }

    // --- success: use an explicit 303 Location header (most reliable) ---
    return new Response(null, {
      status: 303,
      headers: { Location: "/contact-success.html" },
    });
  } catch {
    return new Response("Server error", { status: 500 });
  }
};
