export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
