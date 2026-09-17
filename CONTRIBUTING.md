# Contribuindo com o Voztra

Use Node.js 22 LTS ou superior e Python 3.11–3.14. Consulte o README para preparar o ambiente.

Mantenha os módulos pequenos, contratos IPC explícitos e comentários em português para decisões que não sejam evidentes no código. A interface não acessa Node diretamente. Não carregue modelos automaticamente e preserve a compatibilidade dos dados locais.

Antes de enviar alterações, execute `npm run lint`, `npm test`, `npm run build` e `npm run test:e2e`. Mudanças no motor ou na fila também precisam dos testes com transcrição real descritos em `docs/DISTRIBUICAO.md`.

Não inclua áudios pessoais, modelos, tokens, pastas de dados ou binários no Git. Para problemas, informe versão, plataforma e passos mínimos; remova caminhos pessoais dos logs.
