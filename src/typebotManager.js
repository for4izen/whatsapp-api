const fs = require('fs')
const path = require('path')
const { MessageMedia } = require('whatsapp-web.js')

const FLOWS_FILE = path.join(__dirname, '../data/typebot_flows.json')

class TypebotManager {
  constructor() {
    this.flows = {}
    this.userStates = {} // { `${sessionId}:${chatId}`: { stepId: 'start', lastInteraction: timestamp, isHandover: false, reminderSent: false } }
    this.reminderTimers = {} // { `${sessionId}:${chatId}`: timeoutHandle }
    this.processedMessageIds = new Set() // Previne processar a mesma mensagem duas vezes
    this.chatLocks = new Set() // Previne concorrência se chegarem mensagens simultâneas do mesmo chat
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

  getTemplates() {
    return {
      restaurante: {
        name: '🍔 Hamburgueria / Restaurante / Delivery',
        description: 'Cardápio digital, fazer pedido, endereço/taxa de entrega e falar com atendente.',
        steps: [
          {
            id: 'start',
            title: 'Menu Principal',
            isInitial: true,
            mediaUrl: '',
            message: '{saudacao}, {nome}! 🍔 Bem-vindo(a) ao *Hamburgueria & Delivery Gourmet*!\n\nComo podemos te deliciar hoje? Escolha uma opção abaixo:',
            options: [
              { key: '1', label: '📖 Ver Cardápio Digital & Preços', nextStepId: 'step_cardapio' },
              { key: '2', label: '🛵 Fazer Pedido para Entrega', nextStepId: 'step_pedido' },
              { key: '3', label: '📍 Taxa de Entrega & Bairros Atendidos', nextStepId: 'step_taxa' },
              { key: '4', label: '⏰ Horário de Funcionamento & Localização', nextStepId: 'step_horario' },
              { key: '5', label: '👤 Falar com um Atendente', nextStepId: 'step_atendente' }
            ]
          },
          {
            id: 'step_cardapio',
            title: 'Cardápio Digital',
            isInitial: false,
            message: '🍟 *Cardápio Completo Gourmet:*\n\n🍔 *Burgers Especiais:*\n- Clássico Artesanal (160g): R$ 28,90\n- Bacon Cheddar Melt: R$ 34,90\n- Triplo Smash Burger: R$ 38,90\n\n🍟 *Acompanhamentos:*\n- Batata Rústica c/ Páprica: R$ 16,00\n- Anéis de Cebola Empanados: R$ 18,00\n\n🥤 *Bebidas:*\n- Refrigerante Lata: R$ 6,00\n- Suco Natural 500ml: R$ 9,00\n\n👉 Acesse nosso cardápio com fotos: https://seusite.com/cardapio',
            options: [
              { key: '1', label: 'Fazer meu pedido agora', nextStepId: 'step_pedido' },
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_pedido',
            title: 'Como Fazer o Pedido',
            isInitial: false,
            message: '🛵 *Faça seu pedido em segundos:*\n\n1. Você pode pedir direto pelo nosso App/Site sem filas:\n🔗 https://seusite.com/pedir\n\n2. Ou nos envie por aqui no formato:\n- *Item / Lanche:*\n- *Bebida:*\n- *Endereço completo com ponto de referência:*\n- *Forma de pagamento (Pix/Cartão/Dinheiro):*\n\nAssim que você enviar, um atendente já vai confirmar seu pedido!',
            isHandover: true,
            options: [
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_taxa',
            title: 'Taxa de Entrega',
            isInitial: false,
            message: '📍 *Entregas e Prazos:*\n\n- Centro e Região: *R$ 5,00* (30-45 min)\n- Zona Sul / Norte: *R$ 8,00* (40-55 min)\n- Demais bairros: sob consulta.\n\n🛵 *Entregas grátis* para pedidos acima de R$ 80,00!',
            options: [
              { key: '1', label: 'Fazer Pedido', nextStepId: 'step_pedido' },
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_horario',
            title: 'Horário & Local',
            isInitial: false,
            message: '⏰ *Horários de Atendimento:*\n- Terça a Domingo: 18h00 às 23h30\n- Segundas: Fechado para descanso da equipe\n\n📍 *Endereço para Retirada no Balcão:*\nAv. Principal, nº 1000 - Centro',
            options: [
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_atendente',
            title: 'Atendente Humano',
            isInitial: false,
            isHandover: true,
            message: '👤 Um de nossos atendentes já foi notificado e responderá sua mensagem em breve!\n\nPor favor, digite sua dúvida ou pedido que já vamos te atender.',
            options: [
              { key: '0', label: 'Cancelar e voltar ao menu', nextStepId: 'start' }
            ]
          }
        ]
      },
      ecommerce: {
        name: '🛒 Loja Virtual / E-commerce / Vendas',
        description: 'Catálogo de produtos, rastreamento de compras, trocas/devoluções e vendedor humano.',
        steps: [
          {
            id: 'start',
            title: 'Menu da Loja',
            isInitial: true,
            mediaUrl: '',
            message: '{saudacao}, {nome}! 🛍️ Bem-vindo(a) à nossa loja oficial!\n\nComo podemos te ajudar hoje? Selecione uma opção:',
            options: [
              { key: '1', label: '📦 Rastrear Meu Pedido', nextStepId: 'step_rastreio' },
              { key: '2', label: '🏷️ Conhecer Produtos & Promoções', nextStepId: 'step_catalogo' },
              { key: '3', label: '🔄 Trocas, Garantia e Devoluções', nextStepId: 'step_trocas' },
              { key: '4', label: '💬 Falar com Vendedor / Dúvidas de Compra', nextStepId: 'step_vendedor' }
            ]
          },
          {
            id: 'step_rastreio',
            title: 'Rastreio de Pedido',
            isInitial: false,
            message: '📦 *Rastreamento de Entrega:*\n\nPara acompanhar o seu envio, informe o seu *número de pedido* ou o *CPF do comprador* logo abaixo.\n\nVocê também pode rastrear direto pelo site da transportadora: https://sualoja.com/rastreio',
            isHandover: true,
            options: [
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_catalogo',
            title: 'Catálogo & Ofertas',
            isInitial: false,
            message: '✨ *Confira nossos destaques da semana!*\n\n🔥 Toda a linha com até *30% OFF* usando o cupom: *PRIMEIRACOMPRA*\n\n🌐 Acesse a loja virtual completa:\nhttps://sualoja.com\n\nFrete grátis para compras acima de R$ 199!',
            options: [
              { key: '1', label: 'Tirar dúvidas com um consultor', nextStepId: 'step_vendedor' },
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_trocas',
            title: 'Trocas e Devoluções',
            isInitial: false,
            message: '🔄 *Política de Trocas e Devoluções:*\n\nVocê tem até 7 dias corridos após o recebimento para solicitar troca ou devolução sem nenhum custo.\n\nPara iniciar o processo, envie o número do pedido e fotos do produto aqui neste chat.',
            isHandover: true,
            options: [
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_vendedor',
            title: 'Consultor de Vendas',
            isInitial: false,
            isHandover: true,
            message: '👤 Um de nossos consultores de vendas já vai te atender!\n\nPor favor, envie qual produto você tem interesse ou o que precisa.',
            options: [
              { key: '0', label: 'Voltar ao Menu', nextStepId: 'start' }
            ]
          }
        ]
      },
      clinica: {
        name: '🏥 Clínica / Consultório / Salão & Barbearia',
        description: 'Agendamento de horário, especialidades/serviços, valores e endereço.',
        steps: [
          {
            id: 'start',
            title: 'Recepção / Boas-vindas',
            isInitial: true,
            mediaUrl: '',
            message: '{saudacao}, {nome}! 🩺 Bem-vindo(a) à nossa Central de Agendamentos e Informações.\n\nPor favor, escolha uma opção para continuarmos:',
            options: [
              { key: '1', label: '📅 Agendar ou Remarcar Consulta / Horário', nextStepId: 'step_agendamento' },
              { key: '2', label: '📋 Especialidades & Procedimentos Realizados', nextStepId: 'step_especialidades' },
              { key: '3', label: '📍 Endereço, Estacionamento & Como Chegar', nextStepId: 'step_local' },
              { key: '4', label: '💳 Convênios & Formas de Pagamento', nextStepId: 'step_convenios' },
              { key: '5', label: '👩‍⚕️ Falar com a Recepção', nextStepId: 'step_recepcao' }
            ]
          },
          {
            id: 'step_agendamento',
            title: 'Agendamento de Horário',
            isInitial: false,
            message: '📅 *Agendamento de Horários:*\n\nPor favor, envie na sequência:\n1. *Nome completo do paciente:*\n2. *Especialidade ou procedimento desejado:*\n3. *Melhor dia da semana e período (Manhã/Tarde):*\n\nNossa secretária verificará os horários disponíveis na agenda e te responderá a seguir!',
            isHandover: true,
            options: [
              { key: '0', label: 'Voltar ao Menu', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_especialidades',
            title: 'Especialidades e Tratamentos',
            isInitial: false,
            message: '📋 *Nossos Serviços e Especialidades:*\n\n- Consultas Gerais e Preventivas\n- Avaliações Especializadas\n- Exames de Rotina\n- Procedimentos Estéticos e Cuidados Personalizados\n\nTodos os atendimentos contam com equipe qualificada e equipamentos de ponta.',
            options: [
              { key: '1', label: 'Quero agendar uma avaliação', nextStepId: 'step_agendamento' },
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_local',
            title: 'Endereço e Acesso',
            isInitial: false,
            message: '📍 *Onde Estamos:*\n\nRua das Palmeiras, nº 450 - Sala 302, Edifício Medical Center.\n\n🚗 *Estacionamento:* Temos convênio com o estacionamento ao lado.\n🗺️ *Google Maps:* https://maps.google.com/?q=clinica',
            options: [
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_convenios',
            title: 'Convênios e Pagamentos',
            isInitial: false,
            message: '💳 *Atendimento Particular e Convênios:*\n\n- Aceitamos os principais planos de saúde.\n- Consultas particulares com parcelamento em até 6x no cartão ou desconto no Pix.\n- Emitimos recibo com CNPJ para reembolso em qualquer convênio!',
            options: [
              { key: '1', label: 'Falar com a recepção sobre meu convênio', nextStepId: 'step_recepcao' },
              { key: '0', label: 'Voltar ao Menu', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_recepcao',
            title: 'Recepção Humana',
            isInitial: false,
            isHandover: true,
            message: '👩‍⚕️ Olá! Um membro da nossa recepção já vai responder sua mensagem.\n\nSe já quiser adiantar sua dúvida ou pedido, fique à vontade!',
            options: [
              { key: '0', label: 'Voltar ao Menu', nextStepId: 'start' }
            ]
          }
        ]
      },
      servicos: {
        name: '💼 Prestação de Serviços / Consultoria / Agência',
        description: 'Serviços prestados, portfólio, orçamento personalizado e reunião com consultor.',
        steps: [
          {
            id: 'start',
            title: 'Boas-vindas Consultoria',
            isInitial: true,
            mediaUrl: '',
            message: '{saudacao}, {nome}! 💼 Bem-vindo(a) à nossa empresa de Soluções e Serviços.\n\nComo podemos impulsionar seus projetos hoje? Selecione uma opção:',
            options: [
              { key: '1', label: '🎯 Conhecer Nossos Serviços', nextStepId: 'step_servicos' },
              { key: '2', label: '📊 Solicitar Proposta / Orçamento', nextStepId: 'step_orcamento' },
              { key: '3', label: '🏆 Portfólio & Casos de Sucesso', nextStepId: 'step_portfolio' },
              { key: '4', label: '🤝 Falar Diretamente com um Consultor', nextStepId: 'step_consultor' }
            ]
          },
          {
            id: 'step_servicos',
            title: 'Nossos Serviços',
            isInitial: false,
            message: '🎯 *Principais Soluções Oferecidas:*\n\n1. *Consultoria Especializada:* Diagnóstico completo e plano estratégico.\n2. *Desenvolvimento Sob Medida:* Softwares, automações e integrações.\n3. *Gestão e Aceleração:* Foco em resultados rápidos e escalabilidade.\n\nMais detalhes em: https://seusite.com/servicos',
            options: [
              { key: '1', label: 'Solicitar Orçamento', nextStepId: 'step_orcamento' },
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_orcamento',
            title: 'Solicitar Orçamento',
            isInitial: false,
            message: '📊 *Solicitação de Proposta:* \n\nPara montarmos uma proposta assertiva, conte-nos brevemente:\n- Qual é o objetivo do seu projeto?\n- Qual o prazo ideal de implementação?\n\nNossa equipe técnica entrará em contato para apresentar um orçamento sem compromisso!',
            isHandover: true,
            options: [
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_portfolio',
            title: 'Portfólio',
            isInitial: false,
            message: '🏆 *Casos de Sucesso e Projetos Entregues:*\n\nJá transformamos a operação de dezenas de empresas em todo o país!\n\nVeja nosso portfólio completo com avaliações de clientes:\n🌐 https://seusite.com/cases',
            options: [
              { key: '1', label: 'Falar com um Consultor', nextStepId: 'step_consultor' },
              { key: '0', label: 'Voltar ao Menu', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_consultor',
            title: 'Atendimento Consultivo',
            isInitial: false,
            isHandover: true,
            message: '🤝 Perfeito! Um de nossos consultores especialistas assumirá este atendimento agora.\n\nAguarde um instante que já vamos conversar.',
            options: [
              { key: '0', label: 'Voltar ao Menu', nextStepId: 'start' }
            ]
          }
        ]
      },
      geral: {
        name: '🏢 Atendimento Geral / SAC & Suporte',
        description: 'Dúvidas frequentes, planos/preços, 2ª via financeira e suporte humanizado.',
        steps: [
          {
            id: 'start',
            title: 'Menu Principal',
            isInitial: true,
            mediaUrl: '',
            message: '{saudacao}, {nome}! 👋 Seja bem-vindo(a) à nossa Central de Atendimento.\n\nEscolha o assunto desejado para prosseguirmos:',
            options: [
              { key: '1', label: '🚀 Planos, Preços e Novas Contratações', nextStepId: 'step_planos' },
              { key: '2', label: '💳 Financeiro / 2ª Via de Fatura e Pix', nextStepId: 'step_financeiro' },
              { key: '3', label: '❓ Dúvidas Frequentes & Tutoriais', nextStepId: 'step_duvidas' },
              { key: '4', label: '👤 Falar com Atendente Humano', nextStepId: 'step_humano' }
            ]
          },
          {
            id: 'step_planos',
            title: 'Planos e Preços',
            isInitial: false,
            message: '🚀 *Conheça Nossos Planos:*\n\n- *Básico:* R$ 49/mês (Ideal para começar)\n- *Profissional:* R$ 99/mês (Mais recursos e integrações)\n- *Enterprise:* Personalizado para grandes volumes\n\nTodos com suporte dedicado e ativação imediata!',
            options: [
              { key: '1', label: 'Contratar agora com um especialista', nextStepId: 'step_humano' },
              { key: '0', label: 'Voltar ao Menu Principal', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_financeiro',
            title: 'Financeiro',
            isInitial: false,
            message: '💳 *Segunda Via e Financeiro:*\n\nVocê pode gerar a 2ª via do seu boleto ou chave Pix no portal do cliente: https://financeiro.seusite.com\n\nOu aguarde um atendente para consultar seu cadastro.',
            isHandover: true,
            options: [
              { key: '0', label: 'Voltar ao Menu', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_duvidas',
            title: 'Dúvidas Frequentes',
            isInitial: false,
            message: '❓ *Ajuda e FAQ:*\n\nNossa Central de Conhecimento conta com respostas para as principais dúvidas e passo a passo em vídeo:\n👉 https://ajuda.seusite.com',
            options: [
              { key: '1', label: 'Ainda preciso de ajuda humana', nextStepId: 'step_humano' },
              { key: '0', label: 'Voltar ao Menu', nextStepId: 'start' }
            ]
          },
          {
            id: 'step_humano',
            title: 'Atendimento Humano',
            isInitial: false,
            isHandover: true,
            message: '👤 Um de nossos atendentes entrará na conversa em instantes.\n\nPor favor, relate o que precisa para agilizarmos seu atendimento!',
            options: [
              { key: '0', label: 'Cancelar e voltar ao menu', nextStepId: 'start' }
            ]
          }
        ]
      }
    }
  }

  getDefaultConfig(sessionId) {
    const templates = this.getTemplates()
    const defaultTemplate = templates.geral

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
      // Horário comercial / Atendimento e ausência
      businessHours: {
        enabled: false,
        days: [1, 2, 3, 4, 5], // 0=Dom, 1=Seg... 6=Sab
        startTime: '08:00',
        endTime: '18:00',
        outOfHoursMessage: 'Olá {nome}! No momento nosso time está fora do horário de atendimento comercial (Segunda a Sexta, das 08h às 18h).\n\nSua mensagem foi recebida e responderemos logo no início do próximo expediente!'
      },
      stats: {
        totalInteractions: 0,
        handoversTriggered: 0,
        stepHits: {}
      },
      steps: defaultTemplate.steps,
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

  getGreeting() {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'Bom dia'
    if (hour >= 12 && hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  isWithinBusinessHours(businessHours) {
    if (!businessHours || !businessHours.enabled) return true

    const now = new Date()
    const day = now.getDay() // 0=Dom, 1=Seg... 6=Sab
    const activeDays = businessHours.days || [1, 2, 3, 4, 5]
    if (!activeDays.includes(day)) return false

    const [startH, startM] = (businessHours.startTime || '08:00').split(':').map(Number)
    const [endH, endM] = (businessHours.endTime || '18:00').split(':').map(Number)

    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes
  }

  formatStepMessage(step, contactName = '', phone = '') {
    let msg = (step.message || '')
      .replace(/{nome}/gi, contactName ? contactName.trim() : 'amigo(a)')
      .replace(/{numero}/gi, phone ? phone.replace('@c.us', '') : '')
      .replace(/{saudacao}/gi, this.getGreeting())

    if (step.options && step.options.length > 0) {
      const optionsText = step.options.map(opt => `*[${opt.key}]* ${opt.label}`).join('\n')
      msg += `\n\n${optionsText}`
    }

    return msg.trim()
  }

  async handleIncomingMessage(sessionId, message, client) {
    let stateKey = null
    try {
      const flow = this.getFlow(sessionId)
      if (!flow || !flow.enabled) return

      if (flow.ignoreGroups && (message.from.endsWith('@g.us') || message.to.endsWith('@g.us'))) {
        return
      }

      if (message.fromMe) return

      // Deduplicação: ignorar se esta mesma mensagem já foi recebida/processada
      const msgId = message.id?._serialized || message.id?.id || message.id
      if (msgId) {
        if (this.processedMessageIds.has(msgId)) {
          return
        }
        this.processedMessageIds.add(msgId)
        // Manter tamanho do cache sob controle (máximo 1500 IDs)
        if (this.processedMessageIds.size > 1500) {
          const first = this.processedMessageIds.values().next().value
          this.processedMessageIds.delete(first)
        }
      }

      const chatId = message.from
      const text = (message.body || '').trim()
      if (!text) return

      stateKey = `${sessionId}:${chatId}`

      // Trava de concorrência: se já está processando uma mensagem deste mesmo contato, descarta evento duplo
      if (this.chatLocks.has(stateKey)) {
        return
      }
      this.chatLocks.add(stateKey)

      // O contato interagiu: limpar imediatamente qualquer timer de lembrete pendente
      this.clearReminder(stateKey)

      // Verificar Horário Comercial
      if (!this.isWithinBusinessHours(flow.businessHours)) {
        let contactName = ''
        try {
          const contact = await message.getContact()
          contactName = contact.pushname || contact.name || ''
        } catch (_) {}

        const outOfHoursMsg = (flow.businessHours?.outOfHoursMessage || 'Olá! Nosso expediente de atendimento encerrou por hoje. Responderemos assim que retornarmos!')
          .replace(/{nome}/gi, contactName ? contactName.trim() : 'amigo(a)')
          .replace(/{saudacao}/gi, this.getGreeting())

        // Evita responder repetidamente a cada mensagem fora do expediente (limite de 1 resposta a cada 2 horas por contato)
        const lastOutOfHourKey = `outOfHours:${sessionId}:${chatId}`
        const lastSent = this.userStates[lastOutOfHourKey]
        if (!lastSent || (Date.now() - lastSent > 2 * 60 * 60 * 1000)) {
          this.userStates[lastOutOfHourKey] = Date.now()
          await client.sendMessage(chatId, outOfHoursMsg)
        }
        return
      }

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
    } finally {
      if (stateKey) {
        this.chatLocks.delete(stateKey)
      }
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
