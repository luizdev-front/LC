# LC Commerce — MVP Micro SaaS

MVP funcional de microloja criado para **LC / Luiz Claudio Desenvolvimento Web**.

## O que já está implementado

- Cadastro real de usuário com Supabase Auth
- Login real e sessão persistente
- Criação automática da loja por usuário
- Dashboard
- Cadastro, edição e exclusão de produtos
- Upload real de imagens no Supabase Storage
- Loja pública por `slug`
- Pesquisa e categorias
- Carrinho com LocalStorage
- Checkout com dados de entrega
- Pedido salvo no PostgreSQL
- Total recalculado no servidor para evitar alteração de preço pelo navegador
- Finalização pelo WhatsApp
- Lista de pedidos no painel
- Alteração de status dos pedidos
- Configuração de nome, URL, WhatsApp e logo da loja
- RLS (Row Level Security) para separar dados das lojas

---

## Estrutura

```text
lc_micro_saas/
├── index.html
├── cadastro.html
├── dashboard.html
├── loja.html
├── styles.css
├── assets/
│   └── logo-lc.png
├── js/
│   ├── config.js
│   ├── supabase.js
│   ├── auth.js
│   ├── dashboard.js
│   └── store.js
└── supabase/
    └── schema.sql
```

---

# 1. Criar o Supabase

1. Crie uma conta/projeto no Supabase.
2. Abra o **SQL Editor**.
3. Copie TODO o conteúdo de `supabase/schema.sql`.
4. Execute o SQL uma vez.

Isso cria banco, autenticação auxiliar, políticas de segurança, função de pedido e o bucket de imagens.

---

# 2. Conectar o site ao Supabase

Abra:

`js/config.js`

Substitua:

```js
SUPABASE_URL: "COLE_AQUI_SUA_SUPABASE_URL",
SUPABASE_ANON_KEY: "COLE_AQUI_SUA_CHAVE_PUBLICA"
```

pela **Project URL** e pela chave **publishable/anon** do seu projeto.

> Nunca coloque a `service_role` no navegador.

---

# 3. Configurar o cadastro

Para um MVP mais rápido, no painel do Supabase você pode escolher entre:

- manter confirmação por e-mail; ou
- desativar temporariamente a confirmação por e-mail durante os testes.

Se mantiver a confirmação, o usuário receberá o e-mail e depois fará login normalmente.

---

# 4. Rodar no VS Code

Recomendado: extensão **Live Server**.

Abra `index.html` com o Live Server.

Não abra pelo endereço `file:///...`, porque autenticação e redirects funcionam melhor via servidor HTTP local.

---

# 5. Publicar gratuitamente

O projeto é estático. Você pode publicar no Vercel:

1. Coloque a pasta em um repositório GitHub.
2. Importe o repositório no Vercel.
3. Não é necessário build command.
4. Output directory: raiz do projeto.

Depois, no Supabase, configure a URL publicada em **Authentication > URL Configuration**.

---

# Fluxo

```text
Cadastro
  ↓
Supabase Auth
  ↓
Trigger cria profile + store
  ↓
Dashboard
  ↓
Produtos + imagens
  ↓
loja.html?slug=minha-loja-xxxxxx
  ↓
Carrinho local
  ↓
RPC create_public_order
  ↓
Pedido + itens no PostgreSQL
  ↓
WhatsApp
```

---

# Importante sobre produção

Este projeto já usa autenticação, banco, Storage e RLS reais. Ainda assim, antes de escalar para muitos clientes, revise:

- termos de uso e política de privacidade;
- LGPD;
- backups;
- domínio próprio;
- e-mails transacionais;
- regras de estoque;
- limites do plano gratuito;
- logs e observabilidade;
- meios de pagamento, caso deseje cobrança dentro do sistema.

O checkout do MVP usa WhatsApp de propósito para evitar complexidade e custos de gateway no começo.
