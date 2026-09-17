# Scammeter

Extensão de navegador e página web que dizem se um site brasileiro é golpe, e por quê. Cruza o CNPJ da empresa com o domínio e, quando existe, com a chave Pix. Funciona para qualquer site, não só lojas: página de investimento falsa, phishing e outras fachadas também são só um domínio e uma chave Pix.

Site: https://lucianookdp.github.io/scammeter/

## Como funciona

Três camadas de sinais alimentam o mesmo motor de pontuação (`packages/core`):

1. Reputação: listas de ameaças conhecidas (Safe Browsing, URLhaus, PhishTank, OpenPhish) e o ranking Tranco.
2. Saúde técnica: idade do domínio via RDAP, certificado SSL, cadeia de redirecionamentos, TLD barato com WHOIS privado.
3. Coerência do site: CNPJ encontrado na página cruzado com sua situação cadastral e a idade do próprio domínio, e a chave Pix comparada com esse CNPJ.

Cada regra gera um motivo em linguagem simples. O usuário sempre vê o motivo, não só a nota.

## Rodando

```bash
corepack enable
pnpm install
pnpm test
pnpm dev:web
pnpm dev:proxy
```

O proxy local sobe em `:8787` e a página web já aponta pra ele em desenvolvimento.

## Estrutura

```
packages/
  core/       motor de pontuação, CNPJ e Pix (BR Code), sem dependência de navegador
  web/        página "cole o link", publicada no GitHub Pages
  proxy/      API em Fastify que guarda as chaves, publicada no Railway
  extension/  extensão Manifest V3 (WXT), ainda não publicada
```

## Deploy

GitHub Pages para a página web, pelo workflow em `.github/workflows/deploy-web.yml`, a cada push na `main`. O proxy fica no Railway, publicado manualmente com `railway up`.

## Licença

MIT.
