# Scammeter

A browser extension and a web page that tell you whether a Brazilian site is a
scam, and why. It cross-checks the company registration found on the page
against the domain and, when there is one, against the Pix key. It works for
any site, not only shops: a fake investment page, phishing and other fronts are
also just a domain and a payment key.

Site: https://lucianookdp.github.io/scammeter/

## How the score works

The score counts evidence of a scam. It is a sum of weighted signals, not a
percentage and not a probability. Every rule produces a reason in plain
language with its weight, including the ones that passed, so the user can
follow the arithmetic.

| Score | Verdict |
|---|---|
| 0–14 | Low risk |
| 15–39 | Attention |
| 40–69 | High risk |
| 70–100 | Very high risk |

Rules that keep the number honest:

- **The strongest warning is a floor.** Domain age, popularity and an official
  suffix can offset accumulated points, but never below the heaviest single
  alert. A brand lookalike (45) or a Pix to a person (50) is always at least
  "high risk".
- **Combinations weigh more than their parts.** A brand name on a fresh domain,
  on a free hosting platform or next to bait words, and a cheap TLD on a fresh
  domain, each add their own line.
- **No track record is not low risk.** A site that is not popular, is less than
  a year old and shows no active company registration lands at 30
  ("attention"), even when nothing damning turned up.
- **Absence of a CNPJ is not penalised** unless the page asks for a Pix
  payment: most of the web has no reason to publish one.
- **Shared platforms don't lend their reputation.** A page on `vercel.app`,
  `github.io`, `sites.google.com` and the like does not inherit the platform's
  age or ranking.
- A negative result from a single phishing feed is not enough to award "low
  risk". When every lookup is unavailable, the verdict is "could not verify".

## Signals

Risk:

- PhishDestroy primary phishing hostname feed (100, forces "very high risk").
- A Pix key that pays a person (50) or a different company than the site names (50).
- An inactive company registration (45).
- A known brand's name on a domain that isn't the brand's (45), or the brand
  one letter off, including digit/letter swaps like `rnercadolivre` (50; 20 when
  the domain has existed for years).
- An IP address instead of a name (40), punycode labels (25).
- Domain age: under 30 days (35), 3 months (25), 6 months (15), a year (10).
- A page asking for Pix without naming the company (25).
- Free hosting platforms (15), bait words in the address such as `saque`,
  `rastreio`, `desbloqueio` (10), cheap TLDs such as `.shop` and `.xyz` (10).

Trust:

- The official domain of a known brand (−100).
- Restricted suffixes nobody registers without proof: `.gov.br`, `.jus.br`,
  `.leg.br`, `.mil.br`, `.mp.br`, `.b.br`, `.edu.br` (−40).
- Tranco top 100k (−40).
- Domain older than five years (−25) or two years (−10).
- Company registration active with the federal revenue service (no points, but
  counts as a track record).

Planned, and currently inert:

- Additional sources (Safe Browsing, URLhaus, OpenPhish).
- Page coherence: missing address, missing return policy, contact only through
  WhatsApp, broken social links, registrant and business-activity mismatches.

## Reputation checks

`GET /reputation/:domain` compares a normalized **exact hostname** with the
[PhishDestroy primary list](https://github.com/phishdestroy/destroylist).
It does not follow parent domains or infer that sibling subdomains are unsafe.
This deliberately leaves unlisted subdomains unverified by this source.
A match means the hostname appears in that feed; it is not proof of fraud.
Absence is not a safety certificate, and URL paths are not checked by this feed.

The API returns `blocklisted` (true, false or null), `source`, `sourceUrl`,
`fetchedAt` (our download time), `status` (available, stale or unavailable),
`match` (exact_hostname or null), and `top100k: null` for compatibility.
Cached lists expire after one hour and refresh on the next request. Concurrent
requests share a download; failures back off for one minute. An expired copy
is never used for a verdict. Downloads have an 8 MiB limit and a 3.5-second
body timeout. Cache is in memory per instance and resets on restart.

No credentials, paid services or cron jobs are required. Only the public feed
is requested upstream, never the hostname a user is checking. The UI links to
the source for inspection and false-positive reports. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the MIT data license.

## Popularity

`GET /popularity/:domain` looks up the registrable domain in the
[Tranco](https://tranco-list.eu/) top 100,000. The server downloads the latest
list once a day (32 MiB download cap, 20-second timeout) and keeps it in
memory; the hostname being checked is never sent upstream. It returns
`top100k` (true, false or null when the list isn't loaded), `rank`, `domain`,
`source`, `sourceUrl`, `fetchedAt` and `status`. A day-old copy keeps being
served, marked `stale`, while a refresh fails.

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
