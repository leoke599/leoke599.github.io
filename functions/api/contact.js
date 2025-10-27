export const onRequestPost = async ({ request, env }) => {
  const form = await request.formData();
  const name = form.get("name");
  const email = form.get("email");
  const message = form.get("message");
  const token = form.get("cf-turnstile-response");

  if (!name || !email || !message || !token)
    return new Response("Missing fields", { status: 400 });

  // Turnstile verify
  const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token }),
  }).then(r => r.json());
  if (!verify.success) return new Response("Turnstile failed", { status: 400 });

  // Send via SendGrid
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: env.TO_EMAIL }] }],
      from: { email: env.FROM_EMAIL, name: "Contact Form" },
      reply_to: { email, name },
      subject: `New message from ${name}`,
      content: [{ type: "text/plain", value: `From: ${name} <${email}>\n\n${message}` }],
    }),
  });

  if (!res.ok) return new Response(`SendGrid error: ${await res.text()}`, { status: 502 });
  return Response.redirect("/contact-success.html", 303);
};
