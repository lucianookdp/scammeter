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

Signals that clear a site are worth points too, so a domain registered twenty
years ago offsets smaller doubts. And "low risk" requires that something was
in fact checked: when every lookup comes back empty the verdict is "could not
verify", never a green light.

Every rule produces a reason in plain language, including the ones that
passed. The user always sees why the number is what it is.

## Signals

Live today:

- Domain age via RDAP, and whether the domain is old enough to vouch for itself.
- The company registration found on the page, checked against its official
  status with the federal revenue service.
- The Pix key: whether it pays a person instead of a company, and whether it
  pays a different company than the one named on the site.
- A known brand's name worn by a domain that isn't that brand's.
- Registries that scams cluster on (`.shop`, `.xyz`, and the rest).

Planned, and currently inert:

- Threat lists (Safe Browsing, URLhaus, PhishTank, OpenPhish) and the Tranco
  ranking. `/reputation` is a stub that reports "unverified" rather than a
  fabricated "clean", so nothing is scored on data we don't have.
- Page coherence: missing address, missing return policy, contact only through
  WhatsApp, broken social links, registrant and business-activity mismatches.

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
