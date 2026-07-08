/* game/ui/lobby.js
   Responsibility: Lobby / Matchmaking — lobby panel, Puter presence,
   quick match button.
   Extracted from the original monolithic game/ui.js.
*/
import { isPuterAvailable, startLobbyPresence } from '../puter-client.js';

/**
 * wireLobby — wires lobby panel, presence, and quick match.
 * Returns a controller with { closeLobby, getLobbyPresence, setLobbyStatus,
 * setStartBtnRef, startBtnHighlight }.
 */
export function wireLobby({ world }) {
  const lobbyBtn = document.getElementById('lobbyBtn');
  const lobbyPanel = document.getElementById('lobbyPanel');
  const lobbyClose = document.getElementById('lobbyClose');
  const lobbyBody = document.getElementById('lobbyBody');
  const lobbyCount = document.getElementById('lobbyCount');
  const lobbyQuickMatch = document.getElementById('lobbyQuickMatch');
  const startBtn = document.getElementById('startBtn');

  let _lobbyPresence = null;
  let _lobbyAllPlayers = {};
  let _lobbyOnlineCount = 0;

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  async function openLobby() {
    if (!lobbyPanel) return;
    lobbyPanel.classList.remove('hidden');
    if (!_lobbyPresence) {
      lobbyBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Connecting to lobby...</div>';
      try {
        _lobbyPresence = await startLobbyPresence();
        if (_lobbyPresence) {
          _lobbyPresence.subscribeLobby(handleLobbyUpdate);
          const hs = Number(localStorage.getItem('kamikazziHiScore') || 0);
          _lobbyPresence.setScore(hs);
        } else {
          lobbyBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Unable to connect to lobby. Puter KV unavailable.</div>';
        }
      } catch (_) {
        lobbyBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Unable to connect to lobby.</div>';
      }
    }
  }

  function closeLobby() {
    if (lobbyPanel) lobbyPanel.classList.add('hidden');
  }

  function handleLobbyUpdate(state) {
    _lobbyAllPlayers = state || {};
    const selfId = _lobbyPresence ? _lobbyPresence.clientId : null;
    const entries = Object.values(_lobbyAllPlayers);
    _lobbyOnlineCount = entries.length;
    if (lobbyCount) lobbyCount.textContent = _lobbyOnlineCount;
    if (!lobbyBody) return;
    if (!entries.length) {
      lobbyBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">No other pilots connected yet.</div>';
      return;
    }
    entries.sort((a, b) => {
      if (a.clientId === selfId) return -1;
      if (b.clientId === selfId) return 1;
      return (b.score || 0) - (a.score || 0);
    });
    let html = '';
    for (const player of entries) {
      const isSelf = player.clientId === selfId;
      const avatarHtml = player.avatar
        ? `<img src="${escapeHtml(player.avatar)}" alt="${escapeHtml(player.username || 'Pilot')} avatar" />`
        : `<span style="font-size:16px;">👤</span>`;
      const statusClass = player.status === 'In Game' ? 'game' : player.status === 'Away' ? 'away' : 'lobby';
      const statusLabel = player.status === 'In Game' ? 'In Game' : player.status === 'Away' ? 'Away' : 'In Lobby';
      const selfBadge = isSelf ? `<span style="font-size:9px;color:rgba(0,221,221,0.6);font-weight:400;margin-left:4px;">(you)</span>` : '';
      const scoreStr = (player.score || 0) >= 1000 ? (player.score / 1000).toFixed(1) + 'k' : String(player.score || 0);
      html += `<div class="lobby-card${isSelf ? ' lobby-self' : ''}" role="listitem" aria-label="${escapeHtml(player.username || 'Pilot')} — ${statusLabel}">
        <div class="lobby-avatar">${avatarHtml}</div>
        <div class="lobby-info">
          <div class="lobby-name">${escapeHtml(player.username || 'Pilot')}${selfBadge}</div>
          <div class="lobby-meta"><span class="lobby-status ${statusClass}">${statusLabel}</span></div>
        </div>
        <div class="lobby-score">${scoreStr} <span style="font-size:9px;font-weight:400;color:rgba(0,221,221,0.5);">pts</span></div>
      </div>`;
    }
    lobbyBody.innerHTML = html;
  }

  if (lobbyBtn) lobbyBtn.addEventListener('click', openLobby);
  if (lobbyClose) lobbyClose.addEventListener('click', closeLobby);
  if (lobbyPanel) {
    lobbyPanel.addEventListener('click', e => { if (e.target === lobbyPanel) closeLobby(); });
  }

  // Quick Match button
  if (lobbyQuickMatch) {
    lobbyQuickMatch.addEventListener('click', () => {
      const inLobby = Object.values(_lobbyAllPlayers).filter(
        p => p.status === 'In Lobby' && p.clientId !== (_lobbyPresence ? _lobbyPresence.clientId : null)
      );
      if (inLobby.length > 0) {
        lobbyQuickMatch.textContent = inLobby.length + ' pilot' + (inLobby.length > 1 ? 's' : '') + ' ready — Start Flying!';
        lobbyQuickMatch.style.borderColor = '#ffe08a';
        lobbyQuickMatch.style.color = '#ffe08a';
        if (startBtn) {
          startBtn.style.boxShadow = '0 0 20px rgba(255,200,50,0.5)';
          setTimeout(() => { startBtn.style.boxShadow = ''; }, 3000);
        }
      } else {
        lobbyQuickMatch.textContent = 'No opponents found';
        setTimeout(() => {
          lobbyQuickMatch.textContent = 'Quick Match';
          lobbyQuickMatch.style.borderColor = '';
          lobbyQuickMatch.style.color = '';
        }, 2000);
      }
    });
  }

  // Stop lobby presence on unload
  window.addEventListener('beforeunload', () => {
    if (_lobbyPresence && typeof _lobbyPresence.stop === 'function') {
      _lobbyPresence.stop();
      _lobbyPresence = null;
    }
  });

  return {
    closeLobby,
    getLobbyPresence: () => _lobbyPresence,
    setLobbyStatus: (status) => {
      if (_lobbyPresence && typeof _lobbyPresence.setStatus === 'function') {
        _lobbyPresence.setStatus(status);
      }
    },
  };
}
