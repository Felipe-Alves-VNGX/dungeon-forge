# Dungeon Forge

Gerador procedural de masmorras multinível para [Foundry Virtual Tabletop](https://foundryvtt.com/), escrito em JavaScript.

A partir de uma seed e um conjunto de parâmetros, produz os documentos Foundry de uma masmorra completa:

- Uma imagem de piso por andar
- Paredes com portas, com segmentos colineares otimizados
- Passagens entre andares
- Rótulos semânticos nas salas (entrada, clímax, tesouro, encruzilhada)
- Uma chave da masmorra materializada em Notes e JournalEntries do Foundry, também exportável em Markdown puro

A mesma seed produz sempre a mesma masmorra, bit a bit. O gerador tem dois alvos de emissão — Foundry v13 e v14+ — selecionados por configuração; o pipeline central de geração é idêntico nos dois casos. Veja [`SPEC.md`](./SPEC.md) para a especificação completa.

## Estrutura do projeto

```
packages/
  core/    — pipeline de geração, independente de Foundry
  render/  — renderização de preview
harness/   — app Vite para rodar e visualizar o pipeline localmente
```

## Desenvolvimento

```bash
npm install
npm test    # roda os testes (vitest)
npm run lint
```

Para rodar o harness de preview:

```bash
cd harness
npm run dev
```

## Status

Projeto em desenvolvimento ativo. A API e o formato de saída ainda podem mudar.

## Licença

[MIT](./LICENSE). Veja também [CREDITS.md](./CREDITS.md).
