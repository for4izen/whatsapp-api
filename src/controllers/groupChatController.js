const { MessageMedia } = require('whatsapp-web.js')
const { sessions } = require('../sessions')
const { sendErrorResponse } = require('../utils')

const formatContactId = (id) => {
  if (!id) return id
  const cleaned = String(id).replace(/[^0-9]/g, '')
  return cleaned.endsWith('@c.us') ? cleaned : `${cleaned}@c.us`
}

const normalizeGroupId = (chatId) => {
  if (!chatId) return chatId
  const trimmed = String(chatId).trim()
  if (trimmed.includes('@')) return trimmed
  return `${trimmed}@g.us`
}

/**
 * Adds participants to a group chat.
 * @async
 * @function
 * @param {Object} req - The request object containing the chatId and contactIds in the body.
 * @param {string} req.body.chatId - The ID of the group chat.
 * @param {Array<string>|string} req.body.contactIds - An array or single contact ID to be added to the group.
 * @param {Object} res - The response object.
 * @returns {Object} Returns a JSON object containing a success flag, result details and the updated participants list.
 * @throws {Error} Throws an error if the chat is not a group chat.
*/
const addParticipants = async (req, res) => {
  try {
    const { chatId, contactIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const targets = Array.isArray(contactIds) ? contactIds.map(formatContactId) : [formatContactId(contactIds)]
    const result = await chat.addParticipants(targets)
    res.json({ success: true, result, participants: chat.participants })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Removes participants from a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated participants list
 * @throws {Error} If chat is not a group
 */
const removeParticipants = async (req, res) => {
  try {
    const { chatId, contactIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const targets = Array.isArray(contactIds) ? contactIds.map(formatContactId) : [formatContactId(contactIds)]
    const result = await chat.removeParticipants(targets)
    res.json({ success: true, result, participants: chat.participants })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Promotes participants in a group chat to admin
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated participants list
 * @throws {Error} If chat is not a group
 */
const promoteParticipants = async (req, res) => {
  try {
    const { chatId, contactIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const targets = Array.isArray(contactIds) ? contactIds.map(formatContactId) : [formatContactId(contactIds)]
    const result = await chat.promoteParticipants(targets)
    res.json({ success: true, result, participants: chat.participants })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Demotes admin participants in a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated participants list
 * @throws {Error} If chat is not a group
 */
const demoteParticipants = async (req, res) => {
  try {
    const { chatId, contactIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const targets = Array.isArray(contactIds) ? contactIds.map(formatContactId) : [formatContactId(contactIds)]
    const result = await chat.demoteParticipants(targets)
    res.json({ success: true, result, participants: chat.participants })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets the invite code for a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and invite code
 * @throws {Error} If chat is not a group
 */
const getInviteCode = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const inviteCode = await chat.getInviteCode()
    res.json({ success: true, inviteCode })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sets the subject of a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated chat object
 * @throws {Error} If chat is not a group
 */
const setSubject = async (req, res) => {
  try {
    const { chatId, subject } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const success = await chat.setSubject(subject)
    res.json({ success, chat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sets the description of a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated chat object
 * @throws {Error} If chat is not a group
 */
const setDescription = async (req, res) => {
  try {
    const { chatId, description } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const success = await chat.setDescription(description)
    res.json({ success, chat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Leaves a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and outcome of leaving the chat
 * @throws {Error} If chat is not a group
 */
const leave = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const outcome = await chat.leave()
    res.json({ success: true, outcome })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves information about a chat based on the provided chatId
 *
 * @async
 * @function getClassInfo
 * @param {object} req - The request object
 * @param {object} res - The response object
 * @param {string} req.body.chatId - The chatId of the chat to retrieve information about
 * @param {string} req.params.sessionId - The sessionId of the client making the request
 * @throws {Error} The chat is not a group.
 * @returns {Promise<void>} - A JSON response with success true and chat object containing chat information
 */
const getClassInfo = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    res.json({ success: true, chat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Revokes the invite link for a group chat based on the provided chatId
 *
 * @async
 * @function revokeInvite
 * @param {object} req - The request object
 * @param {object} res - The response object
 * @param {string} req.body.chatId - The chatId of the group chat to revoke the invite for
 * @param {string} req.params.sessionId - The sessionId of the client making the request
 * @throws {Error} The chat is not a group.
 * @returns {Promise<void>} - A JSON response with success true and the new invite code for the group chat
 */
const revokeInvite = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const newInviteCode = await chat.revokeInvite()
    res.json({ success: true, newInviteCode })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sets admins-only status of a group chat's info or messages.
 *
 * @async
 * @function setInfoAdminsOnly
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {string} req.params.sessionId - ID of the user's session.
 * @param {Object} req.body - Request body.
 * @param {string} req.body.chatId - ID of the group chat.
 * @param {boolean} req.body.adminsOnly - Desired admins-only status.
 * @returns {Promise<void>} Promise representing the success or failure of the operation.
 * @throws {Error} If the chat is not a group.
 */
const setInfoAdminsOnly = async (req, res) => {
  try {
    const { chatId, adminsOnly } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.setInfoAdminsOnly(adminsOnly)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sets admins-only status of a group chat's messages.
 *
 * @async
 * @function setMessagesAdminsOnly
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {string} req.params.sessionId - ID of the user's session.
 * @param {Object} req.body - Request body.
 * @param {string} req.body.chatId - ID of the group chat.
 * @param {boolean} req.body.adminsOnly - Desired admins-only status.
 * @returns {Promise<void>} Promise representing the success or failure of the operation.
 * @throws {Error} If the chat is not a group.
 */
const setMessagesAdminsOnly = async (req, res) => {
  try {
    const { chatId, adminsOnly } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.setMessagesAdminsOnly(adminsOnly)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Set the group Picture
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} req.body.pictureMimetype - The mimetype of the image.
 * @param {Object} req.body.pictureData - The new group picture in base64 format.
 * @param {Object} req.body.chatId - ID of the group chat.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the group picture, an error will be thrown.
 */
const setPicture = async (req, res) => {
  try {
    const { pictureMimetype, pictureData, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const media = new MessageMedia(pictureMimetype, pictureData)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.setPicture(media)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Delete the group Picture
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} req.body.chatId - ID of the group chat.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the group picture, an error will be thrown.
 */
const deletePicture = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.deletePicture()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets pending membership requests for a group chat.
 * @async
 * @function getMembershipRequests
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {string} req.body.chatId - ID of the group chat.
 */
const getMembershipRequests = async (req, res) => {
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const requests = await chat.getGroupMembershipRequests()
    res.json({ success: true, requests })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Approves pending membership requests for a group chat.
 * @async
 * @function approveMembershipRequests
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {string} req.body.chatId - ID of the group chat.
 * @param {Array<string>} [req.body.requesterIds] - Optional array of requester IDs to approve. If omitted, approves all.
 */
const approveMembershipRequests = async (req, res) => {
  try {
    const { chatId, requesterIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const options = requesterIds ? { requesterIds: Array.isArray(requesterIds) ? requesterIds.map(formatContactId) : [formatContactId(requesterIds)] } : {}
    const result = await chat.approveGroupMembershipRequests(options)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Rejects pending membership requests for a group chat.
 * @async
 * @function rejectMembershipRequests
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {string} req.body.chatId - ID of the group chat.
 * @param {Array<string>} [req.body.requesterIds] - Optional array of requester IDs to reject. If omitted, rejects all.
 */
const rejectMembershipRequests = async (req, res) => {
  try {
    const { chatId, requesterIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(normalizeGroupId(chatId))
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const options = requesterIds ? { requesterIds: Array.isArray(requesterIds) ? requesterIds.map(formatContactId) : [formatContactId(requesterIds)] } : {}
    const result = await chat.rejectGroupMembershipRequests(options)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  getClassInfo,
  addParticipants,
  demoteParticipants,
  getInviteCode,
  leave,
  promoteParticipants,
  removeParticipants,
  revokeInvite,
  setDescription,
  setInfoAdminsOnly,
  setMessagesAdminsOnly,
  setSubject,
  setPicture,
  deletePicture,
  getMembershipRequests,
  approveMembershipRequests,
  rejectMembershipRequests
}
