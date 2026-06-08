# EBR Neon Teste

Esta pasta e uma copia paralela do EBR para testar outro banco sem alterar o projeto atual em `C:\Users\ebr`.

## O que ja foi preparado

- Dependencia `@neondatabase/serverless`.
- Netlify Function em `/api/neon/health`.
- Pagina de teste em `/neon-teste`.
- Schema inicial em `database/neon-schema.sql`.

## Como ligar o Neon

1. Crie um projeto no Neon.
2. Copie a connection string do banco.
3. Rode o setup local com a connection string:

```powershell
$env:DATABASE_URL="postgresql://usuario:senha@host.neon.tech/banco?sslmode=require"
npm run neon:setup
```

4. Configure a mesma variavel `DATABASE_URL` no Netlify do projeto de teste.
5. Abra `/neon-teste` no projeto de teste e clique em `Testar conexao Neon`.

## Importante

O EBR principal nao foi alterado. Esta copia ainda nao substitui todas as telas para Neon; ela apenas prepara o teste seguro da conexao e do schema antes da migracao real da camada de dados.
