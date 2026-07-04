/**
 * Chat — Collaboration, comments, AI assistant chat
 * Uses the AI bridge for simple Q&A when available.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Collaboration and AI chat for your 3D scene.' },
    { key: 'sep1', label: '──────────', type: 'label' },
    {
      key: 'ask-ai',
      label: 'Ask AI Assistant',
      type: 'button',
      onClick: async () => {
        const app = window.ProModelerApp;
        const sel = app?.selectedObject;
        const prompt = sel
          ? `Give me a tip about editing "${sel.name}" in my 3D scene. It has ${sel.geometry?.index?.count / 3 || '?'} faces.`
          : 'Give me a quick tip about 3D modeling.';
        const el = document.getElementById('statusLeft');
        if (el) el.textContent = 'Chat: asking AI...';
        try {
          const { aiBridge } = await import('../app/ai-bridge.js');
          const result = await aiBridge.request({
            prompt,
            system: 'You are a helpful 3D modeling assistant. Keep responses under 100 characters.',
            timeout: 8000,
          });
          if (result.content) {
            if (el) el.textContent = `Chat: ${result.content.slice(0, 100)}`;
          } else {
            if (el) el.textContent = 'Chat: AI not connected (no WebSim/Puter)';
          }
        } catch (e) {
          if (el) el.textContent = `Chat error: ${e.message}`;
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-collab', type: 'label', label: '  • Real-time multi-user editing' },
    { key: 'info-comments', type: 'label', label: '  • Scene annotations & comments' },
    { key: 'info-history', type: 'label', label: '  • Edit history & version tracking' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
