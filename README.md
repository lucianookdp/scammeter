# Scammeter (Golpômetro)

A browser extension and web page that say, in plain language, whether a
Brazilian online store is a scam — and why. Focused on new scams that
aren't on any denunciation list yet: it cross-checks the CNPJ against the
domain and, at checkout, checks whether the Pix key actually belongs to the
store.

🇧🇷 [Leia em português abaixo](#golpômetro-pt-br).

## How it works

Three independent signal layers feed one scoring engine ([`packages/core`](packages/core)):

1. **Reputation** — known threat lists (Safe Browsing, URLhaus, PhishTank/OpenPhish) and the Tranco top-sites rank.
2. **Technical health** — domain age via RDAP, TLS certificate, redirect chain, cheap TLD + private WHOIS.
3. **Store coherence** — CNPJ found on the page cross-checked against its registration status, activity, and the domain's own age/registrant; and the Pix key at checkout compared against the store's own CNPJ.

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

## Golpômetro (PT-BR)

Uma extensão de navegador e uma página web que dizem, em linguagem simples, se
uma loja online brasileira é golpe e por quê. O foco é o golpe novo, que ainda
não está em nenhuma lista de denúncia.

### Como funciona

Três camadas de sinais independentes alimentam o mesmo motor de pontuação
([`packages/core`](packages/core)):

1. **Reputação** — bases de ameaças conhecidas (Safe Browsing, URLhaus, PhishTank/OpenPhish) e o ranking Tranco.
2. **Saúde técnica** — idade do domínio via RDAP, certificado SSL, cadeia de redirecionamentos, TLD barato com WHOIS privado.
3. **Coerência da loja** — CNPJ encontrado na página cruzado com sua situação cadastral, atividade e a idade/titular do próprio domínio; e o Pix do checkout comparado com o CNPJ da loja.

Cada regra gera um motivo em linguagem simples — o usuário sempre vê o *porquê*, não só a nota.

### Estrutura do monorepo

Veja acima — os nomes dos pacotes e comandos são os mesmos.

### Status

MVP em andamento.
