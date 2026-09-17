# Scammeter

A browser extension and web page that say, in plain language, whether a
Brazilian site is a scam — and why. Not just fake stores: fake investment
platforms, phishing pages and other storefronts are all just a domain and a
Pix key, so the checks apply to any site, not only e-commerce. Focused on new
scams that aren't on any denunciation list yet: it cross-checks the CNPJ
against the domain and, wherever a Pix key shows up, checks whether it
actually belongs to that CNPJ.

🇧🇷 [Leia em português abaixo](#scammeter-pt-br).

## How it works

Three independent signal layers feed one scoring engine ([`packages/core`](packages/core)):

1. **Reputation** — known threat lists (Safe Browsing, URLhaus, PhishTank/OpenPhish) and the Tranco top-sites rank.
2. **Technical health** — domain age via RDAP, TLS certificate, redirect chain, cheap TLD + private WHOIS.
3. **Site coherence** — CNPJ found on the page cross-checked against its registration status, activity, and the domain's own age/registrant; and any Pix key on the page compared against that CNPJ.

Every rule contributes a signal with plain-language reasoning — the user always sees *why*, not just a score. See the full rule table and score thresholds in the project scope doc.

## Monorepo layout

```
packages/
  core/       scoring engine, CNPJ + Pix (BR Code) parsers — no browser dependency
  extension/  Manifest V3 extension (WXT)
  proxy/      Fastify API that holds the API keys (deployed on Railway)
  web/        "paste the link" page (deployed on GitHub Pages)
```

## Development

```bash
corepack enable
pnpm install
pnpm test              # core engine unit tests
pnpm dev:extension      # WXT dev server, load packages/extension/.output/chrome-mv3-dev in chrome://extensions
pnpm dev:web            # web page dev server
pnpm dev:proxy          # local proxy on :8787
```

## Status

MVP in progress. See the scope doc's roadmap for the v0.1–v0.6 plan.

---

## Scammeter (PT-BR)

Uma extensão de navegador e uma página web que dizem, em linguagem simples, se
um site brasileiro é golpe e por quê. Não é só loja falsa: site de
investimento fake, phishing e outras fachadas também são apenas um domínio e
uma chave Pix, então as checagens valem para qualquer site, não só
e-commerce. O foco é o golpe novo, que ainda não está em nenhuma lista de
denúncia.

### Como funciona

Três camadas de sinais independentes alimentam o mesmo motor de pontuação
([`packages/core`](packages/core)):

1. **Reputação** — bases de ameaças conhecidas (Safe Browsing, URLhaus, PhishTank/OpenPhish) e o ranking Tranco.
2. **Saúde técnica** — idade do domínio via RDAP, certificado SSL, cadeia de redirecionamentos, TLD barato com WHOIS privado.
3. **Coerência do site** — CNPJ encontrado na página cruzado com sua situação cadastral, atividade e a idade/titular do próprio domínio; e qualquer chave Pix na página comparada com esse CNPJ.

Cada regra gera um motivo em linguagem simples — o usuário sempre vê o *porquê*, não só a nota.

### Estrutura do monorepo

Veja acima — os nomes dos pacotes e comandos são os mesmos.

### Status

MVP em andamento.
