# Scammeter

Paste a link and find out whether a Brazilian site looks like a scam, and why.

**Site:** https://lucianookdp.github.io/scammeter/

## How it works

The score adds up evidence of a scam. Every point comes with a plain-language
reason, so you can follow the arithmetic.

| Score | Verdict |
|---|---|
| 0–15 | Low risk |
| 15–40 | Attention |
| 40–70 | High risk |
| 70–100 | Very high risk |

A score on a boundary takes the higher band.

**Counts against a site:** a listed phishing address, a Pix key that pays a
person or another company, an inactive or brand-new company registration
(CNPJ), an address imitating a known brand, a page title claiming a brand the
address doesn't belong to, a password or card field under a borrowed brand, a
young domain, free hosting platforms, cheap endings such as `.shop`, and bait
words such as `saque` or `rastreio`.

**Counts in its favour:** a brand's official domain, restricted endings such as
`.gov.br`, being among the 100,000 most visited sites (Tranco), and an old
domain.

Age and popularity never cancel the strongest warning, and a site with no track
record never shows as low risk.

## Data sources

- Company registration: [BrasilAPI](https://brasilapi.com.br/)
- Domain age: RDAP (registro.br and others)
- Phishing list: [PhishDestroy](https://github.com/phishdestroy/destroylist)
- Popularity: [Tranco](https://tranco-list.eu/)

The address being checked is never sent to the list providers. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Structure

```
packages/
  core/       scoring rules, shared by everything else
  web/        the page, on GitHub Pages
  proxy/      the API the page calls, on Railway
  extension/  browser extension (not published yet)
```

## Running locally

```bash
corepack enable
pnpm install
pnpm test
pnpm dev:proxy   # API on :8787
pnpm dev:web     # page, already pointed at the local API
```

## Deploy

Pushes to `main` publish themselves: the page through GitHub Actions when
`web` or `core` changes, the proxy through Railway when `proxy` or `core`
changes and CI passes.

## License

MIT.
