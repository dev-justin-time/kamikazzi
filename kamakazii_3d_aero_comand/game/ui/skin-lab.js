/* game/ui/skin-lab.js
   Responsibility: Skin Lab — plane skin generation, pilot portrait
   generation, building palette generation, style preset chips.
   Extracted from the original monolithic game/ui.js.
*/
import { isPuterAvailable, generateImage, buildSkinPrompt, getSkinStylePresets } from '../puter-client.js';

/**
 * wireSkinLab — wires skin lab UI: skin/portrait/building palette
 * generation and style preset chips.
 * Returns a controller object.
 */
export function wireSkinLab({ world }) {
  const puterAvailable = isPuterAvailable();
  const PRESET_KEYS = {
    skin: 'kamikazzi_skin_preset',
    portrait: 'kamikazzi_portrait_preset',
    building: 'kamikazzi_building_preset',
  };

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }
  function loadPreset(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  }
  function savePreset(key, id) {
    try { localStorage.setItem(key, id); } catch (_) {}
  }

  // ---- DOM refs ----
  const skinLabBtn = document.getElementById('skinLabBtn');
  const skinLabPanel = document.getElementById('skinLabPanel');
  const skinLabClose = document.getElementById('skinLabClose');
  const skinPrompt = document.getElementById('skinPrompt');
  const generateSkinBtn = document.getElementById('generateSkinBtn');
  const skinPreview = document.getElementById('skinPreview');
  const skinStatus = document.getElementById('skinStatus');
  const portraitPrompt = document.getElementById('portraitPrompt');
  const generatePortraitBtn = document.getElementById('generatePortraitBtn');
  const portraitPreview = document.getElementById('portraitPreview');
  const portraitStatus = document.getElementById('portraitStatus');
  const buildPrompt = document.getElementById('buildPrompt');
  const generateBuildBtn = document.getElementById('generateBuildBtn');
  const buildPaletteStrip = document.getElementById('buildPaletteStrip');
  const buildStatus = document.getElementById('buildStatus');
  const applyBuildPaletteBtn = document.getElementById('applyBuildPaletteBtn');
  const buildStyleChips = document.getElementById('buildStyleChips');
  const buildPromptPreview = document.getElementById('buildPromptPreview');
  const skinStyleChips = document.getElementById('skinStyleChips');
  const portraitStyleChips = document.getElementById('portraitStyleChips');
  const skinPromptPreview = document.getElementById('skinPromptPreview');
  const portraitPromptPreview = document.getElementById('portraitPromptPreview');

  // ---- Style presets ----
  const _skinPresets = getSkinStylePresets();
  let _skinActivePresetId = loadPreset(PRESET_KEYS.skin, 'kamikaze');
  let _portraitActivePresetId = loadPreset(PRESET_KEYS.portrait, 'kamikaze');
  let _buildActivePresetId = loadPreset(PRESET_KEYS.building, 'kamikaze');
  let _lastBuildPaletteData = null;

  // ---- Style chips rendering ----
  function renderStyleChips(container, activePresetId, onChange) {
    if (!container) return;
    container.innerHTML = '';
    for (const preset of _skinPresets) {
      const chip = document.createElement('button');
      chip.className = 'skin-style-chip' + (preset.id === activePresetId ? ' active' : '');
      chip.setAttribute('data-preset-id', preset.id);
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(preset.id === activePresetId));
      chip.setAttribute('aria-label', preset.name + ': ' + preset.desc);
      chip.innerHTML = `<span class="chip-emoji">${escapeHtml(preset.emoji)}</span> ${escapeHtml(preset.name)}`;
      chip.addEventListener('click', () => {
        container.querySelectorAll('.skin-style-chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
        chip.classList.add('active'); chip.setAttribute('aria-checked', 'true');
        onChange(preset.id);
      });
      container.appendChild(chip);
    }
  }

  function updatePromptPreview(inputEl, presetId, previewEl) {
    if (!previewEl) return;
    const text = inputEl ? inputEl.value.trim() : '';
    const result = buildSkinPrompt(text, presetId);
    previewEl.textContent = result.prompt;
    previewEl.title = 'Negative: ' + result.negative;
  }

  // ---- Skin panel open/close ----
  function openSkinLab() { if (skinLabPanel) skinLabPanel.classList.remove('hidden'); }
  function closeSkinLab() { if (skinLabPanel) skinLabPanel.classList.add('hidden'); }
  if (skinLabBtn) skinLabBtn.addEventListener('click', openSkinLab);
  if (skinLabClose) skinLabClose.addEventListener('click', closeSkinLab);

  // ---- Skin generation ----
  async function doGenerateSkin() {
    if (!puterAvailable) { if (skinStatus) skinStatus.textContent = 'Sign in to Puter to generate images'; return; }
    if (!skinPrompt) return;
    const raw = skinPrompt.value.trim();
    if (!raw) { if (skinStatus) skinStatus.textContent = 'Enter a prompt'; return; }
    const { prompt, negative } = buildSkinPrompt(raw, _skinActivePresetId);
    if (skinStatus) skinStatus.textContent = 'Generating…';
    if (generateSkinBtn) generateSkinBtn.disabled = true;
    const url = await generateImage(prompt, { size: '512x512', negative_prompt: negative });
    if (generateSkinBtn) generateSkinBtn.disabled = false;
    if (!url) { if (skinStatus) skinStatus.textContent = 'Failed. Try again.'; return; }
    if (skinPreview) skinPreview.style.backgroundImage = `url(${url})`;
    if (skinStatus) skinStatus.textContent = 'Applied!';
    try { localStorage.setItem('kamikazziPlaneSkin', url); } catch (_) {}
    if (world && world.applyPlaneSkin) world.applyPlaneSkin(url);
  }

  // ---- Portrait generation ----
  async function doGeneratePortrait() {
    if (!puterAvailable) { if (portraitStatus) portraitStatus.textContent = 'Sign in to Puter to generate images'; return; }
    if (!portraitPrompt) return;
    const raw = portraitPrompt.value.trim();
    if (!raw) { if (portraitStatus) portraitStatus.textContent = 'Enter a prompt'; return; }
    const { prompt, negative } = buildSkinPrompt(raw, _portraitActivePresetId, { isPortrait: true });
    if (portraitStatus) portraitStatus.textContent = 'Generating…';
    if (generatePortraitBtn) generatePortraitBtn.disabled = true;
    const url = await generateImage(prompt, { size: '512x512', negative_prompt: negative });
    if (generatePortraitBtn) generatePortraitBtn.disabled = false;
    if (!url) { if (portraitStatus) portraitStatus.textContent = 'Failed. Try again.'; return; }
    if (portraitPreview) portraitPreview.style.backgroundImage = `url(${url})`;
    if (portraitStatus) portraitStatus.textContent = 'Saved!';
    try { localStorage.setItem('kamikazziPilotPortrait', url); } catch (_) {}
  }

  // ---- Building Palette generation ----
  function updateBuildPromptPreview() {
    if (!buildPromptPreview) return;
    const text = buildPrompt ? buildPrompt.value.trim() : '';
    buildPromptPreview.textContent = text
      ? 'Building palette: ' + escapeHtml(text) + ' · Style: ' + escapeHtml(_buildActivePresetId)
      : 'Building palette prompt will be expanded with the selected style preset';
    buildPromptPreview.title = 'Style preset: ' + _buildActivePresetId;
  }

  async function doGenerateBuildPalette() {
    if (!puterAvailable) { if (buildStatus) buildStatus.textContent = 'Sign in to Puter to generate images'; return; }
    if (!buildPrompt) return;
    const raw = buildPrompt.value.trim();
    if (!raw) { if (buildStatus) buildStatus.textContent = 'Enter a prompt'; return; }
    if (buildStatus) buildStatus.textContent = 'Generating palette...';
    if (generateBuildBtn) generateBuildBtn.disabled = true;
    if (applyBuildPaletteBtn) applyBuildPaletteBtn.style.display = 'none';
    const { generateBuildingPalette } = await import('../puter-client.js');
    try {
      const result = await generateBuildingPalette(raw, _buildActivePresetId);
      if (!result) { if (buildStatus) buildStatus.textContent = 'Failed. Try again.'; if (generateBuildBtn) generateBuildBtn.disabled = false; return; }
      _lastBuildPaletteData = result;
      if (buildPaletteStrip) {
        buildPaletteStrip.innerHTML = '';
        for (const hex of result.palette) {
          const swatch = document.createElement('div');
          swatch.style.cssText = `flex:1;background:#${hex.toString(16).padStart(6, '0')};`;
          swatch.title = '#' + hex.toString(16).padStart(6, '0');
          buildPaletteStrip.appendChild(swatch);
        }
      }
      if (buildStatus) buildStatus.textContent = 'Palette generated! Apply it as a building skin.';
      if (applyBuildPaletteBtn) applyBuildPaletteBtn.style.display = 'inline-block';
    } catch (e) {
      console.warn('doGenerateBuildPalette failed', e);
      if (buildStatus) buildStatus.textContent = 'Failed. Try again.';
    }
    if (generateBuildBtn) generateBuildBtn.disabled = false;
  }

  function doApplyBuildPalette() {
    if (!_lastBuildPaletteData) return;
    try {
      const customSkin = {
        id: 'custom_generated', name: 'Custom Generated',
        palette: _lastBuildPaletteData.palette, desc: 'AI-generated color palette from custom prompt',
        unlockScore: 0, decalOverlay: null,
        roofColor: _lastBuildPaletteData.roofColor, accentColor: _lastBuildPaletteData.accentColor,
      };
      try { localStorage.setItem('kamikazzi_building_custom_skin', JSON.stringify(customSkin)); } catch (_) {}
      try { localStorage.setItem('kamikazzi_building_skin', 'custom_generated'); } catch (_) {}
      if (buildStatus) buildStatus.textContent = 'Palette applied! Start a new run to see it. Open the Skins panel to select it.';
      if (applyBuildPaletteBtn) applyBuildPaletteBtn.style.display = 'none';
    } catch (e) { console.warn('doApplyBuildPalette failed', e); if (buildStatus) buildStatus.textContent = 'Failed to apply. Try again.'; }
  }

  // ---- Event listeners ----
  if (skinPrompt) skinPrompt.addEventListener('input', () => { updatePromptPreview(skinPrompt, _skinActivePresetId, skinPromptPreview); });
  if (portraitPrompt) portraitPrompt.addEventListener('input', () => { updatePromptPreview(portraitPrompt, _portraitActivePresetId, portraitPromptPreview); });
  if (buildPrompt) buildPrompt.addEventListener('input', updateBuildPromptPreview);
  if (generateSkinBtn) generateSkinBtn.addEventListener('click', doGenerateSkin);
  if (generatePortraitBtn) generatePortraitBtn.addEventListener('click', doGeneratePortrait);
  if (generateBuildBtn) generateBuildBtn.addEventListener('click', doGenerateBuildPalette);
  if (applyBuildPaletteBtn) applyBuildPaletteBtn.addEventListener('click', doApplyBuildPalette);

  // ---- Init style chips ----
  renderStyleChips(skinStyleChips, _skinActivePresetId, (presetId) => {
    _skinActivePresetId = presetId; savePreset(PRESET_KEYS.skin, presetId); updatePromptPreview(skinPrompt, presetId, skinPromptPreview);
  });
  renderStyleChips(portraitStyleChips, _portraitActivePresetId, (presetId) => {
    _portraitActivePresetId = presetId; savePreset(PRESET_KEYS.portrait, presetId); updatePromptPreview(portraitPrompt, presetId, portraitPromptPreview);
  });
  renderStyleChips(buildStyleChips, _buildActivePresetId, (presetId) => {
    _buildActivePresetId = presetId; savePreset(PRESET_KEYS.building, presetId); updateBuildPromptPreview();
  });

  // ---- Initial prompt previews ----
  updatePromptPreview(skinPrompt, _skinActivePresetId, skinPromptPreview);
  updatePromptPreview(portraitPrompt, _portraitActivePresetId, portraitPromptPreview);
  updateBuildPromptPreview();

  // ---- Restore saved customizations ----
  (function restoreCustomizations() {
    try {
      const savedSkin = localStorage.getItem('kamikazziPlaneSkin');
      if (savedSkin) { if (skinPreview) skinPreview.style.backgroundImage = `url(${savedSkin})`; if (world && world.applyPlaneSkin) world.applyPlaneSkin(savedSkin); }
      const savedPortrait = localStorage.getItem('kamikazziPilotPortrait');
      if (savedPortrait && portraitPreview) portraitPreview.style.backgroundImage = `url(${savedPortrait})`;
    } catch (_) {}
  })();

  return { openSkinLab, closeSkinLab };
}
