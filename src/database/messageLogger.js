const { run, query, get } = require('./index')

// Cache em memória para consulta ultrarrápida do status de logs da instância
const sessionSettingsCache = new Map()

/**
 * Retorna as configurações da sessão (incluindo se os logs estão ativados)
 */
async function getSessionSettings(sessionId) {
  if (!sessionId) return { sessionId, logsEnabled: true }
  if (sessionSettingsCache.has(sessionId)) {
    return sessionSettingsCache.get(sessionId)
  }
  try {
    const row = await get('SELECT logsEnabled FROM session_settings WHERE sessionId = ?', [sessionId])
    const logsEnabled = row ? Boolean(row.logsEnabled) : true
    const settings = { sessionId, logsEnabled }
    sessionSettingsCache.set(sessionId, settings)
    return settings
  } catch (err) {
    return { sessionId, logsEnabled: true }
  }
}

/**
 * Atualiza se os logs da instância estão ativados ou desativados
 */
async function setSessionSettings(sessionId, { logsEnabled = true }) {
  if (!sessionId) return
  const enabledVal = logsEnabled ? 1 : 0
  const now = new Date().toISOString()
  await run(`
    INSERT INTO session_settings (sessionId, logsEnabled, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET
      logsEnabled = excluded.logsEnabled,
      updatedAt = excluded.updatedAt
  `, [sessionId, enabledVal, now])
  sessionSettingsCache.set(sessionId, { sessionId, logsEnabled: Boolean(logsEnabled) })
  return { sessionId, logsEnabled: Boolean(logsEnabled) }
}

/**
 * Salva ou atualiza uma mensagem recebida ou enviada no SQLite
 */
async function logMessage(sessionId, message, direction = 'IN', existingMedia = null) {
  if (!message || !message.id) return

  try {
    // Verificar se os logs desta instância estão habilitados
    const settings = await getSessionSettings(sessionId)
    if (!settings.logsEnabled) return
    const messageId = message.id._serialized || message.id.id || String(message.id)
    const fromNumber = message.from || ''
    const toNumber = message.to || ''
    const body = message.body || ''
    const type = message.type || 'chat'
    const hasMedia = message.hasMedia ? 1 : 0
    const ack = typeof message.ack === 'number' ? message.ack : 0
    const timestamp = message.timestamp || Math.floor(Date.now() / 1000)
    const createdAt = new Date(timestamp * 1000).toISOString()

    // Extrair remetente/autor (em grupos vem no message.author ou message._data.author)
    const author = message.author || message._data?.author || fromNumber

    // Extrair nome público ou pushname de quem enviou
    let senderName = message._data?.notifyName || message._data?.pushname || message.author || ''
    if (senderName && typeof senderName === 'object') {
      senderName = senderName.name || senderName.pushname || ''
    }

    // Extrair nome do grupo / conversa
    let chatName = ''
    if (message._data?.chat?.name) {
      chatName = message._data.chat.name
    } else if (message._data?.info?.subject) {
      chatName = message._data.info.subject
    } else if (message._data?.formattedTitle) {
      chatName = message._data.formattedTitle
    }

    // Se chatName ainda não foi extraído e temos getChat() disponível, tentar obter de forma assíncrona
    if (!chatName && typeof message.getChat === 'function') {
      try {
        const chatObj = await Promise.race([
          message.getChat(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ])
        if (chatObj) {
          chatName = chatObj.name || chatObj.formattedTitle || ''
        }
      } catch (e) {
        // Ignora timeout/erro sem travar o processamento
      }
    }

    // Se senderName ainda vazio e temos getContact()
    if (!senderName && typeof message.getContact === 'function') {
      try {
        const contactObj = await Promise.race([
          message.getContact(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
        ])
        if (contactObj) {
          senderName = contactObj.pushname || contactObj.name || ''
        }
      } catch (e) {
        // Ignora timeout/erro
      }
    }

    // Se a mensagem contém mídia, tentar salvar arquivo
    let mediaPath = null
    let mimeType = null

    const saveMediaBuffer = (mMedia) => {
      if (!mMedia || !mMedia.data) return null
      try {
        const mType = mMedia.mimetype || 'image/jpeg'
        const fs = require('fs')
        const path = require('path')
        const mediaDir = path.join(__dirname, '../../data/media')
        if (!fs.existsSync(mediaDir)) {
          fs.mkdirSync(mediaDir, { recursive: true })
        }

        let ext = 'bin'
        if (mType.includes('jpeg') || mType.includes('jpg')) ext = 'jpg'
        else if (mType.includes('png')) ext = 'png'
        else if (mType.includes('webp')) ext = 'webp'
        else if (mType.includes('mp4')) ext = 'mp4'
        else if (mType.includes('ogg') || mType.includes('audio')) ext = 'ogg'
        else if (mType.includes('pdf')) ext = 'pdf'

        const cleanMsgId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_')
        const fileName = `${sessionId}_${cleanMsgId}.${ext}`
        const fullPath = path.join(mediaDir, fileName)

        const newBuffer = Buffer.from(mMedia.data, 'base64')

        // Se o arquivo já existe no disco e o novo buffer for menor ou miniatura (< 8KB), não substitui a imagem original
        if (fs.existsSync(fullPath)) {
          const currentSize = fs.statSync(fullPath).size
          if (newBuffer.length < currentSize && type === 'image') {
            return { path: `/media/${fileName}`, mime: mType }
          }
        }

        console.log(`[MediaDiskLog] Tentando gravar arquivo no disco: ${fullPath} | Tamanho: ${newBuffer.length} bytes`)
        fs.writeFileSync(fullPath, newBuffer)
        console.log(`[MediaDiskLog] ✅ Arquivo gravado com sucesso no disco: ${fullPath}`)
        return { path: `/media/${fileName}`, mime: mType }
      } catch (err) {
        console.error(`[MediaDiskLog] ❌ ERRO ao gravar arquivo no disco (${messageId}):`, err.message, err.stack)
        return null
      }
    }

    if (existingMedia) {
      const isThumb = type === 'image' && existingMedia?.data && Buffer.byteLength(existingMedia.data, 'base64') < 8000
      if (!isThumb) {
        const saved = saveMediaBuffer(existingMedia)
        if (saved) {
          mediaPath = saved.path
          mimeType = saved.mime
        }
      }
    }
    
    if (!mediaPath && hasMedia) {
      // 1. Para Stickers, o arquivo WebP completo vem nativamente no body/base64
      const isSticker = type === 'sticker'
      const rawBody = message._data?.body || (typeof message.body === 'string' && message.body.length > 50 ? message.body : '')
      
      if (isSticker && rawBody && (rawBody.startsWith('data:') || /^[A-Za-z0-9+/=]{100,}$/.test(rawBody.trim()))) {
        const cleanBase64 = rawBody.includes('base64,') ? rawBody.split('base64,')[1] : rawBody
        const saved = saveMediaBuffer({ data: cleanBase64, mimetype: 'image/webp' })
        if (saved) {
          mediaPath = saved.path
          mimeType = saved.mime
        }
      }

      // 2. Para Imagens e demais mídias: SEMPRE obter a imagem em tamanho e resolução REAL/ORIGINAL
      if (typeof message.downloadMedia === 'function') {
        const isImage = type === 'image'
        try {
          const media = await Promise.race([
            message.downloadMedia(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
          ])
          // Validação: se for imagem mas o buffer for miniatura (< 8KB), agendamos retry para pegar a versão full
          const isThumb = isImage && media?.data && Buffer.byteLength(media.data, 'base64') < 8000
          if (media && !isThumb) {
            const saved = saveMediaBuffer(media)
            if (saved) {
              mediaPath = saved.path
              mimeType = saved.mime
            }
          } else {
            throw new Error(isThumb ? 'Aguardando imagem em resolução máxima (thumbnail ignorada)' : 'Mídia pendente')
          }
        } catch (mediaErr) {
          // Retries em background para aguardar descriptografia do arquivo original em alta resolução
          const retryDownload = async (attemptsLeft = 5, delay = 1500) => {
            setTimeout(async () => {
              try {
                if (typeof message.downloadMedia === 'function') {
                  const bgMedia = await message.downloadMedia()
                  const isThumb = isImage && bgMedia?.data && Buffer.byteLength(bgMedia.data, 'base64') < 8000
                  if (bgMedia && !isThumb) {
                    const bgSaved = saveMediaBuffer(bgMedia)
                    if (bgSaved) {
                      await run('UPDATE message_logs SET mediaPath = ?, mimeType = ? WHERE messageId = ?', [bgSaved.path, bgSaved.mime, messageId])
                      console.log(`[MessageLogger] Mídia em resolução original salva com sucesso para ${messageId}: ${bgSaved.path}`)
                      return
                    }
                  }
                }
              } catch (bgErr) {}
              if (attemptsLeft > 1) {
                retryDownload(attemptsLeft - 1, delay * 1.5)
              }
            }, delay)
          }
          retryDownload()
        }
      }
    }

    await run(`
      INSERT INTO message_logs (
        messageId, sessionId, direction, fromNumber, toNumber,
        chatName, senderName, author,
        body, type, hasMedia, mediaPath, mimeType, ack, timestamp, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(messageId) DO UPDATE SET
        ack = excluded.ack,
        chatName = CASE WHEN excluded.chatName IS NOT NULL AND excluded.chatName != '' THEN excluded.chatName ELSE message_logs.chatName END,
        senderName = CASE WHEN excluded.senderName IS NOT NULL AND excluded.senderName != '' THEN excluded.senderName ELSE message_logs.senderName END,
        author = CASE WHEN excluded.author IS NOT NULL AND excluded.author != '' THEN excluded.author ELSE message_logs.author END,
        mediaPath = CASE WHEN excluded.mediaPath IS NOT NULL THEN excluded.mediaPath ELSE message_logs.mediaPath END,
        mimeType = CASE WHEN excluded.mimeType IS NOT NULL THEN excluded.mimeType ELSE message_logs.mimeType END,
        body = CASE WHEN excluded.body != '' THEN excluded.body ELSE message_logs.body END
    `, [
      messageId,
      sessionId,
      direction,
      fromNumber,
      toNumber,
      chatName,
      senderName,
      author,
      body,
      type,
      hasMedia,
      mediaPath,
      mimeType,
      ack,
      timestamp,
      createdAt
    ])
  } catch (err) {
    console.error(`[MessageLogger] Erro ao registrar mensagem (${sessionId}):`, err.message)
  }
}

/**
 * Atualiza o status de entrega/leitura (ACK) de uma mensagem
 */
async function updateMessageAck(sessionId, message, ack) {
  if (!message || !message.id) return

  try {
    const messageId = message.id._serialized || message.id.id || String(message.id)
    await run(`
      UPDATE message_logs
      SET ack = ?
      WHERE messageId = ?
    `, [ack, messageId])
  } catch (err) {
    console.error(`[MessageLogger] Erro ao atualizar ack da mensagem (${sessionId}):`, err.message)
  }
}

/**
 * Consulta histórico de mensagens por sessão ou chat com paginação
 */
async function getMessageLogs({ sessionId, chatId, limit = 50, offset = 0, client = null }) {
  let sql = 'SELECT * FROM message_logs WHERE 1=1'
  const params = []

  if (sessionId) {
    sql += ' AND sessionId = ?'
    params.push(sessionId)
  }

  if (chatId) {
    sql += ' AND (fromNumber = ? OR toNumber = ?)'
    params.push(chatId, chatId)
  }

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  params.push(parseInt(limit) || 50, parseInt(offset) || 0)

  const rows = await query(sql, params)

  // Enriquecer registros legados sem chatName caso o client esteja conectado
  if (client && typeof client.getChats === 'function' && rows.some(r => !r.chatName)) {
    try {
      const chats = await Promise.race([
        client.getChats(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
      ])
      if (Array.isArray(chats)) {
        const chatMap = new Map()
        for (const c of chats) {
          const cId = c.id?._serialized || c.id
          const name = c.name || c.formattedTitle || ''
          if (cId && name) chatMap.set(cId, name)
        }

        for (const row of rows) {
          if (!row.chatName) {
            const targetId = row.direction === 'IN' ? row.fromNumber : row.toNumber
            if (chatMap.has(targetId)) {
              row.chatName = chatMap.get(targetId)
              run('UPDATE message_logs SET chatName = ? WHERE (fromNumber = ? OR toNumber = ?) AND (chatName IS NULL OR chatName = "")', [row.chatName, targetId, targetId]).catch(() => {})
            }
          }
        }

        // Se ainda houver grupos sem chatName, tentar buscar diretamente por getChatById
        const missingGroups = [...new Set(rows.filter(r => !r.chatName && r.fromNumber && r.fromNumber.endsWith('@g.us')).map(r => r.fromNumber))]
        for (const gId of missingGroups) {
          try {
            if (typeof client.getChatById === 'function') {
              const gChat = await Promise.race([
                client.getChatById(gId),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
              ])
              const gName = gChat?.name || gChat?.formattedTitle || ''
              if (gName) {
                rows.forEach(r => {
                  if (r.fromNumber === gId || r.toNumber === gId) r.chatName = gName
                })
                run('UPDATE message_logs SET chatName = ? WHERE (fromNumber = ? OR toNumber = ?)', [gName, gId, gId]).catch(() => {})
              }
            }
          } catch (gErr) {}
        }
      }
    } catch (e) {
      // Ignora erro ou timeout no client.getChats
    }
  }

  return rows
}

module.exports = {
  logMessage,
  updateMessageAck,
  getMessageLogs,
  getSessionSettings,
  setSessionSettings
}
