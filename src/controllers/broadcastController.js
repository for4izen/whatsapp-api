const broadcastManager = require('../broadcastManager')
const { sendErrorResponse } = require('../utils')

/**
 * Criar nova campanha de disparo
 */
const createCampaign = (req, res) => {
  try {
    const { name, sessionId, contacts, message, delayMin, delayMax, scheduledFor } = req.body

    if (!sessionId) {
      return sendErrorResponse(res, 400, 'sessionId é obrigatório.')
    }
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return sendErrorResponse(res, 400, 'Lista de contatos é obrigatória e deve conter ao menos um número.')
    }
    if (!message || typeof message !== 'string') {
      return sendErrorResponse(res, 400, 'Mensagem é obrigatória.')
    }

    const campaign = broadcastManager.createCampaign({
      name,
      sessionId,
      contacts,
      message,
      delayMin,
      delayMax,
      scheduledFor
    })

    res.json({
      success: true,
      message: campaign.status === 'SCHEDULED' ? 'Campanha agendada com sucesso!' : 'Campanha iniciada em segundo plano!',
      campaign
    })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Listar todas as campanhas
 */
const listCampaigns = (req, res) => {
  try {
    const campaigns = broadcastManager.listCampaigns()
    res.json({ success: true, data: campaigns })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Obter detalhes e logs de uma campanha
 */
const getCampaign = (req, res) => {
  try {
    const campaign = broadcastManager.getCampaignById(req.params.id)
    if (!campaign) {
      return sendErrorResponse(res, 404, 'Campanha não encontrada.')
    }
    res.json({ success: true, campaign })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Pausar campanha
 */
const pauseCampaign = (req, res) => {
  try {
    const success = broadcastManager.pauseCampaign(req.params.id)
    if (!success) {
      return sendErrorResponse(res, 400, 'Não foi possível pausar a campanha.')
    }
    res.json({ success: true, message: 'Campanha pausada.' })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retomar campanha
 */
const resumeCampaign = (req, res) => {
  try {
    const success = broadcastManager.resumeCampaign(req.params.id)
    if (!success) {
      return sendErrorResponse(res, 400, 'Não foi possível retomar a campanha.')
    }
    res.json({ success: true, message: 'Campanha retomada.' })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Cancelar / Parar campanha
 */
const cancelCampaign = (req, res) => {
  try {
    const success = broadcastManager.cancelCampaign(req.params.id)
    if (!success) {
      return sendErrorResponse(res, 400, 'Não foi possível cancelar a campanha.')
    }
    res.json({ success: true, message: 'Campanha cancelada.' })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Excluir campanha
 */
const deleteCampaign = (req, res) => {
  try {
    const success = broadcastManager.deleteCampaign(req.params.id)
    if (!success) {
      return sendErrorResponse(res, 404, 'Campanha não encontrada.')
    }
    res.json({ success: true, message: 'Campanha excluída.' })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  createCampaign,
  listCampaigns,
  getCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  deleteCampaign
}
