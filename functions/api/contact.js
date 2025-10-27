// functions/api/contact.js

export const onRequestGet = async () =>
  new Response("Method Not Allowed", { status: 405 });

export const onRequestPost = async ({ request, env }) => {
  try {
    // Read form
    const form = await request.formData();
    const name = (form.get("name") || "").toString().trim();
    const email = (form.get("email") || "").toString().trim();
    const message = (form.get("message") || "").toString().trim();
    const token = (form.get("cf-turnstile-response") || "").toString();

    if (!name || !email || !message || !token) {
      return new Response("Missing fields", { status: 400 });
    }

    // Turnstile verify
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
    try {
      verify = await verifyRes.json();
    } catch {
      return new Response("Turnstile error", { status: 502 });
    }

    if (!verify?.success) {
      return new Response("Turnstile failed", { status: 400 });
    }

    // Send via SendGrid
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
        reply_to: { email, name },
        subject,
        content: [{ type: "text/plain", value: text }],
      }),
    });

    if (!sgRes.ok) {
      const detail = await sgRes.text();
      // Return a readable error (so you don't see 1101)
      return new Response(`SendGrid error: ${detail}`, { status: 502 });
    }

    // Success — either redirect or inline “OK” page
    return Response.redirect("/contact-success.html", 303);
    // If you’d rather render inline success instead of redirect, use:
    // return new Response("<h1>Thanks!</h1><p>Your message was sent.</p>", { headers: { "content-type": "text/html" } });

  } catch (err) {
    // Final safety net: return a controlled 500 instead of throwing
    return new Response("Server error", { status: 500 });
  }
};
