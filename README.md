# Scammeter

[![CI](https://github.com/lucianookdp/scammeter/actions/workflows/ci.yml/badge.svg)](https://github.com/lucianookdp/scammeter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Find out whether a Brazilian site looks like a scam, and why. A browser
extension that warns you on its own, and a page where you paste any link.
No server, no account, no tracking.

**Try it:** https://lucianookdp.github.io/scammeter/

[Português](#português) · [English](#english)

![The extension warning on a fake shop that asks for Pix to a personal key](packages/extension/store/screenshot-1-aviso.png)

## Português

**O que é.** O Scammeter diz se um site parece golpe e mostra cada motivo,
com o peso de cada um na nota. Funciona de dois jeitos:

- **Extensão para o Chrome:** você navega normalmente e ela confere sozinha
  cada site que você abre. Quando o risco é alto, aparece uma faixa vermelha no
  topo da página; o ícone na barra mostra ✓, !, !! ou !!!. Clicando no ícone,
  você vê os motivos.
- **Site:** cole qualquer link em
  [lucianookdp.github.io/scammeter](https://lucianookdp.github.io/scammeter/)
  e, se quiser, o CNPJ ou o código Pix da página.

**O que pesa contra um site:** estar numa lista de phishing, Pix que paga uma
pessoa física ou outra empresa, CNPJ inativo ou aberto há poucos meses,
endereço imitando uma marca, título ou campo de senha usando o nome de outra
marca, domínio recém-criado, hospedagem gratuita, terminações baratas (`.shop`)
e palavras de isca (`saque`, `rastreio`).

**O que conta a favor:** domínio oficial de uma marca, terminações restritas
(`.gov.br`), estar entre os 100 mil sites mais acessados e domínio antigo.

**Privacidade e leveza.** Não há servidor do Scammeter. Sites conhecidos são
reconhecidos na hora por listas que vêm dentro da extensão, sem ler a página nem
consultar nada. Só sites desconhecidos têm a página lida (no próprio
computador) e geram duas consultas públicas: o CNPJ à BrasilAPI e o domínio ao
registro (RDAP). Veja a [política de privacidade](https://lucianookdp.github.io/scammeter/privacidade.html).

## English

### How it works

The score adds up evidence of a scam. Every point comes with a plain-language
reason, so you can follow the arithmetic.

| Score | Verdict |
|---|---|
| 0–15 | Low risk |
| 15–40 | Attention |
| 40–70 | High risk |
| 70–100 | Very high risk |

A score on a boundary takes the higher band. Age and popularity never cancel
the strongest warning, and a site with no track record never shows as low risk.

**Counts against a site:** a listed phishing address, a Pix key that pays a
person or another company, an inactive or brand-new company registration
(CNPJ), an address imitating a known brand, a page title claiming a brand the
address doesn't belong to, a password or card field under a borrowed brand, a
young domain, free hosting platforms, cheap endings such as `.shop`, and bait
words such as `saque` or `rastreio`.

**Counts in its favour:** a brand's official domain, restricted endings such as
`.gov.br`, being among the 100,000 most visited sites (Tranco), and an old
domain.

### No server

Everything runs in the browser:

| Check | Source | Where it runs |
|---|---|---|
| Company registration (CNPJ) | [BrasilAPI](https://brasilapi.com.br/) | browser / extension worker |
| Domain age | RDAP (registro.br, rdap.org) | browser / extension worker |
| Phishing list | [PhishDestroy](https://github.com/phishdestroy/destroylist) | local copy, exact hostname match |
| Popularity | [Tranco](https://tranco-list.eu/) top 100k | local copy |
| Page title, password and card fields, CNPJ and Pix on the page | the open page | extension only |

`scripts/fetch-lists.mjs` downloads both lists at build time as sorted text,
and they are binary-searched in place (`SortedLines`): about 8 MB instead of
the ~40 MB a `Set` of 230,000 hostnames costs. The Pages site is rebuilt daily,
and the extension refreshes the phishing list once a day. The address being
checked is never sent to the list providers. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### The extension

The content script first sends only the address to the background worker. A
popular, official or government site is settled there from the local lists,
and the page is never read. Only for an unknown site does the content script
read the page (once idle, with `textContent`, so no forced layout) and send a
few values back. Only red verdicts get a banner; yellow stays on the toolbar
badge.

Permissions: `storage`, `unlimitedStorage`, and host access to the four data
sources only. Store listing texts and images are in
[`packages/extension/store/`](packages/extension/store/).

### Structure

```
packages/
  core/       scoring rules and browser-side lookups, shared by everything
  web/        the page, on GitHub Pages
  extension/  the Chrome extension (WXT, Manifest V3)
  proxy/      the original API server, kept for reference; nothing uses it
scripts/
  fetch-lists.mjs   downloads the phishing and popularity lists
```

### Running locally

```bash
corepack enable
pnpm install
pnpm lists             # download the phishing and popularity lists (once)
pnpm test
pnpm dev:web
pnpm dev:extension     # opens Chrome with the extension loaded
pnpm zip:extension     # the .zip for the Chrome Web Store
```

### Deploy

Pushes to `main` publish the page through GitHub Actions when `web`, `core` or
`scripts` change, and a daily run refreshes the lists.

## License

MIT.
