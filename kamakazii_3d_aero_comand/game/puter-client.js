/* game/puter-client.js — Refactored orchestrator
   Originally a 1,400+ line monolithic file (2024). Now split into
   5 domain modules under game/puter/:

     - auth.js:    SDK resolution, user identity, legacy API-key client
     - kv.js:      Unified storage (cloud + localStorage), high scores,
                   settings, KV collections, leaderboard, community
                   powerups, lobby presence, briefings sync
     - ai.js:      AI chat (generateFromComment), image generation,
                   text-to-speech, skin/portrait prompt templates
     - replay.js:  Screenshot capture, replay save/load/delete
     - room.js:    Puter KV rooms, Websim/BroadcastChannel rooms,
                   unified room factory, game state snapshots

   This file remains the single public entry point so that all existing
   consumers (world.js, ui modules, etc.) continue to import from the
   same path. All exports are re-exported from the appropriate sub-module.
*/

// Auth
export { isPuterAvailable, getUser, getUsername, getAvatarUrl, refreshUser } from './puter/auth.js';

// KV Storage
export {
  setCloudSyncEnabled, isCloudSyncEnabled,
  save, load,
  syncHighScore, getHighScore,
  recordRun, getRunHistory,
  syncSettings, getSettings,
  submitLeaderboard, getLeaderboard,
  submitCommunityPowerup, getCommunityPowerups, voteCommunityPowerup,
  startLobbyPresence,
} from './puter/kv.js';

// AI
export { generateFromComment, generateImage, speak, buildSkinPrompt, getSkinStylePresets, generateBuildingPalette } from './puter/ai.js';

// Replays
export { captureScreenshot, saveReplay, getReplays, deleteReplay } from './puter/replay.js';

// Rooms & Snapshots
export { createMultiplayerRoom, createPuterRoom, createWebsimRoom, saveGameSnapshot, loadGameSnapshot, deleteGameSnapshot } from './puter/room.js';
