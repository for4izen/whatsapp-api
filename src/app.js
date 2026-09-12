const express = require('express')
const path = require('path')
require('./routes')
const { restoreSessions } = require('./sessions')
const { routes } = require('./routes')
const app = express()
const bodyParser = require('body-parser')
const { maxAttachmentSize } = require('./config')

// Initialize Express app
app.disable('x-powered-by')
app.use(bodyParser.json({ limit: maxAttachmentSize + 1000000 }))
app.use(bodyParser.urlencoded({ limit: maxAttachmentSize + 1000000, extended: true }))

// Serve static assets for dashboard
app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')))

// API routes
app.use('/', routes)

restoreSessions()

module.exports = app
