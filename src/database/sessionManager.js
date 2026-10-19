const { query, get, run } = require('./index')

/**
 * Retorna todas as sessões salvas no SQLite
 */
async function getAllSessions() {
  return await query('SELECT * FROM sessions ORDER BY createdAt DESC')
}

/**
 * Retorna uma sessão específica pelo sessionId
 */
async function getSessionById(sessionId) {
  if (!sessionId) return null
  return await get('SELECT * FROM sessions WHERE sessionId = ?', [sessionId])
}

/**
 * Cria ou atualiza os metadados de uma sessão (nome, telefone, tag, webhook, status)
 */
async function upsertSession(sessionId, { name = null, phone = null, tag = null, webhook = null, status = null } = {}) {
  if (!sessionId) return null

  const existing = await getSessionById(sessionId)
  const now = new Date().toISOString()

  if (existing) {
    const updatedName = name !== null && name !== undefined ? name : existing.name
    const updatedPhone = phone !== null && phone !== undefined ? phone : existing.phone
    const updatedTag = tag !== null && tag !== undefined ? tag : existing.tag
    const updatedWebhook = webhook !== null && webhook !== undefined ? webhook : existing.webhook
    const updatedStatus = status !== null && status !== undefined ? status : existing.status

    await run(`
      UPDATE sessions
      SET name = ?, phone = ?, tag = ?, webhook = ?, status = ?, updatedAt = ?
      WHERE sessionId = ?
    `, [updatedName, updatedPhone, updatedTag, updatedWebhook, updatedStatus, now, sessionId])

    return await getSessionById(sessionId)
  }

  // Criação
  await run(`
    INSERT INTO sessions (sessionId, name, phone, tag, webhook, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    sessionId,
    name || sessionId,
    phone || null,
    tag || null,
    webhook || null,
    status || 'DISCONNECTED',
    now,
    now
  ])

  return await getSessionById(sessionId)
}

/**
 * Atualiza o status e/ou telefone conectado da sessão
 */
async function updateSessionStatus(sessionId, status, phone = null) {
  if (!sessionId) return
  const now = new Date().toISOString()

  // Se já existe registro
  const existing = await getSessionById(sessionId)
  if (existing) {
    const newPhone = phone || existing.phone
    await run(`
      UPDATE sessions
      SET status = ?, phone = ?, updatedAt = ?
      WHERE sessionId = ?
    `, [status, newPhone, now, sessionId])
  } else {
    // Insere inicialmente
    await run(`
      INSERT INTO sessions (sessionId, name, phone, tag, webhook, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [sessionId, sessionId, phone || null, null, null, status, now, now])
  }
}

/**
 * Remove uma sessão do banco
 */
async function deleteSessionRecord(sessionId) {
  if (!sessionId) return
  await run('DELETE FROM sessions WHERE sessionId = ?', [sessionId])
}

module.exports = {
  getAllSessions,
  getSessionById,
  upsertSession,
  updateSessionStatus,
  deleteSessionRecord
}
