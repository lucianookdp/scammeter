# Scammeter

A browser extension and a web page that tell you whether a Brazilian site is a
scam, and why. It cross-checks the company registration found on the page
against the domain and, when there is one, against the Pix key. It works for
any site, not only shops: a fake investment page, phishing and other fronts are
also just a domain and a payment key.

Site: https://lucianookdp.github.io/scammeter/

## How the score works

The score counts evidence of a scam. It does not count the absence of
evidence: a site that simply doesn't publish a company registration is not
penalised for it, because most of the web has no reason to publish one. That
absence only becomes a risk when the page is asking for a Pix payment — not
knowing who receives the money is then the whole problem.

Domain age and popularity can offset accumulated points, but never erase the
strongest warning. A negative result from a single phishing feed is not enough
to award "low risk". When every lookup is unavailable, the verdict is "could
not verify".

Every rule produces a reason in plain language, including the ones that
passed. The user always sees why the number is what it is.

## Signals

Live today:

- PhishDestroy primary phishing hostname feed, with source attribution and the
  time our server downloaded its copy.

- Domain age via RDAP, and whether the domain is old enough to vouch for itself.
- The company registration found on the page, checked against its official
  status with the federal revenue service.
- The Pix key: whether it pays a person instead of a company, and whether it
  pays a different company than the one named on the site.
- A known brand's name worn by a domain that isn't that brand's.
- Registries that scams cluster on (`.shop`, `.xyz`, and the rest).

Planned, and currently inert:

- Additional sources (Safe Browsing, URLhaus, PhishTank, OpenPhish) and the
  Tranco ranking. No popularity data is currently available.
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
