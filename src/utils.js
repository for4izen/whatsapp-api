const axios = require('axios')
const { globalApiKey, disabledCallbacks } = require('./config')

// Trigger webhook endpoint
const triggerWebhook = async (webhookURL, sessionId, dataType, data) => {
  // Processa apenas mensagens recebidas e mídias para evitar alto consumo de memória/rede
  if (dataType !== 'message' && dataType !== 'media') {
    return false
  }

  // Consulta o webhook configurado especificamente para esta instância no SQLite
  let targetUrl = null
  try {
    const { getSessionById } = require('./database/sessionManager')
    const sessionRecord = await getSessionById(sessionId)
    if (sessionRecord && sessionRecord.webhook) {
      targetUrl = sessionRecord.webhook.trim()
    }
  } catch (err) {
    console.error(`[Webhook] Erro ao buscar webhook da sessão ${sessionId}:`, err.message)
  }

  // Se a instância NÃO tem webhook configurado, não envia para lugar nenhum
  if (!targetUrl) {
    return false
  }

  console.log(`[Webhook] Evento: ${dataType} | Session: ${sessionId} | URL da Instância: ${targetUrl}`)

  console.log(`[Webhook] Enviando ${dataType} para ${targetUrl}...`)
  axios.post(targetUrl, { dataType, data, sessionId }, { headers: { 'x-api-key': globalApiKey } })
    .then(res => console.log(`[Webhook] Sucesso (${res.status}) enviado para ${targetUrl}`))
    .catch(error => console.error('[Webhook] Falha ao enviar:', sessionId, dataType, error.message))
}

// Function to send a response with error status and message
const sendErrorResponse = (res, status, message) => {
  res.status(status).json({ success: false, error: message })
}

// Function to wait for a specific item not to be null
const waitForNestedObject = (rootObj, nestedPath, maxWaitTime = 10000, interval = 100) => {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const checkObject = () => {
      const nestedObj = nestedPath.split('.').reduce((obj, key) => obj ? obj[key] : undefined, rootObj)
      if (nestedObj) {
        // Nested object exists, resolve the promise
        resolve()
      } else if (Date.now() - start > maxWaitTime) {
        // Maximum wait time exceeded, reject the promise
        console.log('Timed out waiting for nested object')
        reject(new Error('Timeout waiting for nested object'))
      } else {
        // Nested object not yet created, continue waiting
        setTimeout(checkObject, interval)
      }
    }
    checkObject()
  })
}

const checkIfEventisEnabled = (event) => {
  return new Promise((resolve, reject) => { if (!disabledCallbacks.includes(event)) { resolve() } })
}

module.exports = {
  triggerWebhook,
  sendErrorResponse,
  waitForNestedObject,
  checkIfEventisEnabled
}
