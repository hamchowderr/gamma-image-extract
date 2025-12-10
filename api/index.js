/**
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 */
export default function handler(req, res) {
  res.json({
    name: "PDF to Image API",
    version: "1.0.0",
    status: "healthy",
    endpoints: {
      convert: "POST /api/convert",
    },
  });
}
