# Configuração de Notificações Push no TonuControle

Guia passo a passo para configurar e ativar notificações nativas via Supabase Edge Function e Web Push API no TonuControle PWA (Windows, Android e iOS standalone).

---

## 1. Gerar Chaves VAPID

No terminal do seu computador (Node.js instalado):

```bash
npx web-push generate-vapid-keys
```

Você receberá um par de chaves:
- **Public Key**: chave pública usada no front-end (`VAPID_PUBLIC_KEY`)
- **Private Key**: chave privada usada no servidor / Edge Function (`VAPID_PRIVATE_KEY`)

---

## 2. Configurar Secrets no Supabase

Utilize o Supabase CLI ou o painel em **Project Settings → Edge Functions → Secrets**:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="SUA_CHAVE_PUBLICA_AQUI" \
  VAPID_PRIVATE_KEY="SUA_CHAVE_PRIVADA_AQUI" \
  VAPID_EMAIL="mailto:seu@email.com"
```

> **Nota:** Certifique-se também de que `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão acessíveis para a Edge Function.

---

## 3. Criar a Tabela no Supabase

Abra o **SQL Editor** no painel do Supabase e execute o conteúdo de `migrations/push_subscriptions.sql`:

```sql
-- Tabela de subscrições push
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    keys JSONB NOT NULL, -- { p256dh: string, auth: string }
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, endpoint)
);

-- Índice para busca por user_id
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON public.push_subscriptions(user_id);

-- Habilitar RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies de acesso
CREATE POLICY "Users can view own subscriptions" 
    ON public.push_subscriptions FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions" 
    ON public.push_subscriptions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions" 
    ON public.push_subscriptions FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions" 
    ON public.push_subscriptions FOR DELETE 
    USING (auth.uid() = user_id);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_push_subs_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 4. Deploy da Edge Function

No diretório raiz do projeto:

```bash
supabase functions deploy send-push --no-verify-jwt
```

---

## 5. Agendar Cron no Supabase (pg_cron)

No painel do Supabase, ative as extensões `pg_cron` e `pg_net` em **Database → Extensions**.  
Em seguida, execute no **SQL Editor** para verificar e disparar alertas diários às 08:00:

```sql
SELECT cron.schedule(
  'daily-bill-notifications',
  '0 8 * * *',
  $$ SELECT net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer SEU_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{"mode":"check-bills"}'::jsonb
  ) $$
);
```

*(Substitua `https://SEU-PROJETO.supabase.co` pela URL real do seu projeto e `SEU_SERVICE_ROLE_KEY` pela chave de serviço)*

---

## 6. Configurar Chave Pública no Front-end

Abra o arquivo `js/notifications.js` e substitua a constante:

```javascript
const VAPID_PUBLIC_KEY = '__VAPID_PUBLIC_KEY_PLACEHOLDER__';
```

Pela sua chave pública gerada no passo 1.

---

## 7. Teste de Funcionamento

1. Abra o app TonuControle instalado ou no navegador.
2. Acesse **Configurações** (`settings.html`).
3. Na seção de notificações, clique em **Ativar Notificações Push**.
4. Aceite a permissão nativa do navegador / sistema operacional.
5. Para testar o envio imediatamente via cURL:

```bash
curl -i --location --request POST 'https://SEU-PROJETO.supabase.co/functions/v1/send-push' \
  --header 'Authorization: Bearer SUA_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "user_id": "SEU_USER_ID",
    "title": "🔔 TonuControle Teste",
    "body": "Notificação push nativa recebida com sucesso!",
    "url": "/pages/bills.html"
  }'
```
