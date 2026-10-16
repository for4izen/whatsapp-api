const { sessions } = require('./sessions')
const { run, query } = require('./database')
const { MessageMedia } = require('whatsapp-web.js')

let campaigns = []
let isSchedulerRunning = false

// Sanitizar e padronizar número do WhatsApp
function sanitizePhoneNumber(rawNumber) {
  if (!rawNumber) return ''
  let cleaned = String(rawNumber).replace(/\D/g, '')
  if (!cleaned) return ''
  return cleaned
}

// Carregar campanhas do SQLite na inicialização e recuperar com segurança campanhas em RUNNING
async function loadCampaigns() {
  try {
    const rows = await query('SELECT * FROM campaigns ORDER BY createdAt DESC')
    campaigns = rows.map(r => ({
      ...r,
      contacts: JSON.parse(r.contacts || '[]'),
      logs: JSON.parse(r.logs || '[]')
    }))

    // Recuperação de falha/reinicialização do servidor:
    // Campanhas que estavam em 'RUNNING' quando o servidor desligou são pausadas com segurança para que o operador possa retomar sem perder progresso
    for (const camp of campaigns) {
      if (camp.status === 'RUNNING') {
        camp.status = 'PAUSED'
        camp.logs.push({
          time: new Date().toISOString(),
          message: '⚠️ Servidor foi reiniciado durante a execução. Campanha pausada com segurança no ponto onde parou. Clique em "Retomar" para continuar.',
          type: 'info'
        })
        await persistCampaign(camp)
      }
    }
  } catch (err) {
    console.error('[BroadcastManager] Erro ao carregar campanhas do SQLite:', err.message)
    campaigns = []
  }
}

// Salvar/atualizar campanha no SQLite
async function persistCampaign(camp) {
  try {
    await run(`
      INSERT INTO campaigns (
        id, name, sessionId, contacts, message, delayMin, delayMax,
        scheduledFor, status, currentIndex, sentCount, failedCount,
        totalCount, logs, mediaUrl, batchSize, batchWaitSec,
        createdAt, startedAt, finishedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        currentIndex = excluded.currentIndex,
        sentCount = excluded.sentCount,
        failedCount = excluded.failedCount,
        logs = excluded.logs,
        mediaUrl = excluded.mediaUrl,
        batchSize = excluded.batchSize,
        batchWaitSec = excluded.batchWaitSec,
        startedAt = excluded.startedAt,
        finishedAt = excluded.finishedAt
    `, [
      camp.id,
      camp.name,
      camp.sessionId,
      JSON.stringify(camp.contacts || []),
      camp.message,
      camp.delayMin || 5,
      camp.delayMax || 12,
      camp.scheduledFor || null,
      camp.status || 'PENDING',
      camp.currentIndex || 0,
      camp.sentCount || 0,
      camp.failedCount || 0,
      camp.totalCount || (camp.contacts ? camp.contacts.length : 0),
      JSON.stringify(camp.logs || []),
      camp.mediaUrl || null,
      camp.batchSize || 0,
      camp.batchWaitSec || 0,
      camp.createdAt || new Date().toISOString(),
      camp.startedAt || null,
      camp.finishedAt || null
    ])
  } catch (err) {
    console.error('[BroadcastManager] Erro ao persistir campanha no SQLite:', err.message)
  }
}

// Inicializar carregamento
loadCampaigns()

// Spintax Resolver: {Olá|Oi|E aí}
function resolveSpintax(text) {
  if (!text) return ''
  const spintaxRegex = /\{([^{}]+)\}/g
  return text.replace(spintaxRegex, (match, choices) => {
    if (choices.toLowerCase() === 'nome' || choices.toLowerCase() === 'numero') {
      return match
    }
    const options = choices.split('|')
    return options[Math.floor(Math.random() * options.length)]
  })
}

// Personalização por contato
function personalizeMessage(template, contact) {
  let text = resolveSpintax(template || '')
  const name = contact.name || 'Amigo(a)'
  text = text.replace(/\{nome\}/gi, name)
  text = text.replace(/\{numero\}/gi, contact.number)
  return text
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Cria uma nova campanha (imediata ou agendada)
 */
function createCampaign({
  name,
  sessionId,
  contacts,
  message,
  delayMin = 5,
  delayMax = 12,
  scheduledFor = null,
  mediaUrl = null,
  batchSize = 0,
  batchWaitSec = 0
}) {
  const id = 'camp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  const now = new Date().toISOString()
  
  const isScheduled = !!scheduledFor && new Date(scheduledFor).getTime() > Date.now()
  const status = isScheduled ? 'SCHEDULED' : 'PENDING'

  const formattedContacts = contacts.map(c => ({
    number: sanitizePhoneNumber(c.number),
    name: c.name || '',
    status: 'PENDING', // PENDING, SENT, FAILED
    sentAt: null,
    error: null
  })).filter(c => c.number.length >= 8)

  const newCamp = {
    id,
    name: name || `Campanha ${new Date().toLocaleDateString('pt-BR')}`,
    sessionId,
    contacts: formattedContacts,
    message: message || '',
    mediaUrl: mediaUrl ? String(mediaUrl).trim() : null,
    delayMin: parseInt(delayMin) || 5,
    delayMax: parseInt(delayMax) || 12,
    batchSize: Math.max(0, parseInt(batchSize) || 0),
    batchWaitSec: Math.max(0, parseInt(batchWaitSec) || 0),
    scheduledFor: isScheduled ? new Date(scheduledFor).toISOString() : null,
    status, // SCHEDULED, PENDING, RUNNING, PAUSED, COMPLETED, CANCELLED
    currentIndex: 0,
    sentCount: 0,
    failedCount: 0,
    totalCount: formattedContacts.length,
    logs: [
      { time: now, message: `Campanha criada com ${formattedContacts.length} contatos válidos.`, type: 'info' }
    ],
    createdAt: now,
    startedAt: null,
    finishedAt: null
  }

  campaigns.unshift(newCamp)
  persistCampaign(newCamp)

  if (!isScheduled) {
    startCampaignExecution(id)
  }

  return newCamp
}

/**
 * Retorna lista de campanhas com resumo
 */
function listCampaigns() {
  return campaigns
}

function getCampaignById(id) {
  return campaigns.find(c => c.id === id)
}

function cancelCampaign(id) {
  const camp = campaigns.find(c => c.id === id)
  if (!camp) return false

  camp.status = 'CANCELLED'
  camp.finishedAt = new Date().toISOString()
  camp.logs.push({
    time: new Date().toISOString(),
    message: 'Campanha cancelada pelo usuário.',
    type: 'error'
  })
  persistCampaign(camp)
  return true
}

function pauseCampaign(id) {
  const camp = campaigns.find(c => c.id === id)
  if (!camp || camp.status !== 'RUNNING') return false

  camp.status = 'PAUSED'
  camp.logs.push({
    time: new Date().toISOString(),
    message: 'Campanha pausada pelo usuário.',
    type: 'info'
  })
  persistCampaign(camp)
  return true
}

function resumeCampaign(id) {
  const camp = campaigns.find(c => c.id === id)
  if (!camp || camp.status !== 'PAUSED') return false

  camp.status = 'RUNNING'
  camp.logs.push({
    time: new Date().toISOString(),
    message: 'Campanha retomada.',
    type: 'info'
  })
  persistCampaign(camp)
  startCampaignExecution(id)
  return true
}

function deleteCampaign(id) {
  const idx = campaigns.findIndex(c => c.id === id)
  if (idx === -1) return false

  campaigns[idx].status = 'CANCELLED'
  campaigns.splice(idx, 1)
  run('DELETE FROM campaigns WHERE id = ?', [id]).catch(err => {
    console.error('[BroadcastManager] Erro ao deletar campanha do SQLite:', err.message)
  })
  return true
}

/**
 * Loop assíncrono de execução independente no servidor
 */
async function startCampaignExecution(campaignId) {
  const camp = campaigns.find(c => c.id === campaignId)
  if (!camp) return

  camp.status = 'RUNNING'
  if (!camp.startedAt) {
    camp.startedAt = new Date().toISOString()
  }
  persistCampaign(camp)

  setImmediate(async () => {
    // Pré-carregar mídia caso exista URL para evitar baixar repetidamente
    let cachedMedia = null
    if (camp.mediaUrl) {
      try {
        camp.logs.push({
          time: new Date().toISOString(),
          message: `Baixando mídia anexada de: ${camp.mediaUrl}...`,
          type: 'info'
        })
        persistCampaign(camp)
        cachedMedia = await MessageMedia.fromUrl(camp.mediaUrl, { unsafeMime: true })
      } catch (err) {
        camp.logs.push({
          time: new Date().toISOString(),
          message: `⚠️ Erro ao baixar mídia (${err.message}). Disparos continuarão apenas com texto.`,
          type: 'error'
        })
        persistCampaign(camp)
      }
    }

    let batchCount = 0

    while (camp.status === 'RUNNING' && camp.currentIndex < camp.contacts.length) {
      const contactItem = camp.contacts[camp.currentIndex]
      const client = sessions.get(camp.sessionId)

      if (!client) {
        camp.logs.push({
          time: new Date().toISOString(),
          message: `Instância "${camp.sessionId}" desconectada ou não encontrada. Pausando campanha.`,
          type: 'error'
        })
        camp.status = 'PAUSED'
        persistCampaign(camp)
        break
      }

      const formattedChatId = contactItem.number.endsWith('@c.us') ? contactItem.number : `${contactItem.number}@c.us`
      const content = personalizeMessage(camp.message, contactItem)

      try {
        if (cachedMedia) {
          // Enviar com mídia e legenda personalizada
          await client.sendMessage(formattedChatId, cachedMedia, { caption: content || undefined })
        } else {
          // Enviar somente texto
          await client.sendMessage(formattedChatId, content)
        }

        contactItem.status = 'SENT'
        contactItem.sentAt = new Date().toISOString()
        camp.sentCount++
        camp.logs.push({
          time: new Date().toISOString(),
          message: `✓ [${camp.currentIndex + 1}/${camp.totalCount}] Enviado para ${contactItem.number} (${contactItem.name || 'Sem nome'})`,
          type: 'success'
        })
      } catch (err) {
        contactItem.status = 'FAILED'
        contactItem.error = err.message
        camp.failedCount++
        camp.logs.push({
          time: new Date().toISOString(),
          message: `✗ [${camp.currentIndex + 1}/${camp.totalCount}] Falha para ${contactItem.number}: ${err.message}`,
          type: 'error'
        })
      }

      camp.currentIndex++
      batchCount++
      persistCampaign(camp)

      // Se ainda houver contatos e o status continuar RUNNING
      if (camp.status === 'RUNNING' && camp.currentIndex < camp.contacts.length) {
        // 1. Verificar pausa por lote (Cooling-off anti-bloqueio)
        if (camp.batchSize > 0 && camp.batchWaitSec > 0 && batchCount >= camp.batchSize) {
          batchCount = 0
          camp.logs.push({
            time: new Date().toISOString(),
            message: `☕ [Pausa Anti-Bloqueio] Lote de ${camp.batchSize} mensagens atingido. Pausando por ${camp.batchWaitSec} segundos para descanso da linha...`,
            type: 'info'
          })
          persistCampaign(camp)
          await sleep(camp.batchWaitSec * 1000)
        } else {
          // 2. Intervalo randômico entre mensagens
          const min = Math.max(2, camp.delayMin || 5)
          const max = Math.max(min, camp.delayMax || 12)
          const randomDelaySec = Math.floor(Math.random() * (max - min + 1)) + min
          await sleep(randomDelaySec * 1000)
        }
      }
    }

    if (camp.currentIndex >= camp.contacts.length && camp.status === 'RUNNING') {
      camp.status = 'COMPLETED'
      camp.finishedAt = new Date().toISOString()
      camp.logs.push({
        time: new Date().toISOString(),
        message: `🏁 Campanha concluída com sucesso! Total: ${camp.totalCount} | Enviadas: ${camp.sentCount} | Falhas: ${camp.failedCount}`,
        type: 'info'
      })
      persistCampaign(camp)
    }
  })
}

/**
 * Agendador (Scheduler): Checa a cada 20 segundos se há campanhas programadas prontas para disparar
 */
function initScheduler() {
  if (isSchedulerRunning) return
  isSchedulerRunning = true

  setInterval(() => {
    const now = Date.now()
    campaigns.forEach(camp => {
      if (camp.status === 'SCHEDULED' && camp.scheduledFor) {
        const scheduleTime = new Date(camp.scheduledFor).getTime()
        if (now >= scheduleTime) {
          console.log(`[BroadcastManager] Disparando campanha agendada: ${camp.name} (${camp.id})`)
          camp.logs.push({
            time: new Date().toISOString(),
            message: `⏰ Horário de agendamento atingido (${new Date(camp.scheduledFor).toLocaleString('pt-BR')}). Iniciando disparos...`,
            type: 'info'
          })
          startCampaignExecution(camp.id)
        }
      }
    })
  }, 20000)
}

initScheduler()

module.exports = {
  createCampaign,
  listCampaigns,
  getCampaignById,
  cancelCampaign,
  pauseCampaign,
  resumeCampaign,
  deleteCampaign
}
