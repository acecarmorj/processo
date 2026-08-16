# Painel do processo ex-FAEP / FAETEC

Painel público que apresenta, em linguagem simples, os dados do processo
`SEI-030029/004475/2023`.

## Abrir localmente

```powershell
npm install
npm run serve
```

## Atualizar os dados do SEI

```powershell
npm run update
```

O atualizador lê os andamentos e documentos públicos, salva o resultado em
`data/processo.json` e mantém separados:

- fatos publicados no SEI;
- explicações em linguagem simples;
- estimativas financeiras, que não equivalem a autorização de gasto.

## Publicação

O site é estático. Publique `index.html`, `app.js`, `styles.css`, a pasta `data`
e o arquivo `.nojekyll` no GitHub Pages.
