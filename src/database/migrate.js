const fs = require('fs')
const path = require('path')
const { run, get } = require('./index')


const DATA_DIR = path.join(__dirname, '../../data')
const USER_STATES_FILE = path.join(DATA_DIR, 'user_states.json')
const FLOWS_DIR = path.join(DATA_DIR, 'flows')
const LEGACY_FLOWS_FILE = path.join(DATA_DIR, 'typebot_flows.json')
const LOGS_DIR = path.join(DATA_DIR, 'logs')

async function migrateData() {
  console.log('[Migration] Iniciando verificação e importação para SQLite...')

  // 1. Migrar Estados de Usuários
  if (fs.existsSync(USER_STATES_FILE)) {
    try {
      const content = fs.readFileSync(USER_STATES_FILE, 'utf8')
      const userStates = JSON.parse(content || '{}')
      for (const [key, state] of Object.entries(userStates)) {
        const [sessionId, chatId] = key.split(':')
        const exists = await get('SELECT stateKey FROM user_states WHERE stateKey = ?', [key])
        if (!exists) {
          await run(`
            INSERT INTO user_states (stateKey, sessionId, chatId, stateData, updatedAt)
            VALUES (?, ?, ?, ?, ?)
          `, [
            key,
            sessionId || 'default',
            chatId || key,
            JSON.stringify(state),
            new Date().toISOString()
          ])
          console.log(`[Migration] Estado de usuário migrado: ${key}`)
        }
      }
    } catch (err) {
      console.error('[Migration] Erro ao migrar user_states.json:', err.message)
    }
  }

  // 3. Migrar Fluxos do Typebot
  if (fs.existsSync(FLOWS_DIR)) {
    try {
      const files = fs.readdirSync(FLOWS_DIR).filter(f => f.endsWith('.json'))
      for (const file of files) {
        const sessionId = path.basename(file, '.json')
        const flowData = fs.readFileSync(path.join(FLOWS_DIR, file), 'utf8')
        const exists = await get('SELECT sessionId FROM typebot_flows WHERE sessionId = ?', [sessionId])
        if (!exists) {
          await run(`
            INSERT INTO typebot_flows (sessionId, flowData, updatedAt)
            VALUES (?, ?, ?)
          `, [sessionId, flowData, new Date().toISOString()])
          console.log(`[Migration] Fluxo migrado da pasta flows: ${sessionId}`)
        }
      }
    } catch (err) {
      console.error('[Migration] Erro ao migrar flows/ folder:', err.message)
    }
  }

  // Migrar fluxos legados se ainda existirem
  if (fs.existsSync(LEGACY_FLOWS_FILE)) {
    try {
      const raw = fs.readFileSync(LEGACY_FLOWS_FILE, 'utf8')
      const legacy = JSON.parse(raw || '{}')
      for (const [sessionId, flow] of Object.entries(legacy)) {
        const exists = await get('SELECT sessionId FROM typebot_flows WHERE sessionId = ?', [sessionId])
        if (!exists) {
          await run(`
            INSERT INTO typebot_flows (sessionId, flowData, updatedAt)
            VALUES (?, ?, ?)
          `, [sessionId, JSON.stringify(flow), new Date().toISOString()])
          console.log(`[Migration] Fluxo legado migrado: ${sessionId}`)
        }
      }
    } catch (err) {
      console.error('[Migration] Erro ao migrar legacy flows:', err.message)
    }
  }

  // 4. Migrar Logs
  if (fs.existsSync(LOGS_DIR)) {
    try {
      const logFiles = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'))
      for (const file of logFiles) {
        const sessionId = path.basename(file, '.json')
        const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf8')
        const logs = JSON.parse(content || '[]')
        for (const logItem of logs) {
          await run(`
            INSERT INTO session_logs (sessionId, logEntry, createdAt)
            VALUES (?, ?, ?)
          `, [
            sessionId,
            JSON.stringify(logItem),
            logItem.timestamp || logItem.time || new Date().toISOString()
          ])
        }
        console.log(`[Migration] Logs migrados para sessão: ${sessionId}`)
      }
    } catch (err) {
      console.error('[Migration] Erro ao migrar logs:', err.message)
    }
  }

  console.log('[Migration] Concluído com sucesso!')
}

module.exports = migrateData

if (require.main === module) {
  migrateData().then(() => process.exit(0)).catch(err => {
    console.error(err)
    process.exit(1)
  })
}
