const fs = require('fs')
const path = require('path')
const { MessageMedia } = require('whatsapp-web.js')

const FLOWS_FILE = path.join(__dirname, '../data/typebot_flows.json')

class TypebotManager {
  constructor() {
    this.flows = {}
    this.userStates = {} // { `${sessionId}:${chatId}`: { stepId: 'start', lastInteraction: timestamp, isHandover: false, reminderSent: false } }
    this.reminderTimers = {} // { `${sessionId}:${chatId}`: timeoutHandle }
    this.initStorage()
  }

  initStorage() {
    const dataDir = path.join(__dirname, '../data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    if (fs.existsSync(FLOWS_FILE)) {
      try {
        const raw = fs.readFileSync(FLOWS_FILE, 'utf8')
        this.flows = JSON.parse(raw)
      } catch (err) {
        console.error('[TypebotManager] Erro ao carregar fluxos:', err.message)
        this.flows = {}
      }
    } else {
      this.flows = {}
      this.saveFlows()
    }
  }

  saveFlows() {
    try {
      fs.writeFileSync(FLOWS_FILE, JSON.stringify(this.flows, null, 2), 'utf8')
    } catch (err) {
      console.error('[TypebotManager] Erro ao salvar fluxos:', err.message)
    }
  }

  getDefaultConfig(sessionId) {
    return {
      enabled: false,
      ignoreGroups: true,
      resetKeyword: 'menu',
      sessionTimeoutMinutes: 30,
      handoverTimeoutMinutes: 60,
      typingDelaySeconds: 2, // Efeito "Digitando..." por X segundos
      simulateTyping: true,  // Ativa chat.sendStateTyping()
      invalidOptionMessage: 'Opção inválida! Por favor, escolha uma das opções abaixo:',
      reminderEnabled: false,
      reminderTimeoutMinutes: 5,
      reminderMessage: 'Ainda está por aí, {nome}? Digite uma opção para prosseguir ou 0 para o menu principal:',
      stats: {
        totalInteractions: 0,
        handoversTriggered: 0,
        stepHits: {}
      },
      steps: [
        {
          id: 'start',
          title: 'Menu Principal',
          isInitial: true,
          mediaUrl: '', // URL opcional de imagem ou documento
          message: 'Olá {nome}! 👋 Bem-vindo(a) ao nosso atendimento automatizado.\n\nComo posso ajudar você hoje? Escolha uma opção:',
          options: [
            {
              key: '1',
              label: 'Conhecer Planos e Preços',
              nextStepId: 'step_precos'
            },


            {
              key: '2',
              label: 'Suporte e Dúvidas Frequentes',
              nextStepId: 'step_suporte'
            },
            {
              key: '3',
              label: 'Falar com Atendente Humano',
              nextStepId: 'step_atendente'
            }
          ]
        },
        {
          id: 'step_precos',
          title: 'Planos e Preços',
          isInitial: false,
          message: '🚀 *Nossos planos disponíveis:*\n\n1. Básico: R$ 49/mês\n2. Profissional: R$ 99/mês\n3. Enterprise: Personalizado\n\nAcesse nosso catálogo online: https://seusite.com/precos',
          options: [
            {
              key: '1',
              label: 'Falar com um consultor de vendas',
              nextStepId: 'step_atendente'
            },
            {
              key: '0',
              label: 'Voltar ao Menu Principal',
              nextStepId: 'start'
            }
          ]
        },
        {
          id: 'step_suporte',
          title: 'Suporte Técnico',
          isInitial: false,
          message: '🛠️ *Central de Suporte*\n\nNossa base de conhecimento e tutoriais estão disponíveis em: https://ajuda.seusite.com\n\nCaso seu problema não seja resolvido, selecione uma opção:',
          options: [
            {
              key: '1',
              label: 'Abrir chamado com a equipe técnica',
              nextStepId: 'step_atendente'
            },
            {
              key: '0',
              label: 'Voltar ao Menu Principal',
              nextStepId: 'start'
            }
          ]
        },
        {
          id: 'step_atendente',
          title: 'Atendimento Humano',
          isInitial: false,
          message: '👤 Um de nossos atendentes humanos responderá sua mensagem em breve!\n\nPor favor, aguarde alguns instantes.',
          isHandover: true,
          options: [
            {
              key: '0',
              label: 'Cancelar e voltar ao menu',
              nextStepId: 'start'
            }
          ]
        }
      ],
      logs: []
    }
  }

  getFlow(sessionId) {
    if (!this.flows[sessionId]) {
      this.flows[sessionId] = this.getDefaultConfig(sessionId)
      this.saveFlows()
    }
    return this.flows[sessionId]
  }

  saveFlow(sessionId, flowData) {
    const current = this.getFlow(sessionId)
    this.flows[sessionId] = {
      ...current,
      ...flowData,
      updatedAt: new Date().toISOString()
    }
    this.saveFlows()
    return this.flows[sessionId]
  }

  clearReminder(stateKey) {
    if (this.reminderTimers[stateKey]) {
      clearTimeout(this.reminderTimers[stateKey])
      delete this.reminderTimers[stateKey]
    }
  }

  scheduleReminder(sessionId, chatId, contactName, step, flow, client) {
    const stateKey = `${sessionId}:${chatId}`
    this.clearReminder(stateKey)

    // Apenas agenda se o lembrete estiver ativo, a etapa tiver opções e não for handover
    if (!flow.reminderEnabled || !step.options || step.options.length === 0 || step.isHandover) {
      return
    }

    const waitMs = (flow.reminderTimeoutMinutes || 5) * 60 * 1000

    this.reminderTimers[stateKey] = setTimeout(async () => {
      try {
        const userState = this.userStates[stateKey]
        // Se o usuário ainda estiver na mesma etapa e ainda não tiver respondido
        if (!userState || userState.reminderSent || userState.stepId !== step.id || userState.isHandover) {
          return
        }

        userState.reminderSent = true

        // Formatar mensagem do lembrete com as opções da etapa
        const customPrompt = (flow.reminderMessage || 'Ainda está por aí, {nome}? Digite uma opção para prosseguir ou 0 para o menu principal:')
          .replace(/{nome}/gi, contactName ? contactName.trim() : 'amigo(a)')

        let reminderBody = customPrompt
        if (step.options && step.options.length > 0) {
          const optionsText = step.options.map(opt => `*[${opt.key}]* ${opt.label}`).join('\n')
          reminderBody += `\n\n${optionsText}`
        }

        await client.sendMessage(chatId, reminderBody.trim())

        this.addLog(sessionId, {
          time: new Date().toISOString(),
          from: chatId.replace('@c.us', ''),
          contactName,
          input: '[LEMBRETE AUTOMÁTICO]',
          stepId: step.id,
          stepTitle: step.title,
          isHandover: false
        })
      } catch (err) {
        console.error(`[TypebotManager] Erro ao enviar lembrete para ${chatId}:`, err.message)
      } finally {
        delete this.reminderTimers[stateKey]
      }
    }, waitMs)
  }

  resetUserState(sessionId, chatId = null) {
    if (chatId) {
      const stateKey = `${sessionId}:${chatId}`
      this.clearReminder(stateKey)
      delete this.userStates[stateKey]
    } else {
      for (const key of Object.keys(this.userStates)) {
        if (key.startsWith(`${sessionId}:`)) {
          this.clearReminder(key)
          delete this.userStates[key]
        }
      }
    }
  }

  formatStepMessage(step, contactName = '') {
    let msg = (step.message || '').replace(/{nome}/gi, contactName ? contactName.trim() : 'amigo(a)')

    if (step.options && step.options.length > 0) {
      const optionsText = step.options.map(opt => `*[${opt.key}]* ${opt.label}`).join('\n')
      msg += `\n\n${optionsText}`
    }

    return msg.trim()
  }

  async handleIncomingMessage(sessionId, message, client) {
    try {
      const flow = this.getFlow(sessionId)
      if (!flow || !flow.enabled) return

      if (flow.ignoreGroups && (message.from.endsWith('@g.us') || message.to.endsWith('@g.us'))) {
        return
      }

      if (message.fromMe) return

      const chatId = message.from
      const text = (message.body || '').trim()
      if (!text) return

      const stateKey = `${sessionId}:${chatId}`
      // O contato interagiu: limpar imediatamente qualquer timer de lembrete pendente
      this.clearReminder(stateKey)

      const now = Date.now()
      let userState = this.userStates[stateKey]

      const timeoutMs = (flow.sessionTimeoutMinutes || 30) * 60 * 1000
      if (userState && (now - userState.lastInteraction) > timeoutMs) {
        userState = null
      }

      if (userState && userState.isHandover) {
        const handoverMs = (flow.handoverTimeoutMinutes || 60) * 60 * 1000
        if (now - userState.lastInteraction < handoverMs) {
          if (text.toLowerCase() === (flow.resetKeyword || 'menu').toLowerCase() || text === '0') {
            // Permite resetar
          } else {
            return
          }
        } else {
          userState = null
        }
      }

      let contactName = ''
      try {
        const contact = await message.getContact()
        contactName = contact.pushname || contact.name || ''
      } catch (err) {
        // Fallback
      }

      const steps = flow.steps || []
      const initialStep = steps.find(s => s.isInitial) || steps[0]
      if (!initialStep) return

      let nextStep = null
      let isInvalidOption = false

      const isResetCmd = text.toLowerCase() === (flow.resetKeyword || 'menu').toLowerCase() || (userState && text === '0')
      if (!userState || isResetCmd) {
        nextStep = initialStep
        this.userStates[stateKey] = {
          stepId: initialStep.id,
          lastInteraction: now,
          isHandover: !!initialStep.isHandover,
          reminderSent: false
        }
      } else {
        const currentStep = steps.find(s => s.id === userState.stepId) || initialStep
        const options = currentStep.options || []

        const chosen = options.find(opt => {
          const keyMatches = opt.key.trim().toLowerCase() === text.toLowerCase()
          const labelMatches = opt.label.trim().toLowerCase() === text.toLowerCase()
          return keyMatches || labelMatches
        })

        if (chosen) {
          nextStep = steps.find(s => s.id === chosen.nextStepId)
          if (!nextStep) {
            nextStep = initialStep
          }
          this.userStates[stateKey] = {
            stepId: nextStep.id,
            lastInteraction: now,
            isHandover: !!nextStep.isHandover,
            reminderSent: false
          }
        } else {
          isInvalidOption = true
          nextStep = currentStep
          this.userStates[stateKey].lastInteraction = now
          this.userStates[stateKey].reminderSent = false
        }
      }

      if (nextStep) {
        let responseBody = this.formatStepMessage(nextStep, contactName)
        if (isInvalidOption) {
          responseBody = `⚠️ ${flow.invalidOptionMessage || 'Opção inválida!'}\n\n${responseBody}`
        }

        // 1. Efeito Humano: "Digitando..." e Delay
        if (flow.simulateTyping !== false) {
          try {
            const chat = await client.getChatById(chatId)
            if (chat && typeof chat.sendStateTyping === 'function') {
              await chat.sendStateTyping()
            }
          } catch (e) {
            // Silencioso se der erro no sendStateTyping
          }
        }

        const typingDelay = Math.max(0, (flow.typingDelaySeconds !== undefined ? flow.typingDelaySeconds : 2)) * 1000
        if (typingDelay > 0) {
          await new Promise(res => setTimeout(res, typingDelay))
        }

        // 2. Envio de Mídia / Imagem se houver mediaUrl na etapa
        if (nextStep.mediaUrl && nextStep.mediaUrl.startsWith('http')) {
          try {
            const media = await MessageMedia.fromUrl(nextStep.mediaUrl, { unsafeMime: true })
            await client.sendMessage(chatId, media, { caption: responseBody })
          } catch (mediaErr) {
            console.error(`[TypebotManager] Erro ao carregar mídia ${nextStep.mediaUrl}:`, mediaErr.message)
            // Fallback para texto caso falhe o download da mídia
            await client.sendMessage(chatId, responseBody)
          }
        } else {
          await client.sendMessage(chatId, responseBody)
        }

        // 3. Atualizar Estatísticas do Funil
        this.incrementStats(sessionId, nextStep.id, !!nextStep.isHandover)

        this.addLog(sessionId, {
          time: new Date().toISOString(),
          from: chatId.replace('@c.us', ''),
          contactName,
          input: text,
          stepId: nextStep.id,
          stepTitle: nextStep.title,
          isHandover: !!nextStep.isHandover
        })

        // Agendar lembrete automático se o usuário não responder
        this.scheduleReminder(sessionId, chatId, contactName, nextStep, flow, client)
      }
    } catch (error) {
      console.error(`[TypebotManager] Erro ao processar mensagem na sessão ${sessionId}:`, error.message)
    }
  }

  incrementStats(sessionId, stepId, isHandover = false) {
    const flow = this.getFlow(sessionId)
    if (!flow.stats) {
      flow.stats = { totalInteractions: 0, handoversTriggered: 0, stepHits: {} }
    }
    flow.stats.totalInteractions = (flow.stats.totalInteractions || 0) + 1
    if (isHandover) {
      flow.stats.handoversTriggered = (flow.stats.handoversTriggered || 0) + 1
    }
    if (!flow.stats.stepHits) {
      flow.stats.stepHits = {}
    }
    flow.stats.stepHits[stepId] = (flow.stats.stepHits[stepId] || 0) + 1
    this.saveFlows()
  }

  // Simulador de Chat para o Dashboard testar sem celular
  simulateStep(sessionId, text, currentStepId = null, contactName = 'Usuário Teste') {
    const flow = this.getFlow(sessionId)
    const steps = flow.steps || []
    const initialStep = steps.find(s => s.isInitial) || steps[0]
    if (!initialStep) {
      return { success: false, message: 'Nenhuma etapa configurada no fluxo.' }
    }

    const cleanText = (text || '').trim()
    const isResetCmd = cleanText.toLowerCase() === (flow.resetKeyword || 'menu').toLowerCase() || cleanText === '0'

    let nextStep = null
    let isInvalidOption = false

    if (!currentStepId) {
      // Primeira mensagem do contato: entrega o menu inicial diretamente
      nextStep = initialStep
    } else if (currentStepId === initialStep.id || isResetCmd) {
      if (isResetCmd) {
        nextStep = initialStep
      } else {
        // Encontrar opção do menu inicial
        const options = initialStep.options || []
        const chosen = options.find(opt => {
          return opt.key.trim().toLowerCase() === cleanText.toLowerCase() ||
                 opt.label.trim().toLowerCase() === cleanText.toLowerCase()
        })

        if (chosen) {
          nextStep = steps.find(s => s.id === chosen.nextStepId) || initialStep
        } else {
          isInvalidOption = true
          nextStep = initialStep
        }
      }
    } else {
      const current = steps.find(s => s.id === currentStepId) || initialStep
      const options = current.options || []
      const chosen = options.find(opt => {
        return opt.key.trim().toLowerCase() === cleanText.toLowerCase() ||
               opt.label.trim().toLowerCase() === cleanText.toLowerCase()
      })

      if (chosen) {
        nextStep = steps.find(s => s.id === chosen.nextStepId) || initialStep
      } else {
        isInvalidOption = true
        nextStep = current
      }
    }

    let responseBody = this.formatStepMessage(nextStep, contactName)
    if (isInvalidOption) {
      responseBody = `⚠️ ${flow.invalidOptionMessage || 'Opção inválida!'}\n\n${responseBody}`
    }

    return {
      success: true,
      stepId: nextStep.id,
      stepTitle: nextStep.title,
      isHandover: !!nextStep.isHandover,
      mediaUrl: nextStep.mediaUrl || '',
      response: responseBody,
      options: nextStep.options || []
    }
  }

  addLog(sessionId, logEntry) {
    if (!this.flows[sessionId]) return
    if (!this.flows[sessionId].logs) {
      this.flows[sessionId].logs = []
    }
    this.flows[sessionId].logs.unshift(logEntry)
    if (this.flows[sessionId].logs.length > 50) {
      this.flows[sessionId].logs.pop()
    }
    this.saveFlows()
  }

}

module.exports = new TypebotManager()
