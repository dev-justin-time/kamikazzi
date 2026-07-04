/**
 * Feature page loader — renders controls from a metadata definition.
 * Each feature exports a `meta` object with controls to render.
 */
export function renderFeaturePage(container, state, meta) {
  const form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  // Section: Controls
  if (meta.controls) {
    meta.controls.forEach(ctrl => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

      const label = document.createElement('label');
      label.textContent = ctrl.label;
      label.style.cssText = 'font-size:12px;color:#aaa;';

      let input;
      switch (ctrl.type) {
        case 'slider':
          input = document.createElement('input');
          input.type = 'range';
          input.min = ctrl.min ?? 0;
          input.max = ctrl.max ?? 1;
          input.step = ctrl.step ?? 0.01;
          input.value = ctrl.default ?? 0.5;
          input.style.cssText = 'width:100%;accent-color:#4a9eff;';
          // Value display
          const valSpan = document.createElement('span');
          valSpan.textContent = input.value;
          valSpan.style.cssText = 'font-size:11px;color:#888;text-align:right;';
          input.addEventListener('input', () => { valSpan.textContent = input.value; if (ctrl.onChange) ctrl.onChange(parseFloat(input.value), state); });
          row.appendChild(label);
          row.appendChild(input);
          row.appendChild(valSpan);
          break;
        case 'number':
          input = document.createElement('input');
          input.type = 'number';
          input.value = ctrl.default ?? 0;
          input.style.cssText = 'width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;';
          input.addEventListener('change', () => { if (ctrl.onChange) ctrl.onChange(parseFloat(input.value), state); });
          row.appendChild(label);
          row.appendChild(input);
          break;
        case 'color':
          input = document.createElement('input');
          input.type = 'color';
          input.value = ctrl.default ?? '#ffffff';
          input.style.cssText = 'width:100%;padding:4px;border-radius:4px;border:1px solid #444;background:#222;';
          input.addEventListener('input', () => { if (ctrl.onChange) ctrl.onChange(input.value, state); });
          row.appendChild(label);
          row.appendChild(input);
          break;
        case 'select':
          input = document.createElement('select');
          input.style.cssText = 'width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;';
          (ctrl.options || []).forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            input.appendChild(o);
          });
          input.addEventListener('change', () => { if (ctrl.onChange) ctrl.onChange(input.value, state); });
          row.appendChild(label);
          row.appendChild(input);
          break;
        case 'toggle':
          row.style.cssText = 'flex-direction:row;align-items:center;gap:8px;';
          input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = ctrl.default ?? false;
          input.style.cssText = 'width:18px;height:18px;accent-color:#4a9eff;';
          input.addEventListener('change', () => { if (ctrl.onChange) ctrl.onChange(input.checked, state); });
          row.appendChild(input);
          row.appendChild(label);
          break;
        case 'button':
          input = document.createElement('button');
          input.textContent = ctrl.label;
          input.style.cssText = 'width:100%;padding:8px;border:none;border-radius:4px;background:#4a9eff;color:#fff;cursor:pointer;font-size:13px;';
          input.addEventListener('click', () => { if (ctrl.onClick) ctrl.onClick(state); });
          row.appendChild(input);
          break;
        default:
          break;
      }

      if (ctrl.description) {
        const desc = document.createElement('div');
        desc.textContent = ctrl.description;
        desc.style.cssText = 'font-size:11px;color:#666;margin-top:-2px;';
        row.appendChild(desc);
      }

      form.appendChild(row);
    });
  }

  container.appendChild(form);

  // OK button (called when the shell's OK is clicked)
  return {
    getValues: () => {
      const values = {};
      if (meta.controls) {
        meta.controls.forEach((ctrl, i) => {
          if (ctrl.key) values[ctrl.key] = form.children[i]?.querySelector('input, select, button')?.value;
        });
      }
      return values;
    },
    apply: () => {
      if (meta.onApply) meta.onApply(state);
    }
  };
}
