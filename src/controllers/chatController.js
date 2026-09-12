const { sessions } = require('../sessions')
const { sendErrorResponse } = require('../utils')

/**
 * @function
 * @async
 * @name getClassInfo
 * @description Gets information about a chat using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the chat to get information for
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and chat information
 * @throws {Error} - Throws an error if chat is not found or if there is a server error
 */
const getClassInfo = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) { sendErrorResponse(res, 404, 'Chat not Found') }
    res.json({ success: true, chat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Clears all messages in a chat.
 *
 * @function
 * @async
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {string} req.body.chatId - The ID of the chat to clear messages from.
 * @throws {Error} If the chat is not found or there is an internal server error.
 * @returns {Object} The success status and the cleared messages.
 */
const clearMessages = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) { sendErrorResponse(res, 404, 'Chat not Found') }
    const clearMessages = await chat.clearMessages()
    res.json({ success: true, clearMessages })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Stops typing or recording in chat immediately.
 *
 * @function
 * @async
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {string} req.body.chatId - ID of the chat to clear the state for.
 * @param {string} req.params.sessionId - ID of the session the chat belongs to.
 * @returns {Promise<void>} - A Promise that resolves with a JSON object containing a success flag and the result of clearing the state.
 * @throws {Error} - If there was an error while clearing the state.
 */
const clearState = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) { sendErrorResponse(res, 404, 'Chat not Found') }
    const clearState = await chat.clearState()
    res.json({ success: true, clearState })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Delete a chat.
 *
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.chatId - The ID of the chat to be deleted.
 * @returns {Object} A JSON response indicating whether the chat was deleted successfully.
 * @throws {Object} If there is an error while deleting the chat, an error response is sent with a status code of 500.
 * @throws {Object} If the chat is not found, an error response is sent with a status code of 404.
 */
const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) { sendErrorResponse(res, 404, 'Chat not Found') }
    const deleteChat = await chat.delete()
    res.json({ success: true, deleteChat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Fetches messages from a specified chat.
 *
 * @function
 * @async
 *
 * @param {Object} req - The request object containing sessionId, chatId, and searchOptions.
 * @param {string} req.params.sessionId - The ID of the session associated with the chat.
 * @param {Object} req.body - The body of the request containing chatId and searchOptions.
 * @param {string} req.body.chatId - The ID of the chat from which to fetch messages.
 * @param {Object} req.body.searchOptions - The search options to use when fetching messages.
 *
 * @param {Object} res - The response object to send the fetched messages.
 * @returns {Promise<Object>} A JSON object containing the success status and fetched messages.
 *
 * @throws {Error} If the chat is not found or there is an error fetching messages.
 */
const fetchMessages = async (req, res) => {
  try {
    /*
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'Unique whatsApp identifier for the given Chat (either group or personnal)',
            example: '6281288888888@c.us'
          },
          searchOptions: {
            type: 'object',
            description: 'Search options for fetching messages',
            example: '{}'
          }
        }
      }
    }
  */
    const { chatId, searchOptions } = req.body
    const client = sessions.get(req.params.sessionId)
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not Found')
    }
    const chat = await client.getChatById(chatId)
    if (!chat) { 
      return sendErrorResponse(res, 404, 'Chat not Found') 
    }
    const options = searchOptions || { limit: 200 }
    let rawMessages = []

    try {
      rawMessages = await chat.fetchMessages(options)
    } catch (e) {
      console.log('chat.fetchMessages internal error, trying direct browser query:', e.message)
    }

    // Direct Browser Evaluate Fallback: guarantees messages are fetched from WhatsApp Web Collections directly
    if (!rawMessages || rawMessages.length === 0) {
      try {
        const directMessages = await client.pupPage.evaluate(async (targetChatId, limit) => {
          const chatWid = window.require('WAWebWidFactory').createWid(targetChatId)
          let chatModel = window.require('WAWebCollections').Chat.get(chatWid)
          if (!chatModel && window.require('WAWebFindChatAction')) {
            chatModel = (await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid))?.chat
          }
          if (!chatModel) return []

          // Try to load earlier messages if collection has few
          try {
            if (window.require('WAWebChatLoadMessages')) {
              await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat: chatModel })
            }
          } catch (_) {}

          const msgsArray = chatModel.msgs ? chatModel.msgs.getModelsArray() : []
          const filtered = msgsArray.filter(m => !m.isNotification)
          const slice = limit > 0 ? filtered.slice(-limit) : filtered

          return slice.map(m => ({
            id: m.id?._serialized || m.id?.id,
            body: m.body || m.caption || '',
            type: m.type,
            timestamp: m.t || 0,
            fromMe: Boolean(m.id?.fromMe),
            from: m.from?._serialized || m.from,
            to: m.to?._serialized || m.to,
            author: m.author?._serialized || m.author || null,
            notifyName: m.notifyName || m.sender?.pushname || null,
            hasMedia: Boolean(m.directPath || m.mediaKey),
            ack: m.ack
          }))
        }, chatId, options.limit || 200)

        if (directMessages && directMessages.length > 0) {
          return res.json({ success: true, messages: directMessages })
        }
      } catch (browserErr) {
        console.error('Direct browser query failed:', browserErr.message)
      }
    }
    
    // Explicit clean serialization so the frontend always receives the exact message text and sender
    const messages = (rawMessages || []).map(m => ({
      id: m.id?._serialized || m.id?.id,
      body: m.body || m._data?.body || m._data?.caption || '',
      type: m.type,
      timestamp: m.timestamp || m._data?.t || 0,
      fromMe: Boolean(m.fromMe !== undefined ? m.fromMe : m.id?.fromMe),
      from: m.from,
      to: m.to,
      author: m.author || m._data?.author,
      notifyName: m._data?.notifyName || null,
      hasMedia: Boolean(m.hasMedia),
      ack: m.ack
    }))

    res.json({ success: true, messages })
  } catch (error) {
    console.error('fetchMessages ERROR:', error)
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets the contact for a chat
 * @async
 * @function
 * @param {Object} req - The HTTP request object
 * @param {Object} res - The HTTP response object
 * @param {string} req.params.sessionId - The ID of the current session
 * @param {string} req.body.chatId - The ID of the chat to get the contact for
 * @returns {Promise<void>} - Promise that resolves with the chat's contact information
 * @throws {Error} - Throws an error if chat is not found or if there is an error getting the contact information
 */
const getContact = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) { sendErrorResponse(res, 404, 'Chat not Found') }
    const contact = await chat.getContact()
    res.json({ success: true, contact })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send a recording state to a WhatsApp chat.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the recording state to.
 * @returns {object} - An object containing a success message and the result of the sendStateRecording method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const sendStateRecording = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) { sendErrorResponse(res, 404, 'Chat not Found') }
    const sendStateRecording = await chat.sendStateRecording()
    res.json({ success: true, sendStateRecording })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send a typing state to a WhatsApp chat.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the typing state to.
 * @returns {object} - An object containing a success message and the result of the sendStateTyping method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const sendStateTyping = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) { sendErrorResponse(res, 404, 'Chat not Found') }
    const sendStateTyping = await chat.sendStateTyping()
    res.json({ success: true, sendStateTyping })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  getClassInfo,
  clearMessages,
  clearState,
  deleteChat,
  fetchMessages,
  getContact,
  sendStateRecording,
  sendStateTyping
}
