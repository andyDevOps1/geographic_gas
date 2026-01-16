export default async function handler(req: any, res: any) {
  const parts = req.query?.path;
  const path = Array.isArray(parts) ? parts.join('/') : String(parts || '');

  const upstreamUrl = `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/${path}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.send(text);
  } catch (e: any) {
    res.status(500).json({ error: 'proxy_failed', detail: String(e?.message || e) });
  }
}

