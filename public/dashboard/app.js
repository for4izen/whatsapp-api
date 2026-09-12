// WhatsApp Session Manager Frontend Engine
let currentApiKey = localStorage.getItem('wa_api_key') || ''
let qrPollingInterval = null
let currentQrSessionId = null

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKeyInput')
  if (currentApiKey) {
    apiKeyInput.value = currentApiKey
  }

  // Setup Event Listeners
  document.getElementById('saveKeyBtn').addEventListener('click', () => {
    saveApiKey()
  })

  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveApiKey()
    }
  })

  document.getElementById('refreshBtn').addEventListener('click', loadSessions)
  document.getElementById('newSessionBtn').addEventListener('click', openNewSessionModal)
  document.getElementById('cleanInactiveBtn').addEventListener('click', terminateInactive)

  document.getElementById('newSessionForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const sessionId = document.getElementById('sessionIdInput').value.trim()
    if (!sessionId) return
    closeModal('newSessionModal')
    await startAndConnectSession(sessionId)
  })

  // Initial Fetch if key exists or check server
  if (!currentApiKey) {
    promptForApiKey()
  } else {
    loadSessions()
  }

  // Background Auto-Refresh every 12 seconds
  setInterval(() => {
    if (!document.getElementById('qrModal').classList.contains('hidden')) return
    if (currentApiKey) {
      loadSessions(true)
    }
  }, 12000)

  // Initialize Contact Lists and Stored Message Data
  initContactListsModule()
})

// Tab Switcher
let activeTab = 'sessions'
function switchMainTab(tab) {
  activeTab = tab
  const btnSessions = document.getElementById('tabBtnSessions')
  const btnBroadcast = document.getElementById('tabBtnBroadcast')
  const btnTypebot = document.getElementById('tabBtnTypebot')
  const btnDocs = document.getElementById('tabBtnDocs')

  const viewSessions = document.getElementById('viewSessions')
  const viewBroadcast = document.getElementById('viewBroadcast')
  const viewTypebot = document.getElementById('viewTypebot')
  const viewDocs = document.getElementById('viewDocs')

  btnSessions.classList.remove('active')
  btnBroadcast.classList.remove('active')
  if (btnTypebot) btnTypebot.classList.remove('active')
  if (btnDocs) btnDocs.classList.remove('active')

  viewSessions.classList.add('hidden')
  viewBroadcast.classList.add('hidden')
  if (viewTypebot) viewTypebot.classList.add('hidden')
  if (viewDocs) viewDocs.classList.add('hidden')

  if (tab === 'sessions') {
    btnSessions.classList.add('active')
    viewSessions.classList.remove('hidden')
    loadSessions()
  } else if (tab === 'broadcast') {
    btnBroadcast.classList.add('active')
    viewBroadcast.classList.remove('hidden')
    refreshBroadcastSelects()
    renderContactLists()
    fetchServerCampaigns()
  } else if (tab === 'typebot') {
    if (btnTypebot) btnTypebot.classList.add('active')
    if (viewTypebot) viewTypebot.classList.remove('hidden')
    initTypebotTab()
  } else if (tab === 'docs') {
    if (btnDocs) btnDocs.classList.add('active')
    if (viewDocs) viewDocs.classList.remove('hidden')
    initDocsTab()
  }
}

function initDocsTab() {
  const host = window.location.origin
  const baseEl = document.getElementById('docsBaseUrlText')
  if (baseEl) baseEl.textContent = host

  const frame = document.getElementById('swaggerFrame')
  if (frame && (!frame.src || frame.src.endsWith('/api-docs') === false)) {
    frame.src = '/api-docs'
  }
}

function reloadDocsFrame() {
  const frame = document.getElementById('swaggerFrame')
  if (frame) {
    frame.src = '/api-docs?t=' + Date.now()
    showToast('Swagger recarregado com sucesso!', 'info', 1500)
  }
}







function saveApiKey() {
  const apiKeyInput = document.getElementById('apiKeyInput')
  const val = apiKeyInput.value.trim()
  currentApiKey = val
  localStorage.setItem('wa_api_key', val)
  showToast('Chave de API salva!')
  loadSessions()
}

function promptForApiKey() {
  const keyWrapper = document.querySelector('.api-key-wrapper')
  if (keyWrapper) {
    keyWrapper.style.boxShadow = '0 0 0 2px #ef4444'
    setTimeout(() => {
      keyWrapper.style.boxShadow = ''
    }, 4000)
  }
  showToast('Informe a sua Chave de API no topo e clique em Salvar.', 5000)
}

// Custom Fetch with API Key header
async function apiRequest(url, options = {}) {
  // Always check input if local variable was not updated
  const apiKeyInput = document.getElementById('apiKeyInput')
  if (apiKeyInput && apiKeyInput.value.trim() && !currentApiKey) {
    currentApiKey = apiKeyInput.value.trim()
    localStorage.setItem('wa_api_key', currentApiKey)
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  if (currentApiKey) {
    headers['x-api-key'] = currentApiKey
  }

  const response = await fetch(url, { ...options, headers })
  if (response.status === 403) {
    promptForApiKey()
    throw new Error('Forbidden: Chave de API incorreta ou ausente')
  }

  return response
}

// Toast Notification System
function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer')
  if (!container) return

  const item = document.createElement('div')
  item.className = `toast-item toast-${type}`

  let icon = '✓'
  if (type === 'error') icon = '✕'
  else if (type === 'warning') icon = '⚠️'
  else if (type === 'info') icon = 'ℹ️'

  item.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
  `

  container.appendChild(item)

  setTimeout(() => {
    item.style.opacity = '0'
    item.style.transform = 'translateY(10px)'
    setTimeout(() => {
      item.remove()
    }, 200)
  }, duration)
}

// Custom Confirm Modal (Retorna Promise<boolean> - Substitui window.confirm e alert)
function showConfirmModal({ title = 'Confirmar Ação', message = 'Deseja realmente continuar?', isDanger = false, okText = 'Confirmar', cancelText = 'Cancelar', icon = '⚠️' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal')
    const titleEl = document.getElementById('confirmTitle')
    const msgEl = document.getElementById('confirmMessage')
    const btnOk = document.getElementById('confirmBtnOk')
    const btnCancel = document.getElementById('confirmBtnCancel')
    const iconWrap = document.getElementById('confirmIconWrap')
    const iconEl = document.getElementById('confirmIcon')

    titleEl.textContent = title
    msgEl.textContent = message
    iconEl.textContent = icon
    btnOk.textContent = okText
    btnCancel.textContent = cancelText

    if (isDanger) {
      iconWrap.classList.add('danger')
      btnOk.className = 'btn btn-danger-outline'
    } else {
      iconWrap.classList.remove('danger')
      btnOk.className = 'btn btn-primary'
    }

    modal.classList.remove('hidden')

    const cleanup = () => {
      modal.classList.add('hidden')
      btnOk.removeEventListener('click', onOk)
      btnCancel.removeEventListener('click', onCancel)
    }

    const onOk = () => {
      cleanup()
      resolve(true)
    }

    const onCancel = () => {
      cleanup()
      resolve(false)
    }

    btnOk.addEventListener('click', onOk)
    btnCancel.addEventListener('click', onCancel)
  })
}

// Modal Handlers
function openNewSessionModal() {

  document.getElementById('sessionIdInput').value = ''
  document.getElementById('newSessionModal').classList.remove('hidden')
  document.getElementById('sessionIdInput').focus()
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden')
}

function closeQrModal() {
  if (qrPollingInterval) {
    clearInterval(qrPollingInterval)
    qrPollingInterval = null
  }
  currentQrSessionId = null
  document.getElementById('qrModal').classList.add('hidden')
  loadSessions()
}

let cachedSessions = []

// Load and Render Sessions
async function loadSessions(isBackground = false) {
  try {
    const res = await apiRequest('/session/list')
    const json = await res.json()
    const sessions = json.data || []
    cachedSessions = sessions

    renderStats(sessions)
    renderGrid(sessions)
    updateBroadcastSessionsSelect(sessions)
  } catch (err) {
    if (!isBackground) {
      console.error('Error fetching sessions:', err)
    }
  }
}


// Render Stats Cards
function renderStats(sessions) {
  const total = sessions.length
  const connected = sessions.filter(s => s.status === 'CONNECTED').length
  const waiting = sessions.filter(s => s.status === 'WAITING_QR').length
  const inactive = sessions.filter(s => s.status === 'STOPPED' || s.status === 'ERROR').length

  document.getElementById('totalSessionsCount').textContent = total
  document.getElementById('connectedSessionsCount').textContent = connected
  document.getElementById('qrSessionsCount').textContent = waiting
  document.getElementById('inactiveSessionsCount').textContent = inactive
}

// Render Cards Grid
function filterSessionsGrid(query) {
  const q = (query || '').toLowerCase().trim()
  if (!q) {
    renderGrid(cachedSessions)
    return
  }
  const filtered = cachedSessions.filter(s => {
    const idMatches = s.sessionId.toLowerCase().includes(q)
    const numMatches = s.user && s.user.wid && s.user.wid.includes(q)
    const nameMatches = s.user && s.user.pushname && s.user.pushname.toLowerCase().includes(q)
    return idMatches || numMatches || nameMatches
  })
  renderGrid(filtered)
}

function renderGrid(sessions) {
  const grid = document.getElementById('sessionsGrid')
  const empty = document.getElementById('emptyState')

  if (!sessions || sessions.length === 0) {
    grid.innerHTML = ''
    empty.classList.remove('hidden')
    return
  }


  empty.classList.add('hidden')
  grid.innerHTML = sessions.map(session => {
    let statusClass = ''
    let badgeHtml = ''
    let actionButtons = ''

    if (session.status === 'CONNECTED') {
      statusClass = 'status-connected'
      badgeHtml = `<span class="badge badge-connected"><span class="badge-dot"></span> Conectado</span>`
      actionButtons = `
        <button class="btn btn-secondary btn-sm" onclick="restartSession('${session.sessionId}')" title="Reiniciar Sessão">
          <span>🔄 Reiniciar</span>
        </button>
        <button class="btn btn-danger-outline btn-sm" onclick="disconnectSession('${session.sessionId}')" title="Desconectar WhatsApp">
          <span>🔌 Desconectar</span>
        </button>
      `
    } else if (session.status === 'WAITING_QR') {
      statusClass = 'status-waiting'
      badgeHtml = `<span class="badge badge-waiting"><span class="badge-dot"></span> QR Code</span>`
      actionButtons = `
        <button class="btn btn-primary btn-sm" onclick="openQrModal('${session.sessionId}')">
          <span>📱 Escanear QR</span>
        </button>
        <button class="btn btn-danger-outline btn-sm" onclick="disconnectSession('${session.sessionId}')">
          <span>Parar</span>
        </button>
      `
    } else if (session.status === 'INITIALIZING') {
      badgeHtml = `<span class="badge badge-init"><span class="badge-dot"></span> Inicializando</span>`
      actionButtons = `
        <button class="btn btn-secondary btn-sm" onclick="openQrModal('${session.sessionId}')">
          <span>Ver QR Code</span>
        </button>
      `
    } else {
      badgeHtml = `<span class="badge badge-stopped"><span class="badge-dot"></span> Inativa</span>`
      actionButtons = `
        <button class="btn btn-primary btn-sm" onclick="startAndConnectSession('${session.sessionId}')">
          <span>⚡ Conectar</span>
        </button>
        <button class="btn btn-danger-outline btn-sm" onclick="deleteSessionFolderData('${session.sessionId}')">
          <span>🗑️ Excluir</span>
        </button>
      `
    }

    const numberDisplay = session.user && session.user.wid ? session.user.wid.replace('@c.us', '') : 'Não conectado'
    const nameDisplay = session.user && session.user.pushname ? session.user.pushname : 'Dispositivo'

    return `
      <div class="session-card ${statusClass}">
        <div>
          <div class="card-top">
            <div class="session-title-wrap">
              <div class="session-avatar">
                ${session.isConnected ? '🟢' : '💬'}
              </div>
              <div>
                <h3 class="session-name">${session.sessionId}</h3>
                <span class="session-sub">${nameDisplay}</span>
              </div>
            </div>
            ${badgeHtml}
          </div>

          <div class="card-details">
            <div class="detail-row">
              <span class="detail-label">WhatsApp:</span>
              <span class="detail-value">${numberDisplay}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Processo:</span>
              <span class="detail-value">${session.inMemory ? 'Em Memória' : 'Disco'}</span>
            </div>
          </div>
        </div>

        <div class="card-actions">
          ${actionButtons}
        </div>
      </div>
    `
  }).join('')
}

// Start Session and open QR code immediately
async function startAndConnectSession(sessionId) {
  showToast(`Iniciando instância ${sessionId}...`)
  try {
    const res = await apiRequest(`/session/start/${sessionId}`, { method: 'POST' })
    const json = await res.json()
    if (!json.success && json.message && !json.message.includes('already exists')) {
      showToast(`Erro ao iniciar: ${json.message}`)
      return
    }
    openQrModal(sessionId)
  } catch (err) {
    showToast('Falha ao iniciar sessão.')
  }
}

// Open QR Modal and start reactive polling
function openQrModal(sessionId) {
  currentQrSessionId = sessionId
  document.getElementById('qrModalSessionName').textContent = `Sessão: ${sessionId}`
  document.getElementById('qrModal').classList.remove('hidden')
  document.getElementById('qrImage').classList.add('hidden')
  document.getElementById('qrSpinner').classList.remove('hidden')
  document.getElementById('qrSuccessAlert').classList.add('hidden')
  document.getElementById('qrStatusText').textContent = 'Gerando QR Code...'

  if (qrPollingInterval) clearInterval(qrPollingInterval)

  // Fast polling for QR code and Status
  checkQrStatus(sessionId)
  qrPollingInterval = setInterval(() => checkQrStatus(sessionId), 2500)
}

async function checkQrStatus(sessionId) {
  if (currentQrSessionId !== sessionId) return

  try {
    // 1. Check if it got connected
    const statusRes = await apiRequest(`/session/status/${sessionId}`)
    const statusData = await statusRes.json()

    if (statusData.state === 'CONNECTED' || statusData.success === true) {
      clearInterval(qrPollingInterval)
      document.getElementById('qrSpinner').classList.add('hidden')
      document.getElementById('qrImage').classList.add('hidden')
      document.getElementById('qrSuccessAlert').classList.remove('hidden')
      document.getElementById('qrStatusText').textContent = 'Conectado com sucesso!'
      showToast(`WhatsApp conectado para ${sessionId}!`)
      setTimeout(() => {
        closeQrModal()
      }, 2000)
      return
    }

    // 2. Load QR Image with cache busting
    const qrRes = await apiRequest(`/session/qr/${sessionId}`)
    const qrData = await qrRes.json()

    if (qrData.success && qrData.qr) {
      const qrImg = document.getElementById('qrImage')
      qrImg.src = `/session/qr/${sessionId}/image?t=${Date.now()}`
      if (currentApiKey) {
        // Fetch via blob if apiKey needed for images
        fetchWithAuthImage(sessionId, qrImg)
      } else {
        qrImg.classList.remove('hidden')
        document.getElementById('qrSpinner').classList.add('hidden')
      }
      document.getElementById('qrStatusText').textContent = 'Aponte a câmera do WhatsApp para escanear'
    } else {
      document.getElementById('qrStatusText').textContent = 'Aguardando inicialização do navegador...'
    }
  } catch (err) {
    console.error('Error polling QR:', err)
  }
}

// Fetch QR Code Image with Auth headers
async function fetchWithAuthImage(sessionId, imgElement) {
  try {
    const res = await apiRequest(`/session/qr/${sessionId}/image?t=${Date.now()}`)
    if (res.ok) {
      const blob = await res.blob()
      imgElement.src = URL.createObjectURL(blob)
      imgElement.classList.remove('hidden')
      document.getElementById('qrSpinner').classList.add('hidden')
    }
  } catch (e) {
    console.error(e)
  }
}

// Disconnect Session (Logout)
async function disconnectSession(sessionId) {
  const confirmed = await showConfirmModal({
    title: 'Desconectar WhatsApp',
    message: `Deseja realmente desconectar e deslogar a sessão "${sessionId}"?`,
    isDanger: true,
    okText: 'Sim, Desconectar',
    icon: '🔌'
  })
  if (!confirmed) return

  showToast(`Desconectando ${sessionId}...`, 'info')
  try {
    const res = await apiRequest(`/session/terminate/${sessionId}`, { method: 'POST' })
    const json = await res.json()
    showToast(json.message || 'Sessão finalizada.', 'success')
    loadSessions()
  } catch (err) {
    showToast('Erro ao desconectar sessão.', 'error')
  }
}

// Restart Session
async function restartSession(sessionId) {
  showToast(`Reiniciando ${sessionId}...`, 'info')
  try {
    const res = await apiRequest(`/session/restart/${sessionId}`, { method: 'POST' })
    const json = await res.json()
    showToast(json.message || 'Sessão reiniciada.', 'success')
    loadSessions()
  } catch (err) {
    showToast('Erro ao reiniciar sessão.', 'error')
  }
}

// Delete residual session files
async function deleteSessionFolderData(sessionId) {
  const confirmed = await showConfirmModal({
    title: 'Excluir Arquivos da Sessão',
    message: `Excluir permanentemente os arquivos locais da sessão "${sessionId}"?`,
    isDanger: true,
    okText: 'Sim, Excluir',
    icon: '🗑️'
  })
  if (!confirmed) return

  showToast(`Excluindo ${sessionId}...`, 'info')
  try {
    const res = await apiRequest(`/session/terminate/${sessionId}`, { method: 'POST' })
    const json = await res.json()
    showToast(json.message || 'Sessão excluída.', 'success')
    loadSessions()
  } catch (err) {
    showToast('Erro ao excluir sessão.', 'error')
  }
}

// Terminate inactive sessions
async function terminateInactive() {
  const confirmed = await showConfirmModal({
    title: 'Limpar Instâncias Inativas',
    message: 'Deseja limpar e encerrar todas as sessões inativas ou com erro?',
    isDanger: true,
    okText: 'Limpar Inativas',
    icon: '🧹'
  })
  if (!confirmed) return

  showToast('Limpando instâncias inativas...', 'info')
  try {
    const res = await apiRequest('/session/terminateInactive', { method: 'POST' })
    const json = await res.json()
    showToast(json.message || 'Limpeza concluída.', 'success')
    loadSessions()
  } catch (err) {
    showToast('Erro ao limpar inativas.', 'error')
  }
}


/* ==========================================================================
   MODULE: CONTACT LISTS & BULK MESSAGING (BROADCAST)
   ========================================================================== */

const STORAGE_LISTS_KEY = 'wa_contact_lists'
const STORAGE_DRAFT_KEY = 'wa_broadcast_draft'
let contactLists = []
let broadcastEngine = {
  status: 'IDLE', // IDLE, RUNNING, PAUSED, STOPPED
  queue: [],
  currentIndex: 0,
  sentCount: 0,
  failedCount: 0,
  sessionId: '',
  messageTemplate: '',
  delayMin: 5,
  delayMax: 12
}

function initContactListsModule() {
  loadContactListsFromStorage()
  restoreDraftMessage()

  // Listener for dynamic contact count in modal
  const contactsInput = document.getElementById('listContactsInput')
  if (contactsInput) {
    contactsInput.addEventListener('input', () => {
      const parsed = parseContactsInput(contactsInput.value)
      const preview = document.getElementById('contactsCountPreview')
      if (preview) {
        preview.textContent = `${parsed.length} contatos detectados e válidos`
      }
    })
  }

  // Auto-save draft message and delays
  const messageInput = document.getElementById('broadcastMessageText')
  const minDelayInput = document.getElementById('delayMinInput')
  const maxDelayInput = document.getElementById('delayMaxInput')

  const saveDraft = () => {
    localStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify({
      message: messageInput.value,
      delayMin: minDelayInput.value,
      delayMax: maxDelayInput.value
    }))
  }

  if (messageInput) messageInput.addEventListener('input', saveDraft)
  if (minDelayInput) minDelayInput.addEventListener('change', saveDraft)
  if (maxDelayInput) maxDelayInput.addEventListener('change', saveDraft)
}

function restoreDraftMessage() {
  try {
    const raw = localStorage.getItem(STORAGE_DRAFT_KEY)
    if (raw) {
      const draft = JSON.parse(raw)
      if (draft.message) document.getElementById('broadcastMessageText').value = draft.message
      if (draft.delayMin) document.getElementById('delayMinInput').value = draft.delayMin
      if (draft.delayMax) document.getElementById('delayMaxInput').value = draft.delayMax
    }
  } catch (e) {
    console.error('Error restoring draft:', e)
  }
}

function loadContactListsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_LISTS_KEY)
    if (raw) {
      contactLists = JSON.parse(raw)
    } else {
      // Default example list for immediate testing
      contactLists = [
        {
          id: 'list_default_1',
          name: 'Clientes VIP (Exemplo)',
          sessionScope: '*', // Global
          createdAt: new Date().toISOString(),
          contacts: [
            { number: '5511999999999', name: 'Exemplo Cliente' }
          ]
        }
      ]
      saveContactListsToStorage()
    }
  } catch (e) {
    contactLists = []
  }
}

function saveContactListsToStorage() {
  localStorage.setItem(STORAGE_LISTS_KEY, JSON.stringify(contactLists))
  renderContactLists()
  refreshBroadcastSelects()
}

// Render Lists in the sidebar
function renderContactLists() {
  const container = document.getElementById('contactListsContainer')
  if (!container) return

  if (contactLists.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-dim); font-size: 0.85rem;">
        Nenhuma lista criada ainda.<br>
        Clique em <strong>+ Nova Lista</strong> acima.
      </div>
    `
    return
  }

  container.innerHTML = contactLists.map(list => {
    const scopeLabel = list.sessionScope === '*' ? '🌐 Global' : `📱 ${list.sessionScope}`
    const count = (list.contacts || []).length
    return `
      <div class="list-item-card">
        <div class="list-item-top">
          <span class="list-item-title">${escapeHtml(list.name)}</span>
          <span class="list-item-badge">${scopeLabel}</span>
        </div>
        <div class="list-item-meta">
          <span>👥 ${count} contatos</span>
          <span>${new Date(list.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="editContactList('${list.id}')" title="Editar lista">
            ✏️ Editar
          </button>
          <button class="btn btn-danger-outline btn-sm" onclick="deleteContactList('${list.id}')" title="Excluir lista">
            🗑️
          </button>
        </div>
      </div>
    `
  }).join('')
}

// Populate session selects in list modal and broadcast panel
function updateBroadcastSessionsSelect(sessions) {
  const broadcastSelect = document.getElementById('broadcastSessionSelect')
  const modalSessionSelect = document.getElementById('listSessionSelect')
  if (!broadcastSelect || !modalSessionSelect) return

  const currentBroadcastVal = broadcastSelect.value
  const currentModalVal = modalSessionSelect.value

  // Options for connected sessions
  const connected = sessions.filter(s => s.status === 'CONNECTED')
  
  // 1. Broadcast Session Select (Only connected sessions)
  let broadcastOpts = `<option value="">Selecione uma instância conectada (${connected.length} ativas)...</option>`
  connected.forEach(s => {
    broadcastOpts += `<option value="${s.sessionId}">${s.sessionId} (${s.user?.wid ? s.user.wid.replace('@c.us', '') : 'Conectada'})</option>`
  })
  broadcastSelect.innerHTML = broadcastOpts
  if (currentBroadcastVal) broadcastSelect.value = currentBroadcastVal

  // 2. Modal Scope Session Select (Global + All available sessions)
  let modalOpts = `<option value="*">🌐 Global (Disponível em qualquer instância)</option>`
  sessions.forEach(s => {
    modalOpts += `<option value="${s.sessionId}">📱 Instância: ${s.sessionId}</option>`
  })
  modalSessionSelect.innerHTML = modalOpts
  if (currentModalVal) modalSessionSelect.value = currentModalVal
}

function refreshBroadcastSelects() {
  const listSelect = document.getElementById('broadcastListSelect')
  if (!listSelect) return
  const currentVal = listSelect.value
  const selectedSession = document.getElementById('broadcastSessionSelect')?.value || ''

  let opts = `<option value="">Selecione uma lista de destinatários (${contactLists.length} disponíveis)...</option>`
  
  contactLists.forEach(list => {
    // Filter by session scope if specified, otherwise show if global or matched
    const isAvailable = list.sessionScope === '*' || !selectedSession || list.sessionScope === selectedSession
    const scopeTag = list.sessionScope === '*' ? '[Global]' : `[${list.sessionScope}]`
    const disabledAttr = !isAvailable ? 'disabled' : ''
    opts += `<option value="${list.id}" ${disabledAttr}>${scopeTag} ${escapeHtml(list.name)} (${list.contacts.length} contatos)</option>`
  })

  listSelect.innerHTML = opts
  if (currentVal) listSelect.value = currentVal
  updateSelectedListBanner()
}

function onBroadcastSessionChanged() {
  refreshBroadcastSelects()
}

function onBroadcastListChanged() {
  updateSelectedListBanner()
}

function updateSelectedListBanner() {
  const listId = document.getElementById('broadcastListSelect')?.value
  const banner = document.getElementById('selectedListBanner')
  const infoText = document.getElementById('selectedListInfoText')
  if (!banner || !infoText) return

  if (!listId) {
    banner.classList.add('hidden')
    return
  }

  const list = contactLists.find(l => l.id === listId)
  if (!list) {
    banner.classList.add('hidden')
    return
  }

  infoText.textContent = `🎯 Lista "${list.name}": ${list.contacts.length} contatos carregados prontos para receber o disparo.`
  banner.classList.remove('hidden')
}

// Contacts Parser (Handles raw numbers, CSV, name + phone)
function parseContactsInput(text) {
  if (!text) return []
  const lines = text.split(/\r?\n/)
  const result = []
  const seenNumbers = new Set()

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    let name = ''
    let phoneRaw = ''

    if (line.includes(',') || line.includes(';')) {
      const parts = line.split(/[,;]/).map(p => p.trim())
      // Check which part has more digits
      const digits0 = parts[0].replace(/\D/g, '')
      const digits1 = parts[1] ? parts[1].replace(/\D/g, '') : ''

      if (digits0.length >= 10 && digits0.length > digits1.length) {
        phoneRaw = digits0
        name = parts[1] || ''
      } else {
        phoneRaw = digits1
        name = parts[0] || ''
      }
    } else {
      phoneRaw = line.replace(/\D/g, '')
    }

    // Minimum valid phone length check (e.g. 10 digits for local area + number)
    if (phoneRaw.length >= 10) {
      // Default to adding country code 55 (Brazil) if exactly 10 or 11 digits
      if (phoneRaw.length === 10 || phoneRaw.length === 11) {
        phoneRaw = '55' + phoneRaw
      }

      if (!seenNumbers.has(phoneRaw)) {
        seenNumbers.add(phoneRaw)
        result.push({
          number: phoneRaw,
          name: name.replace(/[<>"']/g, '').trim()
        })
      }
    }
  }

  return result
}

// Modal: Open Create / Edit List
function openCreateListModal() {
  document.getElementById('manageListModalTitle').textContent = 'Nova Lista de Contatos'
  document.getElementById('editListId').value = ''
  document.getElementById('listNameInput').value = ''
  document.getElementById('listContactsInput').value = ''
  document.getElementById('listSessionSelect').value = '*'
  document.getElementById('contactsCountPreview').textContent = '0 contatos detectados'
  document.getElementById('manageListModal').classList.remove('hidden')
  document.getElementById('listNameInput').focus()
}

function editContactList(id) {
  const list = contactLists.find(l => l.id === id)
  if (!list) return

  document.getElementById('manageListModalTitle').textContent = 'Editar Lista de Contatos'
  document.getElementById('editListId').value = list.id
  document.getElementById('listNameInput').value = list.name
  document.getElementById('listSessionSelect').value = list.sessionScope || '*'

  const formattedLines = (list.contacts || []).map(c => c.name ? `${c.number}, ${c.name}` : c.number).join('\n')
  document.getElementById('listContactsInput').value = formattedLines
  document.getElementById('contactsCountPreview').textContent = `${list.contacts.length} contatos detectados e válidos`

  document.getElementById('manageListModal').classList.remove('hidden')
}

function saveContactList() {
  const editId = document.getElementById('editListId').value
  const name = document.getElementById('listNameInput').value.trim()
  const sessionScope = document.getElementById('listSessionSelect').value
  const contactsRaw = document.getElementById('listContactsInput').value
  const contacts = parseContactsInput(contactsRaw)

  if (!name) {
    showToast('Informe o nome da lista.')
    return
  }

  if (contacts.length === 0) {
    showToast('Adicione ao menos um número de contato válido.')
    return
  }

  if (editId) {
    const idx = contactLists.findIndex(l => l.id === editId)
    if (idx !== -1) {
      contactLists[idx].name = name
      contactLists[idx].sessionScope = sessionScope
      contactLists[idx].contacts = contacts
      contactLists[idx].updatedAt = new Date().toISOString()
      showToast('Lista atualizada com sucesso!')
    }
  } else {
    const newList = {
      id: 'list_' + Date.now(),
      name,
      sessionScope,
      contacts,
      createdAt: new Date().toISOString()
    }
    contactLists.unshift(newList)
    showToast(`Lista "${name}" criada com ${contacts.length} contatos!`)
  }

  saveContactListsToStorage()
  closeModal('manageListModal')
}

async function deleteContactList(id) {
  const list = contactLists.find(l => l.id === id)
  if (!list) return
  
  const confirmed = await showConfirmModal({
    title: 'Excluir Lista de Contatos',
    message: `Deseja realmente excluir permanentemente a lista "${list.name}" com ${list.contacts.length} contatos?`,
    isDanger: true,
    okText: 'Sim, Excluir',
    icon: '🗑️'
  })
  if (!confirmed) return

  contactLists = contactLists.filter(l => l.id !== id)
  saveContactListsToStorage()
  showToast('Lista excluída com sucesso.', 'info')
}


// Backup Export / Import
function exportListsBackup() {
  if (contactLists.length === 0) {
    showToast('Nenhuma lista para exportar.')
    return
  }
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(contactLists, null, 2))
  const dlAnchorElem = document.createElement('a')
  dlAnchorElem.setAttribute('href', dataStr)
  dlAnchorElem.setAttribute('download', `whatsapp_listas_backup_${Date.now()}.json`)
  dlAnchorElem.click()
  showToast('Backup exportado com sucesso!')
}

function importListsBackup(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result)
      if (Array.isArray(imported)) {
        contactLists = imported
        saveContactListsToStorage()
        showToast(`${imported.length} listas importadas com sucesso!`)
      } else {
        showToast('Formato de arquivo JSON inválido.')
      }
    } catch (err) {
      showToast('Erro ao ler arquivo JSON de backup.')
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

// Tag insertion helpers
function insertTag(tag) {
  const textarea = document.getElementById('broadcastMessageText')
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = textarea.value
  textarea.value = text.substring(0, start) + tag + text.substring(end)
  textarea.focus()
  textarea.selectionStart = textarea.selectionEnd = start + tag.length
}

// Spintax Resolver: replaces {Olá|Oi|E aí} with a random option
function resolveSpintax(text) {
  const spintaxRegex = /\{([^{}]+)\}/g
  return text.replace(spintaxRegex, (match, choices) => {
    // Avoid replacing {nome} and {numero} tags
    if (choices.toLowerCase() === 'nome' || choices.toLowerCase() === 'numero') {
      return match
    }
    const options = choices.split('|')
    return options[Math.floor(Math.random() * options.length)]
  })
}

// Personalize message for a specific contact
function personalizeMessage(template, contact) {
  let text = resolveSpintax(template)
  const nameToUse = contact.name || 'Amigo(a)'
  text = text.replace(/\{nome\}/gi, nameToUse)
  text = text.replace(/\{numero\}/gi, contact.number)
  return text
}

// ==========================================================================
// SERVER BROADCAST & SCHEDULE CONTROLLER
// ==========================================================================

let serverCampaigns = []
let activeCampaignPolling = null

async function submitBroadcastCampaign() {
  const name = document.getElementById('campaignNameInput').value.trim()
  const sessionId = document.getElementById('broadcastSessionSelect').value
  const listId = document.getElementById('broadcastListSelect').value
  const template = document.getElementById('broadcastMessageText').value.trim()
  const delayMin = Math.max(2, parseInt(document.getElementById('delayMinInput').value) || 5)
  const delayMax = Math.max(delayMin, parseInt(document.getElementById('delayMaxInput').value) || 12)
  const scheduleInput = document.getElementById('scheduleDateTimeInput').value

  if (!name) {
    showToast('Informe um nome para identificar a campanha.')
    return
  }

  if (!sessionId) {
    showToast('Selecione uma instância remetente conectada.')
    return
  }

  if (!listId) {
    showToast('Selecione uma lista de contatos destinatários.')
    return
  }

  if (!template) {
    showToast('Digite a mensagem a ser enviada.')
    return
  }

  const list = contactLists.find(l => l.id === listId)
  if (!list || list.contacts.length === 0) {
    showToast('A lista selecionada não possui contatos válidos.')
    return
  }

  let scheduledFor = null
  if (scheduleInput) {
    const schedDate = new Date(scheduleInput)
    if (schedDate.getTime() <= Date.now()) {
      showToast('A data de agendamento deve ser no futuro.')
      return
    }
    scheduledFor = schedDate.toISOString()
  }

  const confirmed = await showConfirmModal({
    title: scheduledFor ? 'Agendar Disparo' : 'Iniciar Disparo em Segundo Plano',
    message: scheduledFor
      ? `Agendar campanha "${name}" com ${list.contacts.length} contatos para ${new Date(scheduledFor).toLocaleString('pt-BR')} na instância "${sessionId}"?`
      : `Iniciar disparo em segundo plano da campanha "${name}" para ${list.contacts.length} contatos na instância "${sessionId}"?\n\nVocê poderá fechar a página ou navegar livremente, o servidor continuará enviando!`,
    isDanger: false,
    okText: scheduledFor ? 'Sim, Agendar' : 'Sim, Iniciar Disparo',
    icon: scheduledFor ? '⏰' : '🚀'
  })

  if (!confirmed) return


  try {
    showToast('Enviando campanha para o servidor...')
    const res = await apiRequest('/broadcast/create', {
      method: 'POST',
      body: JSON.stringify({
        name,
        sessionId,
        contacts: list.contacts,
        message: template,
        delayMin,
        delayMax,
        scheduledFor
      })
    })

    const json = await res.json()
    if (!res.ok || !json.success) {
      showToast(json.message || 'Erro ao criar campanha no servidor.')
      return
    }

    showToast(json.message || 'Campanha salva no servidor!')
    document.getElementById('campaignNameInput').value = ''
    document.getElementById('scheduleDateTimeInput').value = ''
    
    // Atualizar tabela e focar na campanha criada
    await fetchServerCampaigns()
    if (json.campaign) {
      viewCampaignLogs(json.campaign.id)
    }
  } catch (err) {
    showToast('Erro de comunicação com o servidor.')
  }
}

// Buscar campanhas do servidor
async function fetchServerCampaigns() {
  try {
    const res = await apiRequest('/broadcast/list')
    const json = await res.json()
    serverCampaigns = json.data || []
    renderServerCampaignsTable(serverCampaigns)
  } catch (err) {
    console.error('Error fetching campaigns:', err)
  }
}

// Renderizar tabela de campanhas
function renderServerCampaignsTable(campaigns) {
  const container = document.getElementById('serverCampaignsTableContainer')
  if (!container) return

  if (campaigns.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-dim);">
        Nenhuma campanha em segundo plano ou agendada ainda.
      </div>
    `
    return
  }

  container.innerHTML = `
    <table class="campaigns-table">
      <thead>
        <tr>
          <th>Campanha</th>
          <th>Instância</th>
          <th>Progresso</th>
          <th>Status</th>
          <th>Criada / Agendada</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${campaigns.map(c => {
          const percent = c.totalCount > 0 ? Math.round(((c.sentCount + c.failedCount) / c.totalCount) * 100) : 0
          
          let statusBadge = ''
          if (c.status === 'RUNNING') {
            statusBadge = `<span class="badge badge-connected"><span class="badge-dot"></span> Enviando</span>`
          } else if (c.status === 'SCHEDULED') {
            statusBadge = `<span class="badge badge-scheduled">⏰ Agendada</span>`
          } else if (c.status === 'PAUSED') {
            statusBadge = `<span class="badge badge-waiting">⏸️ Pausada</span>`
          } else if (c.status === 'COMPLETED') {
            statusBadge = `<span class="badge badge-connected">✓ Concluída</span>`
          } else {
            statusBadge = `<span class="badge badge-stopped">Parada</span>`
          }

          let dateInfo = new Date(c.createdAt).toLocaleDateString('pt-BR')
          if (c.scheduledFor) {
            dateInfo = `<span title="Agendada para" style="color: #fbbf24;">📅 ${new Date(c.scheduledFor).toLocaleString('pt-BR')}</span>`
          }

          let actionBtns = `
            <button class="btn btn-secondary btn-sm" onclick="viewCampaignLogs('${c.id}')" title="Ver Progresso e Logs">
              👁️ Logs
            </button>
          `

          if (c.status === 'RUNNING') {
            actionBtns += `
              <button class="btn btn-secondary btn-sm" onclick="pauseServerCampaign('${c.id}')" title="Pausar">
                ⏸️
              </button>
              <button class="btn btn-danger-outline btn-sm" onclick="cancelServerCampaign('${c.id}')" title="Interromper">
                🛑
              </button>
            `
          } else if (c.status === 'PAUSED') {
            actionBtns += `
              <button class="btn btn-primary btn-sm" onclick="resumeServerCampaign('${c.id}')" title="Retomar">
                ▶️
              </button>
              <button class="btn btn-danger-outline btn-sm" onclick="cancelServerCampaign('${c.id}')" title="Cancelar">
                🛑
              </button>
            `
          } else if (c.status === 'SCHEDULED') {
            actionBtns += `
              <button class="btn btn-danger-outline btn-sm" onclick="cancelServerCampaign('${c.id}')" title="Cancelar Agendamento">
                🛑 Cancelar
              </button>
            `
          } else {
            actionBtns += `
              <button class="btn btn-danger-outline btn-sm" onclick="deleteServerCampaign('${c.id}')" title="Excluir do Histórico">
                🗑️
              </button>
            `
          }

          return `
            <tr>
              <td>
                <strong style="color: #fff;">${escapeHtml(c.name)}</strong>
              </td>
              <td>
                <span style="color: var(--wa-green); font-weight: 600;">📱 ${c.sessionId}</span>
              </td>
              <td>
                <div>${c.sentCount}/${c.totalCount} (${percent}%)</div>
                <div class="campaign-mini-bar">
                  <div class="campaign-mini-fill" style="width: ${percent}%;"></div>
                </div>
              </td>
              <td>${statusBadge}</td>
              <td>${dateInfo}</td>
              <td>
                <div style="display: flex; gap: 0.35rem;">
                  ${actionBtns}
                </div>
              </td>
            </tr>
          `
        }).join('')}
      </tbody>
    </table>
  `
}

// Ações nas campanhas do servidor
async function pauseServerCampaign(id) {
  try {
    const res = await apiRequest(`/broadcast/pause/${id}`, { method: 'POST' })
    const json = await res.json()
    showToast(json.message || 'Campanha pausada.')
    fetchServerCampaigns()
  } catch (err) {
    showToast('Erro ao pausar campanha.')
  }
}

async function resumeServerCampaign(id) {
  try {
    const res = await apiRequest(`/broadcast/resume/${id}`, { method: 'POST' })
    const json = await res.json()
    showToast(json.message || 'Campanha retomada.')
    fetchServerCampaigns()
  } catch (err) {
    showToast('Erro ao retomar campanha.')
  }
}

async function cancelServerCampaign(id) {
  const confirmed = await showConfirmModal({
    title: 'Cancelar Campanha',
    message: 'Deseja realmente interromper e cancelar os disparos desta campanha?',
    isDanger: true,
    okText: 'Sim, Cancelar',
    icon: '🛑'
  })
  if (!confirmed) return

  try {
    const res = await apiRequest(`/broadcast/cancel/${id}`, { method: 'POST' })
    const json = await res.json()
    showToast(json.message || 'Campanha cancelada.', 'info')
    fetchServerCampaigns()
  } catch (err) {
    showToast('Erro ao cancelar campanha.', 'error')
  }
}

async function deleteServerCampaign(id) {
  const confirmed = await showConfirmModal({
    title: 'Excluir Campanha',
    message: 'Excluir esta campanha permanentemente do histórico de disparos?',
    isDanger: true,
    okText: 'Sim, Excluir',
    icon: '🗑️'
  })
  if (!confirmed) return

  try {
    const res = await apiRequest(`/broadcast/${id}`, { method: 'DELETE' })
    const json = await res.json()
    showToast(json.message || 'Campanha excluída.', 'info')
    fetchServerCampaigns()
  } catch (err) {
    showToast('Erro ao excluir campanha.', 'error')
  }
}


// Visualizar logs ao vivo da campanha selecionada
async function viewCampaignLogs(id) {
  const progressBox = document.getElementById('broadcastProgressSection')
  progressBox.classList.remove('hidden')
  progressBox.scrollIntoView({ behavior: 'smooth' })

  if (activeCampaignPolling) {
    clearInterval(activeCampaignPolling)
  }

  const updateLogs = async () => {
    try {
      const res = await apiRequest(`/broadcast/${id}`)
      if (!res.ok) return
      const json = await res.json()
      const c = json.campaign
      if (!c) return

      document.getElementById('liveLogTitle').textContent = `Logs ao Vivo: ${c.name} (${c.sessionId})`
      document.getElementById('progTotalCount').textContent = c.totalCount
      document.getElementById('progSentCount').textContent = c.sentCount
      document.getElementById('progFailedCount').textContent = c.failedCount
      document.getElementById('progRemainingCount').textContent = Math.max(0, c.totalCount - (c.sentCount + c.failedCount))
      
      const percent = c.totalCount > 0 ? Math.round(((c.sentCount + c.failedCount) / c.totalCount) * 100) : 0
      document.getElementById('progressBarFill').style.width = `${percent}%`

      // Badge
      const badge = document.getElementById('campaignStatusBadge')
      badge.textContent = c.status === 'RUNNING' ? 'Enviando...' : (c.status === 'SCHEDULED' ? 'Agendada' : c.status)
      badge.className = c.status === 'RUNNING' ? 'badge badge-connected' : (c.status === 'SCHEDULED' ? 'badge badge-scheduled' : 'badge badge-stopped')

      // Logs
      const logsContainer = document.getElementById('broadcastLogs')
      logsContainer.innerHTML = (c.logs || []).map(l => {
        const timeStr = new Date(l.time).toLocaleTimeString('pt-BR')
        return `<div class="log-line ${l.type}">[${timeStr}] ${escapeHtml(l.message)}</div>`
      }).join('')
      logsContainer.scrollTop = logsContainer.scrollHeight

      // Se terminou ou foi cancelada, pode desacelerar o polling
      if (c.status !== 'RUNNING' && c.status !== 'SCHEDULED') {
        fetchServerCampaigns()
      }
    } catch (e) {
      console.error(e)
    }
  }

  await updateLogs()
  activeCampaignPolling = setInterval(updateLogs, 4000)
}

function clearBroadcastLogs() {
  const logsContainer = document.getElementById('broadcastLogs')
  if (logsContainer) {
    logsContainer.innerHTML = '<div class="log-line">Painel pronto. Selecione uma campanha para inspecionar.</div>'
  }
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function escapeHtml(text) {
  if (!text) return ''
  return text.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]
  })
}

/* ==========================================================================
   MODULE: TYPEBOT FLOW CONTROLLER
   ========================================================================== */

let currentTypebotConfig = null
let currentTypebotSessionId = ''

async function initTypebotTab() {
  populateTypebotSessionSelect()
  if (currentTypebotSessionId) {
    await loadTypebotFlowForSession(currentTypebotSessionId)
  }
}

function populateTypebotSessionSelect() {
  const select = document.getElementById('typebotSessionSelect')
  if (!select) return

  const prevVal = select.value || currentTypebotSessionId
  if (cachedSessions.length === 0) {
    select.innerHTML = '<option value="">Nenhuma instância detectada...</option>'
    return
  }

  select.innerHTML = cachedSessions.map(s => {
    const statusTag = s.isConnected ? '🟢 Conectado' : '⚪ Inativo'
    return `<option value="${s.sessionId}">${s.sessionId} (${statusTag})</option>`
  }).join('')

  if (prevVal && cachedSessions.some(s => s.sessionId === prevVal)) {
    select.value = prevVal
    currentTypebotSessionId = prevVal
  } else if (cachedSessions.length > 0) {
    select.value = cachedSessions[0].sessionId
    currentTypebotSessionId = cachedSessions[0].sessionId
  }
}

async function loadTypebotFlowForSelectedSession() {
  const select = document.getElementById('typebotSessionSelect')
  if (!select) return
  currentTypebotSessionId = select.value
  if (currentTypebotSessionId) {
    await loadTypebotFlowForSession(currentTypebotSessionId)
  }
}

async function loadTypebotFlowForSession(sessionId) {
  try {
    showToast(`Carregando fluxo da instância "${sessionId}"...`, 'info', 1200)
    const res = await apiRequest(`/typebot/${sessionId}`)
    const json = await res.json()
    if (!res.ok || !json.success) {
      showToast('Erro ao carregar fluxo do typebot.', 'error')
      return
    }

    currentTypebotConfig = json.flow
    renderTypebotConfigToForm(currentTypebotConfig)
  } catch (err) {
    console.error('Error fetching typebot config:', err)
  }
}

function renderTypebotConfigToForm(flow) {
  if (!flow) return

  document.getElementById('typebotEnabledToggle').checked = !!flow.enabled
  document.getElementById('typebotIgnoreGroupsCheckbox').checked = flow.ignoreGroups !== false
  document.getElementById('typebotResetKeyword').value = flow.resetKeyword || 'menu'
  document.getElementById('typebotTimeoutMinutes').value = flow.sessionTimeoutMinutes || 30
  document.getElementById('typebotHandoverMinutes').value = flow.handoverTimeoutMinutes || 60
  document.getElementById('typebotInvalidMessage').value = flow.invalidOptionMessage || 'Opção inválida! Por favor, escolha uma das opções abaixo:'

  // Configurações Humanizadas / Anti-ban
  const simTypingCheckbox = document.getElementById('typebotSimulateTypingCheckbox')
  if (simTypingCheckbox) {
    simTypingCheckbox.checked = flow.simulateTyping !== false
  }
  const typingDelayInput = document.getElementById('typebotTypingDelaySeconds')
  if (typingDelayInput) {
    typingDelayInput.value = flow.typingDelaySeconds !== undefined ? flow.typingDelaySeconds : 2
  }

  // Configuração do Lembrete de Inatividade
  const reminderCheckbox = document.getElementById('typebotReminderEnabledCheckbox')
  if (reminderCheckbox) {
    reminderCheckbox.checked = !!flow.reminderEnabled
    document.getElementById('typebotReminderMinutes').value = flow.reminderTimeoutMinutes || 5
    document.getElementById('typebotReminderMessage').value = flow.reminderMessage || 'Ainda está por aí, {nome}? Digite uma opção para prosseguir ou 0 para o menu principal:'
    toggleReminderFields()
  }

  renderTypebotStepsGrid(flow.steps || [])
  renderTypebotLogs(flow.logs || [])
}

function toggleReminderFields() {
  const isChecked = document.getElementById('typebotReminderEnabledCheckbox').checked
  const fields = document.getElementById('typebotReminderFields')
  if (isChecked) {
    fields.classList.remove('hidden')
  } else {
    fields.classList.add('hidden')
  }
}


function onTypebotToggleChange() {
  const isChecked = document.getElementById('typebotEnabledToggle').checked
  if (isChecked) {
    showToast(`Chatbot ativado para "${currentTypebotSessionId}"! Lembre-se de salvar.`, 'success', 2500)
  } else {
    showToast(`Chatbot desativado para "${currentTypebotSessionId}".`, 'info', 2000)
  }
}

function renderTypebotStepsGrid(steps) {
  const container = document.getElementById('typebotStepsContainer')
  const countSpan = document.getElementById('typebotStepsCount')
  if (!container) return

  countSpan.textContent = steps ? steps.length : 0

  if (!steps || steps.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; background: rgba(0,0,0,0.2); border-radius: var(--radius-md); border: 1px dashed var(--border-color); color: var(--text-dim);">
        Nenhuma etapa cadastrada no fluxo.<br>
        Clique no botão <strong>+ Nova Etapa</strong> acima para iniciar seu atendimento estilo Typebot.
      </div>
    `
    return
  }

  const stepStats = currentTypebotConfig?.stats?.steps || {}

  container.innerHTML = steps.map((step, idx) => {
    const isInitial = !!step.isInitial || step.id === 'start'
    const isHandover = !!step.isHandover
    const countHits = stepStats[step.id] || 0

    let badge = ''
    if (isInitial) {
      badge = '<span class="step-badge-initial">Menu Principal</span>'
    } else if (isHandover) {
      badge = '<span class="step-badge-handover">Atendente Humano</span>'
    }

    const optionsHtml = (step.options || []).map(opt => `
      <div class="step-opt-item">
        <span class="step-opt-key">${escapeHtml(opt.key)}</span>
        <span class="step-opt-label">${escapeHtml(opt.label)}</span>
        <span class="step-opt-target">➔ ${escapeHtml(opt.nextStepId)}</span>
      </div>
    `).join('')

    const mediaBadge = step.mediaUrl ? `<span class="step-media-pill" title="Envia mídia por URL">📷 Mídia</span>` : ''
    const statsBadge = `<span class="step-stats-pill" title="Vezes que este passo foi disparado">👁️ ${countHits} acessos</span>`

    return `
      <div class="typebot-step-card ${isInitial ? 'is-initial' : ''} ${isHandover ? 'is-handover' : ''}">
        <div class="step-card-header">
          <div>
            <div class="step-card-title">
              <span>${escapeHtml(step.title || `Etapa #${idx + 1}`)}</span>
              <span class="step-id-tag">#${escapeHtml(step.id)}</span>
            </div>
            <div style="display:flex; gap:0.4rem; margin-top: 0.35rem;">
              ${statsBadge}
              ${mediaBadge}
            </div>
          </div>
          <div>${badge}</div>
        </div>

        <div class="step-message-box">
          ${step.mediaUrl ? `<div style="font-size: 0.72rem; color: #a855f7; margin-bottom: 0.35rem; font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📎 ${escapeHtml(step.mediaUrl)}</div>` : ''}
          ${escapeHtml(step.message || '')}
        </div>

        <div class="step-options-label">
          ${(step.options && step.options.length > 0) ? `Opções de Escolha (${step.options.length}):` : 'Fim do Fluxo / Sem Opções'}
        </div>

        <div class="step-options-list">
          ${optionsHtml || '<span style="font-size: 0.75rem; color: var(--text-dim); font-style: italic;">Nenhuma opção (etapa final de resposta)</span>'}
        </div>

        <div class="step-card-actions">
          ${!isInitial ? `<button class="btn btn-secondary btn-sm" onclick="setTypebotStepAsInitial('${step.id}')" title="Tornar etapa inicial">⭐ Inicial</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="editTypebotStep('${step.id}')" title="Editar etapa">✏️ Editar</button>
          ${!isInitial ? `<button class="btn btn-danger-outline btn-sm" onclick="deleteTypebotStep('${step.id}')" title="Excluir etapa">🗑️</button>` : ''}
        </div>
      </div>
    `
  }).join('')
}

function renderTypebotLogs(logs) {
  const container = document.getElementById('typebotInteractionLogs')
  if (!container) return

  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="log-line">Nenhuma interação registrada recentemente.</div>'
    return
  }

  container.innerHTML = logs.map(l => {
    const timeStr = new Date(l.time).toLocaleTimeString('pt-BR')
    const handoverTag = l.isHandover ? ' <span style="color:#fbbf24">[Humano]</span>' : ''
    return `
      <div class="log-line success">
        [${timeStr}] <strong>${escapeHtml(l.from)}</strong> ${l.contactName ? `(${escapeHtml(l.contactName)})` : ''}: digitou "<em>${escapeHtml(l.input)}</em>" ➔ Avançou para <strong>[${escapeHtml(l.stepTitle)}]</strong> (${escapeHtml(l.stepId)})${handoverTag}
      </div>
    `
  }).join('')
}

function clearTypebotLogsView() {
  const container = document.getElementById('typebotInteractionLogs')
  if (container) {
    container.innerHTML = '<div class="log-line">Visualização de logs limpa.</div>'
  }
}

// Salvar todas as configurações do Typebot no servidor
async function saveCurrentTypebotFlow() {
  if (!currentTypebotSessionId) {
    showToast('Selecione uma instância antes de salvar.', 'warning')
    return
  }

  const enabled = document.getElementById('typebotEnabledToggle').checked
  const ignoreGroups = document.getElementById('typebotIgnoreGroupsCheckbox').checked
  const resetKeyword = document.getElementById('typebotResetKeyword').value.trim() || 'menu'
  const sessionTimeoutMinutes = parseInt(document.getElementById('typebotTimeoutMinutes').value) || 30
  const handoverTimeoutMinutes = parseInt(document.getElementById('typebotHandoverMinutes').value) || 60
  const invalidOptionMessage = document.getElementById('typebotInvalidMessage').value.trim()

  const simulateTyping = document.getElementById('typebotSimulateTypingCheckbox')?.checked !== false
  const typingDelaySeconds = parseInt(document.getElementById('typebotTypingDelaySeconds')?.value) || 2

  const reminderEnabled = document.getElementById('typebotReminderEnabledCheckbox')?.checked || false
  const reminderTimeoutMinutes = parseInt(document.getElementById('typebotReminderMinutes')?.value) || 5
  const reminderMessage = document.getElementById('typebotReminderMessage')?.value.trim() || 'Ainda está por aí, {nome}? Digite uma opção para prosseguir ou 0 para o menu principal:'

  const payload = {
    ...(currentTypebotConfig || {}),
    enabled,
    ignoreGroups,
    resetKeyword,
    sessionTimeoutMinutes,
    handoverTimeoutMinutes,
    invalidOptionMessage,
    simulateTyping,
    typingDelaySeconds,
    reminderEnabled,
    reminderTimeoutMinutes,
    reminderMessage,
    steps: currentTypebotConfig?.steps || []
  }

  try {
    showToast('Salvando fluxo do Chatbot...', 'info')
    const res = await apiRequest(`/typebot/${currentTypebotSessionId}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    const json = await res.json()
    if (!res.ok || !json.success) {
      showToast(json.message || 'Erro ao salvar fluxo.', 'error')
      return
    }

    currentTypebotConfig = json.flow
    showToast('Fluxo salvo com sucesso!', 'success')
  } catch (e) {
    showToast('Erro de comunicação com o servidor.', 'error')
  }
}

// Resetar estados de conversas (para testes imediatos)
async function resetTypebotStates() {
  if (!currentTypebotSessionId) {
    showToast('Selecione uma instância.', 'warning')
    return
  }

  const confirmed = await showConfirmModal({
    title: 'Limpar Estados de Conversa',
    message: 'Deseja reiniciar a posição de todos os contatos no fluxo para que possam testar o início novamente?',
    okText: 'Sim, Reiniciar',
    icon: '🔄'
  })
  if (!confirmed) return

  try {
    const res = await apiRequest(`/typebot/${currentTypebotSessionId}/reset-state`, { method: 'POST' })
    const json = await res.json()
    if (res.ok && json.success) {
      showToast('Estados reiniciados! Qualquer mensagem agora começará do início.', 'success')
    }
  } catch (e) {
    showToast('Erro ao reiniciar estados.', 'error')
  }
}

// Tornar etapa como Inicial
async function setTypebotStepAsInitial(stepId) {
  if (!currentTypebotConfig || !currentTypebotConfig.steps) return
  currentTypebotConfig.steps.forEach(s => {
    s.isInitial = (s.id === stepId)
  })
  renderTypebotStepsGrid(currentTypebotConfig.steps)
  showToast(`Etapa #${stepId} definida como inicial! Salve as alterações.`, 'info')
}

// Modal: Adicionar / Editar Etapa
function openAddTypebotStepModal() {
  document.getElementById('typebotStepModalTitle').textContent = 'Nova Etapa do Fluxo'
  document.getElementById('editStepId').value = ''
  document.getElementById('stepTitleInput').value = ''
  document.getElementById('stepIdentifierInput').value = 'step_' + Date.now().toString().slice(-4)
  document.getElementById('stepMessageInput').value = ''
  document.getElementById('stepMediaUrlInput').value = ''
  document.getElementById('stepIsHandoverCheckbox').checked = false
  toggleHandoverNotice()

  // Limpar lista de opções e adicionar 2 linhas padrão
  const optionsList = document.getElementById('stepOptionsModalList')
  optionsList.innerHTML = ''
  addOptionRowToStepModal('1', 'Opção 1', 'start')
  addOptionRowToStepModal('0', 'Voltar ao Início', 'start')

  document.getElementById('typebotStepModal').classList.remove('hidden')
  document.getElementById('stepTitleInput').focus()
}

function editTypebotStep(stepId) {
  if (!currentTypebotConfig || !currentTypebotConfig.steps) return
  const step = currentTypebotConfig.steps.find(s => s.id === stepId)
  if (!step) return

  document.getElementById('typebotStepModalTitle').textContent = `Editar Etapa: ${step.title}`
  document.getElementById('editStepId').value = step.id
  document.getElementById('stepTitleInput').value = step.title || ''
  document.getElementById('stepIdentifierInput').value = step.id
  document.getElementById('stepMessageInput').value = step.message || ''
  document.getElementById('stepMediaUrlInput').value = step.mediaUrl || ''
  document.getElementById('stepIsHandoverCheckbox').checked = !!step.isHandover
  toggleHandoverNotice()

  const optionsList = document.getElementById('stepOptionsModalList')
  optionsList.innerHTML = ''
  if (step.options && step.options.length > 0) {
    step.options.forEach(opt => {
      addOptionRowToStepModal(opt.key, opt.label, opt.nextStepId)
    })
  }

  document.getElementById('typebotStepModal').classList.remove('hidden')
}

function toggleHandoverNotice() {
  const isChecked = document.getElementById('stepIsHandoverCheckbox').checked
  const notice = document.getElementById('handoverNotice')
  if (isChecked) {
    notice.classList.remove('hidden')
  } else {
    notice.classList.add('hidden')
  }
}

function addOptionRowToStepModal(key = '', label = '', nextStepId = '') {
  const container = document.getElementById('stepOptionsModalList')
  if (!container) return

  // Gerar opções de etapas existentes para o select de destino
  const existingSteps = currentTypebotConfig?.steps || []
  let selectOptionsHtml = '<option value="start">start (Menu Principal)</option>'
  existingSteps.forEach(s => {
    if (s.id !== 'start') {
      selectOptionsHtml += `<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)} (${escapeHtml(s.id)})</option>`
    }
  })

  const row = document.createElement('div')
  row.className = 'option-edit-row'
  row.innerHTML = `
    <input type="text" class="form-input option-edit-key" placeholder="Tecla" value="${escapeHtml(key || '')}" required title="Ex: 1, 2, 3">
    <input type="text" class="form-input option-edit-label" placeholder="Texto da opção (ex: Ver Preços)" value="${escapeHtml(label || '')}" required>
    <select class="form-select option-edit-target" title="Próxima etapa">
      ${selectOptionsHtml}
    </select>
    <button type="button" class="btn btn-danger-outline btn-sm" onclick="this.parentElement.remove()" title="Remover opção">✕</button>
  `

  // Selecionar o destino configurado
  if (nextStepId) {
    const sel = row.querySelector('.option-edit-target')
    if (sel) sel.value = nextStepId
  }

  container.appendChild(row)
}

function saveTypebotStepFromModal() {
  const editId = document.getElementById('editStepId').value
  const title = document.getElementById('stepTitleInput').value.trim()
  const id = document.getElementById('stepIdentifierInput').value.trim()
  const message = document.getElementById('stepMessageInput').value.trim()
  const mediaUrl = document.getElementById('stepMediaUrlInput').value.trim()
  const isHandover = document.getElementById('stepIsHandoverCheckbox').checked

  if (!title || !id || !message) {
    showToast('Preencha título, código e mensagem da etapa.', 'warning')
    return
  }

  // Coletar opções
  const optionRows = document.querySelectorAll('#stepOptionsModalList .option-edit-row')
  const options = []
  optionRows.forEach(r => {
    const key = r.querySelector('.option-edit-key').value.trim()
    const label = r.querySelector('.option-edit-label').value.trim()
    const nextStepId = r.querySelector('.option-edit-target').value.trim()
    if (key && label) {
      options.push({ key, label, nextStepId: nextStepId || 'start' })
    }
  })

  if (!currentTypebotConfig) {
    currentTypebotConfig = { steps: [] }
  }
  if (!currentTypebotConfig.steps) {
    currentTypebotConfig.steps = []
  }

  if (editId) {
    const idx = currentTypebotConfig.steps.findIndex(s => s.id === editId)
    if (idx !== -1) {
      currentTypebotConfig.steps[idx] = {
        ...currentTypebotConfig.steps[idx],
        id,
        title,
        message,
        mediaUrl,
        isHandover,
        options
      }
      showToast(`Etapa "${title}" atualizada!`, 'success')
    }
  } else {
    // Verificar se id já existe
    if (currentTypebotConfig.steps.some(s => s.id === id)) {
      showToast(`O código/ID "${id}" já está em uso por outra etapa. Escolha outro.`, 'warning')
      return
    }

    const newStep = {
      id,
      title,
      message,
      mediaUrl,
      isInitial: currentTypebotConfig.steps.length === 0 || id === 'start',
      isHandover,
      options
    }
    currentTypebotConfig.steps.push(newStep)
    showToast(`Etapa "${title}" adicionada!`, 'success')
  }

  closeModal('typebotStepModal')
  renderTypebotStepsGrid(currentTypebotConfig.steps)
  saveCurrentTypebotFlow()
}

async function deleteTypebotStep(stepId) {
  if (!currentTypebotConfig || !currentTypebotConfig.steps) return
  const step = currentTypebotConfig.steps.find(s => s.id === stepId)
  if (!step) return

  const confirmed = await showConfirmModal({
    title: 'Excluir Etapa',
    message: `Deseja realmente excluir a etapa "${step.title}" (${step.id})?`,
    isDanger: true,
    okText: 'Sim, Excluir',
    icon: '🗑️'
  })
  if (!confirmed) return

  currentTypebotConfig.steps = currentTypebotConfig.steps.filter(s => s.id !== stepId)
  renderTypebotStepsGrid(currentTypebotConfig.steps)
  showToast('Etapa removida.', 'info')
  saveCurrentTypebotFlow()
}

function insertStepTag(tag) {
  const textarea = document.getElementById('stepMessageInput')
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = textarea.value
  textarea.value = text.substring(0, start) + tag + text.substring(end)
  textarea.focus()
  textarea.selectionStart = textarea.selectionEnd = start + tag.length
}

/* ==========================================================================
   SIMULADOR DE WHATSAPP (TESTAR BOT NO NAVEGADOR)
   ========================================================================== */

let simulatorCurrentStepId = null
let simulatorIsTyping = false

function openTypebotSimulator() {
  if (!currentTypebotSessionId) {
    showToast('Selecione uma instância antes de simular.', 'warning')
    return
  }

  document.getElementById('simSessionName').textContent = currentTypebotSessionId
  document.getElementById('simulatorChatBody').innerHTML = ''
  document.getElementById('simulatorTextInput').value = ''
  document.getElementById('simulatorTypingBar').classList.add('hidden')
  document.getElementById('typebotSimulatorModal').classList.remove('hidden')
  
  simulatorCurrentStepId = null
  triggerSimulatorFirstMessage()
}

async function triggerSimulatorFirstMessage() {
  appendSimulatorBubble('Olá, gostaria de saber mais informações!', 'msg-outgoing')
  await simulateBotResponse('oi')
}

function restartSimulatorChat() {
  document.getElementById('simulatorChatBody').innerHTML = ''
  simulatorCurrentStepId = null
  triggerSimulatorFirstMessage()
}

async function sendSimulatorMessage() {
  const inputEl = document.getElementById('simulatorTextInput')
  const text = inputEl.value.trim()
  if (!text || simulatorIsTyping) return

  inputEl.value = ''
  appendSimulatorBubble(text, 'msg-outgoing')
  await simulateBotResponse(text)
}

async function simulateBotResponse(userText) {
  simulatorIsTyping = true
  const typingBar = document.getElementById('simulatorTypingBar')
  const statusEl = document.getElementById('simStatus')
  
  if (typingBar) typingBar.classList.remove('hidden')
  if (statusEl) statusEl.textContent = 'digitando...'

  const delayMs = (currentTypebotConfig?.simulateTyping !== false ? (currentTypebotConfig?.typingDelaySeconds || 1.5) : 0.5) * 1000

  try {
    const res = await apiRequest(`/typebot/${currentTypebotSessionId}/simulate`, {
      method: 'POST',
      body: JSON.stringify({
        text: userText,
        currentStepId: simulatorCurrentStepId,
        contactName: 'Visitante'
      })
    })

    const json = await res.json()
    await sleep(Math.min(delayMs, 2500))

    if (typingBar) typingBar.classList.add('hidden')
    if (statusEl) statusEl.textContent = 'online'
    simulatorIsTyping = false

    if (res.ok && json.success) {
      simulatorCurrentStepId = json.stepId || json.nextStepId

      let mediaHtml = ''
      if (json.mediaUrl) {
        mediaHtml = `<img src="${escapeHtml(json.mediaUrl)}" class="chat-media-preview" alt="Mídia enviada pelo bot" onerror="this.style.display='none'">`
      }

      const botReply = json.response || json.replyText || ''
      appendSimulatorBubble((mediaHtml + escapeHtml(botReply)).replace(/\n/g, '<br>'), 'msg-incoming', true)

      if (json.isHandover) {
        appendSimulatorBubble('🤝 <em>[Atendimento transferido para um operador humano]</em>', 'msg-incoming', true)
      }
    } else {
      appendSimulatorBubble('⚠️ ' + (json.message || 'Erro ao processar simulação.'), 'msg-incoming', false)
    }
  } catch (err) {
    if (typingBar) typingBar.classList.add('hidden')
    if (statusEl) statusEl.textContent = 'online'
    simulatorIsTyping = false
    appendSimulatorBubble('⚠️ Falha ao se comunicar com o simulador.', 'msg-incoming', false)
  }
}

function appendSimulatorBubble(content, typeClass, isRawHtml = false) {
  const container = document.getElementById('simulatorChatBody')
  if (!container) return

  const now = new Date()
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const bubble = document.createElement('div')
  bubble.className = `chat-msg ${typeClass}`
  
  if (isRawHtml) {
    bubble.innerHTML = `${content} <div class="chat-msg-time">${timeStr}</div>`
  } else {
    bubble.innerHTML = `${escapeHtml(content)} <div class="chat-msg-time">${timeStr}</div>`
  }

  container.appendChild(bubble)
  container.scrollTop = container.scrollHeight
}

/* ==========================================================================
   EXPORTAR, IMPORTAR E CLONAR FLUXO DO TYPEBOT
   ========================================================================== */

function exportTypebotBackup() {
  if (!currentTypebotConfig) {
    showToast('Nenhum fluxo carregado para exportar.', 'warning')
    return
  }

  const exportObj = {
    appName: 'whatsapp-api-typebot',
    version: '2.0',
    exportedAt: new Date().toISOString(),
    flow: currentTypebotConfig
  }

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportObj, null, 2))
  const dlAnchorElem = document.createElement('a')
  dlAnchorElem.setAttribute('href', dataStr)
  dlAnchorElem.setAttribute('download', `typebot_flow_${currentTypebotSessionId}_${Date.now()}.json`)
  dlAnchorElem.click()
  showToast('Fluxo exportado em JSON com sucesso!', 'success')
}

function importTypebotBackup(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result)
      const importedFlow = data.flow || data
      if (importedFlow && Array.isArray(importedFlow.steps)) {
        currentTypebotConfig = {
          ...currentTypebotConfig,
          ...importedFlow,
          sessionId: currentTypebotSessionId
        }
        renderTypebotConfigToForm(currentTypebotConfig)
        await saveCurrentTypebotFlow()
        showToast('Fluxo importado e salvo com sucesso!', 'success')
      } else {
        showToast('JSON inválido ou sem etapas reconhecidas.', 'error')
      }
    } catch (err) {
      showToast('Erro ao processar arquivo JSON importado.', 'error')
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

function openCloneFlowModal() {
  if (!currentTypebotSessionId) {
    showToast('Selecione a instância que receberá o fluxo.', 'warning')
    return
  }

  document.getElementById('cloneTargetSessionLabel').textContent = currentTypebotSessionId
  const select = document.getElementById('cloneSourceSessionSelect')
  select.innerHTML = '<option value="">Selecione uma instância...</option>'

  const otherSessions = cachedSessions.filter(s => s.sessionId !== currentTypebotSessionId)
  if (otherSessions.length === 0) {
    showToast('Não há outras instâncias para copiar.', 'info')
    return
  }

  otherSessions.forEach(s => {
    const opt = document.createElement('option')
    opt.value = s.sessionId
    opt.textContent = `${s.sessionId} (${s.isConnected ? '🟢 Conectado' : '⚪ Inativo'})`
    select.appendChild(opt)
  })

  document.getElementById('typebotCloneModal').classList.remove('hidden')
}

async function submitCloneFlow() {
  const sourceSession = document.getElementById('cloneSourceSessionSelect').value
  if (!sourceSession) {
    showToast('Selecione a instância de origem.', 'warning')
    return
  }

  try {
    showToast(`Copiando fluxo de "${sourceSession}"...`, 'info')
    const res = await apiRequest(`/typebot/${currentTypebotSessionId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ fromSessionId: sourceSession })
    })

    const json = await res.json()
    if (res.ok && json.success) {
      currentTypebotConfig = json.flow
      renderTypebotConfigToForm(currentTypebotConfig)
      closeModal('typebotCloneModal')
      showToast('Fluxo clonado e ativado com sucesso!', 'success')
    } else {
      showToast(json.message || 'Erro ao clonar fluxo.', 'error')
    }
  } catch (err) {
    showToast('Erro ao comunicar com o servidor.', 'error')
  }
}





