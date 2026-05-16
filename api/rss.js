// Proxy RSS server-side. Los feeds de los medios de Santiago del
// Estero (Nuevo Diario, Panorama, El Liberal) no mandan CORS y
// además bloquean (403) a los proxies públicos compartidos. Este
// endpoint los fetchea desde el server de Vercel —sin CORS, con
// un User-Agent de browser— y devuelve el XML crudo al portal,
// que lo parsea con parseRssXml() como ya hacía.
export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url requerida' })

  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ComunasBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const xml = await response.text()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/xml')
    res.status(200).send(xml)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
