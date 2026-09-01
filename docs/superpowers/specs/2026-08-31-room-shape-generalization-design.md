# Generalização de formas de sala — Design

## Contexto

Follow-up 2 do plano vivo `docs/superpowers/plans/2026-08-27-room-editor-ui.md`: hoje `Room` é sempre um retângulo (`x,y,w,h`), e `placeRooms`, `carve`, `verticalLinks`, `extractWalls` em `packages/core` assumem isso implicitamente. Este documento especifica como generalizar para L, cruz, círculo e triângulo, sorteadas por uma tabela ponderada configurável, mantendo retrocompatibilidade total quando a tabela não é usada.

Explicitamente fora de escopo desta rodada:
- Polígono livre/arbitrário (fora do catálogo fixo de formas).
- Religar `harness/src/cell-editor.js` para aplicar máscara real em vez de bounding box — fica para um Follow-up 3 futuro, com design próprio (desenho livre é um problema de UI diferente de sorteio por tabela ponderada na geração).
- Qualquer mudança em `packages/render` ou `adapter-foundry`.

## Decisões confirmadas

1. **Fonte de verdade da forma:** um novo array paralelo ao grid, `roomIdAt: Uint16Array` (mesma indexação `z*w*h + y*w + x` de `cells`; sentinela `0xFFFF` = nenhuma sala). `Room` continua só com o bounding box (`x,y,w,h,cx,cy`) — nenhuma máscara duplicada dentro de `Room`. Evita duas fontes de verdade divergentes.
2. **Catálogo de formas:** funções especializadas por tipo (não um motor genérico de polígono). Cada forma é uma função pura `rasterize<Shape>(room, rng) → Array<{x,y}>` em `packages/core/src/shapes.js`.
3. **Separação/steering em `placeRooms`:** inalterada — continua operando em bounding boxes (AABB). Conservador: bboxes nunca sobrepostas ⇒ formas reais nunca sobrepostas. A rasterização da forma acontece depois que a posição final é decidida.
4. **Escopo por role:** a tabela ponderada se aplica a todas as salas, sem exceção por `role` (entrance/climax/etc. não são hardcoded retangulares).
5. **Config:** `RoomParams.shapes?: {type, weight}[]`; default (campo ausente) = 100% retângulo, comportamento idêntico ao atual. Seleção via novo helper `rng.weightedPick(entries, weightFn)` em `rng.js`.
6. **Invariante obrigatório de rasterização:** toda forma gerada DEVE conter a célula `(round(room.cx), round(room.cy))`. Isso é o que permite `carve.roomBoundaryCell` continuar funcionando sem nenhuma mudança.

## Modelo de dados

```js
/**
 * @typedef {Object} RoomShapeEntry
 * @property {'rect'|'l'|'cross'|'circle'|'triangle'} type
 * @property {number} weight   // peso relativo, não precisa somar 1
 */

/**
 * @typedef {Object} RoomParams
 * ...campos existentes (count, sizeMean, sizeStdDev, sizeMin, sizeMax, spawnRadius, separationIters)...
 * @property {RoomShapeEntry[]} [shapes]   // default: [{type:'rect', weight:1}]
 */
```

`Room` ganha um campo opcional `shape: {type, params}` — só para introspecção/debug e uso futuro pelo cell-editor; nada no pipeline lê esse campo depois da rasterização (a fonte de verdade pós-rasterização é sempre `roomIdAt` + `CELL.ROOM`).

`Dungeon` ganha `roomIdAt: Uint16Array`, preenchido no mesmo loop que hoje marca `CELL.ROOM` durante a rasterização de cada sala.

## Rasterizadores (`packages/core/src/shapes.js`)

- `rasterizeRect(room)` — todas as células do bbox. Caso trivial, extraído do comportamento atual.
- `rasterizeL(room, armRatio, rng)` — bbox menos um retângulo de canto (o "notch"). `armRatio` (faixa configurável, default ~0.4–0.6) sorteada por `rng.float()`, decide a proporção do braço restante em cada eixo. Canto do notch também sorteado (4 rotações possíveis).
- `rasterizeCross(room, armRatio, rng)` — bbox menos os 4 cantos, sobra uma cruz. Mesmo parâmetro de proporção do braço.
- `rasterizeCircle(room)` — elipse inscrita no bbox: célula `(x,y)` incluída se `((x-cx)/rw)² + ((y-cy)/rh)² ≤ 1`, com `rw=w/2, rh=h/2`.
- `rasterizeTriangle(room, orientation, rng)` — triângulo inscrito no bbox, preenchido por scanline; `orientation` (up/down/left/right) sorteada, decide para que lado aponta o vértice.

Cada rasterizador aplica uma clamp mínima de tamanho (não confia cegamente em `sizeMin` do config) para garantir que o invariante do centroide nunca degenere (ex: um L com braço tão fino que exclui o centroide arredondado).

## Mudanças por estágio

### `01-place-rooms.js`
Depois de promover as `count` maiores salas (steering por bbox inalterado), cada sala sorteia uma forma via `rng.weightedPick(params.shapes ?? [{type:'rect', weight:1}], e => e.weight)` e chama o rasterizador correspondente. As células retornadas alimentam o preenchimento de `CELL.ROOM` e `roomIdAt` no pipeline (ou dentro do próprio `placeRooms`, a decidir na implementação — ver plano).

### `06-carve.js`
**Nenhuma mudança.** `roomBoundaryCell` continua devolvendo `(round(cx), round(cy))`, garantido válido pelo invariante de rasterização. `cellCost` já é agnóstico a forma (só lê valor de célula). `thickenCorridors` opera sobre `residualCells` (retângulos não promovidos), sem relação com a forma das salas promovidas.

### `05-vertical-links.js`
**Nenhuma mudança.** `rectGap`/`nearestRoomGap`/`nearestRoom` continuam usando o bbox do `Room` — aproximação conservadora aceitável (distância real à forma é sempre ≤ distância à bbox; não viola nenhum invariante do SPEC, que trata proximidade como heurística, não garantia exata).

### `10-extract-walls.js`
Mudança concentrada aqui:
- `roomAt(rooms, x, y)` (busca linear por bbox) → lookup O(1) em `roomIdAt`.
- `collectDoorEdges`: em vez de varrer o perímetro retangular explícito (`for x in [room.x, room.x+room.w)` por lado), varre o **perímetro real da forma**: para cada célula com `roomIdAt === room.id`, examina os 4 vizinhos; todo vizinho com `roomIdAt` diferente (ou não-ROOM) que seja `isDoorOpening` é uma aresta de porta candidata, com direção n/s/e/w determinada diretamente por qual vizinho é (sem comparar contra `room.x/room.y`). Mesmo princípio de `collectSilhouetteEdges`, escopado por sala.
- `doorDirection(door, room)` — **eliminada**. Hoje deriva a direção comparando a coordenada da porta contra `room.x`/`room.y`, o que só funciona para bordas retangulares retas. A direção passa a ser carregada como campo desde `collectDoorEdges`, no momento em que já sabemos qual vizinho gerou a aresta.
- `traceDestinationRoom`: já faz BFS pela grade (agnóstico a forma); só a chamada a `roomAt` no caso-base vira lookup em `roomIdAt`.
- `collectSilhouetteEdges` (parede externa/perímetro global): **nenhuma mudança**, já é 100% agnóstico a forma.

## `rng.js`
Novo helper: `weightedPick(entries, weightFn)` — soma cumulativa de pesos, sorteia `rng.float() * totalWeight`, acha o bucket via busca linear. Reaproveitável por qualquer tabela ponderada futura do projeto.

## Plano de testes

- **`shapes.test.js`** (novo): cada rasterizador isoladamente — contém o centroide arredondado; toda célula dentro do bbox declarado; contagem de células plausível (círculo ≈ π·rw·rh; L/cruz = fórmula fechada da união de sub-retângulos).
- **`01-place-rooms.test.js`** (estendido): com `shapes` configurado, toda sala promovida tem `shape` preenchido e rasterização não-vazia; sem `shapes`, snapshot idêntico ao atual.
- **`06-carve.test.js`** (novo caso): sala em L cujo centroide de bbox cai fora do braço "óbvio" ainda é alcançada pelo A* — valida na prática o invariante da seção de rasterizadores.
- **`10-extract-walls.test.js`** (novo caso): sala não-retangular tem portas detectadas em todos os lados reais do perímetro da forma, incluindo a parede interna de uma concavidade (L/cruz) que um scan de bbox nunca acharia; contagem de portas em casos retangulares existentes não regride.
- **`validate.test.js` / `property.test.js`**: rodar o property test (2000+ seeds) também com uma config de `shapes` misto (peso > 0 para todos os tipos), além da config default-retângulo — é o teste que historicamente pegou bugs reais de geração (overlap, leaf sem conteúdo, etc.) e deve pegar qualquer regressão de conectividade/portas/budget introduzida por formas côncavas.
- **Meta de regressão zero:** nenhum teste existente muda de resultado quando `RoomParams.shapes` está ausente.

## Riscos conhecidos e mitigação

- **Formas degeneradas** (L/cruz com braço tão fino que exclui o centroide): mitigado por clamp mínima de tamanho dentro de cada rasterizador, independente do `sizeMin` do config.
- **`extractWalls` é o ponto de maior risco real** (única lógica genuinamente reescrita, não só estendida) — coberto por casos de teste dedicados a concavidade antes de qualquer outra mudança do pipeline.
- **Determinismo por seed:** `weightedPick` consome do substream de RNG já derivado para o estágio (`placeRooms`), preservando a garantia do SPEC §5.1 de que mudar um estágio não invalida seeds de outro.
