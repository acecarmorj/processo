# Painel público ex-FAEP / FAETEC

Painel mobile-first para acompanhar o processo `SEI-030029/004475/2023`.

## Funcionamento

- O Agendador de Tarefas do Windows inicia a consulta às 00:01, 10:01, 12:01, 14:01, 16:01, 18:01, 20:01 e 22:01, no horário de Brasília.
- O computador precisa estar ligado e conectado à internet, mas o Codex não precisa estar aberto.
- Se encontrar mudança, atualiza `data/processo.json`.
- O atualizador faz um commit e envia o arquivo ao GitHub; o GitHub Pages publica o painel.
- Ao abrir a página, o visitante recebe os dados mais recentes.
- O navegador guarda a última visita e destaca novos documentos e movimentos.
- O botão **Resumo histórico** apresenta a trajetória completa em linguagem simples.

O GitHub Actions não faz a consulta automática porque o portal SEI bloqueia as conexões dos servidores hospedados do GitHub. A Action permanece disponível somente para testes manuais de conectividade.

## Preparar o repositório

1. Crie um repositório no GitHub.
2. Envie todo o conteúdo desta pasta para a raiz do repositório.
3. Em **Settings > Pages**, escolha **Deploy from a branch**.
4. Selecione a branch `main` e a pasta `/ (root)`.
5. Configure o atualizador em um computador que consiga acessar o portal SEI.

O endereço ficará semelhante a:

`https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`

## Análise com IA

Sem chave, o painel usa análise automática baseada nos setores e movimentos.

Para ativar a análise da OpenAI em um ambiente compatível:

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
