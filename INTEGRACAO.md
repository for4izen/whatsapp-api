# 📖 Documentação de Integração da WhatsApp API

Esta documentação foi criada para você integrar facilmente esta WhatsApp API em qualquer **site, sistema, CRM, e-commerce ou painel** (PHP, Node.js, Python, JavaScript, cURL, etc.).

---

## 🔑 1. Autenticação e Configuração Básica

Todas as requisições para a API devem conter o cabeçalho HTTP com a sua **API Key**:

- **Header HTTP**: `x-api-key: SUA_CHAVE_API`
- **Content-Type**: `application/json`
- **URL Base Padrão**: `http://localhost:3000` (ou o domínio do seu servidor em produção)

---

## 🚀 2. Endpoints Principais

### A. Envio de Mensagem Individual
Envie notificações, confirmações de pedidos, 2FA ou alertas para um cliente.

- **Método**: `POST`
- **Rota**: `/client/sendMessage/{sessionId}`
- **Exemplo de Body (JSON)**:
```json
{
  "chatId": "5511999999999@c.us",
  "contentType": "string",
  "content": "Olá João! Seu pedido #1234 foi aprovado com sucesso."
}
```

> **Nota sobre o formato do número**: Utilize sempre o DDI + DDD + Número seguido de `@c.us` (Ex: `5511999999999@c.us`).

---

### B. Envio de Mensagem com Imagem / Mídia (via URL)
Envie comprovantes, PDFs, fotos ou catálogos.

- **Método**: `POST`
- **Rota**: `/client/sendMessage/{sessionId}`
- **Exemplo de Body (JSON)**:
```json
{
  "chatId": "5511999999999@c.us",
  "contentType": "MessageMediaFromURL",
  "content": "https://seusite.com/arquivos/comprovante.pdf",
  "options": {
    "caption": "Segue o seu comprovante em anexo."
  }
}
```

---

### C. Criar Campanha em Massa (Imediata ou Agendada)
Dispare para uma lista de clientes diretamente em segundo plano ou programe para uma data futura.

- **Método**: `POST`
- **Rota**: `/broadcast/create`
- **Exemplo de Body para Disparo Imediato**:
```json
{
  "name": "Aviso de Promoção",
  "sessionId": "vendas",
  "message": "{Olá|Oi} {nome}! Aproveite nossa promoção exclusiva hoje!",
  "delayMin": 5,
  "delayMax": 15,
  "contacts": [
    { "number": "5511999999999", "name": "Carlos" },
    { "number": "5521988888888", "name": "Ana" }
  ]
}
```

- **Exemplo de Body para Disparo AGENDADO**:
```json
{
  "name": "Lembrete de Vencimento",
  "sessionId": "financeiro",
  "message": "Olá {nome}, seu boleto vence hoje.",
  "scheduledFor": "2026-09-15T09:00:00.000Z",
  "contacts": [
    { "number": "5511999999999", "name": "Carlos" }
  ]
}
```

---

### D. Checar Status da Instância
Verifique se a sessão do WhatsApp está conectada antes de enviar.

- **Método**: `GET`
- **Rota**: `/session/status/{sessionId}`
- **Resposta de Exemplo**:
```json
{
  "success": true,
  "state": "CONNECTED",
  "message": "session_connected"
}
```

---

### E. Chatbot de Fluxos Estilo Typebot
Permite obter, salvar ou reiniciar o fluxo conversacional com etapas e opções numéricas por instância:

- **Obter Fluxo da Instância**: `GET /typebot/{sessionId}`
- **Salvar / Atualizar Fluxo**: `POST /typebot/{sessionId}`
- **Reiniciar Estados de Conversa dos Contatos**: `POST /typebot/{sessionId}/reset-state`

Exemplo de Payload do Fluxo:
```json
{
  "enabled": true,
  "ignoreGroups": true,
  "resetKeyword": "menu",
  "sessionTimeoutMinutes": 30,
  "handoverTimeoutMinutes": 60,
  "invalidOptionMessage": "Opção inválida! Escolha uma opção:",
  "reminderEnabled": true,
  "reminderTimeoutMinutes": 5,
  "reminderMessage": "Ainda está por aí, {nome}? Digite uma opção para prosseguir ou 0 para o menu principal:",
  "steps": [
    {
      "id": "start",
      "title": "Menu Principal",
      "isInitial": true,
      "message": "Olá {nome}! Como podemos te ajudar?",
      "options": [
        { "key": "1", "label": "Ver Preços", "nextStepId": "precos" },
        { "key": "2", "label": "Falar com Atendente", "nextStepId": "humano" }
      ]
    }
  ]
}
```

---



### 🔹 Exemplo em PHP (cURL)
Perfeito para WordPress, Laravel ou sites em PHP:

```php
<?php
function enviarWhatsApp($sessionId, $telefone, $mensagem) {
    $url = "http://localhost:3000/client/sendMessage/" . $sessionId;
    $apiKey = "sua_chave_aqui";

    // Formatar número para padrão internacional
    $numeroLimpo = preg_replace('/\D/', '', $telefone);
    if (strlen($numeroLimpo) == 10 || strlen($numeroLimpo) == 11) {
        $numeroLimpo = "55" . $numeroLimpo;
    }
    $chatId = $numeroLimpo . "@c.us";

    $data = [
        "chatId" => $chatId,
        "contentType" => "string",
        "content" => $mensagem
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "x-api-key: " . $apiKey
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        "status" => $httpCode,
        "response" => json_decode($response, true)
    ];
}

// Teste de uso:
$resultado = enviarWhatsApp("comercial", "11999999999", "Olá! Seu cadastro no site foi concluído.");
print_r($resultado);
```

---

### 🔹 Exemplo em JavaScript (Node.js / Fetch no Backend)
Ideal para Next.js, Express, NestJS ou Cloud Functions:

```javascript
async function sendWhatsAppMessage(sessionId, phone, message) {
  const apiKey = process.env.WHATSAPP_API_KEY || 'sua_chave_aqui';
  const cleanNumber = phone.replace(/\D/g, '');
  const formattedNumber = (cleanNumber.length <= 11 ? '55' : '') + cleanNumber + '@c.us';

  const res = await fetch(`http://localhost:3000/client/sendMessage/${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      chatId: formattedNumber,
      contentType: 'string',
      content: message
    })
  });

  return await res.json();
}

// Chamando a função:
sendWhatsAppMessage('vendas', '11999999999', 'Código de verificação: 4892');
```

---

### 🔹 Exemplo em Python (requests)
Ideal para Django, Flask, FastAPI ou scripts de automação:

```python
import requests
import re

def send_whatsapp(session_id, phone, text):
    url = f"http://localhost:3000/client/sendMessage/{session_id}"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": "sua_chave_aqui"
    }
    
    clean_phone = re.sub(r'\D', '', phone)
    if len(clean_phone) in (10, 11):
        clean_phone = "55" + clean_phone
    chat_id = f"{clean_phone}@c.us"

    payload = {
        "chatId": chat_id,
        "contentType": "string",
        "content": text
    }

    response = requests.post(url, json=payload, headers=headers)
    return response.json()

# Teste de uso:
print(send_whatsapp("suporte", "11999999999", "Olá! Como podemos te ajudar?"))
```

---

## 🛡️ 4. Boas Práticas e Recomendações Anti-Ban

1. **Variações de Texto (Spintax)**: Ao enviar muitas mensagens, varie saudações como `{Olá|Oi|E aí}`.
2. **Intervalo entre Envios**: No envio em massa, utilize atraso randômico entre 5 a 15 segundos entre contatos.
3. **Instância Conectada**: Sempre valide se a instância está `CONNECTED` antes de submeter lotes de mensagens.
4. **Base de Contatos Limpa**: Envie apenas para números com WhatsApp ativo e com consentimento para evitar denúncias de spam.
