// Proxy RSS server-side (Vercel Node.js runtime). Los feeds de los
// medios de Santiago del Estero no mandan CORS y bloquean (403) a
// los proxies públicos. Esta función los fetchea desde el server
// con el cliente http/https nativo de Node (más robusto que fetch
// para timeouts y errores de red) y devuelve el XML crudo.
import https from 'https'
import http from 'http'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url requerida' })

  let targetUrl
  try {
    targetUrl = decodeURIComponent(url)
    new URL(targetUrl) // valida que sea URL válida
  } catch {
    return res.status(400).json({ error: 'URL inválida' })
  }

  try {
    const data = await new Promise((resolve, reject) => {
      const client = targetUrl.startsWith('https') ? https : http
      const request = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        timeout: 8000,
      }, (response) => {
        let body = ''
        response.on('data', chunk => body += chunk)
        response.on('end', () => resolve({ status: response.statusCode, body }))
      })
      request.on('error', reject)
      request.on('timeout', () => { request.destroy(); reject(new Error('timeout')) })
    })

    if (data.status >= 400) {
      return res.status(502).json({ error: `Feed respondió ${data.status}` })
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300')
    return res.status(200).send(data.body)

  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
