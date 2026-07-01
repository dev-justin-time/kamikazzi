/* game/ui.js
   Responsibility: wire DOM elements (start, retry, score display) to the world API.
   Also: show the skull/crash image only on crash and hide it when retrying.
*/
export function setupUI({ world, rendererObj }) {
  const scoreVal = document.getElementById('scoreVal');
  const speedVal = document.getElementById('speedVal');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOver');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');

  // create crash-only image (skull) but keep it hidden until game over
  const crashImg = document.createElement('img');
  crashImg.src = '/Clipboard0E2.webp';
  crashImg.alt = 'crash';
  crashImg.style.maxWidth = '48%';
  crashImg.style.maxHeight = '36%';
  crashImg.style.objectFit = 'contain';
  crashImg.style.borderRadius = '8px';
  crashImg.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';
  crashImg.style.marginTop = '12px';
  crashImg.style.display = 'none';
  crashImg.setAttribute('aria-hidden', 'true');
  // place at top of gameOver overlay content
  if (gameOverScreen) gameOverScreen.insertBefore(crashImg, gameOverScreen.firstChild);

  // UI update loop
  function uiLoop() {
    if (world && world.state) {
      scoreVal.textContent = Math.floor(world.state.score);
      speedVal.textContent = (world.state.speed / world.state.baseSpeed).toFixed(1) + 'x';
      bestScoreEl.textContent = world.state.best;

      if (world.state.over) {
        finalScoreEl.textContent = Math.floor(world.state.score);
        startScreen.classList.add('hidden');
        gameOverScreen.classList.remove('hidden');
        // show crash image only on crash
        crashImg.style.display = 'block';
      } else {
        // hide crash image during normal play or on start screen
        crashImg.style.display = 'none';
        if (!world.state.running) {
          startScreen.classList.remove('hidden');
        } else {
          startScreen.classList.add('hidden');
          gameOverScreen.classList.add('hidden');
        }
      }
    }
    requestAnimationFrame(uiLoop);
  }
  requestAnimationFrame(uiLoop);

  function start() {
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    // ensure crash image is hidden when starting
    crashImg.style.display = 'none';
    if (world && world.startLoop && rendererObj) {
      try { 
        world.startLoop(rendererObj); 
      } catch (e) { 
        console.warn('UI start failed to call world.startLoop', e); 
      }
    }
  }

  function retry() {
    // hide crash image on retry and then start again
    crashImg.style.display = 'none';
    start();
  }

  if (startBtn) startBtn.addEventListener('click', start);
  if (retryBtn) retryBtn.addEventListener('click', retry);

  return { start, retry };
}