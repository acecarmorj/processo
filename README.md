# Painel público ex-FAEP / FAETEC

Painel mobile-first para acompanhar o processo `SEI-030029/004475/2023`.

## Funcionamento

- A consulta automática ocorre de hora em hora, das 08:00 às 20:00, com uma verificação extra às 00:10, no horário de Brasília.
- Se encontrar mudança, atualiza `data/processo.json`.
- O GitHub Pages publica o painel.
- Ao abrir a página, o visitante recebe os dados mais recentes.
- O navegador guarda a última visita e destaca novos documentos e movimentos.
- O botão **Resumo histórico** apresenta a trajetória completa em linguagem simples.

## Preparar o repositório

1. Crie um repositório no GitHub.
2. Envie todo o conteúdo desta pasta para a raiz do repositório.
3. Em **Settings > Pages**, escolha **Deploy from a branch**.
4. Selecione a branch `main` e a pasta `/ (root)`.
5. Em **Actions**, execute manualmente `Atualizar processo SEI` pela primeira vez.

O endereço ficará semelhante a:

`https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`

## Análise com IA

Sem chave, o painel usa análise automática baseada nos setores e movimentos.

Para ativar a análise da OpenAI:

1. Abra **Settings > Secrets and variables > Actions**.
2. Crie o secret `OPENAI_API_KEY`.
3. Execute novamente a Action.

A chave fica protegida no GitHub e nunca é enviada ao celular do visitante.

## Teste local

```powershell
npm.cmd install
npm.cmd run update
npm.cmd run serve
```

Abra o endereço informado pelo comando.
