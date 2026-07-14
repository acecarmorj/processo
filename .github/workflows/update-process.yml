name: Atualizar processo SEI

on:
  # O portal SEI bloqueia conexões dos servidores hospedados do GitHub.
  # Este fluxo fica disponível apenas para testes manuais de conectividade.
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: atualizar-processo-sei
  cancel-in-progress: true

jobs:
  atualizar:
    runs-on: ubuntu-latest
    timeout-minutes: 6
    steps:
      - name: Baixar repositório
        uses: actions/checkout@v4

      - name: Preparar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm

      - name: Instalar dependências
        run: npm ci

      - name: Consultar processo e gerar relatório
        run: npm run update
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_MODEL: gpt-5.4-mini

      - name: Publicar atualização
        run: |
          if git diff --quiet -- data/processo.json; then
            echo "Nenhuma mudança pública encontrada."
            exit 0
          fi
          git config user.name "Painel FAEP/FAETEC"
          git config user.email "actions@users.noreply.github.com"
          git add data/processo.json
          git commit -m "Atualiza andamento do processo SEI"
          git push
