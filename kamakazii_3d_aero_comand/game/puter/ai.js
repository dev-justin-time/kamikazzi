/* game/puter/ai.js
   Extracted from puter-client.js — AI chat completions, image
   generation, text-to-speech, and Stable Diffusion prompt
   templates for skin/portrait/building-palette generation.
*/

import { resolvePuter, getUser, getAiExport } from './auth.js';

import { dbg } from '../dbg.js';

// ── AI Chat: generateFromComment ───────────────────────────────
export async function generateFromComment(text) {
  if (!text) return null;
  const p = await resolvePuter();
  const aiInstance = (p && p.ai) || getAiExport() || (typeof ai !== 'undefined' ? ai : null);
  if (!aiInstance || !aiInstance.chat || !aiInstance.chat.completions) return null;
  return _doAiChat(aiInstance, text);
}

async function _doAiChat(aiInstance, text) {
  const systemPrompt = `You are a game-config generator for Kamikazzi 3D. Respond ONLY with valid JSON. No markdown, no explanations.

Available fields (all optional):
- spawnInterval: number (seconds between building spawns)
- baseSpeed: number (plane base speed)
- speedMultiplier: number (multiply current baseSpeed)
- enablePowerups: boolean
- night: boolean
- spawnBuildingCount: integer (extra buildings to spawn now)
- persistIdeasConfig: boolean (save this config to localStorage)

Example response:
{"enablePowerups":true,"night":false,"spawnInterval":20}`;

  try {
    const response = await aiInstance.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      max_tokens: 256,
    });
    let content = null;
    if (response && response.choices && response.choices[0] && response.choices[0].message) {
      content = response.choices[0].message.content;
    } else if (response && response.choices && response.choices[0] && response.choices[0].text) {
      content = response.choices[0].text;
    } else if (response && response.content) {
      content = response.content;
    }
    if (!content) return null;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/```\s*([\s\S]*?)```/);
    if (jsonMatch) content = jsonMatch[1].trim();
    JSON.parse(content);
    return content;
  } catch (_) { return null; }
}

// Backward-compat global
window.generateFromComment = generateFromComment;

// ── AI Image Generation ────────────────────────────────────────
export async function generateImage(prompt, options = {}) {
  if (!prompt) return null;
  const p = await resolvePuter();
  if (!p || !p.ai || typeof p.ai.txt2img !== 'function') {
    dbg.warn('Puter image generation unavailable');
    return null;
  }
  try {
    const result = await p.ai.txt2img(prompt, {
      size: options.size || '512x512',
      ...options,
    });
    if (result instanceof File) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(result);
      });
    }
    if (result instanceof HTMLImageElement) return result.src;
    if (result && typeof result.src === 'string') return result.src;
    if (result && typeof result.url === 'string') return result.url;
    return null;
  } catch (e) {
    dbg.warn('generateImage failed', e);
    return null;
  }
}

// ── Text-to-Speech ─────────────────────────────────────────────
const _ttsCache = new Map();
const _ttsQueue = [];
let _ttsPlaying = false;
const _ttsMaxCache = 20;

function _ttsCacheSet(key, audio) {
  if (_ttsCache.size >= _ttsMaxCache) {
    const firstKey = _ttsCache.keys().next().value;
    if (firstKey !== undefined) _ttsCache.delete(firstKey);
  }
  _ttsCache.set(key, audio);
}

async function _ttsProcessQueue() {
  if (_ttsPlaying || _ttsQueue.length === 0) return;
  _ttsPlaying = true;
  const { text, cacheKey } = _ttsQueue.shift();
  try {
    let audio = _ttsCache.get(cacheKey);
    if (!audio) {
      const p = await resolvePuter();
      if (!p || !p.ai || typeof p.ai.txt2speech !== 'function') {
        _ttsPlaying = false;
        _ttsProcessQueue();
        return;
      }
      audio = await p.ai.txt2speech(text, {
        provider: 'aws-polly',
        voice: 'Matthew',
      });
      if (audio) _ttsCacheSet(cacheKey, audio);
    }
    if (audio && typeof audio.play === 'function') {
      audio.volume = 0.55;
      audio.addEventListener('ended', () => {
        _ttsPlaying = false;
        _ttsProcessQueue();
      }, { once: true });
      audio.play().catch(() => {
        _ttsPlaying = false;
        _ttsProcessQueue();
      });
    } else {
      _ttsPlaying = false;
      _ttsProcessQueue();
    }
  } catch (_) {
    _ttsPlaying = false;
    _ttsProcessQueue();
  }
}

/**
 * Speak a phrase via Puter TTS. Queued so announcements don't overlap.
 * @param {string} text
 * @param {string} [cacheKey] - Optional cache key (defaults to text)
 */
export function speak(text, cacheKey) {
  if (!text) return;
  _ttsQueue.push({ text, cacheKey: cacheKey || text });
  if (!_ttsPlaying) _ttsProcessQueue();
}

// ── Skin Style Presets ─────────────────────────────────────────
const SKIN_STYLE_PRESETS = [
  { id: 'kamikaze', name: 'Kamikaze Red', emoji: '🇯🇵', desc: 'Rising sun livery — red disk, white fuselage, bold calligraphy accents', template: "WW1 biplane warplane fuselage texture, {prompt}, rising sun livery, red and white, bold kanji calligraphy, distressed paint, weathering, rivet details, metal panel lines, highly detailed texture atlas, seamless, 4k, pbr, unreal engine 5, octane render, cinematic lighting, dramatic clouds background", negative: 'blurry, low quality, cartoon, anime, flat, toy, lego, plastic, cgi, render artifacts, watermark, signature, text' },
  { id: 'cyberpunk', name: 'Cyberpunk Neon', emoji: '🌃', desc: 'Neon-drenched city fighter — magenta teal contrast, holographic accents', template: "WW1 biplane warplane fuselage texture, {prompt}, cyberpunk, neon noir, magenta and cyan, holographic decals, carbon fiber panels, glowing trim, rain-slicked metal, gritty urban, blade runner aesthetic, highly detailed texture atlas, seamless, 4k, pbr, octane render, volumetric fog", negative: 'daylight, sunny, cartoon, toy, lego, flat, pastel, blurry, low quality, watermark, signature' },
  { id: 'wasteland', name: 'Wasteland Desolation', emoji: '🏜️', desc: 'Rusted, sand-blasted war survivor with scavenged patchwork plates', template: "WW1 biplane warplane fuselage texture, {prompt}, post-apocalyptic, rusted metal, corroded panels, sand-blasted, weathered steel, war-torn, patchwork repairs, dented armor, desert worn, mad max inspired, highly detailed texture atlas, seamless, 4k, pbr, gritty realistic", negative: 'clean, pristine, polished, new, shiny, cartoon, anime, toy, lego, blurry, low quality, watermark' },
  { id: 'arctic', name: 'Arctic Ghost', emoji: '❄️', desc: 'Frozen tundra stealth — white/grey digital camo with frost rime', template: "WW1 biplane warplane fuselage texture, {prompt}, arctic white and grey, digital camouflage, frost rime, ice crystals, snow-dusted, cold steel, matte finish, stealth coatings, frozen tundra, highly detailed texture atlas, seamless, 4k, pbr, ambient occlusion, rim lighting", negative: 'warm colors, gold, red, orange, cartoon, anime, toy, blurry, low quality, watermark, signature, bright, sunny' },
  { id: 'woodgrain', name: 'Vintage Woodgrain', emoji: '🪵', desc: 'Classic wooden warbird — varnished mahogany, brass fittings, canvas wings', template: "WW1 biplane warplane fuselage texture, {prompt}, varnished mahogany wood, dark stained oak, brass rivets, canvas fabric, vintage aviation, 1910s warbird, art deco accents, shellac finish, warm amber tones, highly detailed wood grain, seamless texture, 4k, pbr, photorealistic", negative: 'plastic, modern, neon, cyberpunk, sci-fi, cartoon, anime, toy, lego, blurry, low quality, watermark' },
  { id: 'stealth', name: 'Stealth Matte', emoji: '⚫', desc: 'Modern stealth fighter aesthetic — matte black, flat grey, minimal reflections', template: "WW1 biplane warplane fuselage texture, {prompt}, stealth fighter matte finish, flat black and charcoal grey, radar-absorbent panels, minimal reflections, tactical, military grade, non-reflective coating, sharp geometric shapes, highly detailed texture atlas, seamless, 4k, pbr, ultra realistic", negative: 'glossy, shiny, polished, chrome, neon, bright colors, decals, cartoon, anime, toy, lego, blurry, low quality, watermark' },
  { id: 'flame', name: 'Flame Streak', emoji: '🔥', desc: 'Hot rod flames licking the fuselage — orange-red gradients on dark base', template: "WW1 biplane warplane fuselage texture, {prompt}, hot rod flame job, orange and red flames, dark grey base, airbrushed gradients, custom paint job, kustom kulture, pinstripe details, gloss clear coat, highly detailed texture atlas, seamless, 4k, pbr, showroom shine", negative: 'rust, damaged, worn, cartoon, anime, toy, lego, flat, matte, blurry, low quality, watermark, signature, text' },
  { id: 'digital', name: 'Digital Rez', emoji: '💎', desc: 'Low-poly voxel aesthetic — faceted gem-like panels, retro arcade vibes', template: "WW1 biplane warplane fuselage texture, {prompt}, low-poly voxel style, faceted geometric panels, retro arcade aesthetic, pixel-art inspired, sharp angular planes, synthetic materials, glowing edges, tron legacy vibe, highly detailed texture atlas, seamless, 4k, pbr, neon accents", negative: 'organic, smooth, round, realistic paint, wood, fabric, blurry, low quality, watermark, signature, photorealistic' },
  { id: 'camo', name: 'Jungle Camo', emoji: '🌿', desc: 'Dense jungle camouflage — olive, khaki, brown organic patterns', template: "WW1 biplane warplane fuselage texture, {prompt}, military camouflage, jungle pattern, olive green and khaki brown, organic shapes, matte tactical finish, field-worn, foliage netting details, humid environment weathering, highly detailed texture atlas, seamless, 4k, pbr, realistic military paint", negative: 'shiny, bright colors, neon, cartoon, anime, toy, lego, clean, pristine, blurry, low quality, watermark' },
  { id: 'chrome', name: 'Chrome Beast', emoji: '🪞', desc: 'Mirror-polished chrome — high-gloss reflective surfaces, silver bullet', template: "WW1 biplane warplane fuselage texture, {prompt}, mirror polished chrome, high-gloss reflective metal, silver, liquid metal, show chrome, environment reflection, flawless surface, automotive grade, highly detailed texture atlas, seamless, 4k, pbr, raytraced reflections, ultra realistic", negative: 'matte, flat, rust, worn, damaged, cartoon, anime, toy, lego, blurry, low quality, watermark, signature, text, paint' },
  { id: 'steampunk', name: 'Steampunk Brass', emoji: '⚙️', desc: 'Victorian engineering — polished brass, copper pipes, gears, rivets, steam vents', template: "WW1 biplane warplane fuselage texture, {prompt}, steampunk, polished brass and copper, Victorian era engineering, intricate gears, clockwork mechanisms, steam pipes, riveted plates, leather straps, brass fittings, sepia bronze patina, hot air balloon canvas, highly detailed texture atlas, seamless, 4k, pbr, octane render, dramatic workshop lighting", negative: 'modern, plastic, neon, cyberpunk, shiny chrome, cartoon, anime, toy, lego, blurry, low quality, watermark, signature' },
  { id: 'bioluminescent', name: 'Bioluminescent', emoji: '🧬', desc: 'Alien biology — living metal with glowing organic veins, pulsating patterns', template: "WW1 biplane warplane fuselage texture, {prompt}, bioluminescent alien organic, living metal, glowing neon veins, pulsating patterns, deep purple and cyan, iridescent chitin, translucent membranes, alien biology, sci-fi organism, phosphorescent glow, dark background, highly detailed texture atlas, seamless, 4k, pbr, unreal engine 5, volumetric glow", negative: 'rust, worn, dirty, cartoon, anime, toy, lego, flat, matte, blurry, low quality, watermark, signature, wood, metal' },
  { id: 'pixelart', name: 'Pixel Art', emoji: '🕹️', desc: '8-bit retro game — chunky pixels, NES palette, scanline nostalgia', template: "WW1 biplane warplane fuselage texture, {prompt}, 8-bit pixel art, retro NES game texture, chunky square pixels, limited color palette, blocky sprites, scanline overlay, retro gaming aesthetic, pixel-perfect, chiptune vibes, classic arcade, highly detailed pixel art texture atlas, seamless, 4k, crisp pixel rendering", negative: 'smooth, realistic, photorealistic, 3d render, pbr, painted, oil, watercolor, blurry, low quality, watermark, signature, anti-aliased' },
  { id: 'origami', name: 'Origami Paper', emoji: '🦢', desc: 'Folded paper craft — washi texture, crisp geometric creases, light and shadow', template: "WW1 biplane warplane fuselage texture, {prompt}, origami folded paper, washi paper texture, crisp geometric creases, papercraft, folded plane, white textured paper, subtle fiber grain, sharp angular folds, lighting and shadow across creases, paper seams, highly detailed texture atlas, seamless, 4k, pbr, macro photography of paper", negative: 'metal, plastic, wood, paint, rust, shiny, glossy, wet, cartoon, anime, toy, lego, blurry, low quality, watermark, signature, rough' },
];

const PORTRAIT_TEMPLATES = {
  kamikaze:  "pilot portrait photograph, {prompt}, WW1 aviator, rising sun backdrop, dramatic lighting, cinematic portrait, detailed face, weathered military gear, leather flight jacket, vintage goggles, heroic expression, photorealistic, 8k, canon 85mm, professional color grading",
  cyberpunk: "pilot portrait photograph, {prompt}, cyberpunk, neon city lights bokeh, holographic visor, techwear jacket, face illuminated by neon signs, blade runner aesthetic, detailed cybernetic implants, gritty, cinematic, 8k, professional portrait photography",
  wasteland: "pilot portrait photograph, {prompt}, post-apocalyptic wasteland warrior, dusty face, scavenged gear, welding goggles, weathered leather, sand and grime, fierce determined expression, mad max style, cinematic lighting, 8k, professional portrait",
  arctic:    "pilot portrait photograph, {prompt}, arctic explorer, fur-lined hood, frost on eyelashes, cold breath, pale winter light, snow-covered background, intense blue eyes, survival gear, cinematic portrait, 8k, professional photography",
  woodgrain: "pilot portrait photograph, {prompt}, 1910s vintage aviator, sepia tones, leather flying helmet, brass goggles, canvas flight suit, old photograph style, warm film grain, classic aviation, historical portrait, 8k, professional",
  stealth:   "pilot portrait photograph, {prompt}, modern military pilot, tactical headset, matte black helmet, subdued lighting, serious expression, night operation, tactical gear, steely eyes, professional portrait, 8k, cinematic, photorealistic",
  flame:     "pilot portrait photograph, {prompt}, hot rod culture pilot, flame tattoo on face, leather jacket with flame decals, rebel sunglasses, confident smirk, dramatic backlit, orange glow, cinematic portrait, 8k, professional",
  digital:   "pilot portrait photograph, {prompt}, low-poly voxel portrait, geometric face, digital art, pixel-perfect, retro arcade aesthetic, faceted features, synthetic being, neon wireframe lines, tron style, digital painting, 8k",
  camo:      "pilot portrait photograph, {prompt}, jungle warfare pilot, face paint camouflage, dense foliage background, humid atmosphere, combat gear, focused expression, military portrait, natural lighting, 8k, professional photography",
  chrome:    "pilot portrait photograph, {prompt}, mirror chrome finish, liquid metal face, reflective surfaces, sci-fi pilot, polished steel, futuristic helmet, gleaming armor, high contrast lighting, cinematic portrait, 8k, photorealistic",
  steampunk: "pilot portrait photograph, {prompt}, steampunk aviator, brass goggles, leather top hat, copper earphone, Victorian suit, steam machine background, sepia tones, intricate gear jewelry, dramatic workshop lighting, cinematic portrait, 8k, professional photography",
  bioluminescent: "pilot portrait photograph, {prompt}, bioluminescent alien, glowing skin patterns, neon veins on face, otherworldly eyes, dark atmosphere, floating particles, ethereal glow, cyan and purple lighting, sci-fi portrait, cinematic, 8k, professional photography",
  pixelart:  "pilot portrait photograph, {prompt}, 8-bit pixel art portrait, retro NES style, chunky pixels, limited color palette, blocky facial features, retro gaming aesthetic, nostalgic, scanline overlay, pixel-perfect, 8k pixel art, professional portrait",
  origami:   "pilot portrait photograph, {prompt}, origami paper portrait, folded paper face, geometric creases, washi texture, papercraft sculpture, subtle shadows across folds, white textured paper, angular features, macro photography, 8k, professional portrait",
};

/**
 * Build an optimized Stable Diffusion prompt from user input and selected preset.
 * @param {string} userPrompt
 * @param {string} presetId
 * @param {object} [options]
 * @param {boolean} [options.isPortrait]
 * @returns {{ prompt: string, negative: string, preset: object }}
 */
export function buildSkinPrompt(userPrompt, presetId, options = {}) {
  const preset = SKIN_STYLE_PRESETS.find(p => p.id === presetId) || SKIN_STYLE_PRESETS[0];
  const cleanInput = (userPrompt || '').trim();
  const promptTemplate = options.isPortrait
    ? (PORTRAIT_TEMPLATES[presetId] || PORTRAIT_TEMPLATES.kamikaze)
    : preset.template;
  const prompt = promptTemplate.replace('{prompt}', cleanInput ? cleanInput + ', ' : '');
  return { prompt, negative: preset.negative, preset };
}

/**
 * Get all available skin style presets.
 * @returns {Array}
 */
export function getSkinStylePresets() {
  return SKIN_STYLE_PRESETS.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, desc: p.desc }));
}

// ── Building Color Palette Templates ────────────────────────────
const BUILDING_STYLE_TEMPLATES = {
  kamikaze:  "flat vector color swatches, {prompt} japanese city palette, warm red and white, indigo rooftops, sakura pink accents, zen garden stone, bamboo green, bold rising sun palette, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  cyberpunk: "flat vector color swatches, {prompt} neon cyberpunk city palette, magenta cyan electric blue, dark purple, hot pink, toxic green, holographic white, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  wasteland: "flat vector color swatches, {prompt} post-apocalyptic wasteland palette, rusted orange, sand tan, corroded green, weathered grey, faded brown, dust yellow, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  arctic:    "flat vector color swatches, {prompt} frozen arctic city palette, ice blue, frost white, silver grey, pale cyan, snow shadow, cold steel, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  woodgrain: "flat vector color swatches, {prompt} vintage city palette, warm mahogany, brass gold, cream beige, dark oak, olive green, terracotta, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  stealth:   "flat vector color swatches, {prompt} tactical military city palette, matte black, charcoal grey, olive drab, slate, dark navy, gunmetal, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  flame:     "flat vector color swatches, {prompt} hot rod city palette, flame red, burnt orange, yellow gold, dark grey, white stripe, deep black, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  digital:   "flat vector color swatches, {prompt} retro digital city palette, neon green, electric blue, hot pink, cyan, purple, bright white, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  camo:      "flat vector color swatches, {prompt} jungle camouflage city palette, olive green, khaki tan, dark brown, mud grey, foliage green, sand, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  chrome:    "flat vector color swatches, {prompt} chrome reflective city palette, mirror silver, gunmetal grey, polished steel, white chrome, dark reflector, brushed aluminum, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  steampunk: "flat vector color swatches, {prompt} steampunk city palette, polished brass, copper patina, dark iron, leather brown, cream parchment, emerald glass, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  bioluminescent: "flat vector color swatches, {prompt} bioluminescent alien city palette, glowing cyan, neon purple, phosphorescent green, deep indigo, iridescent pink, alien teal, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  pixelart:  "flat vector color swatches, {prompt} 8-bit retro city palette, nes classic, blocky primary colors, bright red, sky blue, grass green, chocolate brown, pale yellow, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  origami:   "flat vector color swatches, {prompt} origami paper city palette, washi white, subtle cream, soft grey, pale celadon, warm beige, ink black, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
};

function extractPaletteFromImage(imageUrl, count = 7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (imageUrl && !imageUrl.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = count;
        const h = 1;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const colors = [];
        for (let i = 0; i < w; i++) {
          const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
          if (a < 128) continue;
          const hex = (Math.round(r / 8) * 8 << 16) | (Math.round(g / 8) * 8 << 8) | Math.round(b / 8) * 8;
          const isDup = colors.some(c => Math.abs(c - hex) < 0x101010);
          if (!isDup) colors.push(hex);
        }
        while (colors.length < count) colors.push(colors.length ? colors[colors.length - 1] : 0x888888);
        resolve(colors.slice(0, count));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

/**
 * Generate a building color palette from user prompt and style preset.
 * @param {string} userPrompt
 * @param {string} presetId
 * @returns {Promise<{ palette: number[], roofColor: number, accentColor: number, imageUrl: string }|null>}
 */
export async function generateBuildingPalette(userPrompt, presetId) {
  if (!userPrompt) return null;
  const template = BUILDING_STYLE_TEMPLATES[presetId] || BUILDING_STYLE_TEMPLATES.kamikaze;
  const cleanInput = userPrompt.trim();
  const prompt = template.replace('{prompt}', cleanInput ? cleanInput + ', ' : '');
  const imageUrl = await generateImage(prompt, { size: '512x512' });
  if (!imageUrl) return null;
  try {
    const palette = await extractPaletteFromImage(imageUrl, 7);
    const sorted = [...palette].sort((a, b) => {
      const lumA = (a >> 16 & 255) * 0.299 + (a >> 8 & 255) * 0.587 + (a & 255) * 0.114;
      const lumB = (b >> 16 & 255) * 0.299 + (b >> 8 & 255) * 0.587 + (b & 255) * 0.114;
      return lumA - lumB;
    });
    return { palette, roofColor: sorted[0], accentColor: sorted[sorted.length - 1], imageUrl };
  } catch (e) {
    dbg.warn('generateBuildingPalette color extraction failed', e);
    return { palette: [0x5c6bc0, 0x26a69a, 0xab47bc, 0xef5350, 0xffa726, 0x42a5f5, 0x55d65f], roofColor: 0x4a4a6a, accentColor: 0x2a2f3a, imageUrl };
  }
}
