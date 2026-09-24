import { describe, expect, it } from "vitest";
import { pageAsksCredentials, pageTitle } from "../src/page.js";
import { companyMatchesHost, titleImpersonation } from "../src/domain.js";

describe("pageTitle", () => {
  it("decodes entities and collapses whitespace", () => {
    expect(pageTitle("<head><title>\n  Ita&uacute; &amp; Voc&ecirc; &#8211; Login </title>")).toBe("Itau & Voce – Login");
    expect(pageTitle("<html><body>no title</body></html>")).toBeNull();
    expect(pageTitle("<title>&#99999999;</title>")).toBe("&#99999999;");
    expect(pageTitle('<TITLE lang="pt">Loja</TITLE>')).toBe("Loja");
    expect(pageTitle("<titles>no</titles><title>Sim</title>")).toBe("Sim");
  });
});

describe("pageAsksCredentials", () => {
  it("spots password and card fields, not ordinary inputs", () => {
    expect(pageAsksCredentials('<input class="x" type="password" name="senha">')).toBe(true);
    expect(pageAsksCredentials("<input type=password>")).toBe(true);
    expect(pageAsksCredentials('<input autocomplete="cc-number">')).toBe(true);
    expect(pageAsksCredentials('<input name="numero_cartao">')).toBe(true);
    expect(pageAsksCredentials('<input id="card-cvv" maxlength="4">')).toBe(true);
    expect(pageAsksCredentials('<input type="search" name="q"><input type="email">')).toBe(false);
    expect(pageAsksCredentials("<p>Informe o CVV do cartão</p>")).toBe(false);
    expect(pageAsksCredentials('<INPUT TYPE="PASSWORD">')).toBe(true);
    expect(pageAsksCredentials('<inputs type="password">')).toBe(false);
  });
});

describe("hostile markup", () => {
  // Each of these used to take minutes on a proxy-sized page (regex restarts
  // at every "<input"/"<title" and runs to the end). The bound is generous;
  // the linear scan needs a few milliseconds.
  it.each([
    ["unclosed inputs", "<input ".repeat(200_000)],
    ["unclosed inputs with attributes", '<input name="a '.repeat(100_000)],
    ["inputs closed once at the end", "<input ".repeat(200_000) + ">"],
    ["unclosed titles", "<title ".repeat(200_000)],
    ["titles never closed", "<title>".repeat(200_000)],
  ])("stays linear on %s", (_label, html) => {
    const started = performance.now();
    pageAsksCredentials(html);
    pageTitle(html);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("titleImpersonation", () => {
  it("names the brand a title claims on someone else's address", () => {
    expect(titleImpersonation("Nubank - Acesse sua conta", "atendimento-online24.com")).toBe("Nubank");
    expect(titleImpersonation("Itaú | Internet Banking", "seguro-acesso.site")).toBe("Itaú");
    expect(titleImpersonation("Banco do Brasil Atualização Cadastral", "bb-att.online")).toBe("Banco do Brasil");
    expect(titleImpersonation("gov.br: Consulta de restituição", "consulta-restituicao.com")).toBe("gov.br");
  });

  it("stays quiet on the brand's own domain and on passing mentions", () => {
    expect(titleImpersonation("Nubank - Acesse sua conta", "nubank.com.br")).toBeNull();
    expect(titleImpersonation("Receita Federal", "www.gov.br")).toBeNull();
    expect(titleImpersonation("Capinha para Samsung e Nubank", "lojadecapas.com.br")).toBeNull();
    expect(titleImpersonation("Caixa de Som JBL | Ofertas", "somloja.com.br")).toBeNull();
    expect(titleImpersonation("Lojas Pompéia - A moda é toda sua", "www.lojaspompeia.com.br")).toBeNull();
    expect(titleImpersonation(null, "x.com")).toBeNull();
  });
});

describe("companyMatchesHost", () => {
  it("ties a company to its trading domain", () => {
    expect(companyMatchesHost(["MAGAZINE LUIZA S/A"], "www.magazineluiza.com.br")).toBe(true);
    expect(companyMatchesHost(["MERCADO LIVRE BRASIL LTDA", "MERCADO LIVRE"], "mercadolivre.com.br")).toBe(true);
    expect(companyMatchesHost(["LOJAS RENNER S.A."], "www.lojasrenner.com.br")).toBe(true);
  });

  it("flags a legal name unlike the address", () => {
    // Real, but worth a second look: Lojas Pompéia trades as Lins Ferrão.
    expect(companyMatchesHost(["LINS FERRAO ARTIGOS DO VESTUARIO LTDA", ""], "www.lojaspompeia.com.br")).toBe(false);
    // Generic words alone never tie a company to an address.
    expect(companyMatchesHost(["LOJAS COMERCIO DIGITAL LTDA"], "lojas-digital-ofertas.shop")).toBe(false);
  });
});
