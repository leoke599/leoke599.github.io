// functions/api/contact.js

// Optional: reject accidental GETs so bots don't trip errors
export const onRequestGet = async () =>
  new Response("Method Not Allowed", { status: 405 });

export const onRequestPost = async ({ request, env }) => {
  try {
    // 1) Read form fields
    const form = await request.formData();
    const name = (form.get("name") || "").toString().trim();
    const email = (form.get("email") || "").toString().trim();
    const message = (form.get("message") || "").toString().trim();
    const token = (form.get("cf-turnstile-response") || "").toString();

    if (!name || !email || !message || !token) {
      return new Response("Missing fields", { status: 400 });
    }

    // 2) Verify Turnstile
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET || "",
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || "",
      }),
    });
    const verify = await verifyRes.json();
    if (!verify?.success) {
      return new Response("Turnstile failed", { status: 400 });
    }

    // 3) Send via SendGrid
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
        from: { email: env.FROM_EMAIL, name: "Contact Form" }, // must be your verified Single Sender
        reply_to: { email, name }, // lets you reply directly
        subject,
        content: [{ type: "text/plain", value: text }],
      }),
    });

    if (!sgRes.ok) {
      const detail = await sgRes.text();
      return new Response(`SendGrid error: ${detail}`, { status: 502 });
    }

    // 4) Redirect to a thank-you page
    return Response.redirect("/contact-success.html", 303);
  } catch (err) {
    return new Response("Server error", { status: 500 });
  }
};
