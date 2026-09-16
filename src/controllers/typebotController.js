const typebotManager = require('../typebotManager')

const getFlow = async (req, res) => {
  /*
    #swagger.summary = 'Get Typebot flow configuration for session'
    #swagger.parameters['sessionId'] = {
      in: 'path',
      description: 'Session ID',
      required: true,
      type: 'string'
    }
  */
  try {
    const { sessionId } = req.params
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' })
    }

    const flow = typebotManager.getFlow(sessionId)
    return res.status(200).json({ success: true, flow })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

const saveFlow = async (req, res) => {
  /*
    #swagger.summary = 'Save Typebot flow configuration for session'
    #swagger.parameters['sessionId'] = {
      in: 'path',
      description: 'Session ID',
      required: true,
      type: 'string'
    }
    #swagger.parameters['body'] = {
      in: 'body',
      description: 'Flow settings and steps',
      required: true,
      schema: {
        enabled: true,
        ignoreGroups: true,
        steps: []
      }
    }
  */
  try {
    const { sessionId } = req.params
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' })
    }

    const updated = typebotManager.saveFlow(sessionId, req.body)
    return res.status(200).json({ success: true, message: 'Fluxo salvo com sucesso!', flow: updated })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

const resetStates = async (req, res) => {
  /*
    #swagger.summary = 'Reset contact conversation states for session'
    #swagger.parameters['sessionId'] = {
      in: 'path',
      description: 'Session ID',
      required: true,
      type: 'string'
    }
  */
  try {
    const { sessionId } = req.params
    typebotManager.resetUserState(sessionId)
    return res.status(200).json({ success: true, message: 'Estados de conversa reiniciados com sucesso!' })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

const simulate = async (req, res) => {
  /*
    #swagger.summary = 'Simulate step response in Dashboard test preview'
  */
  try {
    const { sessionId } = req.params
    const { text, currentStepId, contactName } = req.body
    const result = typebotManager.simulateStep(sessionId, text, currentStepId, contactName)
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

const cloneFlow = async (req, res) => {
  /*
    #swagger.summary = 'Copy entire flow from one session to another'
  */
  try {
    const { sessionId } = req.params
    const sourceSessionId = req.body.sourceSessionId || req.body.fromSessionId
    if (!sourceSessionId) {
      return res.status(400).json({ success: false, message: 'sourceSessionId is required' })
    }

    const source = typebotManager.getFlow(sourceSessionId)
    const cloned = typebotManager.saveFlow(sessionId, {
      ...source,
      stats: { totalInteractions: 0, handoversTriggered: 0, stepHits: {} },
      logs: []
    })
    return res.status(200).json({ success: true, message: `Fluxo copiado de ${sourceSessionId} com sucesso!`, flow: cloned })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

const getTemplates = async (req, res) => {
  /*
    #swagger.summary = 'Get built-in workflow templates by business segment'
  */
  try {
    const templates = typebotManager.getTemplates()
    return res.status(200).json({ success: true, templates })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

const applyTemplate = async (req, res) => {
  /*
    #swagger.summary = 'Apply a business template to an instance flow'
  */
  try {
    const { sessionId } = req.params
    const { templateKey } = req.body
    if (!sessionId || !templateKey) {
      return res.status(400).json({ success: false, message: 'sessionId and templateKey are required' })
    }

    const templates = typebotManager.getTemplates()
    const chosenTemplate = templates[templateKey]
    if (!chosenTemplate) {
      return res.status(404).json({ success: false, message: `Template "${templateKey}" não encontrado.` })
    }

    const current = typebotManager.getFlow(sessionId)
    const updated = typebotManager.saveFlow(sessionId, {
      ...current,
      steps: chosenTemplate.steps
    })

    return res.status(200).json({
      success: true,
      message: `Modelo "${chosenTemplate.name}" aplicado com sucesso!`,
      flow: updated
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

module.exports = {
  getFlow,
  saveFlow,
  resetStates,
  simulate,
  cloneFlow,
  getTemplates,
  applyTemplate
}

