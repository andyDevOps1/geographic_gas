export default async function handler(req, res) {
  try {
    const path = req.query.path;

    if (!path || typeof path !== "string") {
      return res.status(400).json({ error: "Missing path" });
    }

    const upstream = `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/${path}`;

    const r = await fetch(upstream, {
      headers: { Accept: "text/json" }
    });

    if (!r.ok) {
      return res.status(502).json({ error: "Upstream error", status: r.status });
    }

    const body = await r.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(body);
  } catch (e) {
    return res.status(500).json({ error: "Proxy failed" });
  }
}