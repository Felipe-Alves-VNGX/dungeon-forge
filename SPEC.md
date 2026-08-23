# SPEC — Dungeon Forge

Gerador procedural de masmorras multinível para Foundry VTT, em JavaScript.

**Versão do documento:** 1.2
**Alvo:** Foundry VTT v13 **e** v14+, com duas estratégias de emissão selecionadas por `config.target` (ver §5.14)
**Linguagem:** JavaScript ESM, sem build step obrigatório no core

---

## 1. Objetivo

Gerar, a partir de uma seed e um conjunto de parâmetros, os documentos Foundry de uma **masmorra multinível**, contendo:

- Uma imagem de piso por andar, limpa
- Paredes com portas, otimizadas (segmentos colineares fundidos)
- Uma passagem de nível por par de andares adjacentes — mecanismo concreto depende do alvo (ver §5.14)
- Rótulos semânticos nas salas (entrada, clímax, tesouro, encruzilhada)
- **Chave da masmorra** materializada em Notes nativas do Foundry: um pin por área, com o rótulo como texto e link direto para a página da chave
- Uma JournalEntry de chave, com uma página por área e uma página de legenda

A chave é exportável em Markdown puro, independente do Foundry.

A mesma seed deve produzir sempre a mesma masmorra, bit a bit — em qualquer um dos dois alvos. `core` não sabe qual alvo será usado; só `adapter-foundry` sabe.

### 1.1 Dois alvos, uma masmorra

| | `target: 'v14'` | `target: 'v13'` |
|---|---|---|
| Documento de Scene | **Uma** Scene para a masmorra inteira | **N** Scenes, uma por andar |
| Multi-andar via | Bandas de elevação nativas (`levels[]`, `bottom`/`top`) dentro da Scene | Regions pareadas com behavior "Teleport Token" (core desde v12), cada metade numa Scene |
| Escada = | Region com comportamento de troca de banda de elevação, presente numa Scene só | Duas Regions, uma por Scene, referenciando-se mutuamente |
| Placeable pertence a andar via | Flag de nível no documento (wall/tile/light/Note) | A própria Scene em que o documento vive — não precisa de flag |

A escolha de alvo é um parâmetro de configuração (`config.target`), não uma bifurcação do pipeline: estágios 1–11 do `core` (§5) são idênticos nos dois casos. Só o estágio 12 (`emit`, adapter-foundry) muda de estratégia.

### 1.2 Não-objetivos

- Popular encontros, tesouro concreto ou stat blocks. O gerador produz **estrutura e semântica**, não conteúdo de sistema.
- Renderizar em 3D.
- Suportar grid hexagonal. Só grid quadrado.
- Suportar Foundry v12 ou anterior.
- Misturar as duas estratégias de emissão numa mesma masmorra (uma masmorra é ou totalmente v13, ou totalmente v14; não há andar em Scene separada e andar em banda de elevação no mesmo `emit`).

---

## 2. Restrições de plataforma

### 2.1 Comuns aos dois alvos

| Restrição | Consequência no design |
|---|---|
| Measured Templates foram removidos em v14 (continuam existindo em v13) | O adapter nunca emite documentos de template em nenhum dos dois alvos — nem é uma feature usada pelo gerador |
| Canvas degrada com milhares de walls | Fusão de segmentos colineares é obrigatória, não otimização, nos dois alvos |
| A grade de geração é sempre 3D (`z` = andar) independente do alvo | O `core` nunca sabe se vai virar 1 Scene ou N — ver §3.1 |

### 2.2 Específicas de `target: 'v14'`

| Restrição | Consequência no design |
|---|---|
| Scene Levels são bandas de elevação (`bottom`/`top`) dentro de **uma** Scene | O gerador emite **um** documento Scene, não N scenes ligadas por teleporte |
| Cada placeable é tagueado para um ou mais níveis | Todo wall, tile, light e region emitido carrega o índice do nível — campo a confirmar contra golden sample, ver §2.4 |
| Escadas são Regions com comportamento de troca de nível | Não existe rampa geométrica. Escada = footprint retangular presente nos dois níveis, numa Region só |

### 2.3 Específicas de `target: 'v13'`

| Restrição | Consequência no design |
|---|---|
| v13 não tem bandas de elevação nativas numa única Scene | O gerador emite **N Scenes**, uma por andar, cada uma um documento independente no `Scene Directory` |
| Cada Scene contém só os placeables do seu próprio andar | Não é preciso tag de nível em wall/tile/light/Note — o pertencimento já é dado pela Scene em que o documento vive |
| Escadas ligam duas Scenes distintas | Escada = uma Region por footprint em cada uma das duas Scenes, pareadas por um behavior de teleporte que aponta de uma para a outra |
| Region behavior "Teleport Token" aponta para uma **Region de destino**, que pode estar em outra Scene | É o único mecanismo nativo de troca de mapa sem módulo de terceiros; o par de Regions é criado como uma unidade atômica (ver §5.14) |

### 2.4 Contrato com o Foundry — regra de ouro

**Não derive o schema da documentação.** Antes de escrever cada adapter:

**Para `target: 'v14'`:**
1. Instale o módulo gratuito de demonstração multinível publicado pela Foundry (Restored Keep / Scene Levels).
2. Abra a cena, exporte o JSON.
3. Salve em `fixtures/golden-scene-v14.json`.
4. O adapter v14 é validado por diff estrutural contra esse arquivo.

**Para `target: 'v13'`:**
1. Num mundo v13 limpo, crie duas Scenes de teste ("Andar A", "Andar B").
2. Em "Andar A", crie uma Region com um behavior "Teleport Token" cujo destino é uma Region criada em "Andar B" (e vice-versa, para o par de volta).
3. Exporte o JSON das duas Scenes, incluindo `regions[]` e os `RegionBehavior` embutidos.
4. Salve em `fixtures/golden-scene-v13-floor-a.json` e `fixtures/golden-scene-v13-floor-b.json`.
5. O adapter v13 é validado por diff estrutural contra esses arquivos.

Em ambos os casos: todo campo cujo nome não estiver confirmado no golden sample correspondente deve aparecer no código marcado com `// TODO(schema)` e nunca ser inventado.

---

## 3. Arquitetura

```
dungeon-forge/
├── packages/
│   ├── core/                 # zero dependência de Foundry, zero DOM
│   │   ├── src/
│   │   │   ├── rng.js
│   │   │   ├── grid.js
│   │   │   ├── geometry.js
│   │   │   ├── types.js      # JSDoc typedefs — o contrato
│   │   │   ├── pipeline.js
│   │   │   ├── validate.js
│   │   │   └── stages/
│   │   │       ├── 01-place-rooms.js
│   │   │       ├── 02-triangulate.js
│   │   │       ├── 03-spanning-tree.js
│   │   │       ├── 04-add-cycles.js
│   │   │       ├── 05-vertical-links.js
│   │   │       ├── 06-carve.js
│   │   │       ├── 07-prune.js
│   │   │       ├── 08-mission.js
│   │   │       └── 09-extract-walls.js
│   │   └── test/
│   ├── render/               # depende de Canvas2D/OffscreenCanvas
│   ├── adapter-foundry/      # traduz Dungeon → documentos Foundry
│   │   ├── shared/            # journal de chave, ícones, cálculo de pixel — comum aos dois alvos
│   │   ├── v14.js             # emit: uma Scene, bandas de elevação
│   │   └── v13.js             # emit: N Scenes, Regions de teleporte pareadas
│   └── module/               # wrapper: module.json, UI, hooks
├── harness/                  # Vite standalone, preview em canvas
└── fixtures/
    ├── golden-scene-v14.json
    ├── golden-scene-v13-floor-a.json
    └── golden-scene-v13-floor-b.json
```

### 3.1 Regra de dependência

`core` **não importa nada** de `render`, `adapter-foundry` ou do globalThis do Foundry. Ele roda em Node, em Worker e no browser sem alteração, e **não sabe qual dos dois alvos vai consumir seu resultado**.

Justificativa: iterar em gerador dentro do Foundry significa recarregar mundo, limpar cenas e abrir console a cada tentativa. Com o core isolado, o loop é o hot reload do Vite e 10.000 seeds rodam no Node em CI — e essa suíte vale para os dois alvos ao mesmo tempo, porque não testa nada de `adapter-foundry`.

`adapter-foundry/shared/` existe para não duplicar entre `v13.js` e `v14.js` o que é idêntico nos dois: construção da JournalEntry de chave, escolha de ícone por `role`, cálculo `pixel = cell * gridSize`, geração de nome de Note. Só a parte que decide "uma Scene ou N Scenes" e "banda de elevação ou par de Regions" vive nos arquivos por alvo.

### 3.2 Execução

Geração acima de ~100ms roda em Web Worker. O core é escrito para ser transferível: só TypedArrays e objetos planos cruzam a fronteira, nada de classes com métodos.

---

## 4. Contratos de dados

Todo estágio recebe e devolve objetos planos serializáveis. Definidos em `core/src/types.js` como JSDoc typedefs.

```js
/**
 * @typedef {Object} Config
 * @property {'v13'|'v14'} target       // decide a estratégia de emit — só usado por adapter-foundry
 * @property {string} seed
 * @property {number} floors            // 2..5
 * @property {number} width             // células, 30..80
 * @property {number} height            // células, 30..80
 * @property {RoomParams} rooms
 * @property {number} cycleRate         // 0..1, default 0.25
 * @property {number} verticalLinksPerGap // default 2
 * @property {CarveCosts} carve
 * @property {number} pruneIterations   // default 8
 */

/**
 * @typedef {Object} RoomParams
 * @property {number} count             // salas-alvo por andar
 * @property {number} sizeMean          // média da normal, em células
 * @property {number} sizeStdDev
 * @property {number} sizeMin
 * @property {number} sizeMax
 * @property {number} spawnRadius       // raio da elipse de spawn
 * @property {number} separationIters
 */

/**
 * @typedef {Object} CarveCosts
 * @property {number} newHallway        // default 10
 * @property {number} reuseHallway      // default 1
 * @property {number} throughRoom       // default 50
 * @property {number} turn              // default 2 — penaliza zigue-zague
 */

/**
 * @typedef {Object} Room
 * @property {number} id
 * @property {number} floor
 * @property {number} x @property {number} y   // canto superior esquerdo, células
 * @property {number} w @property {number} h
 * @property {number} cx @property {number} cy // centroide, float
 * @property {RoomRole} role
 * @property {number[]} doors           // índices em Dungeon.doors
 */

/** @typedef {'entrance'|'climax'|'treasure'|'junction'|'filler'} RoomRole */

/**
 * @typedef {Object} Edge
 * @property {number} a @property {number} b   // Room.id
 * @property {number} weight
 * @property {'mst'|'cycle'|'vertical'} kind
 */

/**
 * @typedef {Object} VerticalLink
 * @property {number} id
 * @property {number} fromFloor @property {number} toFloor
 * @property {number} x @property {number} y   // canto do footprint, idêntico nos dois andares
 * @property {number} w @property {number} h   // default 2x1
 * @property {'stair'|'shaft'|'ladder'} kind
 */

/**
 * @typedef {Object} Door
 * @property {number} id
 * @property {number} floor
 * @property {number} x1 @property {number} y1 // em coordenadas de canto de célula
 * @property {number} x2 @property {number} y2
 * @property {number} roomId
 * @property {boolean} secret
 */

/**
 * @typedef {Object} Area
 * @property {number} id
 * @property {string} label             // '2-07', 'B7', '17'
 * @property {number} floor
 * @property {number|null} roomId       // null se for junção numerada
 * @property {number} cx @property {number} cy  // âncora do rótulo, em células
 * @property {AreaExit[]} exits
 */

/**
 * @typedef {Object} AreaExit
 * @property {'n'|'s'|'e'|'w'|'up'|'down'} dir
 * @property {string} toLabel
 * @property {'door'|'secret'|'open'|'stair'|'shaft'} via
 */

/**
 * @typedef {Object} KeyEntry
 * @property {number} areaId
 * @property {string} label
 * @property {string} title
 * @property {string} description       // placeholder gerado
 * @property {string[]} tags            // role + traços derivados do grafo
 */

/**
 * @typedef {Object} LegendSymbol
 * @property {'door'|'secret'|'stairUp'|'stairDown'|'shaft'|'areaNumber'} kind
 * @property {string} caption
 */

/**
 * @typedef {Object} WallSegment
 * @property {number} floor
 * @property {number} x1 @property {number} y1
 * @property {number} x2 @property {number} y2
 * @property {boolean} isDoor
 * @property {number|null} doorId
 */

/**
 * O artefato final do core. Serializável, é o único input do render e do adapter.
 * Idêntico independente de `config.target` — o campo `floor` presente em
 * Room/Door/WallSegment/VerticalLink é o que cada adapter usa para decidir,
 * respectivamente, em qual banda de elevação (v14) ou em qual Scene (v13)
 * cada documento entra. Ver §5.14.
 * @typedef {Object} Dungeon
 * @property {Config} config
 * @property {string} seed
 * @property {number} width @property {number} height @property {number} floors
 * @property {Uint8Array} cells         // ver §5.2
 * @property {Room[]} rooms
 * @property {Edge[]} edges
 * @property {VerticalLink[]} links
 * @property {Door[]} doors
 * @property {WallSegment[]} walls
 * @property {Object} mission           // ver §5.10
 * @property {Area[]} areas             // ver §5.11
 * @property {Object} key               // ver §5.11
 */
```

---

## 5. Pipeline

Treze estágios. Cada um é uma função pura `(input, rng) → output`. Cada um pode ser rodado isoladamente e ter o resultado inspecionado no harness. Os estágios 0–11 (§5.1–§5.13) são **idênticos para os dois alvos** — não leem `config.target`. Só o estágio 12 (§5.14) se bifurca.

### 5.1 Estágio 0 — RNG

`Math.random` não é seedável e está **proibido em todo o repositório** (regra de lint).

```js
export function makeRng(seed) { /* sfc32 */ }
export function deriveRng(rootSeed, stageName) { /* splitmix32(hash(rootSeed + stageName)) */ }
```

Cada estágio recebe seu próprio substream, derivado do nome do estágio. Consequência desejada: mexer no algoritmo de render ou de rotulagem **não altera o layout** já aprovado. Sem isso, cada refatoração invalida todas as seeds salvas.

Helpers obrigatórios: `rng.float()`, `rng.int(min,max)`, `rng.normal(mean,stdDev)` (Box-Muller), `rng.pick(array)`, `rng.shuffle(array)`, `rng.chance(p)`.

### 5.2 Grade

```js
// Uint8Array, índice = z * (w * h) + y * w + x
export const CELL = {
  EMPTY:   0,
  ROOM:    1,
  HALLWAY: 2,
  STAIR:   3,
  BLOCKED: 4,  // headroom/footprint reservado, não caminhável
};
```

Nunca array de objetos. Numa grade 80×80×5 a diferença de performance é de duas ordens de grandeza.

A grade é 3D internamente (`z` = andar) nos dois alvos: o `core` gera a masmorra como um todo, para que a topologia entre andares (escadas, dificuldade, alcançabilidade) seja coerente. É só na hora de emitir que `v14.js` funde tudo numa Scene com bandas e `v13.js` recorta por andar em N Scenes.

### 5.3 Estágio 1 — `placeRooms`

**Não usar colocação por rejeição.** O método adotado é o da linhagem TinyKeep/Adonaac, que é o consenso da comunidade:

1. Sortear `count * 1.6` células candidatas dentro de uma elipse (`spawnRadius`), com posição uniforme no disco.
2. Sortear largura e altura de cada uma com **distribuição normal** (`sizeMean`, `sizeStdDev`), clampada em `[sizeMin, sizeMax]`.
3. Rodar **separação por steering**: `separationIters` iterações empurrando cada célula para longe das que a sobrepõem, proporcional ao vetor de sobreposição.
4. Encaixar todas na grade (arredondar posições).
5. Promover a **sala** apenas as células acima de um limiar de área (as `count` maiores).
6. Guardar as células não promovidas em `residualCells` — elas são usadas no estágio 6.

Por que assim: `sizeMean` e `sizeStdDev` são parâmetros com significado estético direto (salas homogêneas versus mistura de salões e closets), e o steering produz agrupamento orgânico em vez de dispersão uniforme. Rejeição pura produz layouts sem caráter.

**Invariante de saída:** nenhuma sala sobrepõe outra; toda sala tem ≥1 célula de folga em cada lado; toda sala está dentro dos limites da grade.

### 5.4 Estágio 2 — `triangulate`

**Delaunay 2D por andar**, com `delaunator` (Mapbox).

Não usar tetraedralização 3D. As conexões verticais são escolhidas explicitamente no estágio 5; salas não atravessam andares neste design. Isso elimina a parte mais cara e mais frágil da referência original.

Entrada: centroides das salas do andar. Saída: lista de arestas únicas com peso = distância euclidiana.

### 5.5 Estágio 3 — `spanningTree`

Prim sobre as arestas de cada andar. ~30 linhas; não vale trazer dependência.

**Invariante:** grafo do andar conexo, `V-1` arestas, sem ciclos.

### 5.6 Estágio 4 — `addCycles`

Reintroduzir arestas da triangulação que não estão na MST, cada uma com probabilidade `cycleRate`.

Valores de referência: TinyKeep usa 15%, a implementação do Vazgriz usa 12,5% — ambos mirando jogo de ação, onde ciclo atrapalha o combate. **Para mesa o default é 0.25.** Masmorra sem ciclo é corredor de ida e volta; ciclo é o que permite fuga, flanqueamento e a sensação de mapa.

Marcar as arestas reintroduzidas com `kind: 'cycle'` — o estágio 8 usa essa informação.

### 5.7 Estágio 5 — `verticalLinks`

Para cada par de andares adjacentes, escolher `verticalLinksPerGap` conexões.

Critério de candidatura de um footprint em `(x, y)` de tamanho `w×h`:

- Livre nos dois andares (`CELL.EMPTY` em ambos)
- A ≤3 células de uma sala ou corredor potencial nos dois andares
- Distância ≥ `min(width, height) / 3` de qualquer outro link já escolhido (evita cacho de escadas)

Escolher maximizando dispersão: pegar o primeiro candidato aleatoriamente, depois sempre o candidato mais distante dos já escolhidos.

Marcar as células como `CELL.STAIR` nos dois andares. O footprint é **idêntico em (x,y)** nos dois níveis — não é exigência do Foundry, mas lê muito melhor. Em `v14` isso mantém a Region de escada visualmente alinhada entre as duas bandas de elevação; em `v13` isso faz a Region de chegada cair no mesmo lugar visual da Region de saída, só que na Scene do outro andar.

**Invariante:** todo andar tem ≥1 link para o andar acima e ≥1 para o de baixo (exceto topo e fundo).

### 5.8 Estágio 6 — `carve`

A* por aresta do grafo, sobre a grade do andar.

Função de custo (a peça mais importante do algoritmo inteiro):

```js
cost(cell) =
    cell === CELL.EMPTY   ? costs.newHallway
  : cell === CELL.HALLWAY ? costs.reuseHallway
  : cell === CELL.ROOM    ? costs.throughRoom
  : Infinity;
// + costs.turn se a direção mudou em relação ao passo anterior
```

Reusar corredor existente ser dez vezes mais barato que abrir novo é o que gera junções orgânicas, corredores-tronco e coincidências que lêem como arquitetura intencional. A penalidade de curva é adição nossa: sem ela o A* produz escadinhas diagonais horrorosas em grade quadrada.

Arestas verticais: o A* vai até a célula de acesso do footprint do link, não atravessa. Não existe o problema de "pular quatro células" da referência original, porque a escada não tem geometria.

**Engrossamento de corredor.** Depois de todos os caminhos traçados, para cada `residualCell` do estágio 1 que intersecta um corredor, converter suas células para `CELL.HALLWAY`. Isso produz paredes de corredor irregulares e trechos alargados, em vez de corredores de exatamente uma célula. É o truque do TinyKeep original e é o que salva a estética numa battlemap — corredor de 5 pés não comporta encontro.

Ordem de processamento: arestas da MST primeiro (garante conectividade), depois as de ciclo.

### 5.9 Estágio 7 — `prune`

Remoção iterativa de becos sem saída:

```
repetir pruneIterations vezes:
  para cada célula HALLWAY com exatamente 1 vizinho caminhável:
    se não for adjacente a sala, escada ou porta: virar EMPTY
```

Beco gerado por acaso lê como bug numa battlemap: o jogador vai lá, não tem nada, e o GM fica sem resposta. Becos **intencionais** são criados depois, pelo estágio 8, e ficam imunes por já terem conteúdo atribuído.

### 5.10 Estágio 8 — `mission`

Camada semântica. O pipeline até aqui produz topologia; nenhuma sala sabe o que é.

Rotulagem por métrica de grafo, sobre o grafo final (MST + ciclos + verticais):

| Papel | Critério |
|---|---|
| `entrance` | Folha do andar mais alto, a maior distância possível da borda ocupada |
| `climax` | Folha de maior excentricidade a partir da entrada, preferindo o andar mais fundo |
| `treasure` | Folhas alcançáveis **apenas** por arestas `kind: 'cycle'` — becos opcionais são exatamente onde recompensa deve ficar |
| `junction` | Grau ≥ 3 |
| `filler` | O resto |

Saída em `dungeon.mission`:

```js
{
  entranceRoomId: number,
  climaxRoomId: number,
  path: number[],              // rota entrada → clímax
  criticalLinks: number[],     // VerticalLink.id no caminho crítico
  optionalBranches: number[][] // ramos fora do caminho
}
```

**Extensão futura (fase 2):** chaves e trancas. Escolher uma aresta do caminho crítico como tranca, marcar uma sala fora dela como portadora da chave, e emitir a porta correspondente com `secret` ou estado trancado. O plugin de UE5 do shun126, que descende diretamente desse mesmo algoritmo, resolveu exatamente isso com um MissionGraph — vale ler como referência antes de projetar.

### 5.11 Estágio 9 — `key`

Produz a **chave da masmorra**: numeração das áreas, entradas de texto correspondentes e a legenda de símbolos. É o que permite tratar o mapa como material publicável, no formato clássico de mapa numerado mais lista de áreas.

#### Numeração

**Derivada da topologia, nunca do RNG.** Este estágio não recebe substream. Duas masmorras com o mesmo grafo recebem os mesmos números, e mexer em qualquer parâmetro de estágio posterior não renumera nada.

Ordem: BFS a partir de `mission.entranceRoomId`, andar por andar, atravessando `VerticalLink` só depois de esgotar o andar atual. Empates no BFS são desfeitos por coordenada (menor `y`, depois menor `x`) — determinístico e produz uma ordem que sobe e desce pelo mapa de forma legível, em vez de saltar.

Justificativa: numeração por ordem de leitura pura ignora a estrutura e espalha áreas conexas por números distantes. BFS a partir da entrada faz o número crescer conforme o jogador se afasta, que é como uma chave escrita à mão se organiza.

#### Esquemas de rótulo

`config.key.scheme`:

| Valor | Exemplo | Uso |
|---|---|---|
| `flat` | `1`, `2`, `17` | Masmorra de um andar |
| `per-floor` | `1-01`, `2-07` | Default. Andar-área, com zero à esquerda |
| `alpha-floor` | `A1`, `B7` | Andar como letra, estilo OSR |

O prefixo de andar do rótulo (`1-`, `2-`...) é sobretudo estético em `v14` (a Scene é uma só, o GM vê o andar mudando de banda de elevação), mas é a única pista textual de "em qual mapa isso está" em `v13`, onde cada andar é uma Scene separada e a chave pode ser lida fora do canvas.

#### O que recebe número

- Toda `Room`, sempre.
- Junções de corredor com grau ≥3, se `config.key.numberJunctions` — desligado por default. Ligue em masmorras grandes, onde "vá para o cruzamento" precisa de referência.
- `VerticalLink` **não** recebe número. Recebe símbolo de escada com o rótulo do destino (`↑ 1-03`), que é o que o GM realmente precisa ler.

#### Texto gerado

Cada `Area` gera uma `KeyEntry` com título e descrição **placeholder**, derivados de `role` e de métricas do grafo. Não é conteúdo de sistema, é andaime:

| `role` | Título gerado | Descrição |
|---|---|---|
| `entrance` | "Entrada" | Aponta as saídas e o que se vê do umbral |
| `climax` | "Câmara final" | Marca como o ponto mais distante, lista os acessos |
| `treasure` | "Câmara isolada" | Marca como ramo opcional |
| `junction` | "Encruzilhada" | Lista as N saídas com seus rótulos |
| `filler` | "Área {label}" | Só dimensões e saídas |

Toda entrada lista **saídas com rótulo de destino** (`"Norte → 2-04"`, `"Escada descendo → 1-06"`). Isso é o item de maior valor prático da chave inteira e é gratuito: já está no grafo.

#### Legenda de símbolos

A legenda **não é desenhada no mapa**. Ela é o conjunto de ícones de pin usado pelas Notes, documentado numa página da chave.

`dungeon.key.legend` lista apenas os símbolos efetivamente presentes nesta masmorra — se não houver porta secreta, o símbolo não entra.

| `kind` | Ícone de pin | Aplicado a |
|---|---|---|
| `entrance` | portal | Área com `role: 'entrance'` |
| `climax` | caveira | Área com `role: 'climax'` |
| `treasure` | baú | Área com `role: 'treasure'` |
| `junction` | losango | Área com `role: 'junction'` |
| `area` | círculo neutro | Demais áreas |
| `stairUp` / `stairDown` | seta | Note de escada, sem número |
| `secret` | interrogação | Porta secreta |

Os arquivos ficam em `module/assets/pins/*.svg` e são versionados com o módulo. `LegendSymbol.caption` alimenta a página de legenda, para o GM saber o que cada pin significa sem decorar.

#### Saída

Adiciona a `Dungeon`:

```js
areas: Area[],
key: {
  scheme: 'flat'|'per-floor'|'alpha-floor',
  entries: KeyEntry[],       // mesma ordem de areas
  legend: LegendSymbol[],
  byLabel: Record<string, number>,  // label → Area.id
}
```

#### Exportação fora do Foundry

`core` expõe `keyToMarkdown(dungeon)`, que devolve a chave em Markdown puro: cabeçalho por andar, uma seção por área, legenda no fim. Serve para imprimir, colar no Obsidian ou versionar junto com o resto do material de campanha. Zero dependência de Foundry, zero dependência de `config.target` — é a razão de o estágio viver no `core` e não no adapter.

### 5.12 Estágio 10 — `extractWalls`

Por andar:

1. Percorrer a fronteira da máscara caminhável (`ROOM | HALLWAY | STAIR`), produzindo segmentos de aresta de célula.
2. **Fundir segmentos colineares e contíguos** num único `WallSegment`.
3. Onde um corredor cruza a fronteira do footprint de uma sala, marcar o segmento como `isDoor` e registrar em `dungeon.doors`.

A fusão não é otimização. Uma grade 60×60 sem fusão gera milhares de documentos de parede e trava o canvas — em `v14` isso é ainda mais crítico, porque as paredes de todos os andares somam na mesma Scene.

Portas emergem da geometria; não tente posicioná-las num passo separado depois — a informação de qual corredor entrou em qual sala já se perdeu.

### 5.13 Estágio 11 — `render`

Uma imagem por andar. Só a máscara e as paredes entram; **nenhum número, nenhum símbolo**. A numeração é responsabilidade das Notes (§5.14), que são vetoriais, clicáveis, reposicionáveis pelo GM e não exigem regerar imagem.

Caminho adotado: **vetorial**, desenhado em `OffscreenCanvas`. Piso hachurado ou texturizado por padrão repetido, contorno de parede grosso, sombra externa suave, ruído leve.

Saída: `{ floor, blob, width, height }[]`. `render` não conhece o Foundry nem `config.target` — cada entrada dessa lista vira, em `v14`, um Tile tagueado ao nível dentro da Scene única, e em `v13`, o background de uma Scene distinta.

#### `bakeOverlay` — opcional, default desligado

`config.key.bakeOverlay` gera uma imagem adicional por andar com os rótulos gravados. **Não é usada na(s) Scene(s).** Existe por um motivo só: Notes não saem em exportação de imagem, então se você quiser um PDF ou um handout impresso do mapa numerado, precisa da versão gravada.

O comando que a produz é separado (`exportMap`), não faz parte do fluxo de geração de cena, e a imagem não é enviada ao servidor por default.

### 5.14 Estágio 12 — `emit` (adapter-foundry)

Traduz `Dungeon` + imagens em documentos. Único ponto do repositório que toca API do Foundry. Lê `config.target` e delega para `v14.js` ou `v13.js` — o restante desta seção descreve cada um.

#### Ordem de criação comum aos dois alvos

Notes referenciam páginas por id, então a JournalEntry precisa existir primeiro em ambos os casos:

1. Criar a `JournalEntry` da chave, com todas as páginas.
2. Coletar o mapa `Area.id → pageId` a partir do documento criado.
3. A partir daqui, `v14.js` e `v13.js` seguem passos diferentes (abaixo).

Se a criação de Scene(s) falhar depois do passo 1, a JournalEntry é revertida — a operação inteira é transacional, ou o mundo fica com journals fantasma a cada tentativa.

#### JournalEntry "Chave — {nome}"

- Página `Legenda` — tabela de ícones e o que cada um significa, mais o índice de áreas por andar. Em `v13`, cada linha do índice também mostra o **nome da Scene** correspondente ao andar (não existe essa necessidade em `v14`, onde há uma Scene só).
- Uma página por `Area`, titulada `{label} — {title}`, com a descrição placeholder, a lista de saídas com destino, e os campos que o GM vai preencher

Uma página por área, e não uma página longa, por causa da permissão: é o que permite liberar áreas individualmente aos jogadores. Comum aos dois alvos.

---

#### `v14.js` — uma Scene, bandas de elevação

4. Criar **uma** `Scene`, com as Notes já apontando para os `pageId` reais coletados no passo 2.

Criar a Scene antes da JournalEntry gera Notes órfãs que abrem em branco — por isso a ordem do passo 1–2 vale igual aqui.

##### Scene

- `levels[]` — uma banda por andar
- Um Tile por nível com a imagem limpa do piso, tagueado ao nível
- `walls[]` — `c: [x1,y1,x2,y2]` em pixels, `door: 0|1`, `ds: 0`, flags de movimento/visão/luz/som, mais o índice de nível (`// TODO(schema)` até confirmar contra o golden sample)
- `regions[]` — uma por `VerticalLink`, com comportamento de troca de nível, presente nos dois níveis daquele link
- `lights[]` — opcional, uma por área com `role !== 'filler'`
- `notes[]` — ver abaixo

##### Notes

Uma Note por `Area`, mais uma por `VerticalLink` (duas, uma em cada nível).

| Campo | Valor |
|---|---|
| `x`, `y` | `area.cx * gridSize`, `area.cy * gridSize` |
| `text` | `area.label` |
| `textAnchor` | centro |
| `fontSize` | derivado de `gridSize`, mínimo 24 |
| `texture.src` | ícone de `module/assets/pins/` conforme o `role` (§5.11) |
| `iconSize` | `gridSize * 0.6` |
| `entryId` / `pageId` | a página da chave daquela área |
| `global` | `false` |
| nível | tagueado ao andar da área — `// TODO(schema)` |

Notes de escada não recebem número: `text` é `↑ 1-03` ou `↓ 2-07`, e o link aponta para a página da área de destino.

##### Armadilhas conhecidas (v14)

- Notes só aparecem com a camada de notas ligada. O módulo verifica a configuração de exibição de notas da cena ao terminar de gerar e avisa se estiver desligada.
- Pin demais polui. Com `numberJunctions` ligado numa masmorra grande, o mapa vira um campo de ícones — daí o orçamento de Notes no validador.
- Apagar a JournalEntry deixa todas as Notes órfãs. O módulo grava o id da entry num flag da Scene e oferece regerar o vínculo.

---

#### `v13.js` — N Scenes, Regions de teleporte pareadas

Regions de escada referenciam a Region parceira em outra Scene por id — o que só existe depois que a Scene de destino existe. A ordem, continuando do passo 2 comum:

4. Criar **as N Scenes**, uma por andar, cada uma com seu background, `walls[]`, `notes[]` (já apontando para os `pageId` reais) e `lights[]`. As Regions de escada entram nesta criação **sem** behavior de teleporte configurado ainda — só o footprint geométrico.
5. Coletar o mapa `floor → sceneId` e, por Region de escada, `VerticalLink.id → regionId` dentro de cada Scene.
6. Para cada `VerticalLink`, `update()` as duas Regions parceiras (uma em `fromFloor`, outra em `toFloor`), adicionando o `RegionBehavior` "Teleport Token" de cada uma apontando para a `regionId` da outra.

Criar as Regions com o behavior já resolvido no passo 4 não é possível: a Region de destino só ganha id depois de criada, e as duas metades do par se referenciam mutuamente. Se o passo 6 falhar, os passos 1–5 são revertidos — a operação inteira é transacional, ou o mundo fica com Scenes pela metade e journals fantasma a cada tentativa.

##### Scenes

Uma por andar, nomeada `{nome da masmorra} — Andar {n}` (ou conforme `config.key.scheme`, ex. `{nome} — B` no esquema `alpha-floor`). Cada Scene contém:

- Um Tile ou background com a imagem limpa daquele andar — sem tag de nível, porque a Scene inteira já é o andar
- `walls[]` — `c: [x1,y1,x2,y2]` em pixels, `door: 0|1`, `ds: 0`, flags de movimento/visão/luz/som
- `regions[]` — uma por `VerticalLink` que toca este andar (cada link gera **duas** Regions, uma por Scene), com um `RegionBehavior` de tipo teleporte apontando para a Region parceira na Scene do outro andar (ver ordem de criação acima)
- `lights[]` — opcional, uma por área com `role !== 'filler'`
- `notes[]` — ver abaixo

Não existe conceito de "banda de elevação" nem de tag de nível por placeable: pertencimento a andar é 1:1 com pertencimento a Scene.

##### Notes

Uma Note por `Area`, mais uma por `VerticalLink` em cada uma das duas Scenes que ele liga (duas Notes por link, uma de cada lado — igual ao par de Regions, mas Note e Region são documentos distintos: a Region move o token, a Note é o pin clicável da chave).

| Campo | Valor |
|---|---|
| `x`, `y` | `area.cx * gridSize`, `area.cy * gridSize` |
| `text` | `area.label` |
| `textAnchor` | centro |
| `fontSize` | derivado de `gridSize`, mínimo 24 |
| `texture.src` | ícone de `module/assets/pins/` conforme o `role` (§5.11) |
| `iconSize` | `gridSize * 0.6` |
| `entryId` / `pageId` | a página da chave daquela área |
| `global` | `false` |

Não há campo de nível aqui: a Note já nasce dentro da Scene certa.

Notes de escada não recebem número: `text` é `↑ 1-03` ou `↓ 2-07`, e o link aponta para a página da área de destino. A Note funciona mesmo antes de o jogador efetivamente atravessar a Region de teleporte.

##### Visibilidade progressiva (comum, com nuance v13)

Por default toda página da chave nasce com ownership `NONE` para jogadores, então nenhum pin aparece na mesa. Conforme o grupo descobre uma área, o GM sobe a página para `OBSERVER` e o pin passa a ser visível e clicável para todos. Em `v13`, isso cobre também o caso de o GM só querer navegar o grupo para a Scene do andar 2 quando eles de fato descerem — a visibilidade da chave e a troca de Scene evoluem juntas.

O módulo expõe, em `v13`, três atalhos: revelar todas as áreas de um andar, revelar a área sob o token selecionado, e navegar todos os tokens selecionados para a Scene de destino de uma escada (equivalente manual ao que a Region de teleporte faz automaticamente ao token que pisa nela). Em `v14`, os dois primeiros atalhos existem; o terceiro não se aplica, pois não há troca de Scene.

##### Armadilhas conhecidas (v13)

- Notes só aparecem com a camada de notas ligada. O módulo verifica a configuração de exibição de notas de **cada Scene** ao terminar de gerar e avisa se estiver desligada em alguma.
- Pin demais polui. Com `numberJunctions` ligado numa masmorra grande, o mapa vira um campo de ícones — daí o orçamento de Notes no validador (por Scene, não somado entre andares).
- Apagar a JournalEntry deixa todas as Notes de todas as Scenes órfãs. O módulo grava o id da entry num flag de cada Scene e oferece regerar o vínculo.
- Apagar ou renomear uma Scene de andar quebra o par de Regions de teleporte das escadas que levam a ela. O módulo grava, em flag de cada Region, o `VerticalLink.id` de origem, e oferece um comando de "revalidar escadas" que detecta destinos órfãos.
- Duplicar uma Scene de andar (ação nativa do Foundry) duplica as Regions, mas o behavior de teleporte continua apontando para a Scene original — comportamento esperado do Foundry, não bug do módulo, mas vale documentar no README.

---

Conversão de coordenadas: `pixel = cell * config.gridSize`. Default `gridSize = 100`, igual nos dois alvos e igual para todas as Scenes de uma mesma masmorra em `v13` — o que garante que o footprint da escada caia visualmente no mesmo lugar (x,y) nos dois andares.

Todo nome de campo não confirmado contra o golden sample do alvo correspondente (§2.4) recebe `// TODO(schema)`.

---

## 6. Validador

`core/src/validate.js` roda sobre `Dungeon` e devolve `{ ok: boolean, errors: Issue[] }`. Estas invariantes são sobre o modelo abstrato produzido pelo `core` e **não dependem de `config.target`** — a mesma suíte vale para os dois alvos, porque roda antes de `emit` sequer ser chamado.

Invariantes obrigatórias:

1. **Conectividade por andar** — flood fill a partir de qualquer célula caminhável alcança todas as células caminháveis do andar.
2. **Conectividade global** — flood fill atravessando os `VerticalLink` alcança todos os andares a partir da entrada. Em `v14` isso corresponde a: seguindo as Regions de troca de nível, dá para alcançar qualquer banda de elevação. Em `v13`: seguindo os pares de Regions de teleporte, dá para alcançar a Scene de qualquer andar.
3. **Escadas pareadas** — todo `VerticalLink` tem footprint livre e acessível nos dois níveis. No adapter v13, isso garante que as duas Regions do par sempre existem e nenhuma fica com behavior de teleporte apontando para uma Region inexistente.
4. **Portas bem formadas** — toda porta tem célula caminhável dos dois lados e parede nos dois lados perpendiculares.
5. **Sem parede órfã** — todo `WallSegment` faz fronteira com ≥1 célula caminhável.
6. **Sem beco sem conteúdo** — nenhuma folha `filler` sem saída.
7. **Orçamento de paredes** — `walls.length < 1500` no total, em `v14` (uma Scene só); por andar, em `v13` (uma Scene por andar) — senão a Scene trava.
8. **Salas alcançáveis** — toda `Room` tem ≥1 porta.
9. **Chave completa** — toda `Room` tem exatamente uma `Area`; toda `Area` tem exatamente uma `KeyEntry`.
10. **Rótulos únicos e contíguos** — nenhum rótulo repetido; a numeração por andar não tem buracos.
11. **Saídas simétricas** — se a área X lista saída para Y, Y lista saída para X. Erro clássico quando escada e porta são tratadas em passos diferentes.
12. **Âncoras válidas** — o centroide de rótulo de toda área cai dentro de célula caminhável daquela área, e a ≥`gridSize * 0.4` de qualquer parede, para o pin não ficar em cima do traço.
13. **Legenda fiel** — todo ícone declarado na legenda é usado por ≥1 Note, e toda Note usa ícone declarado.
14. **Orçamento de Notes** — `areas.length + links.length * 2 <= 60` no total, em `v14`; por Scene (`areas.length do andar + links.length do andar * 2 <= 60`), em `v13`. Acima disso o canvas vira campo de ícones; o gerador reduz `numberJunctions` automaticamente e avisa.
15. **Vínculo íntegro** — toda Note emitida referencia uma página existente da chave, e toda página de área é referenciada por ≥1 Note. Em `v13`, adicionalmente: toda Region de escada referencia uma Region parceira existente em outra Scene.

O validador roda em CI sobre **10.000 seeds**. Falha em qualquer uma quebra o build. Essa suíte é o que separa um gerador utilizável de um que arruína uma sessão ao vivo — e roda uma vez só, antes de escolher o alvo.

---

## 7. Parâmetros — defaults

```js
export const DEFAULTS = {
  target: 'v13',              // ou 'v14' — decide a estratégia de emit
  floors: 3,
  width: 50,
  height: 50,
  gridSize: 100,
  rooms: {
    count: 9,
    sizeMean: 7,
    sizeStdDev: 2.5,
    sizeMin: 3,
    sizeMax: 14,
    spawnRadius: 18,
    separationIters: 60,
  },
  cycleRate: 0.25,
  verticalLinksPerGap: 2,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: {
    scheme: 'per-floor',
    numberJunctions: false,
    startAt: 1,
    padTo: 2,               // zero à esquerda: 1-07
    exitsInEntries: true,
    revealToPlayers: false, // ownership inicial das páginas
    stairNotes: true,
    bakeOverlay: false,     // só para exportar mapa impresso
  },
  scenes: {
    // usado só quando target === 'v13'
    nameTemplate: '{dungeonName} — Andar {floor}',
  },
};
```

Todos expostos na UI do módulo. `seed` aceita string livre; a UI mostra a seed usada e permite copiá-la. `target` é detectado automaticamente a partir da versão do Foundry rodando (`game.release.generation`), com override manual na UI para quem quer forçar um dos dois comportamentos.

---

## 8. Ordem de implementação

| Marco | Entrega | Critério de pronto |
|---|---|---|
| M0 | `rng`, `grid`, `types`, harness Vite com preview em canvas | Grade renderiza, seed reproduz |
| M1 | Estágios 1–4, um andar só | Grafo de salas visível e conexo |
| M2 | Estágio 6 sem engrossamento | Corredores de 1 célula ligando tudo |
| M3 | Estágio 9 + render vetorial | Imagem de um andar que dá pra jogar |
| M4a | Estágios 5 e 11, `emit` alvo `v13` | N Scenes criadas no Foundry, uma por andar, com par de Regions de escada teleportando corretamente entre elas |
| M4b | `emit` alvo `v14` | Scene multinível criada no Foundry, bandas de elevação e escadas funcionando |
| M5 | Estágios 7, 8 e engrossamento | Qualidade de layout aceitável, nos dois alvos |
| M6 | Estágio 9, JournalEntry de chave, Notes vinculadas | Pins numerados abrindo a página certa nos dois alvos; `keyToMarkdown` funcionando |
| M7 | Validador + 10.000 seeds em CI | Zero falhas, independente de alvo (validador não conhece `target`) |
| M8 | UI do módulo, Worker, presets, detecção automática de `target` | Uso em sessão real, nos dois alvos |

M4a e M4b são os marcos de risco: é onde o schema do Foundry de cada versão pode surpreender. Fazer os dois golden samples (§2.4) **antes** do M0. Se só um dos dois alvos importa para o lançamento inicial, o outro marco pode ser adiado sem bloquear M5 em diante — `emit` é a única parte que depende dele.

---

## 9. Testes

- **Unitários** — cada estágio contra fixtures de entrada conhecida.
- **Determinismo** — mesma seed, dois runs, `JSON.stringify` idêntico. Roda em cada commit.
- **Isolamento de substream** — alterar o algoritmo do estágio 8 não muda `dungeon.cells`. Regressão comum e silenciosa.
- **Propriedade** — 10.000 seeds contra o validador, uma vez só (não depende de `target`).
- **Performance** — 50×50×3 gera em <300ms em hardware médio.
- **Emit v14** — teste de integração (mundo Foundry real ou mock de API) que cria uma masmorra de 2 andares e verifica que a Scene única tem duas bandas, com a Region de escada presente nas duas.
- **Emit v13** — teste de integração equivalente que verifica que as duas Regions de cada `VerticalLink` se referenciam mutuamente após o passo 6 de §5.14.
- **Paridade shared/** — mesma seed nos dois alvos produz a mesma JournalEntry de chave (mesmos títulos, descrições e legenda), já que `adapter-foundry/shared/` é código comum.

---

## 10. Regras de código

1. `Math.random` proibido. Regra de ESLint.
2. `core` não importa DOM, Canvas, nem globais do Foundry, nem lê `config.target`.
3. Grades sempre `TypedArray`, nunca array de objetos.
4. Estágios são funções puras. Nenhum estado de módulo.
5. Nomes de campo do Foundry não confirmados no golden sample do alvo levam `// TODO(schema)`.
6. Todo artefato intermediário é serializável — se não passa por `structuredClone`, está errado.
7. O estágio 9 não recebe substream de RNG. Numeração é função pura da topologia; se depender de sorteio, a chave renumera sozinha e o material impresso desmonta.
8. `v13.js` nunca cria uma Region de escada sem, na mesma transação lógica, criar ou já ter criado sua parceira na Scene do outro andar. Uma Region de teleporte sem destino válido é pior que não ter escada: o jogador clica e nada acontece.
9. Lógica compartilhada entre `v13.js` e `v14.js` vive em `adapter-foundry/shared/`, nunca duplicada — se um bug de legenda ou de cálculo de pixel só for corrigido num dos dois arquivos, os dois alvos divergem silenciosamente.

---

## Referências

- Vazgriz, *Procedurally Generated Dungeons* — pipeline Delaunay/MST/A*, base deste documento
- A. Adonaac, *Procedural Dungeon Generation Algorithm* — separação por steering, distribuição normal
- TinyKeep dev, post original no GameDev.net — células residuais como corredor irregular
- shun126, *DungeonGenerator* (UE5, GPL) — MissionGraph sobre este mesmo algoritmo
- Bob Nystrom, *Rooms and Mazes* — poda de becos, junção de regiões
- Joris Dormans, geração cíclica — referência para a fase 2 de missão
- Foundry VTT, documentação de Scene Levels/bandas de elevação (v14+) — base do adapter `v14.js`
- Foundry VTT, documentação de Regions e Region Behaviors (core desde v12) — base do mecanismo de teleporte entre Scenes usado pelo adapter `v13.js`
