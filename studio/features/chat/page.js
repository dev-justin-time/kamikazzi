/**
 * Chat — Conversation with message history, scene context, save/export
 */
function _getApp() { return window.ProModelerApp; }

let _messageHistory = [];

function _addMessage(text, type) {
  const container = document.querySelector('#popupContent [data-key="chat-log"] .ctrl-label');
  if (!container) return;
  const msg = document.createElement('div');
  msg.style.cssText = `padding:6px 10px;border-radius:4px;margin-bottom:4px;font-size:12px;line-height:1.5;${
    type === 'user' ? 'background:#2a2a3a;color:#ccc;' :
    type === 'ai' ? 'background:#1a2a3a;color:#8cf;' :
    type === 'system' ? 'background:#2a2a1a;color:#cc8;font-style:italic;' :
    'background:#2a1a1a;color:#f88;'
  }`;
  msg.textContent = type === 'user' ? `🧑 ${text}` : type === 'ai' ? `🤖 ${text}` : type === 'system' ? `🛠 ${text}` : `⚠️ ${text}`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  _messageHistory.push({ text, type, timestamp: Date.now() });
}

function _renderHistory() {
  const container = document.querySelector('#popupContent [data-key="chat-log"] .ctrl-label');
  if (!container) return;
  container.innerHTML = '';
  _messageHistory.forEach(m => {
    const msg = document.createElement('div');
    msg.style.cssText = `padding:6px 10px;border-radius:4px;margin-bottom:4px;font-size:12px;line-height:1.5;${
      m.type === 'user' ? 'background:#2a2a3a;color:#ccc;' :
      m.type === 'ai' ? 'background:#1a2a3a;color:#8cf;' :
      m.type === 'system' ? 'background:#2a2a1a;color:#cc8;font-style:italic;' :
      'background:#2a1a1a;color:#f88;'
    }`;
    msg.textContent = m.type === 'user' ? `🧑 ${m.text}` : m.type === 'ai' ? `🤖 ${m.text}` : m.type === 'system' ? `🛠 ${m.text}` : `⚠️ ${m.text}`;
    container.appendChild(msg);
  });
  container.scrollTop = container.scrollHeight;
}

function _clearChat() {
  _messageHistory = [];
  const container = document.querySelector('#popupContent [data-key="chat-log"] .ctrl-label');
  if (container) container.innerHTML = '';
}

function _exportChat() {
  const text = _messageHistory.map(m =>
    `${new Date(m.timestamp).toLocaleTimeString()} [${m.type.toUpperCase()}] ${m.text}`
  ).join('\n');
  if (!text) { log('No chat to export', 'error'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = 'chat-log.txt';
  a.click();
}

async function _askAI(customPrompt) {
  const app = _getApp();
  const sel = app?.selectedObject;

  let prompt = customPrompt || 'Give me a quick tip about 3D modeling.';
  // Inject scene context
  if (sel) {
    const faces = sel.geometry?.index ? Math.round(sel.geometry.index.count / 3) : '?';
    prompt += `\n\nContext: Selected "${sel.name}" (${faces} faces, ${sel.type}).`;
  } else {
    prompt += `\n\nContext: Scene has ${app?.objects.length || 0} objects, ${app?.lights?.length || 0} lights.`;
  }

  _addMessage(prompt, 'user');
  const el = document.getElementById('statusLeft');
  if (el) el.textContent = 'Chat: asking AI...';

  try {
    const { aiBridge } = await import('../app/ai-bridge.js');
    const result = await aiBridge.request({
      prompt,
      system: 'You are a helpful 3D modeling assistant. Keep responses under 200 characters.',
      timeout: 10000,
    });
    if (result.content) {
      _addMessage(result.content, 'ai');
      if (el) el.textContent = `Chat: ${result.content.slice(0, 100)}`;
    } else {
      _addMessage('AI not connected (no WebSim/Puter bridge)', 'error');
      if (el) el.textContent = 'Chat: AI not connected';
    }
  } catch (e) {
    _addMessage(`Error: ${e.message}`, 'error');
    if (el) el.textContent = `Chat error: ${e.message}`;
  }
}

const meta = {
  controls: [
    // ── Quick Prompts ──
    { key: 'info-quick', type: 'label', label: 'Quick Questions:' },
    { key: 'tip-model', label: '💡 Modeling Tip', type: 'button', onClick: () => _askAI('Give me a quick 3D modeling tip.') },
    { key: 'tip-material', label: '🎨 Material Advice', type: 'button', onClick: () => _askAI('Suggest materials for my current selection or scene.') },
    { key: 'tip-perf', label: '⚡ Performance Tip', type: 'button', onClick: () => _askAI('How can I optimize my 3D scene for better performance?') },
    { key: 'tip-scene', label: '🌍 Scene Composition', type: 'button', onClick: () => _askAI('Suggest improvements for my scene layout and composition.') },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Custom Send ──
    { key: 'info-custom', type: 'label', label: 'Send a custom message:' },
    {
      key: 'send-chat',
      label: 'Send Message',
      type: 'button',
      onClick: () => {
        const textarea = document.getElementById('chatCustomInput');
        const msg = textarea?.value?.trim();
        if (msg) {
          _askAI(msg);
          textarea.value = '';
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Chat Log ──
    { key: 'chat-log', type: 'label', label: 'Chat log — ask a question to begin.' },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Actions ──
    {
      key: 'clear-chat',
      label: '🗑 Clear Chat',
      type: 'button',
      onClick: () => { _clearChat(); },
    },
    {
      key: 'export-chat',
      label: '📤 Export Chat Log',
      type: 'button',
      onClick: () => { _exportChat(); },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Info ──
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-collab', type: 'label', label: '  • Real-time multi-user editing' },
    { key: 'info-comments', type: 'label', label: '  • Scene annotations & comments' },
    { key: 'info-history', type: 'label', label: '  • Edit history & version tracking' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  // Inject textarea for custom messages
  const existing = document.getElementById('chatCustomInput');
  if (!existing) {
    const textarea = document.createElement('textarea');
    textarea.id = 'chatCustomInput';
    textarea.placeholder = 'Type your message and click Send...';
    textarea.style.cssText = 'width:100%;min-height:50px;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;resize:vertical;box-sizing:border-box;margin-bottom:4px;';
    // Find the send button row and insert before it
    const sendBtnRow = container.querySelector('[data-key="send-chat"]');
    if (sendBtnRow) {
      sendBtnRow.parentNode.insertBefore(textarea, sendBtnRow);
    } else {
      container.appendChild(textarea);
    }
    // Enter key to send
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const msg = textarea.value.trim();
        if (msg) {
          _askAI(msg);
          textarea.value = '';
        }
      }
    });
  }

  // Style the chat log label
  const logEl = container.querySelector('[data-key="chat-log"] .ctrl-label');
  if (logEl) {
    logEl.style.cssText = 'display:block;max-height:200px;overflow-y:auto;font-size:12px;line-height:1.5;padding:4px;background:#1a1a1a;border-radius:4px;border:1px solid #333;min-height:40px;';
  }

  // Restore history from previous session
  _renderHistory();
}
