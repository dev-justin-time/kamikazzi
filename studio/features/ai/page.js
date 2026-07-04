/**
 * AI Tools — Custom prompts, response display, templates
 */
function _getApp() { return window.ProModelerApp; }

function _addMessage(text, type) {
  const container = document.querySelector('#popupContent [data-key="ai-responses"] .ctrl-label');
  if (!container) return;
  const msg = document.createElement('div');
  msg.style.cssText = `padding:6px 10px;border-radius:4px;margin-bottom:4px;font-size:12px;line-height:1.5;${
    type === 'user' ? 'background:#2a2a3a;color:#ccc;' :
    type === 'ai' ? 'background:#1a2a3a;color:#8cf;' :
    'background:#2a1a1a;color:#f88;'
  }`;
  msg.textContent = type === 'user' ? `🧑 ${text}` : type === 'ai' ? `🤖 ${text}` : `⚠️ ${text}`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function _clearResponses() {
  const container = document.querySelector('#popupContent [data-key="ai-responses"] .ctrl-label');
  if (container) container.innerHTML = '';
}

const meta = {
  controls: [
    // ── Prompt Templates ──
    {
      key: 'ai-prompt',
      label: 'Quick Prompt',
      type: 'select',
      default: 'suggest',
      options: [
        { value: 'suggest', label: 'Suggest next modeling step' },
        { value: 'describe', label: 'Describe selected object' },
        { value: 'generate', label: 'Generate scene description' },
        { value: 'optimize', label: 'Optimization tips for scene' },
        { value: 'material', label: 'Material/texture advice' },
      ],
      description: 'Select a quick prompt template',
    },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── Custom Prompt Input ──
    { key: 'info-custom', type: 'label', label: 'Or write your own (textarea below):' },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Run / Clear ──
    {
      key: 'run-ai',
      label: '🚀 Run AI Query',
      type: 'button',
      onClick: async () => {
        const app = _getApp();
        const sel = app?.selectedObject;

        // Read the custom text from the textarea (rendered by the render function)
        const textarea = document.getElementById('aiCustomInput');
        const customPrompt = textarea?.value?.trim() || '';

        // Determine which prompt to use
        const selectEl = document.querySelector('#popupContent [data-key="ai-prompt"] select');
        const template = selectEl?.value || 'suggest';

        let prompt;
        if (customPrompt) {
          prompt = customPrompt + (sel ? `\n\nContext: Selected object is "${sel.name}".` : '');
        } else {
          const templates = {
            suggest: sel
              ? `Suggest next steps for modeling "${sel.name}" in a 3D editor. It has ${sel.geometry?.index?.count / 3 || '?'} faces.`
              : 'Suggest how to start a 3D modeling project.',
            describe: sel
              ? `Describe the 3D object "${sel.name}" — its possible use cases and what could be improved.`
              : 'No object selected. Describe general 3D scene composition tips.',
            generate: sel
              ? `Generate a detailed description for a 3D model named "${sel.name}".`
              : 'Generate ideas for a 3D modeling scene.',
            optimize: `The scene has ${app?.objects.length || 0} objects. Suggest optimization strategies for real-time rendering.`,
            material: sel
              ? `Suggest materials and textures for "${sel.name}". What would make it look realistic/stylized?`
              : 'Suggest how to choose materials for different objects in a 3D scene.',
          };
          prompt = templates[template] || templates.suggest;
        }

        _addMessage(prompt, 'user');
        const el = document.getElementById('statusLeft');
        if (el) el.textContent = 'AI thinking...';

        try {
          const { aiBridge } = await import('../app/ai-bridge.js');
          const result = await aiBridge.request({
            prompt,
            system: window.__aiSystemPrompt || 'You are a 3D modeling assistant. Give concise, actionable advice.',
            timeout: 15000,
          });
          if (result.content) {
            _addMessage(result.content, 'ai');
            if (el) el.textContent = `AI: ${result.content.slice(0, 80)}...`;
          } else {
            _addMessage('No response (bridge not ready)', 'error');
            if (el) el.textContent = 'AI: No response (bridge not ready)';
          }
        } catch (e) {
          _addMessage(`Error: ${e.message}`, 'error');
          if (el) el.textContent = `AI error: ${e.message}`;
        }
      },
    },
    {
      key: 'clear-ai',
      label: '🗑 Clear Responses',
      type: 'button',
      onClick: () => { _clearResponses(); },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── System Prompt ──
    {
      key: 'system-prompt',
      label: 'System Prompt',
      type: 'select',
      default: 'modeling',
      options: [
        { value: 'modeling', label: '3D Modeling Assistant' },
        { value: 'creative', label: 'Creative/Artistic Advisor' },
        { value: 'technical', label: 'Technical/Performance Expert' },
        { value: 'custom', label: 'Custom... (write your own)' },
      ],
      description: 'AI persona/behavior preset',
      onChange: (val) => {
        const prompts = {
          modeling: 'You are a 3D modeling assistant. Give concise, actionable advice.',
          creative: 'You are a creative 3D art director. Suggest artistic improvements and stylized approaches.',
          technical: 'You are a technical artist specialized in real-time rendering. Focus on performance, optimization, and best practices.',
          custom: window.__aiCustomSystem || 'You are a helpful assistant.',
        };
        window.__aiSystemPrompt = prompts[val] || prompts.modeling;
      },
    },
    { key: 'info-custom-sys', type: 'label', label: 'Set system prompt to "Custom..." to type your own below.' },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Response Display ──
    {
      key: 'ai-responses',
      type: 'label',
      label: 'Responses will appear here...',
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Info ──
    { key: 'info', type: 'label', label: 'Works best with WebSim.ai or Puter.js connected.' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  // Inject a textarea for custom prompts and a response container
  const textarea = document.createElement('textarea');
  textarea.id = 'aiCustomInput';
  textarea.placeholder = 'Type your custom AI prompt here...';
  textarea.style.cssText = 'width:100%;min-height:60px;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;resize:vertical;box-sizing:border-box;';

  const sysTextarea = document.createElement('textarea');
  sysTextarea.id = 'aiCustomSystem';
  sysTextarea.placeholder = 'Custom system prompt...';
  sysTextarea.style.cssText = 'width:100%;min-height:50px;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;resize:vertical;box-sizing:border-box;display:none;';
  sysTextarea.addEventListener('input', () => { window.__aiCustomSystem = sysTextarea.value; });

  // Style the response label to be a scrollable container
  const respLabel = container.querySelector('[data-key="ai-responses"] .ctrl-label');
  if (respLabel) {
    respLabel.style.cssText = 'display:block;max-height:200px;overflow-y:auto;font-size:12px;line-height:1.5;padding:4px;background:#1a1a1a;border-radius:4px;border:1px solid #333;white-space:normal;';
  }

  container.appendChild(textarea);
  container.appendChild(sysTextarea);

  // Show/hide system textarea based on selection
  const sysSelect = container.querySelector('[data-key="system-prompt"] select');
  if (sysSelect) {
    sysSelect.addEventListener('change', () => {
      sysTextarea.style.display = sysSelect.value === 'custom' ? 'block' : 'none';
    });
  }

  // Initial state for response container
  const initialMsg = container.querySelector('[data-key="ai-responses"] .ctrl-label');
  if (initialMsg) {
    initialMsg.innerHTML = 'Responses will appear here...';
  }
}
