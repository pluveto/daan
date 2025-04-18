export default {
  fetch(request: { url: string }) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return Response.json({
        name: 'Cloudflare',
      });
    }
    return new Response(null, { status: 404 });
  },
};
