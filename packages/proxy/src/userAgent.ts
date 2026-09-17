// Some upstream APIs (BrasilAPI's Cloudflare front, notably) 403 requests
// with no User-Agent at all — Node's default fetch sends none.
export const PROXY_USER_AGENT = "scammeter-proxy/0.1 (+https://github.com/lucianookdp/scammeter)";
