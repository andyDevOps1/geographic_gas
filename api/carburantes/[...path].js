export default async function handler(req, res) {
  try {
    const pathParts = req.query.path || [];
    const path = Array.isArray(pathParts) ? pathParts.join("/") : String(pathParts);

    const upstream =
      `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/${path}`;

    const r = await fetch(upstream, {
      headers: {
        // Importante: este servicio devuelve JSON de forma fiable con text/json
        Accept: "text/json",
      },
    });

    if (!r.ok) {
      res.status(502).json({ error: "Upstream error", status: r.status });
      return;
    }

    const body = await r.text();

    // Cache opcional para no machacar el servicio (Vercel CDN)
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(body);
  } catch (err) {
    res.status(500).json({ error: "Proxy failed" });
  }
}
