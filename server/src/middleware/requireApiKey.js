/**
 * Requires x-api-key header to match ADMIN_API_KEY when set.
 * If ADMIN_API_KEY is not set, allows all requests (backward compatible for local dev).
 */
export function requireApiKey(req, res, next) {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) return next();

  const provided = req.headers['x-api-key'];
  if (provided !== apiKey) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or missing API key',
    });
  }
  next();
}
