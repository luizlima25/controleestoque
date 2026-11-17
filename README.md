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

## Provedores

| id | Descrição |
|----|-----------|
| `demo` | Catálogo simulado e determinístico (preços variam com o tempo). Funciona offline. |
| `mercadolivre` | API pública do Mercado Livre (MLB). Se responder 401/403, defina `ML_TOKEN`. |
| `pageurl` | Leitor de qualquer página de produto (só para monitorar link). Não funciona com lojas que renderizam o preço só via JavaScript. |

Novo provedor = um arquivo em `lib/providers/` com `{ id, name, search(q), getItem(id) }` retornando
`{ id, provider, title, price, oldPrice, url, image, store, condition, freeShipping, rating }`, registrado em `index.js`.

> Os provedores reais (`mercadolivre`, `pageurl`) foram cobertos por testes com fixtures, mas **não foram
> exercitados contra os sites ao vivo** (o ambiente de desenvolvimento não tinha acesso externo). Respeite os termos de uso de cada loja.

## Configuração

`PORT` (3000) · `HOST` (127.0.0.1) · `MONITOR_MINUTES` (5) · `DATA_DIR` (./data, guarda `db.json`) · `ML_TOKEN`.
O servidor não tem autenticação: por padrão só escuta em localhost.
