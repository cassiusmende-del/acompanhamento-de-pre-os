# Análise técnica — Histórico de preços Amazon Brasil (uso pessoal)

> Status: **proposta para aprovação**. Nenhum código foi escrito ainda.
> Revisão 01/10/2026: decisões do usuário incorporadas na **seção 12**, que prevalece
> sobre as seções anteriores onde houver diferença.
> Data da análise: 01/10/2026.

O objetivo do sistema é responder, com dados observados:

> "Como o preço atual se comporta em relação ao histórico deste produto?"

Este documento cobre, na ordem pedida: arquitetura, modelo de dados, fluxo de coleta,
fluxo de processamento, cálculo das métricas, interface, estratégia de histórico,
riscos e limitações, stack e plano de implementação. No final há uma lista de
**decisões que dependem de você** antes de começar.

---

## 0. Resumo executivo

- **A coleta é o ponto crítico, não a análise.** Não existe API pública que exponha o
  carrinho pessoal. As fontes legítimas de preço têm restrições de elegibilidade ou de
  termos de uso que afetam diretamente a ideia de "guardar histórico" (detalhes na seção 3).
- Por isso a arquitetura isola a coleta atrás de `PriceProvider` e trata a origem de
  cada observação como dado de primeira classe. O resto do sistema (histórico,
  métricas, alertas, interface) funciona igual para qualquer fonte.
- Proposta para o MVP: começar com `MockPriceProvider` (desenvolvimento) e
  `ManualPriceProvider` (registro por formulário e por um "bookmarklet" que captura o
  preço da página que **você** está vendo no seu navegador). Depois, adicionar
  `AmazonCreatorsApiProvider` se você for elegível. A automação de navegador fica como
  opção avaliada, não como padrão.
- Aplicação única em Next.js + um processo *worker* no mesmo código, PostgreSQL e
  Prisma, tudo em Docker Compose. Sem microsserviços.
- Toda métrica é descritiva. Quando faltam dados, o sistema diz isso em vez de estimar.

---

## 1. Arquitetura

### 1.1 Visão geral

```
┌──────────────────────────── docker compose ────────────────────────────┐
│                                                                        │
│  ┌──────────────┐        ┌──────────────────┐        ┌──────────────┐  │
│  │  web         │        │  worker          │        │  postgres    │  │
│  │  Next.js     │        │  (mesmo código,  │        │  16          │  │
│  │  UI + rotas  │◀──────▶│  outro entry-    │◀──────▶│              │  │
│  │  de servidor │  DB    │  point)          │   DB   │  volume      │  │
│  └──────────────┘        └──────────────────┘        └──────────────┘  │
│         ▲                         │                                    │
│         │ bookmarklet /           │ PriceProvider                      │
│         │ registro manual         ▼                                    │
│      você (navegador)      Creators API / Mock / (Browser opcional)    │
└────────────────────────────────────────────────────────────────────────┘
```

- **web**: Next.js (App Router). Páginas, *server actions* e algumas rotas HTTP
  (cadastro de produto, registro manual, endpoint do bookmarklet, exportação).
- **worker**: processo Node de longa duração com o agendador de coletas. Compartilha
  o mesmo pacote TypeScript e o mesmo Prisma Client. Separado do web para que uma
  coleta lenta nunca trave a interface e para que o web possa reiniciar sem
  interromper a coleta.
- **postgres**: única fonte de verdade.

### 1.2 Módulos (monólito modular)

```
src/
  domain/          tipos e regras puras (Money, Asin, Observation, EventType)
  providers/       PriceProvider + implementações (mock, manual, creators-api, browser)
  collection/      agendador, collection runs, normalização, validação, gravação
  processing/      detecção de eventos, atualização do snapshot do produto
  analytics/       funções PURAS de estatística (sem acesso a banco) — testadas à exaustão
  alerts/          avaliação de regras de alerta (lê o banco; não conhece o coletor)
  notifications/   canais de saída (pós-MVP: e-mail, Telegram, ntfy)
  app/             páginas e rotas Next.js
  worker/          entrypoint do worker
```

Regras de dependência:

- `analytics` não importa nada de banco nem de provider: recebe séries e devolve números.
- `alerts` depende de `analytics` e do banco, **nunca** de `collection` ou `providers`.
  O coletor apenas grava; o processamento e os alertas reagem ao que foi gravado.
- `app` e `worker` só falam com `providers` através de `PriceProvider`.

### 1.3 Abstração `PriceProvider`

```ts
interface PriceProvider {
  readonly id: ProviderId;                 // "mock" | "manual" | "creators_api" | "browser" | ...
  readonly capabilities: {
    automatic: boolean;                    // pode ser chamado pelo agendador?
    shipping: boolean;                     // informa frete?
    coupon: boolean;                       // informa cupom?
    seller: boolean;
    listPrice: boolean;                    // informa preço "de" (referência exibida)?
  };
  getPrice(product: ProductRef): Promise<ProviderResult>;
}

type ProviderResult =
  | { status: "OK"; offer: OfferSnapshot; raw: unknown }
  | { status: "UNAVAILABLE"; reason: string; raw: unknown }      // produto sem oferta
  | { status: "NOT_FOUND"; raw: unknown }                         // ASIN inválido/removido
  | { status: "BLOCKED"; reason: string }                         // CAPTCHA, 403, cota
  | { status: "ERROR"; error: string; retryable: boolean };

interface OfferSnapshot {
  priceCents: number;            // preço do item, em centavos
  currency: "BRL";
  listPriceCents?: number;       // preço "de" exibido pela Amazon, se houver
  shippingCents?: number | null; // null = desconhecido; 0 = frete grátis confirmado
  couponDescription?: string;
  couponValueCents?: number;
  totalCents?: number;           // só quando todos os componentes são conhecidos
  sellerName?: string;
  sellerId?: string;
  fulfilledByAmazon?: boolean;
  isBuyBoxWinner?: boolean;
  condition: "NEW" | "USED" | "REFURBISHED" | "UNKNOWN";
  availability: string;          // texto/código normalizado
  observedAt: Date;              // momento real da leitura
}
```

Pontos importantes:

- `BLOCKED` é um resultado legítimo e esperado. O sistema **não tenta contornar**:
  registra, aplica *backoff* e mostra na tela de coletas.
- `UNAVAILABLE` nunca vira preço zero. Vira observação sem preço.
- O payload bruto (`raw`) é guardado para auditoria e reprocessamento.

---

## 2. Modelo de dados

### 2.1 Decisões de modelagem

- **Dinheiro em centavos (`Int`)** + coluna `currency`. Nunca `float`.
- **Timestamps em UTC (`timestamptz`)**; exibição em `America/Sao_Paulo`.
- **`price_observations` é append-only.** Imutabilidade garantida no banco por
  *trigger* que rejeita `UPDATE` e `DELETE`, não só por convenção no código.
- **Correções administrativas** não alteram a observação: criam um registro em
  `observation_corrections` (excluir da análise, ou substituir valor, com motivo).
  A análise lê a *view* `effective_observations`, que aplica as correções.
  O dado original continua lá para sempre.
- **Eventos (`price_events`) são derivados** e podem ser recalculados a partir das
  observações. Mesmo assim são persistidos, porque registram explicitamente a mudança
  (requisito 4) e servem de trilha de auditoria.
- **Origem sempre registrada** (`source`): `creators_api`, `manual`, `bookmarklet`,
  `browser`, `mock`, `import_keepa` etc. A interface pode filtrar por origem.

### 2.2 Tabelas

| Tabela | Papel |
|---|---|
| `products` | Produto monitorado (ASIN, título, URL, condição acompanhada, ativo/pausado, intervalo de coleta). |
| `price_observations` | Cada leitura de preço. Imutável. |
| `observation_corrections` | Correções administrativas explícitas sobre observações. |
| `price_events` | Mudanças detectadas entre observações consecutivas. |
| `alerts` | Regras de alerta configuradas por produto. |
| `alert_events` | Cada disparo de alerta, com o retrato das métricas no momento. |
| `collection_runs` | Cada execução de coleta (início, fim, provider, contagem de OK/erros/bloqueios). |
| `product_snapshots` | Cache das métricas principais por produto (para a listagem). Recalculável. |
| `settings` | Configurações chave/valor (CEP de referência, intervalos padrão, limiares). |

### 2.3 Esboço do schema Prisma

```prisma
enum Condition        { NEW USED REFURBISHED UNKNOWN }
enum ObservationStatus{ OK UNAVAILABLE NOT_FOUND BLOCKED ERROR }
enum PriceEventType   { PRICE_DROP PRICE_INCREASE PRICE_UNCHANGED PRICE_UNAVAILABLE PRICE_AVAILABLE_AGAIN FIRST_PRICE }
enum AlertType        { PRICE_BELOW PERCENTILE_AT_OR_BELOW AT_OR_BELOW_ALL_TIME_LOW DROP_PERCENT BELOW_AVERAGE }
enum CorrectionAction { EXCLUDE REPLACE_PRICE }
enum RunStatus        { RUNNING SUCCEEDED PARTIAL FAILED }

model Product {
  id              String   @id @default(cuid())
  asin            String   @db.VarChar(10)
  marketplace     String   @default("amazon.com.br")
  title           String
  url             String
  trackedCondition Condition @default(NEW)
  active          Boolean  @default(true)
  collectEveryMin Int      @default(360)          // 4x/dia
  createdAt       DateTime @default(now()) @db.Timestamptz
  observations    PriceObservation[]
  events          PriceEvent[]
  alerts          Alert[]
  snapshot        ProductSnapshot?
  @@unique([asin, marketplace, trackedCondition])
}

model PriceObservation {
  id             String   @id @default(cuid())
  productId      String
  asin           String   @db.VarChar(10)          // redundante de propósito: histórico autocontido
  observedAt     DateTime @db.Timestamptz          // quando o preço foi lido
  recordedAt     DateTime @default(now()) @db.Timestamptz
  status         ObservationStatus
  priceCents     Int?                              // null quando não há preço. Nunca 0 por ausência.
  currency       String   @default("BRL") @db.Char(3)
  listPriceCents Int?                              // preço "de" exibido
  shippingCents  Int?                              // null = desconhecido
  couponText     String?
  couponCents    Int?
  totalCents     Int?                              // só quando todos os componentes são conhecidos
  sellerName     String?
  sellerId       String?
  fulfilledByAmazon Boolean?
  isBuyBoxWinner Boolean?
  condition      Condition @default(UNKNOWN)
  availability   String?
  source         String                            // creators_api | manual | bookmarklet | browser | mock | import_*
  collectionRunId String?
  rawPayload     Json?
  product        Product  @relation(fields: [productId], references: [id])
  corrections    ObservationCorrection[]
  @@index([productId, observedAt])
}

model ObservationCorrection {
  id            String   @id @default(cuid())
  observationId String
  action        CorrectionAction
  newPriceCents Int?
  reason        String
  createdAt     DateTime @default(now()) @db.Timestamptz
  observation   PriceObservation @relation(fields: [observationId], references: [id])
}

model PriceEvent {
  id                 String   @id @default(cuid())
  productId          String
  observationId      String   @unique              // observação que gerou o evento
  previousObservationId String?
  type               PriceEventType
  occurredAt         DateTime @db.Timestamptz
  previousPriceCents Int?
  newPriceCents      Int?
  deltaCents         Int?
  deltaPercent       Decimal? @db.Decimal(9, 4)
  sellerChanged      Boolean  @default(false)
  product            Product  @relation(fields: [productId], references: [id])
  @@index([productId, occurredAt])
}

model Alert {
  id          String    @id @default(cuid())
  productId   String
  type        AlertType
  thresholdCents Int?                    // PRICE_BELOW
  percent     Decimal?  @db.Decimal(6,2) // PERCENTILE_AT_OR_BELOW (ex.: 10) / DROP_PERCENT (ex.: 10)
  enabled     Boolean   @default(true)
  cooldownMin Int       @default(1440)
  lastState   Boolean   @default(false)  // condição estava satisfeita na última avaliação?
  createdAt   DateTime  @default(now()) @db.Timestamptz
  product     Product   @relation(fields: [productId], references: [id])
  events      AlertEvent[]
}

model AlertEvent {
  id            String   @id @default(cuid())
  alertId       String
  observationId String
  triggeredAt   DateTime @default(now()) @db.Timestamptz
  message       String                    // frase descritiva, ex.: "R$ 639,90 — abaixo de R$ 650,00"
  metrics       Json                      // retrato: atual, mín., média, mediana, percentil, N
  notifiedAt    DateTime? @db.Timestamptz
  alert         Alert    @relation(fields: [alertId], references: [id])
}

model CollectionRun {
  id         String    @id @default(cuid())
  provider   String
  trigger    String                        // schedule | manual | retry
  startedAt  DateTime  @default(now()) @db.Timestamptz
  finishedAt DateTime? @db.Timestamptz
  status     RunStatus
  okCount    Int @default(0)
  unavailableCount Int @default(0)
  blockedCount Int @default(0)
  errorCount Int @default(0)
  log        Json?
}

model ProductSnapshot { /* métricas cacheadas para a listagem; recalculável a qualquer momento */ }
model Setting { key String @id  value Json  updatedAt DateTime @updatedAt }
```

### 2.4 Imutabilidade no banco

Migration SQL manual (Prisma permite SQL cru em migrations):

```sql
CREATE FUNCTION forbid_observation_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'price_observations é imutável; use observation_corrections';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER price_observations_immutable
BEFORE UPDATE OR DELETE ON price_observations
FOR EACH ROW EXECUTE FUNCTION forbid_observation_mutation();
```

E a view usada pela análise:

```sql
CREATE VIEW effective_observations AS
SELECT o.*, COALESCE(c.new_price_cents, o.price_cents) AS effective_price_cents
FROM price_observations o
LEFT JOIN LATERAL (
  SELECT * FROM observation_corrections c
  WHERE c.observation_id = o.id ORDER BY c.created_at DESC LIMIT 1
) c ON true
WHERE c.action IS DISTINCT FROM 'EXCLUDE';
```

---

## 3. Coleta — avaliação das fontes

Esta é a seção mais importante da análise. Resumo: **não há uma fonte que seja ao
mesmo tempo gratuita, oficial, sem requisitos de elegibilidade e que permita guardar
histórico sem conflito com os termos.** Cada opção abaixo tem um custo diferente.

### 3.1 Amazon Creators API (sucessora da PA-API 5.0)

**Situação atual.** A Product Advertising API 5.0 foi descontinuada: deprecação em
30/04/2026 e desligamento do endpoint em 15/05/2026; chamadas antigas recebem
`403 AccessDeniedException`. A sucessora é a **Creators API**, uma API REST para
afiliados/criadores, com autenticação diferente (credenciais de cliente + token, em
vez da assinatura por requisição da PA-API). Bibliotecas de terceiros já suportam
o marketplace Brasil.

**O que entrega (operação `GetItems` por ASIN, recurso `OffersV2`):**

| Campo | Disponível | Observação |
|---|---|---|
| Preço da oferta (`Price.Money`) | Sim | Valor, moeda e texto formatado. |
| Preço de referência (`Price.SavingBasis`) | Às vezes | É o "preço de" exibido — útil para detectar falsa promoção (seção 5.8). |
| Disponibilidade | Sim | |
| Condição (novo/usado) | Sim | |
| Vendedor (`MerchantInfo`) | Sim | |
| Vencedor do Buy Box (`IsBuyBoxWinner`) | Sim | Indica a oferta "principal" da página. |
| Detalhes de oferta-relâmpago (`DealDetails`) | Sim | |
| Frete para o seu CEP | **Não** de forma confiável | Depende de endereço/Prime. |
| Cupons "clicáveis" | **Não** | |
| Preço do carrinho | **Não** | A API vê ofertas públicas, não o seu carrinho. |

O suporte a parâmetros varia por marketplace; é preciso validar no Brasil o que de
fato vem preenchido (isso será a primeira tarefa da etapa de integração).

**Requisitos e limites:**

- Exige conta aprovada no **Programa de Associados Amazon** (no Brasil) e, para
  acessar a API, **pelo menos 10 vendas qualificadas nos últimos 30 dias**.
- O acesso é **perdido após 30 dias consecutivos sem vendas qualificadas**.
- Cota inicial: 1 requisição/segundo e 8.640/dia — sobra para uso pessoal
  (100 produtos × 4 coletas/dia = 400 requisições; `GetItems` aceita até 10 ASINs por chamada).
- **Restrição de termos sobre armazenamento.** As políticas do programa limitam
  armazenamento/cache do "Product Advertising Content" e exigem data/hora junto ao
  preço quando os dados não são atualizados de hora em hora. Há registro público de que
  a Amazon considera guardar histórico de preços como cache além do permitido.
  **Isso conflita diretamente com o objetivo do sistema.** Para uma aplicação
  particular, não publicada, o risco prático é baixo, mas é um conflito contratual real
  e você deve decidir conscientemente. Eu não recomendo apresentar isso como "permitido".

**Avaliação:** a fonte tecnicamente mais limpa e estável, mas para a maioria das
pessoas físicas **a elegibilidade é o bloqueio** (10 vendas/mês como afiliado), e há o
conflito de termos sobre histórico.

### 3.2 Outras APIs oficiais

- **Selling Partner API (SP-API) — Product Pricing (`getItemOffers`)**: retorna ofertas,
  frete e Buy Box de qualquer ASIN, mas exige conta de **vendedor** (plano profissional,
  pago) e aprovação de aplicação de desenvolvedor para um caso de uso de vendedor.
  Usar para monitorar compras pessoais está fora do uso aceitável. **Não recomendado.**
- **Não existe API pública de carrinho, lista de desejos ou conta de cliente.**
  Não vou presumir que exista nem tentar usar endpoints internos do site/app.

### 3.3 Fonte de dados de terceiros (ex.: Keepa)

- Serviço pago com API que cobre `amazon.com.br` e tem histórico anterior ao início do
  seu monitoramento.
- Encaixa bem como **provider opcional e importação inicial** (backfill), sempre
  marcado com `source = import_keepa`, nunca misturado silenciosamente ao histórico
  coletado por você. A interface pode mostrar "histórico próprio" vs "histórico importado".
- Isso não contradiz o requisito 13: o dado de terceiro aqui é **observação de preço**,
  não "avaliação" de se o preço é bom. A análise continua sendo feita pelo seu sistema.
- Custo e limites de plano precisam ser verificados no momento da contratação.

### 3.4 Automação de navegador (`AmazonBrowserProvider`)

Avaliação antes de qualquer implementação:

- **Termos de uso da Amazon** proíbem o uso de robôs e ferramentas de extração de dados
  no site. Mesmo com baixa frequência, é violação dos termos.
- **Mecanismos anti-bot**: a Amazon serve CAPTCHA e páginas de bloqueio para tráfego
  automatizado. Como **não** haverá bypass de CAPTCHA, rotação de IP, falsificação de
  fingerprint nem qualquer evasão, a confiabilidade será limitada: quando bloquear, a
  coleta simplesmente falha com `BLOCKED` e espera.
- **Fragilidade**: o HTML muda com frequência; seletores quebram sem aviso; o preço
  exibido varia por CEP, Prime e teste A/B.
- **Sessão pessoal**: usar cookies da sua conta para ver o carrinho é exatamente o que
  **não** vou implementar (risco de bloqueio da conta e armazenamento indevido de sessão).

Se você decidir usar mesmo assim, as salvaguardas seriam: sem login; frequência baixa e
fixa; uma página por vez; parar no primeiro CAPTCHA e pausar o provider por horas;
nenhum disfarce de automação. Minha recomendação é **não** usar como fonte principal.

### 3.5 Captura assistida pelo usuário (`ManualPriceProvider` + bookmarklet)

Alternativa pragmática e de baixo risco:

- **Formulário manual**: você digita preço, vendedor, frete, cupom.
- **Bookmarklet / extensão mínima**: enquanto você navega normalmente na Amazon,
  um clique envia para o seu servidor o ASIN, o preço exibido, o vendedor e o "preço de"
  **da página que você já está vendo**. Não há robô, não há acesso automatizado ao site:
  é o seu navegador, na sua navegação, enviando ao seu banco o que você viu.
  Pode capturar inclusive frete para o seu CEP e cupom visível, que nenhuma API dá.
- Limitação: a frequência depende de você. O modelo estatístico (seção 5.1) foi
  desenhado para lidar com amostragem irregular justamente por isso.
- Observação: a extração do preço no bookmarklet depende do HTML da página; quando
  falhar, ele abre o formulário pré-preenchido com o ASIN para você completar.

### 3.6 Preço de oferta vs. preço do carrinho

O "preço" pode significar coisas diferentes, e o sistema vai guardá-las separadamente:

| Conceito | Fonte possível |
|---|---|
| Preço da oferta principal (Buy Box) | Creators API, bookmarklet, browser |
| Preço "de" / referência exibida | Creators API (`SavingBasis`), bookmarklet |
| Frete | bookmarklet/manual (depende de CEP); API em geral não |
| Cupom | bookmarklet/manual |
| Desconto por forma de pagamento (Pix, à vista) | manual |
| Preço final no carrinho | só manual — não há API |

**A série histórica principal será o preço do item na oferta Buy Box, condição
acompanhada (padrão: novo).** É o único valor comparável ao longo do tempo entre
fontes. `total_cents` só é preenchido quando todos os componentes são conhecidos e
é analisado como série separada, nunca misturado à principal.

### 3.7 Identificação do ASIN

- Extração por expressão regular dos padrões de URL: `/dp/{ASIN}`, `/gp/product/{ASIN}`,
  `/gp/aw/d/{ASIN}`, `/product/{ASIN}`; ou o ASIN colado diretamente (`[A-Z0-9]{10}`).
- Links curtos (`amzn.to`) exigem resolver um redirecionamento; alternativa sem
  nenhum acesso ao site: pedir a URL completa.
- **Variações**: ASIN "pai" não tem preço; o cadastro precisa do ASIN da variação
  específica (cor/capacidade). O sistema avisa quando o provider indicar que é pai.

### 3.8 Fluxo de coleta

```
worker (a cada minuto)
  └─ seleciona produtos ativos cujo próximo horário venceu
      └─ cria collection_run (lock consultivo no Postgres: nunca duas coletas simultâneas)
          └─ para cada lote de produtos (até 10 ASINs se o provider permitir):
              provider.getPrice()
                ├─ OK          → normaliza → valida → grava observação (status OK)
                ├─ UNAVAILABLE → grava observação sem preço (status UNAVAILABLE)
                ├─ NOT_FOUND   → grava observação + marca produto para revisão
                ├─ BLOCKED     → grava status na run, pausa o provider (backoff exponencial)
                └─ ERROR       → retry limitado se retryable; senão registra na run
          └─ fecha collection_run com contagens
          └─ dispara processamento (seção 4) para cada observação nova
```

Captura manual/bookmarklet segue o mesmo caminho a partir de "normaliza".

**Validação** (não descarta, sinaliza): preço ≤ 0, moeda ≠ BRL, ou variação > 60% em
relação à mediana dos últimos 30 dias → observação gravada com marca `suspect` para
revisão na interface. Você decide se exclui (via correção) ou mantém. O sistema não
apaga dados que "parecem errados" por conta própria.

---

## 4. Fluxo de processamento

Executado após cada observação gravada, em uma transação:

1. **Detecção de evento** — compara com a **última observação com preço válido** da
   mesma série (produto + condição):
   - observação sem preço → `PRICE_UNAVAILABLE` (apenas na transição; sem repetir enquanto
     continuar indisponível);
   - primeira observação com preço depois de indisponibilidade → `PRICE_AVAILABLE_AGAIN`
     **e** a comparação de preço com o último preço válido anterior;
   - preço menor → `PRICE_DROP`; maior → `PRICE_INCREASE`; igual → `PRICE_UNCHANGED`;
   - primeira observação do produto → `FIRST_PRICE`.
   - Grava preço anterior, novo, `delta_cents`, `delta_percent` e se o vendedor mudou.
   - Exemplo: 699,90 → 649,90 = −R$ 50,00, −7,14%, `PRICE_DROP`.
2. **Atualização do snapshot** do produto (métricas da listagem).
3. **Avaliação de alertas** (módulo `alerts`, seção 5.9).
4. (Pós-MVP) **Envio de notificações** pendentes.

Como os eventos são derivados, existe um comando administrativo `recompute-events`
que apaga e recalcula os eventos de um produto a partir das observações efetivas
(útil após uma correção).

---

## 5. Cálculo das métricas

Todas as funções vivem em `src/analytics`, são puras e cobertas por testes com os
exemplos deste documento.

### 5.1 Questão metodológica central: observações vs. tempo

Se a coleta for irregular (por exemplo, você registra manualmente mais vezes durante
uma promoção), a contagem por observação fica enviesada: um preço coletado 10 vezes em
um dia "pesa" mais que um preço que durou 3 semanas com 2 coletas.

Por isso o sistema calcula **duas versões** das estatísticas de distribuição e mostra
qual é qual:

- **Por observação**: cada observação válida conta 1. É o que você descreveu
  ("18% das observações").
- **Ponderada pelo tempo**: cada preço pesa o tempo em que vigorou, até a próxima
  observação. Responde "em quanto **tempo** do histórico o preço esteve abaixo de X".
  Para não inventar dados em lacunas, o intervalo de cada observação é limitado a um
  teto (padrão: 2× o intervalo de coleta configurado, mínimo 24 h). O que passar disso
  é tratado como **período sem dados** e não entra em nenhum dos dois cálculos.

Com coleta automática regular, as duas versões ficam praticamente iguais. Na interface,
média e mediana "principais" são por observação (como nos exemplos do enunciado), e a
versão ponderada pelo tempo aparece ao lado. As frases dizem explicitamente
"média das observações" ou "do tempo monitorado".

### 5.2 Métricas básicas

Sobre observações efetivas com status `OK` da série principal:

| Métrica | Definição |
|---|---|
| `current_price` | Preço da observação mais recente **se** ela tiver preço. Se a mais recente for indisponível, `current_price = null` e a tela diz "indisponível desde dd/mm"; o último preço válido aparece como "último preço registrado". |
| `previous_price` | Último preço válido anterior ao atual. |
| `lowest_price` / `highest_price` | Mínimo e máximo, com data da (última) ocorrência. |
| `average_price` | Média aritmética (por observação) e média ponderada pelo tempo. |
| `median_price` | Mediana (por observação; ponderada pelo tempo como versão alternativa). |
| `drop_count` / `increase_count` | Contagem de eventos `PRICE_DROP` / `PRICE_INCREASE`. |

### 5.3 Variações

`change_from_X = (atual − X) / X × 100`, para X ∈ {anterior, média, mediana, mínimo,
máximo}. Também em valor absoluto (R$). Exemplos com os dados do enunciado
(atual 649,90; média 721,40; mínimo 579,90):

- vs. média: (649,90 − 721,40) / 721,40 = **−9,9%** → "9,9% abaixo da média histórica".
- vs. mínimo: (649,90 − 579,90) / 579,90 = **+12,1%** → "12,1% acima do menor preço registrado".

### 5.4 Mínimos por janela (7, 30, 90, 180, 365 dias)

Para cada janela `[agora − N dias, agora]`:

- **Completa** se o histórico começa antes do início da janela (o preço vigente no
  início é conhecido) **e** não há período sem dados (seção 5.1) maior que 25% da
  janela. Exibe o mínimo normalmente.
- **Parcial** se há dados na janela mas o histórico não cobre a janela inteira:
  exibe "R$ X — histórico cobre apenas 12 dos 30 dias".
- **Sem dados** se não há nenhuma observação válida na janela: exibe "sem dados".

Nada é extrapolado nem estimado.

### 5.5 Posição do preço atual

**Posição na faixa (min–max):**

```
posição = (atual − mínimo) / (máximo − mínimo) × 100
```

0% = igual ao menor já visto; 100% = igual ao maior. Indefinida se mínimo = máximo
(o sistema diz "o preço nunca variou"). Atenção: essa medida é sensível a extremos —
um único pico de R$ 1.500 comprime todo o resto da escala. Por isso o percentil é a
medida mais informativa quando há dados suficientes.

**Percentil histórico:**

```
percentil = (nº de observações com preço ≤ atual) / (nº total de observações) × 100
```

Significado correto: "percentil 18" quer dizer que **aproximadamente 18% das
observações registradas tiveram preço igual ou inferior ao atual** (e, portanto, cerca
de 82% foram mais caras). **Não** significa probabilidade de o preço cair nem de subir,
e só vale para o período e a frequência de coleta observados. A versão ponderada pelo
tempo é lida como "o preço esteve ≤ atual em ~18% do tempo monitorado".

Exibido somente se houver **pelo menos 20 observações válidas cobrindo pelo menos
14 dias** (limiares configuráveis em `settings`). Abaixo disso: "dados insuficientes
para percentil (N observações em D dias)".

**Posição ordinal ("4º menor preço"):** calculada sobre **valores distintos** de preço
(dense rank), com a contagem de vezes que cada um foi visto: "4º menor preço distinto
observado; preços menores apareceram em 6 de 120 observações". Isso evita que dez
observações repetidas de R$ 579,90 empurrem artificialmente o ranking.

### 5.6 Recorrência e faixas de preço

- **Faixas**: largura configurável — padrão em percentual da mediana (2,5%), com opção
  de valor fixo (ex.: R$ 25) ou de agrupar por valor exato.
- Para cada faixa: nº de observações, **dias** na faixa (ponderado pelo tempo),
  **nº de episódios** (sequências contínuas dentro da faixa), data da última ocorrência.
- Visual: histograma horizontal com o preço atual marcado. No exemplo do enunciado,
  fica evidente que R$ 599 apareceu 1 vez e R$ 699 é recorrente.
- **"Preço baixo"** é definido explicitamente (padrão: ≤ percentil 10 do histórico, ou
  um valor em R$ escolhido por você). Para episódios de preço baixo:
  duração = do primeiro registro abaixo do limite até o primeiro registro acima dele.
  Como o momento exato de início/fim entre duas coletas é desconhecido, a duração é
  mostrada com limites: "entre 4 e 5 dias" (mínimo = primeira a última observação
  dentro; máximo = observação anterior à última depois).
- Frases possíveis: "O produto esteve abaixo de R$ 650 em 18% das observações
  (14% do tempo)." / "Na última ocorrência, permaneceu abaixo de R$ 650 por 6 dias."

### 5.7 Duração de promoções e recuperação (pós-MVP)

- **Preço de referência** de cada momento = mediana dos 30 dias anteriores (não o
  preço imediatamente anterior, para não aceitar um aumento artificial como base).
- **Início de promoção**: preço ≤ referência × (1 − X), X padrão 10%.
- **Fim**: primeira observação com preço de volta a ≥ referência × (1 − X/2).
- **Recuperação**: tempo até voltar a ±2% da referência.
- Registro de cada episódio: início, preço anterior/referência, preço promocional mínimo,
  duração (com limites), preço e data da recuperação, e a sequência de passos
  (ex.: 699 → 599 → 649 → 699).
- Agregados apenas descritivos: "das 5 quedas acima de 10% registradas, a duração
  mediana foi de 3 dias". **Nenhuma previsão.**

### 5.8 Preço de referência exibido vs. histórico (falsas promoções)

Quando a fonte informa o "preço de" (`list_price_cents`), o sistema compara com o
histórico próprio:

- "Preço atual (R$ 799) está 6,7% acima da média histórica (R$ 749)."
- "Já houve registros abaixo do preço atual (menor: R$ 699, em 12/08)."
- "O preço de referência exibido (R$ 999) foi observado em 0 das 140 observações dos
  últimos 90 dias." (ou "foi o preço praticado em 8% do tempo").

O sistema não classifica como "falsa promoção". Mostra os fatos; a interpretação é sua.

### 5.9 Alertas

Avaliados no módulo `alerts`, depois do processamento, com base no banco:

| Tipo | Condição |
|---|---|
| `PRICE_BELOW` | atual < valor (ex.: R$ 650) |
| `PERCENTILE_AT_OR_BELOW` | percentil do atual ≤ P (ex.: 10). Requer dados suficientes; caso contrário, o alerta fica "inativo por falta de dados" e isso aparece na tela. |
| `AT_OR_BELOW_ALL_TIME_LOW` | atual ≤ menor preço histórico anterior |
| `DROP_PERCENT` | queda ≥ X% vs. observação anterior (opcional: vs. mediana de 30 dias) |
| `BELOW_AVERAGE` | atual < média histórica |

- Dispara na **transição** de "falso" para "verdadeiro" (com `cooldown`), para não
  repetir a cada coleta enquanto o preço continuar baixo.
- `alert_events` guarda a mensagem e o retrato das métricas no momento do disparo.
- MVP: alertas visíveis na interface. Notificações externas ficam para depois.

### 5.10 Frases descritivas

As frases são geradas por *templates* ligados a métricas, e **cada template só é
usado se a métrica que o sustenta existe e tem dados suficientes**. Exemplos:

- "Preço caiu 7,1% desde a última observação (R$ 699,90 → R$ 649,90, em 12/09)."
- "O preço atual está 9,9% abaixo da média histórica."
- "O produto já foi observado por R$ 579,90 (há 47 dias)."
- "4º menor preço distinto observado."
- "Percentil 18: cerca de 18% das observações tiveram preço igual ou menor."

Vocabulário proibido no código das frases: "compre", "não compre", "boa oportunidade",
"vai cair", "tende a". Um teste automatizado verifica isso.

---

## 6. Proposta de interface

Princípios: ferramenta de análise, densa e legível; tipografia e números antes de
decoração; números em fonte tabular; cor usada só com significado (queda/alta,
preço atual no gráfico); sem gradientes, sem grade de cards, sem ícones decorativos.

### 6.1 Páginas

1. **`/` — Lista de produtos**: tabela simples, ordenável.
   Colunas: produto · atual · Δ última coleta · vs. mediana · mínimo histórico · percentil ·
   última coleta · minigráfico (sparkline). Linha em destaque discreto se algum alerta
   disparou. Aviso no topo se a coleta está atrasada ou bloqueada.
2. **`/products/new` — Cadastro**: um campo (URL ou ASIN) → extração do ASIN →
   confirmação de título/variação → condição acompanhada → intervalo de coleta.
3. **`/products/[id]` — Página do produto** (esboço abaixo).
4. **`/alerts`** — todos os alertas e disparos.
5. **`/runs`** — histórico de coletas (status, erros, bloqueios). Essencial para confiar no histórico.
6. **`/settings`** — CEP de referência, limiares, provider padrão.

### 6.2 Página do produto (esboço)

```
SSD Samsung 990 Pro 2TB                                  ASIN B0BHJJ9Y77 · novo · amazon.com.br
──────────────────────────────────────────────────────────────────────────────────────────────
R$ 649,90   preço atual · coletado em 12/09/2026 14:02 · vendedor Amazon.com.br · via Creators API

  MENOR        MÉDIA        MEDIANA      MAIOR        OBSERVAÇÕES
  R$ 579,90    R$ 721,40    R$ 709,90    R$ 899,90    142 em 186 dias
  há 47 dias

HISTÓRICO DE PREÇOS                                 [7d] [30d] [90d] [180d] [1a] [Tudo]
  ┌────────────────────────────────────────────────────────────────────┐
  │ gráfico em degraus (o preço vale até a próxima observação),       │
  │ linhas de referência: média ··· mediana --- mínimo ___            │
  │ lacunas visíveis onde não há dados; faixas cinza = indisponível   │
  │ marcadores ▼ ▲ nas mudanças; tooltip com vendedor e origem        │
  └────────────────────────────────────────────────────────────────────┘

COMPARAÇÃO                          JANELAS
  vs. anterior   −R$ 50,00  −7,1%     mín. 7 dias     R$ 649,90
  vs. média      −R$ 71,50  −9,9%     mín. 30 dias    R$ 629,90
  vs. mediana    −R$ 60,00  −8,5%     mín. 90 dias    R$ 579,90
  vs. mínimo     +R$ 70,00  +12,1%    mín. 180 dias   R$ 579,90
  vs. máximo     −R$ 250,00 −27,8%    mín. 365 dias   histórico cobre só 186 dias

POSIÇÃO HISTÓRICA
  min ├──●──────────────────────────────┤ max      posição na faixa: 21,9%
  4º menor preço distinto observado · percentil 18 (por observação) / 15 (por tempo)
  [histograma horizontal por faixa de preço, com a faixa atual marcada]

COMPORTAMENTO
  · Preço caiu 7,1% desde a última observação.
  · O preço atual está 9,9% abaixo da média histórica.
  · O produto já foi observado por R$ 579,90, há 47 dias, por 3 dias.
  · Esteve abaixo de R$ 650 em 18% das observações; na última vez, por 6 dias.

OCORRÊNCIAS DE PREÇOS BAIXOS (≤ P10 ou ≤ valor definido)
  início      fim         duração        menor preço   antes → depois
  26/07       29/07       3–4 dias       R$ 579,90     R$ 699,90 → R$ 689,90
  ...

MUDANÇAS (eventos)              ALERTAS DESTE PRODUTO           OBSERVAÇÕES (tabela bruta)
```

O gráfico usa `stepAfter` porque o preço "vale" até ser observado outro — uma linha
interpolada sugeriria preços intermediários que nunca existiram.

---

## 7. Estratégia de histórico

- **Append-only** reforçado por trigger; correções em tabela separada; a view
  `effective_observations` é a única fonte da análise.
- **Toda observação guarda o payload bruto**, a origem, o provider e a run. Assim é
  possível reprocessar se uma regra de normalização mudar.
- **Eventos, snapshots e episódios são derivados e recalculáveis**; nunca são a fonte
  da verdade.
- **Indisponibilidade e falhas de coleta são registradas**, mas distinguidas:
  "produto indisponível" (informação sobre o produto) ≠ "coleta falhou/bloqueada"
  (informação sobre o coletor). Falhas de coleta **não** viram observação de produto;
  ficam em `collection_runs`. Isso impede que um período de bloqueio pareça
  "produto indisponível".
- **Lacunas são explícitas** no gráfico e nas métricas (seção 5.1).
- **Backup**: serviço no compose que roda `pg_dump` diário com rotação (ex.: 14 diários +
  12 mensais) para um volume/pasta que você sincroniza fora da máquina.
- **Exportação** (pós-MVP): CSV/JSON por produto e dump completo.
- **Dados importados** (ex.: Keepa) ficam marcados e podem ser incluídos ou excluídos
  da análise com um filtro.
- **Volume**: 100 produtos × 4 coletas/dia × 10 anos ≈ 1,5 milhão de linhas — trivial
  para PostgreSQL com o índice `(product_id, observed_at)`. Não é preciso agregação
  nem particionamento.

---

## 8. Riscos e limitações

| Risco | Impacto | Mitigação |
|---|---|---|
| **Sem elegibilidade à Creators API** (10 vendas/30 dias como afiliado) | Sem fonte automática oficial | Arquitetura não depende dela; MVP funciona com captura manual/bookmarklet; Keepa como alternativa paga. |
| **Termos da Creators API limitam armazenar preços** | Conflito contratual com o objetivo do sistema | Decisão consciente sua; uso estritamente privado; nada publicado. |
| **Automação de navegador viola os termos da Amazon** | Bloqueio de IP/conta; violação contratual | Não é o padrão; se usada: sem login, baixa frequência, para no primeiro CAPTCHA, sem evasão. |
| **Preço varia por CEP, Prime, login, teste A/B, forma de pagamento** | O preço registrado pode não ser o que você pagaria | Série principal = preço do item na oferta Buy Box; frete/cupom/total em campos separados; origem registrada. |
| **Mudança de vendedor do Buy Box** | Saltos de preço que são troca de vendedor, não de preço | `seller_changed` no evento; filtro "somente vendido pela Amazon" opcional. |
| **Variações e ASIN pai** | Preço ausente ou de outra variação | Validação no cadastro. |
| **ASIN substituído/relistado** | Histórico "quebra" | Possibilidade futura de vincular produtos (pós-MVP). |
| **Amostragem irregular** | Estatísticas enviesadas | Métricas por tempo + por observação; lacunas explícitas; limiares mínimos. |
| **Coletor parado sem você perceber** | Buracos no histórico | Aviso na interface quando a última coleta bem-sucedida passou do esperado; tela `/runs`. |
| **Erro de leitura (ex.: preço de parcela lido como preço)** | Observação errada | Validação marca `suspect`; correção administrativa sem apagar o original. |
| **Perda de dados** | Perda do histórico (o ativo principal) | Backup diário automático + exportação. |
| **Exposição do servidor** | Acesso indevido | Rodar em rede privada (localhost/Tailscale) e autenticação simples por senha. |

Limitações inerentes, que o sistema declara em vez de esconder:

- O histórico só começa quando o produto é cadastrado (salvo importação marcada).
- Preço do carrinho, cupons e frete só são conhecidos quando você mesmo os registra.
- Nenhuma métrica diz o que vai acontecer. O passado observado é tudo o que o sistema oferece.

---

## 9. Stack proposta

| Camada | Escolha | Motivo |
|---|---|---|
| Linguagem | TypeScript (strict) | Um só idioma em web, worker e análise. |
| Web | Next.js (versão estável atual, App Router, server components/actions) | Pedido; dispensa API separada. |
| Estilo | Tailwind CSS | Pedido; facilita uma interface sóbria e consistente. |
| Gráficos | Recharts (`LineChart` com `type="stepAfter"`, `ReferenceLine`, `BarChart` horizontal) | Pedido; suficiente para o caso. |
| Banco | PostgreSQL 16 | Pedido; triggers, views, `timestamptz`, advisory locks. |
| ORM | Prisma (+ migrations SQL para trigger/view) | Pedido. |
| Validação | Zod | Validar entradas (formulário, bookmarklet, payload da API). |
| Agendamento | Loop simples no worker + `collection_runs` + advisory lock | Sem Redis nem fila externa; suficiente para uso pessoal. |
| Datas | `date-fns` + `date-fns-tz` | Exibição em America/Sao_Paulo. |
| Testes | Vitest (unidade, foco em `analytics`) + Playwright (algumas telas) | Métricas corretas são o núcleo do produto. |
| Qualidade | ESLint, Prettier, `tsc --noEmit` em CI (GitHub Actions) | |
| Infra | Docker Compose: `db`, `web`, `worker`, `backup` | Uma máquina, um comando. |
| Acesso | Basic auth/senha única via middleware + rede privada | Aplicação pessoal. |

---

## 10. Plano de implementação por etapas

Cada etapa termina com algo funcionando e testado.

**Etapa 0 — Fundação**
- Projeto Next.js + TypeScript + Tailwind; Docker Compose (db, web, worker).
- Schema Prisma, migrations, trigger de imutabilidade, view `effective_observations`.
- CI com lint, typecheck e testes.

**Etapa 1 — Núcleo de análise (sem interface)**
- `Money`, parsing de ASIN, funções de `analytics`: mín/máx/média/mediana,
  variações, janelas com cobertura, posição na faixa, percentil, ranking distinto,
  métricas ponderadas pelo tempo, detecção de eventos, episódios de preço baixo.
- Testes com os exemplos do enunciado (série de 01/08 a 12/09, distribuição 899/799/699/649/599).

**Etapa 2 — Produtos e captura**
- Cadastro por URL/ASIN; `MockPriceProvider` (séries sintéticas determinísticas para dev);
  `ManualPriceProvider` com formulário; endpoint autenticado + bookmarklet.

**Etapa 3 — Pipeline de coleta e processamento**
- Worker, agendamento, `collection_runs`, validação/`suspect`, eventos,
  snapshot, tela `/runs`, correções administrativas.

**Etapa 4 — Interface de análise**
- Lista de produtos; página do produto com números, gráfico em degraus com seletor
  de período, comparação, janelas, posição/percentil, frases descritivas,
  ocorrências de preços baixos, eventos e observações brutas.

**Etapa 5 — Alertas (MVP)**
- `PRICE_BELOW` e demais tipos da seção 5.9, avaliação pós-processamento,
  `alert_events`, exibição na interface.

**Etapa 6 — Fonte automática** (conforme sua decisão na seção 11)
- `AmazonCreatorsApiProvider` (validar campos reais no marketplace BR primeiro), e/ou
  importação/provider Keepa, e/ou `AmazonBrowserProvider` com as salvaguardas da 3.4.

→ **Fim do MVP** (cobre os 11 itens pedidos).

**Pós-MVP**
- Duração de promoções e recuperação (5.7); frequência por faixa completa (5.6);
  comparação com "preço de" (5.8) na interface; notificações (e-mail, Telegram ou ntfy);
  exportação CSV/JSON; série de preço total (com frete/cupom); múltiplas fontes
  com filtro; backup com verificação de restauração.

---

## 11. Decisões que dependem de você

1. **Você tem conta no Programa de Associados Amazon Brasil com vendas recorrentes
   (≥ 10 qualificadas em 30 dias)?** Se não, a Creators API provavelmente não é viável.
2. **Aceita o conflito com os termos da Creators API** sobre armazenamento de preços
   (uso privado)?
3. **Automação de navegador**: descartar, ou manter como opção com as salvaguardas da 3.4,
   ciente de que viola os termos de uso do site?
4. **Captura via bookmarklet/extensão** atende como fonte principal no início?
5. **Keepa (pago)**: interesse como fonte/importação inicial?
6. **Onde vai rodar** (máquina local, servidor doméstico, VPS)? Afeta acesso e backup.
7. **CEP de referência** para frete (se for registrar frete).
8. **Canal de notificação** preferido para depois do MVP.

---

## 12. Decisões tomadas e ajustes resultantes (01/10/2026)

| # | Decisão | Consequência |
|---|---|---|
| 1 | Sem conta de Associados | Creators API fora do MVP. A interface `PriceProvider` continua permitindo adicioná-la no futuro. |
| 2 | (pergunta sobre implicações) | Irrelevante enquanto a Creators API não for usada; ver 12.1. |
| 3 | Automação de navegador descartada | `AmazonBrowserProvider` **não** será implementado. |
| 4 | Captura assistida como fonte principal | `ManualPriceProvider` + captura por bookmarklet (ou extensão pessoal). |
| 5 | Sem Keepa | Sem importação de terceiros. Todo o histórico é próprio. |
| 6 | Roda na máquina local | Docker Compose local; acesso só por `localhost`. |
| 7 | Sem CEP definido | Frete registrado como "o que a página mostrou", opcional, em série separada. |
| 8 | Notificação por e-mail | SMTP (pós-MVP), configurado por variáveis de ambiente. |

### 12.1 Implicação do conflito de termos (Creators API)

O conflito era contratual, entre o usuário e a Amazon pelo Acordo Operacional do
Programa de Associados. A consequência prática possível seria a suspensão das
credenciais da API ou da conta de Associado (e de comissões). Não há API em uso, então
o conflito **não se aplica** a esta versão. Volta a ser relevante apenas se um dia a
Creators API for adicionada.

### 12.2 Efeitos de uma coleta 100% assistida

Sem coleta automática, várias partes ficam mais simples e algumas regras mudam:

- **Sem worker no MVP.** Não há o que agendar. O compose fica com `db`, `web` e `backup`.
  O processamento (eventos → snapshot → alertas) roda de forma síncrona logo após cada
  captura. `collection_runs` é mantida, mas registra **sessões de captura** (cada envio
  manual ou do bookmarklet), não execuções do agendador.
- **Amostragem irregular e esparsa é o caso normal.** As métricas ponderadas pelo tempo
  (seção 5.1) passam a ser essenciais. O teto de validade de cada observação deixa de ser
  "2× o intervalo de coleta" e passa a ser **configurável, padrão 7 dias**. Depois disso,
  o período conta como "sem dados".
- **Limiares de suficiência** (percentil, janelas) continuam os mesmos e serão mais
  frequentemente "dados insuficientes" no início. O sistema dirá isso explicitamente.
- **Nova página `/capturar` (fila de captura).** Lista os produtos ordenados por tempo
  desde a última captura, com link que abre a página do produto na Amazon em nova aba.
  Você abre, olha, e clica no bookmarklet. Nada é acessado automaticamente pelo sistema.
  Cada produto tem um "intervalo desejado" (padrão: 2 dias) só para ordenar essa fila.
- **Alertas**: são avaliados no momento da captura. Como você estará olhando a página
  nesse momento, o alerta aparece na própria tela de confirmação. O e-mail (pós-MVP)
  serve como registro e para capturas feitas pelo celular/outra aba.

### 12.3 Desenho da captura pelo bookmarklet

Fluxo escolhido por ser o mais robusto:

1. Na página do produto (amazon.com.br), você clica no favorito "Registrar preço".
2. O script lê da página já carregada: ASIN, título, preço do item, "preço de",
   vendedor, condição, disponibilidade, frete e cupom visíveis.
3. Em vez de enviar os dados em segundo plano (o que pode ser bloqueado pela política de
   segurança de conteúdo do site ou por regras do navegador para `localhost`), ele **abre
   uma aba** em `http://localhost:3000/capture?...` com os dados na URL.
4. A aplicação mostra um formulário pré-preenchido. Você confere, corrige se preciso e
   confirma. Só então a observação é gravada (`source = bookmarklet`).
5. A tela de confirmação já mostra a comparação com o histórico e os alertas disparados.

Se algum campo não for encontrado (HTML mudou), o formulário abre com o que foi possível
e você completa. Se algum navegador bloquear bookmarklets nessa página, a alternativa é
uma extensão mínima instalada localmente (modo desenvolvedor), com o mesmo comportamento.
Isso será validado na Etapa 2.

Observação sobre os termos: o script não faz requisições à Amazon nem navega sozinho;
apenas lê a página que você abriu no seu navegador, por ação sua, e a envia ao seu
computador. É, na prática, uma cópia assistida do que você já está vendo.

### 12.4 Plano de implementação revisado

- **Etapa 0 — Fundação**: Next.js + TS + Tailwind; compose (`db`, `web`, `backup`);
  schema Prisma; trigger de imutabilidade; view `effective_observations`; CI.
- **Etapa 1 — Núcleo de análise**: funções puras e testes (inclui o teto de 7 dias).
- **Etapa 2 — Produtos e captura**: cadastro por URL/ASIN; `MockPriceProvider` com séries
  sintéticas para desenvolvimento; formulário manual; bookmarklet + `/capture`;
  página `/capturar`.
- **Etapa 3 — Processamento**: eventos, snapshot, validação/`suspect`, correções
  administrativas, registro de sessões de captura.
- **Etapa 4 — Interface de análise**: lista e página do produto (seção 6).
- **Etapa 5 — Alertas**: os cinco tipos da seção 5.9, exibidos na interface.

→ **Fim do MVP.**

- **Pós-MVP**: e-mail via SMTP; promoções e recuperação; faixas completas; comparação com
  "preço de"; exportação CSV/JSON; série de preço total; verificação de restauração do backup.

---

## 13. Notas de implementação (Etapas 0 e 1)

Ajustes feitos durante a implementação, que prevalecem sobre os esboços anteriores:

- **Prisma 7.10** (estável). O Prisma 8 ainda está em versão candidata.
- **Next.js 16**: a senha opcional usa `src/proxy.ts` (o antigo `middleware` foi renomeado).
  Fontes do sistema, sem requisições ao Google Fonts.
- **Status da observação**: apenas `OK`, `UNAVAILABLE` e `NOT_FOUND`. Falhas de coleta
  (bloqueio, erro) ficam em `collection_runs`, conforme a seção 7.
- **Integridade no banco**: além dos triggers de imutabilidade (também contra `TRUNCATE`),
  há `CHECK` garantindo que status `OK` tem preço positivo e que os demais status nunca têm
  preço; correções exigem motivo e, quando substituem preço, um valor positivo.
- **Correções**: aplicadas por uma função TypeScript testada (`applyCorrections`), em vez de
  uma view SQL, para haver uma única implementação. Nova ação `RESTORE` desfaz correções.
- **Eventos**: um evento por observação. "Voltou a ficar disponível" é o campo
  `back_in_stock` do evento de preço, não um tipo separado.
- **Percentil**: inclui a observação atual na contagem.
- **Limite de "preço baixo"** por percentil usa o método do posto mais próximo, que sempre
  devolve um preço que de fato ocorreu.
- **Cliente do banco** criado no primeiro uso (o build do Next.js não precisa de `DATABASE_URL`).

---

## 14. Notas de implementação (Etapa 2)

- **Captura pela extensão** (pasta `extension/`, Manifest V3, Chrome/Edge/Brave; Firefox exigiria um manifesto separado):
  - `extract.js` lê a página já carregada (preço da Buy Box, preço "de", disponibilidade,
    vendedor, frete, cupom). Cada campo tem vários seletores em ordem de preferência e o
    resultado registra qual foi usado (`diagnostics`, guardado em `raw_payload`).
  - Se o preço não for encontrado, **nada é gravado**: aparece um aviso com atalho para o
    registro manual. Indisponibilidade só é registrada quando a página diz isso explicitamente.
  - Grava automaticamente ao abrir um produto monitorado e mostra um aviso com **Desfazer**
    (cria uma correção `EXCLUDE`; o registro original permanece).
  - Recarregar a página em menos de 30 minutos com o mesmo preço não gera novo registro
    (configurável em `settings.capture_dedupe_minutes`); mudança de preço é sempre gravada.
  - Só o serviço em segundo plano fala com a aplicação, sempre com token
    (`Authorization: Bearer`). Isso impede que outras páginas abertas gravem dados no servidor local.
  - "Abrir pendentes" abre até 10 produtos da fila em abas de fundo no navegador do usuário.
- **Rotas em português**: `/`, `/produtos/novo`, `/produtos/[id]`, `/capturar`, `/configuracoes`.
  API da extensão em `/api/extension/*` (fora da senha opcional, protegida pelo token).
- **Produto sem título** recebe "Produto {ASIN}", substituído pelo título da página na primeira captura.
- **Dados simulados**: `npm run db:seed-demo` usa o `MockPriceProvider` e só roda em bancos
  terminados em `_dev` ou `_test`, porque o histórico gerado não pode ser apagado.
- **Limitação conhecida**: os seletores foram escritos a partir da estrutura conhecida das
  páginas da Amazon e testados com páginas sintéticas. A validação em páginas reais depende do
  uso; o popup da extensão mostra exatamente o que foi lido.

---

## 15. Notas de implementação (Etapa 3)

- **Processamento único** (`src/processing/process.ts`): após cada observação nova e após cada
  correção, os eventos do produto são recalculados a partir das observações efetivas
  (apaga e regrava `price_events`) e o retrato em `product_snapshots` é atualizado. Como tudo
  é derivado, o resultado é sempre consistente com o histórico e as correções.
- **Valor suspeito** (`src/processing/suspect.ts`): preço que difere mais de 60% da mediana dos
  últimos 30 dias (com ao menos 3 observações efetivas) é gravado com `suspect = true` e o motivo.
  Ele **entra nos cálculos** até ser revisado; a interface avisa enquanto houver pendências.
  Revisão: "Confirmar valor" (nova ação de correção `CONFIRM`) ou "Excluir da análise".
- **Lista de produtos** lê os retratos: atual, variação desde a anterior, menor, mediana,
  variação em relação à mediana e percentil. Produtos sem retrato são processados ao abrir a
  lista (atualização transparente de dados das etapas anteriores).
- **Página Registros** (`/registros`): últimos 100 registros de todos os produtos, com filtro de
  suspeitos pendentes.
- **Porcentagens extremas**: valores entre 0 e 0,5% aparecem como "<1%" e entre 99,5% e 100% como
  ">99%", para não sugerir "nenhum" ou "todos" quando não é o caso.
- `npm run db:reprocess` recalcula eventos e retratos de todos os produtos (desenvolvimento).

---

## 16. Notas de implementação (Etapa 4)

- **Página do produto** reúne, nesta ordem: preço atual (ou "indisponível desde"), números
  principais (menor, média, mediana, maior, observações; média e mediana também pelo tempo),
  frases descritivas, gráfico, comparação com o preço atual, menor preço por período, posição no
  histórico, frequência por faixa, períodos de preço baixo, mudanças, registro manual e observações.
- **Gráfico** (`src/components/PriceChart.tsx`, Recharts): uma única série em degraus (`stepAfter`),
  cor validada nos modos claro e escuro; linhas de referência discretas para menor preço e mediana
  do histórico inteiro (incluídas no eixo mesmo em períodos curtos, para manter o contexto); faixas
  cinza para indisponibilidade; a linha é interrompida onde não há dados; tooltip com cruz vertical;
  marcas do eixo em valores redondos (`niceTicks`). A série é montada por funções puras e testadas
  em `src/analytics/chart.ts`.
- **Frequência por faixa** mostra também as faixas vazias entre o menor e o maior preço, e alarga
  as faixas até no máximo 14 linhas.
- **Preço baixo**: o limite padrão é o percentil 10 (com dados suficientes); o usuário pode informar
  outro valor pelo parâmetro `?limite=` (formulário na própria seção), sem gravar nada.
- **Tabelas** têm rolagem horizontal própria; a página não rola de lado no celular. A tabela de
  observações mostra as 30 mais recentes, com opção de ver todas.

---

## Fontes consultadas

- Amazon — deprecação da PA-API 5.0 e migração para Creators API:
  https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation
- Amazon — limites de uso da Creators API:
  https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/api-rates
- Amazon — recurso OffersV2:
  https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/offersV2
  e https://webservices.amazon.com/paapi5/documentation/offersV2.html
- Amazon — preço, vendedor e entrega via ofertas:
  https://webservices.amazon.com/paapi5/documentation/use-cases/using-offer-information/determining-price-merchant-and-delivery-information.html
- Biblioteca de terceiros com suporte ao marketplace Brasil:
  https://github.com/nager/Nager.AmazonCreatorsApi
- Requisitos de elegibilidade (resumo de terceiros): https://affiliatexblocks.com/docs/amazon-creators-api/
- Políticas do programa sobre cache e data/hora de preço (compilação de terceiros):
  https://conductatlas.com/platform/amazon-associates/amazon-associates-program-policies/provision/CA-P-064571/client-applications-may-not-cache-product-advertising-content/
  e https://conductatlas.com/platform/amazon-associates/amazon-associates-program-policies/provision/CA-P-064575/price-display-via-data-feeds-requires-timestamp-disclosure/
- Keepa — marketplaces suportados (inclui .com.br): https://addons.mozilla.org/firefox/addon/keepa/

Observação: as páginas da Amazon não puderam ser abertas diretamente do ambiente desta
análise (bloqueio de rede); as informações vieram dos resumos indexados dessas páginas e
de fontes secundárias. Antes da Etapa 6, os campos e limites reais devem ser confirmados
com uma chamada de teste à API no marketplace Brasil.
