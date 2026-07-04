/*
AnimationManager - small helper to manage animation playback via the ModelEditor animation API.
Wired to top-menu controls. Exported as a named class.
*/
export class AnimationManager {
  constructor(editor) {
    this.editor = editor;
  }

  // Populate a select element with clip names from current editor.animations
  populateSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const clips = (this.editor && Array.isArray(this.editor.animations)) ? this.editor.animations : [];
    if (!clips || clips.length === 0) {
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'No clips'; selectEl.appendChild(opt);
      return;
    }
    clips.forEach((c, idx) => {
      const opt = document.createElement('option');
      opt.value = c.name || (`Clip_${idx}`);
      opt.textContent = c.name || (`Clip ${idx + 1}`);
      selectEl.appendChild(opt);
    });
  }

  play(name, loop = true) {
    if (!this.editor) return;
    this.editor.playAnimationByName(name, loop);
  }

  pause() {
    if (!this.editor) return;
    this.editor.pauseAnimations();
  }

  stop() {
    if (!this.editor) return;
    this.editor.stopAnimations();
  }

  setSpeed(speed) {
    if (!this.editor) return;
    this.editor.setAnimationSpeed(speed);
  }
}