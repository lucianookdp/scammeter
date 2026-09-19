# Scammeter

A browser extension and a web page that tell you whether a Brazilian site is a
scam, and why. It cross-checks the company registration found on the page
against the domain and, when there is one, against the Pix key. It works for
any site, not only shops: a fake investment page, phishing and other fronts are
also just a domain and a payment key.

Site: https://lucianookdp.github.io/scammeter/

## How it works

Three layers of signals feed the same scoring engine (`packages/core`):

1. Reputation: known threat lists (Safe Browsing, URLhaus, PhishTank,
   OpenPhish) and the Tranco ranking.
2. Technical health: domain age via RDAP, SSL certificate, redirect chain,
   cheap TLD with private WHOIS.
3. Site coherence: the company registration found on the page, checked against
   its official status and against the age of the domain itself, and the Pix
   key compared with that same company.

Every rule produces a reason in plain language. The user always sees the
reason, not just the score.

## Running

```bash
corepack enable
pnpm install
pnpm test
pnpm dev:web
pnpm dev:proxy
```

The local proxy listens on `:8787` and the web page already points at it in
development.

## Structure

```
packages/
  core/       scoring engine, company registration and Pix (BR Code), no browser dependency
  web/        the "paste a link" page, published on GitHub Pages
  proxy/      API holding the keys, published on Railway
  extension/  Manifest V3 extension (WXT), not published yet
```

## Deploy

GitHub Pages for the web page, through the workflow in
`.github/workflows/deploy-web.yml`, on every push to `main`. The proxy lives on
Railway and is published manually with `railway up`.

## License

MIT.
