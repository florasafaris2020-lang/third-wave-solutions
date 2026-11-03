export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const init = { headers: { "content-type": "application/json; charset=utf-8" } };

    // --- D1 table initialisation (once) ---
    if (url.pathname === "/_init") {
      await env.BUSINESSES.executeSql(`
        CREATE TABLE IF NOT EXISTS businesses (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          price TEXT,
          location TEXT,
          contact TEXT,
          email TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL
        )
      `);
      return new Response(JSON.stringify({ok: true}), init);
    }

    // --- Submit a new business proposal ---
    if (url.pathname === "/api/business-submit" && request.method === "POST") {
      const body = await request.json();
      const id = crypto.randomUUID ? crypto.randomUUID() : ('' + Math.random()).slice(2, 22);
      const now = Math.floor(Date.now() / 1000);
      await env.BUSINESSES.executeSql(
        "INSERT INTO businesses (id, name, description, price, location, contact, email, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
        [id, body.name, body.description, body.price, body.location, body.contact, body.email, now]
      );
      const approveUrl = new URL('/approve', location.origin).href + '?id=' + id + '&action=approved';
      const declineUrl = new URL('/approve', location.origin).href + '?id=' + id + '&action=declined';
      return new Response(JSON.stringify({ok: true, id, approveUrl, declineUrl}), init);
    }

    // --- Approve / decline a submission ---
    if (url.pathname === "/approve") {
      const search = url.searchParams;
      const id = search.get("id");
      const action = search.get("action"); // 'approved' or 'declined'
      if (!id) return new Response(JSON.stringify({error: "missing id"}), {...init, status: 400});
      const status = action === "approved" ? "approved" : "declined";
      await env.BUSINESSES.executeSql(
        "UPDATE businesses SET status = ?, approved_at = ? WHERE id = ?",
        [status, Math.floor(Date.now() / 1000), id]
      );
      return new Response(JSON.stringify({ok: true, status}), init);
    }

    // Serve the home page for the root path.
    if (url.pathname === "/index.html") {
      return Response.redirect(new URL("/", url).toString(), 301);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    // Static assets resolve "404" (or "404.html" in some configurations).
    for (const candidate of ["/404", "/404.html"]) {
      const page = await env.ASSETS.fetch(new Request(new URL(candidate, url).toString(), request));
      if (page.ok) {
        return new Response(page.body, { status: 404, headers: page.headers });
      }
    }
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
