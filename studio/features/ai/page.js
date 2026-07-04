/**
 * AI Tools — Generate, suggest, analyze via AI bridge
 */
const meta = {
  controls: [
    {
      key: 'ai-prompt',
      label: 'AI Prompt',
      type: 'select',
      default: 'suggest',
      options: [
        { value: 'suggest', label: 'Suggest next modeling step' },
        { value: 'describe', label: 'Describe selected object' },
        { value: 'generate', label: 'Generate object description' },
      ],
      description: 'Choose what to ask the AI',
    },
    { key: 'sep1', label: '──────────', type: 'label' },
    {
      key: 'run-ai',
      label: 'Run AI Query',
      type: 'button',
      onClick: async () => {
        const app = window.ProModelerApp;
        const sel = app?.selectedObject;
        const prompt = sel
          ? `Suggest next steps for modeling "${sel.name}" in a 3D editor`
          : 'Suggest how to start a 3D modeling project';
        const el = document.getElementById('statusLeft');
        if (el) el.textContent = 'AI thinking...';
        try {
          const { aiBridge } = await import('../app/ai-bridge.js');
          const result = await aiBridge.request({
            prompt,
            system: 'You are a 3D modeling assistant. Give concise, actionable advice.',
            timeout: 10000,
          });
          if (result.content) {
            if (el) el.textContent = `AI: ${result.content.slice(0, 120)}...`;
          } else {
            if (el) el.textContent = 'AI: No response (bridge not ready)';
          }
        } catch (e) {
          if (el) el.textContent = `AI error: ${e.message}`;
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'info', type: 'label', label: 'Works best with WebSim.ai or Puter.js connected.' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
