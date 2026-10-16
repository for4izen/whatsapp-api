const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')

const DB_PATH = path.join(__dirname, '../../data/database.sqlite')
const DATA_DIR = path.dirname(DB_PATH)

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[Database] Erro ao conectar ao SQLite:', err.message)
  }
})

// Funções utilitárias com Promises para queries limpas e assíncronas
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

// Inicialização síncrona/serializada das tabelas
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL;')
  db.run('PRAGMA foreign_keys = ON;')

  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT,
      sessionId TEXT NOT NULL,
      contacts TEXT NOT NULL,
      message TEXT NOT NULL,
      delayMin INTEGER DEFAULT 5,
      delayMax INTEGER DEFAULT 12,
      scheduledFor TEXT,
      status TEXT NOT NULL,
      currentIndex INTEGER DEFAULT 0,
      sentCount INTEGER DEFAULT 0,
      failedCount INTEGER DEFAULT 0,
      totalCount INTEGER DEFAULT 0,
      logs TEXT,
      mediaUrl TEXT,
      batchSize INTEGER DEFAULT 0,
      batchWaitSec INTEGER DEFAULT 0,
      createdAt TEXT,
      startedAt TEXT,
      finishedAt TEXT
    )
  `)

  // Migrações graduais de colunas adicionais para campanhas
  db.run('ALTER TABLE campaigns ADD COLUMN mediaUrl TEXT;', () => {})
  db.run('ALTER TABLE campaigns ADD COLUMN batchSize INTEGER DEFAULT 0;', () => {})
  db.run('ALTER TABLE campaigns ADD COLUMN batchWaitSec INTEGER DEFAULT 0;', () => {})

  db.run(`
    CREATE TABLE IF NOT EXISTS typebot_flows (
      sessionId TEXT PRIMARY KEY,
      flowData TEXT NOT NULL,
      updatedAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS user_states (
      stateKey TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      chatId TEXT NOT NULL,
      stateData TEXT NOT NULL,
      updatedAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT NOT NULL,
      logEntry TEXT NOT NULL,
      createdAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS session_settings (
      sessionId TEXT PRIMARY KEY,
      logsEnabled INTEGER DEFAULT 1,
      updatedAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      messageId TEXT UNIQUE,
      sessionId TEXT NOT NULL,
      direction TEXT NOT NULL,
      fromNumber TEXT NOT NULL,
      toNumber TEXT NOT NULL,
      chatName TEXT,
      senderName TEXT,
      author TEXT,
      body TEXT,
      type TEXT,
      hasMedia INTEGER DEFAULT 0,
      mediaPath TEXT,
      mimeType TEXT,
      ack INTEGER DEFAULT 0,
      timestamp INTEGER,
      createdAt TEXT
    )
  `)

  // Migrações graduais de colunas adicionais se a tabela já existia
  db.run('ALTER TABLE message_logs ADD COLUMN chatName TEXT;', () => {})
  db.run('ALTER TABLE message_logs ADD COLUMN senderName TEXT;', () => {})
  db.run('ALTER TABLE message_logs ADD COLUMN author TEXT;', () => {})
  db.run('ALTER TABLE message_logs ADD COLUMN mediaPath TEXT;', () => {})
  db.run('ALTER TABLE message_logs ADD COLUMN mimeType TEXT;', () => {})

  db.run('CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);')
  db.run('CREATE INDEX IF NOT EXISTS idx_campaigns_sessionId ON campaigns(sessionId);')
  db.run('CREATE INDEX IF NOT EXISTS idx_user_states_session ON user_states(sessionId);')
  db.run('CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_logs(sessionId);')
  db.run('CREATE INDEX IF NOT EXISTS idx_message_logs_session ON message_logs(sessionId);')
  db.run('CREATE INDEX IF NOT EXISTS idx_message_logs_direction ON message_logs(direction);')
  db.run('CREATE INDEX IF NOT EXISTS idx_message_logs_fromNumber ON message_logs(fromNumber);')
  db.run('CREATE INDEX IF NOT EXISTS idx_message_logs_toNumber ON message_logs(toNumber);')
  db.run('CREATE INDEX IF NOT EXISTS idx_message_logs_createdAt ON message_logs(createdAt);')
})

module.exports = {
  db,
  query,
  get,
  run
}
