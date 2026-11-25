# Chrome Web Store: textos do anúncio

Tudo o que o painel de desenvolvedor pede, pronto para colar. O pacote é
`packages/extension/.output/scammeter-<versão>-chrome.zip` (`pnpm zip:extension`).

## Detalhes do produto

**Nome (vem do manifest):** Scammeter: detector de golpes e sites falsos

**Resumo (vem do manifest, 132 caracteres no máximo):**
Descubra se um site é golpe ou loja falsa antes de comprar ou pagar o Pix. Confere CNPJ, Pix, idade do domínio e lista de phishing.

**Categoria:** Ferramentas (Tools)

**Idioma:** Português (Brasil)

**Descrição:**

```
Esse site é confiável ou é golpe? O Scammeter avisa quando uma loja parece falsa, quando um link é phishing ou quando o Pix vai para a pessoa errada, e mostra o porquê.

Feito para o Brasil: lojas falsas com preço bom demais, golpe do Pix, sites que imitam bancos e grandes lojas, links recebidos por SMS, e-mail ou WhatsApp.

Você navega normalmente. Em cada site que abre, o Scammeter confere sozinho:
• se o endereço imita uma marca conhecida (ex.: "magazineluiza-ofertas.shop");
• se o site está numa lista pública de phishing;
• há quanto tempo o domínio existe (golpes costumam ter dias ou semanas);
• se a empresa (CNPJ) publicada na página está ativa na Receita Federal;
• se o Pix da página paga uma pessoa física em vez da empresa;
• se a página pede senha ou cartão usando o nome de outra marca.

Quando o risco é alto, aparece uma faixa vermelha no topo da página. O ícone na barra também muda: ✓ (tudo certo), ! (atenção), !! e !!! (risco). Clique no ícone para ver cada motivo e quanto ele pesou na nota. Nada de nota misteriosa: dá para conferir a conta.

Leve, até em computador fraco
Sites conhecidos (Google, bancos, grandes lojas) são reconhecidos na hora por listas que já vêm na extensão, sem ler a página nem consultar nada. Só sites desconhecidos são analisados a fundo.

Privado
• Sem conta, sem anúncios, sem rastreamento.
• O Scammeter não tem servidor: a análise acontece no seu navegador.
• Só sites desconhecidos geram consultas externas: o CNPJ à BrasilAPI (dados da Receita) e o domínio ao registro público (RDAP).
• Código aberto: github.com/lucianookdp/scammeter

Importante: é uma análise automática que ajuda a decidir, não uma garantia. Na dúvida, não pague.
```

## Imagens

- Ícone 128×128: `public/icon/128.png` (já vai no pacote)
- Capturas de tela 1280×800: `store/screenshot-1-aviso.png`, `store/screenshot-2-detalhes.png`
- Bloco promocional pequeno 440×280: `store/promo-440x280.png`

## Privacidade (aba "Práticas de privacidade")

**Finalidade única:**
Avisar o usuário quando o site aberto apresenta sinais de golpe ou phishing, explicando os motivos.

**Justificativa das permissões:**

- `storage`: guarda o resultado da análise de cada aba (mostrado no popup) e um cache curto das consultas, para não repetir a mesma consulta.
- `unlimitedStorage`: a lista pública de phishing, atualizada uma vez por dia, tem cerca de 5 MB; com o cache ela passaria do limite padrão.
- Permissões de host (`brasilapi.com.br`, `rdap.registro.br`, `rdap.org`, `raw.githubusercontent.com`): são as únicas fontes consultadas. BrasilAPI para a situação do CNPJ na Receita Federal, RDAP para a data de registro do domínio e GitHub para baixar a lista pública de phishing.
- Script de conteúdo em todos os sites (`http://*/*`, `https://*/*`): a finalidade é avisar em qualquer site que a pessoa abra. O script confere primeiro só o endereço; a página só é lida (título, campos de senha e cartão, CNPJ e Pix) quando o site é desconhecido, e o conteúdo não sai do computador.

**Código remoto:** Não, não uso código remoto.

**Dados coletados (marcar):**
- "Histórico da Web": o nome do domínio de sites desconhecidos é consultado no registro público RDAP para saber a idade do domínio.
- "Conteúdo do site": a página de sites desconhecidos é lida localmente; só um CNPJ encontrado nela é consultado na BrasilAPI.

**Declarações (marcar as três):**
- Não vendo nem transfiro dados de usuários a terceiros, fora dos casos de uso aprovados.
- Não uso nem transfiro dados de usuários para fins não relacionados à finalidade única do item.
- Não uso nem transfiro dados de usuários para determinar capacidade de crédito ou para empréstimos.

**URL da política de privacidade:** https://lucianookdp.github.io/scammeter/privacidade.html

## Distribuição

- Visibilidade: Pública
- Regiões: todas (o foco é o Brasil, mas não há motivo para bloquear)
- Preço: gratuito
