# Farejador de Ofertas

Buscador de ofertas com **nota própria** e **monitoramento de preços**. Sem dependências (só Node ≥ 20).

```bash
npm start            # http://localhost:3000
npm test
```

## O que faz

- **Busca multi-loja**: consulta vários provedores em paralelo; se um falhar, os outros continuam.
- **Nota Farejador (0–100)**: em vez de confiar no "de R$ X por R$ Y" da loja, compara cada oferta com a
  *mediana real* das demais. Também:
  - descarta resultados fora do assunto e marca **acessórios** (capa, película…) que distorcem a busca;
  - denuncia **desconto inflado** (a loja diz −50%, mas o preço está só 9% abaixo do mercado);
  - trata **usado** à parte (esperado ser ~30% mais barato) e marca **menor preço já visto**.
- **Produto específico, salvo e monitorado**, de dois jeitos:
  - *Monitorar busca* — acompanha a melhor oferta "de verdade" de um termo;
  - *Monitorar anúncio* — acompanha um anúncio exato; ou cole o **link de qualquer loja** (lê schema.org JSON-LD / Open Graph).
- **Alertas** (sino) quando atinge o preço-alvo, cai ≥ 5% ou bate mínima histórica; histórico com gráfico.
  Verificação automática a cada `MONITOR_MINUTES` (padrão 5) + botão "Verificar agora".

## Só lojas confiáveis

A opção **"Apenas lojas confiáveis"** (ligada por padrão) filtra *antes* de dar nota, para que preços
"bons demais" de golpistas não distorçam a mediana:

- **Mercado Livre**: só entram loja oficial, MercadoLíder Gold/Platinum, ou reputação verde com ≥ 100 vendas e ≥ 90% de avaliações positivas.
- **Links de qualquer loja**: só domínios de uma lista de varejistas conhecidos (Amazon, Magalu, KaBuM!, Casas Bahia, Americanas…).
  Acrescente os seus com `TRUSTED_DOMAINS=loja.com.br,outra.com` (ou use só os seus com `TRUSTED_DOMAINS_ONLY=1`).
- O contador mostra quantas ofertas foram ocultas; desmarque a opção para vê-las (com selo "Vendedor não verificado" e nota limitada).

## Provedores

| id | Descrição |
|----|-----------|
| `demo` | Catálogo simulado e determinístico (preços variam com o tempo). Funciona offline. |
| `mercadolivre` | API oficial do Mercado Livre (MLB). Exige credenciais — veja abaixo. |
| `pageurl` | Leitor de qualquer página de produto (só para monitorar link). Não funciona com lojas que renderizam o preço só via JavaScript. |

Novo provedor = um arquivo em `lib/providers/` com `{ id, name, search(q), getItem(id) }` retornando
`{ id, provider, title, price, oldPrice, url, image, store, condition, freeShipping, rating }`, registrado em `index.js`.

> Os provedores reais (`mercadolivre`, `pageurl`) foram cobertos por testes com fixtures, mas **não foram
> exercitados contra os sites ao vivo** (o ambiente de desenvolvimento não tinha acesso externo). Respeite os termos de uso de cada loja.

## Configuração

### Mercado Livre: token com renovação automática

1. Crie um app em <https://developers.mercadolivre.com.br> e copie o *Client ID* e o *Secret*.
2. `ML_CLIENT_ID=... ML_CLIENT_SECRET=... npm start` — o Farejador pede o token, renova antes de vencer
   e tenta de novo uma vez se a API responder 401/403. (Alternativa sem renovação: `ML_TOKEN`.)

`PORT` (3000) · `HOST` (127.0.0.1) · `MONITOR_MINUTES` (5) · `DATA_DIR` (./data, guarda `db.json`) · `ML_CLIENT_ID`/`ML_CLIENT_SECRET`/`ML_TOKEN` · `TRUSTED_DOMAINS`.
O servidor não tem autenticação: por padrão só escuta em localhost.
