export const onRequestGet = async () =>
  new Response("Method Not Allowed", { status: 405 });

export const onRequestPost = async ({ request, env }) => {
  try {
    // 1) Read form safely
    let form;
    try {
      form = await request.formData();
    } catch (e) {
      console.error("formData() failed", e);
      return new Response("Bad form submission", { status: 400 });
    }

    const name = (form.get("name") || "").toString().trim();
    const email = (form.get("email") || "").toString().trim();
    const message = (form.get("message") || "").toString().trim();
    const token = (form.get("cf-turnstile-response") || "").toString();

    if (!name || !email || !message || !token) {
      return new Response("Missing fields", { status: 400 });
    }

    // 2) Turnstile verify (comment this block out if you want to bypass)
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
    } catch (e) {
      console.error("Turnstile JSON parse failed", e);
      return new Response("Turnstile error", { status: 502 });
    }

    if (!verify?.success) {
      console.error("Turnstile failed payload:", verify);
      return new Response("Turnstile failed", { status: 400 });
    }

    // 3) SendGrid send
    const payload = {
      personalizations: [{ to: [{ email: env.TO_EMAIL }] }],
      from: { email: env.FROM_EMAIL, name: "Contact Form" },
      reply_to: { email, name },
      subject: `New message from ${name}`,
      content: [{ type: "text/plain", value: `From: ${name} <${email}>\n\n${message}` }],
    };

    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!sgRes.ok) {
      const detail = await sgRes.text();
      console.error("SendGrid error:", sgRes.status, detail);
      return new Response(`SendGrid error: ${detail}`, { status: 502 });
    }

    return Response.redirect("/contact-success.html", 303);
  } catch (err) {
    console.error("Unhandled crash:", err);
    return new Response("Server error", { status: 500 });
  }
};
