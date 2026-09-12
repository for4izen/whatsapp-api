const fs = require('fs')
const path = require('path')
const { sessions } = require('./sessions')

const DATA_DIR = path.join(__dirname, '../data')
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json')

// Garantir diretório data
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

let campaigns = []
let isSchedulerRunning = false

function loadCampaigns() {
  try {
    if (fs.existsSync(CAMPAIGNS_FILE)) {
      const content = fs.readFileSync(CAMPAIGNS_FILE, 'utf8')
      campaigns = JSON.parse(content || '[]')
    } else {
      campaigns = []
    }
  } catch (err) {
    console.error('[BroadcastManager] Erro ao carregar campanhas:', err)
    campaigns = []
  }
}

function saveCampaigns() {
  try {
    fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2), 'utf8')
  } catch (err) {
    console.error('[BroadcastManager] Erro ao salvar campanhas:', err)
  }
}

// Inicializar carregamento
loadCampaigns()

// Spintax Resolver: {Olá|Oi|E aí}
function resolveSpintax(text) {
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
  let text = resolveSpintax(template)
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
function createCampaign({ name, sessionId, contacts, message, delayMin = 5, delayMax = 12, scheduledFor = null }) {
  const id = 'camp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  const now = new Date().toISOString()
  
  const isScheduled = !!scheduledFor && new Date(scheduledFor).getTime() > Date.now()
  const status = isScheduled ? 'SCHEDULED' : 'PENDING'

  const newCamp = {
    id,
    name: name || `Campanha ${new Date().toLocaleDateString('pt-BR')}`,
    sessionId,
    contacts: contacts.map(c => ({
      number: c.number,
      name: c.name || '',
      status: 'PENDING', // PENDING, SENT, FAILED
      sentAt: null,
      error: null
    })),
    message,
    delayMin: parseInt(delayMin) || 5,
    delayMax: parseInt(delayMax) || 12,
    scheduledFor: isScheduled ? new Date(scheduledFor).toISOString() : null,
    status, // SCHEDULED, PENDING, RUNNING, PAUSED, COMPLETED, CANCELLED
    currentIndex: 0,
    sentCount: 0,
    failedCount: 0,
    totalCount: contacts.length,
    logs: [
      { time: now, message: `Campanha criada com ${contacts.length} contatos.`, type: 'info' }
    ],
    createdAt: now,
    startedAt: null,
    finishedAt: null
  }

  campaigns.unshift(newCamp)
  saveCampaigns()

  if (!isScheduled) {
    // Iniciar imediatamente em background
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
  saveCampaigns()
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
  saveCampaigns()
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
  saveCampaigns()
  startCampaignExecution(id)
  return true
}

function deleteCampaign(id) {
  const idx = campaigns.findIndex(c => c.id === id)
  if (idx === -1) return false

  campaigns[idx].status = 'CANCELLED'
  campaigns.splice(idx, 1)
  saveCampaigns()
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
  saveCampaigns()

  // Executa em segundo plano sem bloquear a requisição HTTP
  setImmediate(async () => {
    while (camp.status === 'RUNNING' && camp.currentIndex < camp.contacts.length) {
      const contactItem = camp.contacts[camp.currentIndex]
      const client = sessions.get(camp.sessionId)

      // Verificar se o cliente ainda está conectado
      if (!client) {
        camp.logs.push({
          time: new Date().toISOString(),
          message: `Instância "${camp.sessionId}" desconectada ou não encontrada. Pausando campanha.`,
          type: 'error'
        })
        camp.status = 'PAUSED'
        saveCampaigns()
        break
      }

      const formattedChatId = contactItem.number.endsWith('@c.us') ? contactItem.number : `${contactItem.number}@c.us`
      const content = personalizeMessage(camp.message, contactItem)

      try {
        await client.sendMessage(formattedChatId, content)
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
      saveCampaigns()

      // Delay aleatório se houver mais mensagens e ainda estiver rodando
      if (camp.status === 'RUNNING' && camp.currentIndex < camp.contacts.length) {
        const min = Math.max(2, camp.delayMin || 5)
        const max = Math.max(min, camp.delayMax || 12)
        const randomDelaySec = Math.floor(Math.random() * (max - min + 1)) + min
        await sleep(randomDelaySec * 1000)
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
      saveCampaigns()
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
  }, 20000) // Verifica a cada 20 segundos
}

// Inicializar scheduler automaticamente
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
