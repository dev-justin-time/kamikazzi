import { BLOCK_TYPES } from './world.js';

export class Chat {
  constructor() {
    this.container = document.getElementById('chat-container');
    this.history = document.getElementById('chat-history');
    this.input = document.getElementById('chat-input');
    this.wrapper = document.getElementById('chat-input-wrapper');
    this.sendBtn = document.getElementById('chat-send-btn');
    
    this.suggestionBox = document.createElement('div');
    this.suggestionBox.id = 'chat-suggestions';
    
    if (this.wrapper) {
      this.container.insertBefore(this.suggestionBox, this.wrapper);
    } else {
      this.container.insertBefore(this.suggestionBox, this.input);
    }
    
    this.gameInterface = null;
    this.isOpen = false;
    this.fadeTimers = new Map();
    
    this.username = "Player";
    this.fetchUser();

    // Database setup
    this.room = new WebsimSocket();
    this.serverId = null;
    this.lastMessageId = null;
    this.isOp = false;

    this.setupListeners();
    this.startObfuscationLoop();
    
    // Ensure input regains focus if window was blurred (alt-tab)
    this.boundOnWindowFocus = () => {
       if (this.isOpen && this.input) {
          setTimeout(() => this.input.focus(), 50);
       }
    };
    window.addEventListener('focus', this.boundOnWindowFocus);
  }

  startObfuscationLoop() {
    this.obfuscationInterval = setInterval(() => {
      if (!this.history) return;
      // Find all obfuscated spans in chat history
      const elements = this.history.getElementsByClassName('mc-obfuscated');
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
      
      for (const el of elements) {
         // Check if element is still in DOM and visible (optimization)
         if (el.offsetParent !== null) {
            let str = "";
            const len = el.innerText.length;
            for(let i=0; i<len; i++) {
               str += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            el.innerText = str;
         }
      }
    }, 50); // ~20 updates/sec
  }

  initMultiplayer(serverId) {
    this.serverId = serverId;
    this.checkOpStatus();
    
    // Subscribe to ops changes
    this.unsubscribeOps = this.room.collection('server_ops').filter({ server_id: serverId }).subscribe(() => {
       this.checkOpStatus();
    });

    // Listen for ephemeral chat messages
    this.room.onmessage = (event) => {
       const data = event.data;
       if (data.type === 'chat' && data.serverId === this.serverId) {
          if (data.clientId !== this.room.clientId) {
             // If username is explicitly null in payload, it's a system message (no brackets)
             const author = data.username === null ? null : (data.username || "Unknown");
             this.addMessage(data.message, author);
          }
       }
    };
  }

  async fetchUser() {
    if (window.websim && window.websim.getCurrentUser) {
      try {
        const user = await window.websim.getCurrentUser();
        if (user && user.username) {
          this.username = user.username;
        }
        // Track player presence in DB (Removed)
      } catch (e) {
        console.error("Error fetching user:", e);
      }
    }
  }

  async checkOpStatus() {
     if (!this.serverId || !this.username) return;
     const ops = await this.room.collection('server_ops').filter({
        server_id: this.serverId,
        username: this.username
     }).getList();
     
     const wasOp = this.isOp;
     this.isOp = ops.length > 0;
     
     if (wasOp !== this.isOp) {
        if (this.isOp) this.addMessage("You are now a server operator", null, '#55FFFF');
        else this.addMessage("You are no longer a server operator", null, '#55FFFF');
     }
  }

  setGameInterface(gameInterface) {
    this.gameInterface = gameInterface;
  }

  setupListeners() {
    // Global key listener to open chat
    this.boundOnGlobalKeyDown = (e) => {
      if (e.key === 't' || e.key === 'T') {
        if (!this.isOpen && document.activeElement !== this.input) {
          e.preventDefault();
          this.open();
        }
      }
      if (e.key === '/') {
        if (!this.isOpen && document.activeElement !== this.input) {
          e.preventDefault();
          this.open();
          this.input.value = '/';
        }
      }
    };
    window.addEventListener('keydown', this.boundOnGlobalKeyDown);

    // Send button listener
    if (this.sendBtn) {
      this.boundHandleSend = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.sendMessage();
        this.close();
      };
      this.sendBtn.addEventListener('click', this.boundHandleSend);
      this.sendBtn.addEventListener('touchstart', this.boundHandleSend);
    }

    // Input specific listeners
    this.boundOnInput = () => {
      this.updateSuggestions();
    };
    this.input.addEventListener('input', this.boundOnInput);

    this.boundOnInputKeydown = (e) => {
      e.stopPropagation(); // Stop event bubbling to controls
      
      if (e.key === 'Enter') {
        this.sendMessage();
        this.close();
      } else if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.applySuggestion();
      }
    };
    this.input.addEventListener('keydown', this.boundOnInputKeydown);
  }

  dispose() {
    if (this.boundOnGlobalKeyDown) window.removeEventListener('keydown', this.boundOnGlobalKeyDown);
    if (this.boundOnWindowFocus) window.removeEventListener('focus', this.boundOnWindowFocus);
    
    // Clean up persistent element listeners
    if (this.sendBtn && this.boundHandleSend) {
      this.sendBtn.removeEventListener('click', this.boundHandleSend);
      this.sendBtn.removeEventListener('touchstart', this.boundHandleSend);
    }
    
    if (this.input) {
      if (this.boundOnInput) this.input.removeEventListener('input', this.boundOnInput);
      if (this.boundOnInputKeydown) this.input.removeEventListener('keydown', this.boundOnInputKeydown);
    }
    
    // Clear onmessage handler
    if (this.room) {
      this.room.onmessage = null;
    }
    
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    if (this.obfuscationInterval) clearInterval(this.obfuscationInterval);

    // Hide chat if open
    this.close();
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.container.classList.add('active');
    
    if (this.wrapper) {
      this.wrapper.style.display = 'flex';
    } else {
      this.input.style.display = 'block';
    }
    
    this.input.focus();
    
    // Release pointer lock so user can type/interact
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.container.classList.remove('active');
    
    if (this.wrapper) {
      this.wrapper.style.display = 'none';
    } else {
      this.input.style.display = 'none';
    }

    this.input.value = '';
    this.suggestionBox.style.display = 'none';
    this.input.blur();
    
    // Automatically resume game (request pointer lock) if on desktop
    const canvas = document.getElementById('game-canvas');
    if (canvas && !('ontouchstart' in window)) {
       canvas.requestPointerLock();
    }
  }

  sendMessage() {
    const text = this.input.value.trim();
    if (text.length > 0) {
      if (text.startsWith('/')) {
        this.processCommand(text);
      } else {
        // Local echo
        this.addMessage(text, this.username);
        
        // Send to server if multiplayer
        if (this.serverId) {
           this.room.send({
              type: 'chat',
              serverId: this.serverId,
              message: text,
              username: this.username
           });
        }
      }
    }
  }

  processCommand(cmd) {
    // Log command usage (DB logging removed)

    const parts = cmd.substring(1).split(' ');
    const command = parts[0].toLowerCase();
    
    if (this.serverId && !this.isOp) {
       this.addMessage("You do not have permission to use commands.", null);
       return;
    }

    if (command === 'tp') {
       this.handleTeleport(parts);
    } else if (command === 'give') {
      if (parts.length < 3) {
        this.addMessage('Usage: /give <player> <item> [amount]', null);
        return;
      }
      
      const targetPlayerName = parts[1];
      const itemName = parts[2].toUpperCase();
      let blockType = BLOCK_TYPES[itemName];
      
      if (blockType === undefined) {
        this.addMessage(`Unknown item: ${parts[2]}`, null);
        return;
      }
      
      const amount = parts.length > 3 ? parseInt(parts[3]) : 1;
      if (isNaN(amount)) {
         this.addMessage('Invalid amount', null);
         return;
      }

      // Check if giving to self
      if (targetPlayerName.toLowerCase() === this.username.toLowerCase() || targetPlayerName === '@s' || targetPlayerName === 'me') {
          if (this.gameInterface && this.gameInterface.giveItem) {
            this.gameInterface.giveItem(blockType, amount);
            this.addMessage(`Gave ${amount} [${itemName}] to ${this.username}`, null);
          }
      } else {
          // Find target client ID
          const targetClientId = this.getClientIdByName(targetPlayerName);
          if (targetClientId) {
             this.room.requestPresenceUpdate(targetClientId, {
                type: 'give',
                item: blockType,
                amount: amount
             });
             this.addMessage(`Gave ${amount} [${itemName}] to ${targetPlayerName}`, null);
          } else {
             this.addMessage(`Player '${targetPlayerName}' not found.`, null, '#ff5555');
          }
      }
    } else if (command === 'op') {
       const targetInput = parts[1];
       if (targetInput) {
          // Resolve correct casing
          let targetUsername = targetInput;
          const clientId = this.getClientIdByName(targetInput);
          if (clientId && this.room.peers[clientId]) {
             targetUsername = this.room.peers[clientId].username;
          }

          this.room.collection('server_ops').create({
             server_id: this.serverId,
             username: targetUsername
          })
          .then(() => this.addMessage(`Opped ${targetUsername}`, null, '#55FFFF'))
          .catch(e => this.addMessage(`Error opping player: ${e.message}`, null, '#ff5555'));
       } else {
          this.addMessage("Usage: /op <player>", null);
       }
    } else if (command === 'deop') {
       const targetInput = parts[1];
       if (targetInput) {
          let targetUsername = targetInput;
          const clientId = this.getClientIdByName(targetInput);
          if (clientId && this.room.peers[clientId]) {
             targetUsername = this.room.peers[clientId].username;
          }

          this.room.collection('server_ops').filter({
             server_id: this.serverId,
             username: targetUsername
          }).getList().then(records => {
             records.forEach(r => this.room.collection('server_ops').delete(r.id));
             this.addMessage(`De-opped ${targetUsername}`, null, '#55FFFF');
          });
       } else {
          this.addMessage("Usage: /deop <player>", null);
       }
    } else if (command === 'tp') {
       if (parts.length === 4) {
          // /tp x y z
          const x = parseFloat(parts[1]);
          const y = parseFloat(parts[2]);
          const z = parseFloat(parts[3]);
          if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
             if (this.gameInterface && this.gameInterface.teleport) {
                this.gameInterface.teleport(x, y, z);
                this.addMessage(`Teleported to ${x}, ${y}, ${z}`, null);
             }
          } else {
             this.addMessage("Invalid coordinates", null);
          }
       } else {
          this.addMessage("Usage: /tp <x> <y> <z>", null);
       }
    } else if (command === 'time') {
       if (parts.length >= 3 && parts[1].toLowerCase() === 'set') {
          let val = parseInt(parts[2]);
          const key = parts[2].toLowerCase();
          
          if (key === 'day') val = 1000;
          else if (key === 'noon') val = 6000;
          else if (key === 'sunset') val = 12000;
          else if (key === 'night') val = 13000;
          else if (key === 'midnight') val = 18000;
          else if (key === 'sunrise') val = 23000;

          if (!isNaN(val)) {
             if (this.gameInterface && this.gameInterface.setTime) {
                this.gameInterface.setTime(val);
                this.addMessage(`Set time to ${val}`, null, '#ffff55');
             }
          } else {
             this.addMessage("Invalid time value.", null, '#ff5555');
          }
       } else {
          this.addMessage("Usage: /time set <number|day|noon|night|midnight>", null);
       }
    } else if (command === 'summon') {
       // /summon <x> <y> <z> <mob>
       if (parts.length < 5) {
          this.addMessage("Usage: /summon <x> <y> <z> <mob>", null);
          return;
       }
       
       let px = 0, py = 0, pz = 0;
       if (this.gameInterface && this.gameInterface.getPlayerPosition) {
           const pos = this.gameInterface.getPlayerPosition();
           px = pos.x; py = pos.y; pz = pos.z;
       }

       const x = this.parseCoord(parts[1], px);
       const y = this.parseCoord(parts[2], py);
       const z = this.parseCoord(parts[3], pz);
       const mob = parts[4];

       if (this.gameInterface && this.gameInterface.summon) {
           const success = this.gameInterface.summon(mob, x, y, z);
           if (success) {
               this.addMessage(`Summoned new ${mob}`, null, '#ffff55');
           } else {
               this.addMessage(`${mob} is not a valid mob`, null, '#ff5555');
           }
       }
    } else {
      this.addMessage(`Unknown command: ${command}`, null);
    }
  }

  getClientIdByName(name) {
     if (!this.room || !this.room.peers) return null;
     
     const lower = name.toLowerCase();
     
     // Special case for self
     if (lower === this.username.toLowerCase() || lower === '@s' || lower === 'me') return this.room.clientId;

     const entry = Object.entries(this.room.peers).find(([id, p]) => p.username && p.username.toLowerCase() === lower);
     return entry ? entry[0] : null;
  }

  getPresence(clientId) {
     // Check if it's us
     if (clientId === this.room.clientId) {
        // We might not be in room.presence immediately if we haven't moved, 
        // but we can't easily access player position from here without gameInterface query.
        // However, for relative coords on self, we usually assume the game handles it or we pass a flag.
        // But for consistency let's try to get it from presence or gameInterface if extended.
        return this.room.presence[clientId] || null;
     }
     return this.room.presence[clientId];
  }
  
  parseCoord(input, currentVal) {
     if (input.startsWith('~')) {
        const offset = parseFloat(input.substring(1)) || 0;
        return currentVal + offset;
     }
     return parseFloat(input);
  }

  handleTeleport(parts) {
     // /tp [target] [dest]
     // /tp [target] x y z
     
     // Args excluding command
     const args = parts.slice(1);
     if (args.length === 0) {
        this.addMessage("Usage: /tp <player> <destination> OR /tp <player> <x> <y> <z>", null, '#ff5555');
        return;
     }

     let targetClient = null;
     let destClient = null;
     let x, y, z;
     let isCoord = false;

     // Case 1: /tp <x> <y> <z>  (Target is self)
     // Detect if args[0] is numeric or tilde
     if (args.length === 3 && (isFinite(args[0]) || args[0].startsWith('~'))) {
        targetClient = this.room.clientId; // Self
        isCoord = true;
     } 
     // Case 2: /tp <target> <x> <y> <z>
     else if (args.length === 4) {
        targetClient = this.getClientIdByName(args[0]);
        isCoord = true;
     }
     // Case 3: /tp <target> <destinationPlayer>
     else if (args.length === 2) {
        targetClient = this.getClientIdByName(args[0]);
        destClient = this.getClientIdByName(args[1]);
     } 
     // Case 4: /tp <destinationPlayer> (Target is self)
     else if (args.length === 1) {
        targetClient = this.room.clientId;
        destClient = this.getClientIdByName(args[0]);
     }

     if (!targetClient) {
        this.addMessage("Player not found.", null, '#ff5555');
        return;
     }

     let targetPos = { x: 0, y: 0, z: 0 };
     // If we need current position for relative coords, we need to fetch it.
     // If target is self, we use local game interface.
     // If target is other, we use presence.
     const currentPresence = this.room.presence[targetClient];
     
     if (targetClient === this.room.clientId && this.gameInterface && this.gameInterface.getPlayerPosition) {
        targetPos = this.gameInterface.getPlayerPosition();
     } else if (currentPresence && currentPresence.position) {
        targetPos = currentPresence.position;
     }

     if (isCoord) {
        const xArg = args[args.length - 3];
        const yArg = args[args.length - 2];
        const zArg = args[args.length - 1];
        
        x = this.parseCoord(xArg, targetPos.x);
        y = this.parseCoord(yArg, targetPos.y);
        z = this.parseCoord(zArg, targetPos.z);
     } else {
        if (!destClient) {
           this.addMessage("Destination player not found.", null, '#ff5555');
           return;
        }
        const destPresence = this.room.presence[destClient];
        if (!destPresence || !destPresence.position) {
           this.addMessage("Destination player has no position data.", null, '#ff5555');
           return;
        }
        x = destPresence.position.x;
        y = destPresence.position.y;
        z = destPresence.position.z;
     }

     // Execute
     if (targetClient === this.room.clientId) {
        // Teleport Self
        if (this.gameInterface && this.gameInterface.teleport) {
           this.gameInterface.teleport(x, y, z);
           this.addMessage(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`, null, '#ffff55');
        }
     } else {
        // Teleport Other
        this.room.requestPresenceUpdate(targetClient, {
           type: 'teleport',
           x, y, z
        });
        const targetName = this.room.peers[targetClient]?.username || "Player";
        this.addMessage(`Teleported ${targetName} to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`, null, '#ffff55');
     }
  }

  updateSuggestions() {
    const text = this.input.value;
    if (!text.startsWith('/')) {
      this.suggestionBox.style.display = 'none';
      return;
    }

    const parts = text.split(' ');
    const commandPart = parts[0].substring(1).toLowerCase();
    
    const COMMANDS = ['give', 'tp', 'op', 'deop', 'say', 'time', 'summon'];
    
    // Suggest command itself if typing partial command
    if (parts.length === 1) {
       const matches = COMMANDS.filter(c => c.startsWith(commandPart));
       if (matches.length > 0) {
          this.suggestionBox.style.display = 'block';
          const best = matches[0];
          this.currentSuggestion = `/${best} `;
          let html = `<span style="color: yellow">/${best}</span>`;
          if (matches.length > 1) html += ` <span style="color: #666">(${matches.length-1} others)</span>`;
          this.suggestionBox.innerHTML = html;
       } else {
          this.suggestionBox.style.display = 'none';
       }
       return;
    }

    const command = parts[0].substring(1).toLowerCase();

    // Helper to get player matches
    const getPlayerMatches = (partial) => {
       const peers = this.room.peers || {};
       const names = Object.values(peers).map(p => p.username).filter(n => n);
       // Add 'Player' if offline testing or self if not in peers list yet
       if (this.username && !names.includes(this.username)) names.push(this.username);
       // Filter
       return names.filter(n => n.toLowerCase().startsWith(partial.toLowerCase()));
    };

    if (command === 'give') {
      this.suggestionBox.style.display = 'block';
      let html = '';
      
      if (parts.length === 2) {
         // Player name
         const inputName = parts[1];
         const matches = getPlayerMatches(inputName);
         
         if (matches.length > 0) {
           const best = matches[0];
           html = `/give <span style="color: yellow">${best}</span> <item> [amount]`;
           this.currentSuggestion = `/give ${best} `;
         } else {
           html = `/give <span style="color: red">${parts[1]}</span> <item> [amount]`;
           this.currentSuggestion = null;
         }
      } else if (parts.length === 3) {
         // Item name
         const inputItem = parts[2].toUpperCase();
         const items = Object.keys(BLOCK_TYPES).filter(k => k !== 'AIR');
         const matches = items.filter(i => i.startsWith(inputItem));
         
         if (matches.length > 0) {
           matches.sort((a,b) => a.length - b.length);
           const best = matches[0].toLowerCase();
           html = `/give ${parts[1]} <span style="color: yellow">${best}</span> [amount]`;
           if (matches.length > 1) html += ` <span style="color: #666">(${matches.length - 1} others)</span>`;
           this.currentSuggestion = `/give ${parts[1]} ${best} `;
         } else {
           html = `/give ${parts[1]} <span style="color: red">${parts[2]}</span> [amount]`;
           this.currentSuggestion = null;
         }
      } else if (parts.length === 4) {
         html = `/give ${parts[1]} ${parts[2]} <span style="color: yellow">${parts[3] || '1'}</span>`;
         this.currentSuggestion = null;
      }
      this.suggestionBox.innerHTML = html;

    } else if (command === 'op' || command === 'deop') {
       this.suggestionBox.style.display = 'block';
       const inputName = parts[1] || "";
       const matches = getPlayerMatches(inputName);
       
       if (matches.length > 0) {
          const best = matches[0];
          this.suggestionBox.innerHTML = `/${command} <span style="color: yellow">${best}</span>`;
          this.currentSuggestion = `/${command} ${best}`;
       } else {
          this.suggestionBox.innerHTML = `/${command} <span style="color: red">${inputName}</span>`;
          this.currentSuggestion = null;
       }

    } else if (command === 'time') {
       this.suggestionBox.style.display = 'block';
       if (parts.length === 2) {
           // Suggest 'set'
           const input = parts[1].toLowerCase();
           if ('set'.startsWith(input)) {
               this.suggestionBox.innerHTML = `/time <span style="color: yellow">set</span> <value>`;
               this.currentSuggestion = `/time set `;
           } else {
               this.suggestionBox.innerHTML = `/time <span style="color: red">${parts[1]}</span>`;
               this.currentSuggestion = null;
           }
       } else if (parts.length === 3 && parts[1].toLowerCase() === 'set') {
           const timeKeywords = ['day', 'noon', 'sunset', 'night', 'midnight', 'sunrise'];
           const partial = parts[2].toLowerCase();
           const matches = timeKeywords.filter(k => k.startsWith(partial));
           
           if (matches.length > 0) {
               const best = matches[0];
               this.suggestionBox.innerHTML = `/time set <span style="color: yellow">${best}</span>`;
               this.currentSuggestion = `/time set ${best}`;
           } else if (!isNaN(parseInt(partial))) {
               this.suggestionBox.innerHTML = `/time set <span style="color: yellow">${partial}</span>`;
               this.currentSuggestion = null;
           } else {
               this.suggestionBox.innerHTML = `/time set <span style="color: red">${parts[2]}</span>`;
               this.currentSuggestion = null;
           }
       }

    } else if (command === 'summon') {
        this.suggestionBox.style.display = 'block';
        if (parts.length >= 2 && parts.length <= 4) {
            // Coords
            const coord = parts[parts.length-1];
            if (isFinite(coord) || coord.startsWith('~') || coord === '') {
               // Hint
               if (parts.length === 2) this.suggestionBox.innerHTML = `/summon <span style="color: yellow">~</span> <y> <z> <mob>`;
               if (parts.length === 3) this.suggestionBox.innerHTML = `/summon ${parts[1]} <span style="color: yellow">~</span> <z> <mob>`;
               if (parts.length === 4) this.suggestionBox.innerHTML = `/summon ${parts[1]} ${parts[2]} <span style="color: yellow">~</span> <mob>`;
               if (coord === '') this.currentSuggestion = this.input.value + "~ ";
               else this.currentSuggestion = null;
            }
        } else if (parts.length === 5) {
            const mobs = ['zombie'];
            const input = parts[4].toLowerCase();
            const matches = mobs.filter(m => m.startsWith(input));
            if (matches.length > 0) {
               const best = matches[0];
               this.suggestionBox.innerHTML = `/summon ${parts[1]} ${parts[2]} ${parts[3]} <span style="color: yellow">${best}</span>`;
               this.currentSuggestion = `/summon ${parts[1]} ${parts[2]} ${parts[3]} ${best}`;
            } else {
               this.suggestionBox.innerHTML = `/summon ${parts[1]} ${parts[2]} ${parts[3]} <span style="color: red">${input}</span>`;
               this.currentSuggestion = null;
            }
        }

    } else if (command === 'tp') {
       this.suggestionBox.style.display = 'block';
       // /tp <target> [dest]
       if (parts.length === 2) {
          const inputName = parts[1];
          const matches = getPlayerMatches(inputName);
          if (matches.length > 0) {
             const best = matches[0];
             this.suggestionBox.innerHTML = `/tp <span style="color: yellow">${best}</span> [dest]`;
             this.currentSuggestion = `/tp ${best} `;
          } else {
             this.suggestionBox.innerHTML = `/tp <span style="color: red">${inputName}</span> [dest]`;
             this.currentSuggestion = null;
          }
       } else if (parts.length === 3) {
          // Dest (player or x)
          const arg = parts[2];
          // Check if it looks like a coordinate
          if (isFinite(arg) || arg.startsWith('~')) {
             this.suggestionBox.innerHTML = `/tp ${parts[1]} <span style="color: yellow">${arg}</span> <y> <z>`;
             this.currentSuggestion = null;
          } else {
             const matches = getPlayerMatches(arg);
             if (matches.length > 0) {
                const best = matches[0];
                this.suggestionBox.innerHTML = `/tp ${parts[1]} <span style="color: yellow">${best}</span>`;
                this.currentSuggestion = `/tp ${parts[1]} ${best}`;
             } else {
                this.suggestionBox.innerHTML = `/tp ${parts[1]} <span style="color: red">${arg}</span>`;
                this.currentSuggestion = null;
             }
          }
       } else if (parts.length >= 4) {
           this.suggestionBox.innerHTML = `/tp ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]||'<z>'}`;
           this.currentSuggestion = null;
       }

    } else {
      this.suggestionBox.style.display = 'none';
    }
  }

  applySuggestion() {
    if (this.currentSuggestion) {
      this.input.value = this.currentSuggestion;
      this.updateSuggestions();
    }
  }

  formatMessageContent(text) {
    let output = '';
    
    let color = null;
    let bold = false;
    let italic = false;
    let underline = false;
    let strike = false;
    let obfuscated = false;
    
    let buffer = '';
    
    const flush = () => {
      if (buffer.length === 0) return;
      
      let style = '';
      if (color) style += `color:${color};`;
      if (bold) style += 'font-weight:bold;';
      if (italic) style += 'font-style:italic;';
      
      let decoration = '';
      if (underline) decoration += 'underline ';
      if (strike) decoration += 'line-through ';
      if (decoration) style += `text-decoration:${decoration.trim()};`;
      
      let cls = '';
      if (obfuscated) cls = 'class="mc-obfuscated"';
      
      const escaped = buffer
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      output += `<span ${cls} style="${style}">${escaped}</span>`;
      buffer = '';
    };

    const colors = {
        '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
        '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
        '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
        'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF'
    };

    let i = 0;
    while (i < text.length) {
      if (text[i] === '&') {
        // Lookahead
        
        // Hex Check: &x&r&r&g&g&b&b
        if (i + 13 < text.length && text[i+1].toLowerCase() === 'x') {
             let hex = '';
             let valid = true;
             for (let j = 0; j < 6; j++) {
                 if (text[i + 2 + j*2] !== '&') { valid = false; break; }
                 const c = text[i + 3 + j*2];
                 if (!/[0-9a-fA-F]/.test(c)) { valid = false; break; }
                 hex += c;
             }
             if (valid) {
                 flush();
                 color = '#' + hex;
                 bold = italic = underline = strike = obfuscated = false;
                 i += 14;
                 continue;
             }
        }
        
        if (i + 1 < text.length) {
           const code = text[i+1].toLowerCase();
           
           if (colors[code]) {
               flush();
               color = colors[code];
               bold = italic = underline = strike = obfuscated = false;
               i += 2;
               continue;
           }
           
           let isStyle = true;
           if (code === 'r') {
               flush();
               color = null;
               bold = italic = underline = strike = obfuscated = false;
           } else if (code === 'l') { // Bold
               flush();
               bold = true;
           } else if (code === 'o') { // Italic
               flush();
               italic = true;
           } else if (code === 'n') { // Underline
               flush();
               underline = true;
           } else if (code === 'm') { // Strikethrough
               flush();
               strike = true;
           } else if (code === 'k') { // Obfuscated
               flush();
               obfuscated = true;
           } else {
               isStyle = false;
           }
           
           if (isStyle) {
               i += 2;
               continue;
           }
        }
      }
      
      buffer += text[i];
      i++;
    }
    
    flush();
    return output;
  }

  addMessage(text, author = null, color = null) {
    const msg = document.createElement('div');
    msg.className = 'chat-message';
    if (color) msg.style.color = color;
    
    let fullText = "";
    if (author) {
      fullText = `<${author}> ${text}`;
    } else {
      fullText = text;
    }
    
    msg.innerHTML = this.formatMessageContent(fullText);
    
    this.history.appendChild(msg);
    this.history.scrollTop = this.history.scrollHeight;
    
    // Setup fade out
    const timer = setTimeout(() => {
      msg.classList.add('faded');
    }, 10000); // Fade after 10 seconds
    
    // Remove from DOM eventually to save memory
    setTimeout(() => {
      if (msg.parentElement === this.history) {
        // If chat is active, we might want to keep it? 
        // For simplicity, we just remove really old messages
        // or just let them stay faded.
        // Let's keep them in DOM but hidden.
      }
    }, 11000);
  }
}