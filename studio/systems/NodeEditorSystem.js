import * as THREE from 'three';

export class NodeEditorSystem {
    constructor(studio) {
        this.studio = studio;
        this.nodes = [];
        this.connections = [];
        this.canvas = null;
        this.svgContainer = null;
        this.dragState = {
            active: false,
            node: null,
            startX: 0,
            startY: 0,
            initialNodeX: 0,
            initialNodeY: 0
        };
        this.wireDragState = {
            active: false,
            fromNode: null,
            fromSocket: null,
            tempLine: null
        };
    }

    init() {
        // Idempotent guard
        if (this._inited) return;
        this._inited = true;

        this.canvas = document.querySelector('.node-editor-canvas');
        if (!this.canvas) {
            // If DOM isn't present yet, register a one-time MutationObserver to initialize when the node-editor is added,
            // or listen for the node-editor panel to become visible. Return early to avoid throwing.
            this._inited = false;
            if (!this._nodeEditorObserver) {
                this._nodeEditorObserver = new MutationObserver((mutations, obs) => {
                    const found = document.querySelector('.node-editor-canvas');
                    if (found) {
                        obs.disconnect();
                        this._nodeEditorObserver = null;
                        try { this.init(); } catch (e) { console.warn('NodeEditorSystem init retry failed', e); }
                    }
                });
                this._nodeEditorObserver.observe(document.body, { childList: true, subtree: true });
            }
            console.warn('NodeEditorSystem: node-editor DOM not present, initialization deferred until DOM available.');
            return;
        }

        // Reset canvas content
        this.canvas.innerHTML = `
            <div class="node-editor-toolbar" style="position:absolute;top:10px;left:10px;z-index:100;">
                <button class="node-add-button" id="addNodeBtn">Add Node</button>
                <div class="dropdown" id="addNodeDropdown" style="display:none;position:absolute;top:100%;left:0;background:#2a2a2a;border:1px solid #404040;border-radius:4px;min-width:150px;box-shadow:0 4px 12px rgba(0,0,0,0.5);">
                    <div class="dropdown-item" data-type="Value">Value</div>
                    <div class="dropdown-item" data-type="RGB Input">RGB Input</div>
                    <div class="dropdown-item" data-type="Noise Texture">Noise Texture</div>
                    <div class="dropdown-item" data-type="Mix Shader">Mix Shader</div>
                    <div class="dropdown-item" data-type="Principled BSDF">Principled BSDF</div>
                    <div class="dropdown-item" data-type="Material Output">Material Output</div>
                </div>
            </div>
            <div class="node-editor-grid"></div>
            <svg class="connections-layer" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;"></svg>
        `;
        this.svgContainer = this.canvas.querySelector('.connections-layer');

        // Setup Add Node Menu
        const addBtn = this.canvas.querySelector('#addNodeBtn');
        const dropdown = this.canvas.querySelector('#addNodeDropdown');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });
        
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addNode(item.dataset.type, 150, 150);
                dropdown.style.display = 'none';
            });
        });

        // Add default nodes
        const outNode = this.addNode('Material Output', 600, 100);
        const bsdfNode = this.addNode('Principled BSDF', 300, 100);
        
        // Connect default nodes
        this.connections.push({
            fromNode: bsdfNode,
            fromSocket: 'BSDF',
            toNode: outNode,
            toSocket: 'Surface'
        });

        // Prepare debounced scheduler for connection updates to avoid jank during dragging
        if (!this._updateConnTimer) this._updateConnTimer = null;
        if (!this._scheduleUpdateConnections) {
            this._scheduleUpdateConnections = () => {
                clearTimeout(this._updateConnTimer);
                this._updateConnTimer = setTimeout(() => {
                    try { this.updateConnections(); } catch (e) { console.warn('updateConnections failed', e); }
                }, 60); // small debounce
            };
        }

        // Global mouse handlers for the editor
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        console.log('Node Editor System initialized');
        // Initial render of connections (debounced to allow DOM settle)
        setTimeout(() => this._scheduleUpdateConnections && this._scheduleUpdateConnections(), 50);
    }

    addNode(type, x, y) {
        const id = 'node_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const nodeData = {
            id,
            type,
            x,
            y,
            data: {}, // Store internal values like color, float
            inputs: this.getInputsForType(type),
            outputs: this.getOutputsForType(type)
        };

        // Set default data
        if (type === 'Value') nodeData.data.value = 0.5;
        if (type === 'RGB Input') nodeData.data.color = '#ffffff';

        this.nodes.push(nodeData);
        this.renderNode(nodeData);
        return nodeData;
    }

    getInputsForType(type) {
        const map = {
            'Material Output': [{ name: 'Surface', type: 'shader' }],
            'Principled BSDF': [
                { name: 'Base Color', type: 'color' },
                { name: 'Metallic', type: 'float' },
                { name: 'Roughness', type: 'float' },
                { name: 'Normal', type: 'vector' }
            ],
            'Image Texture': [{ name: 'Vector', type: 'vector' }],
            'Noise Texture': [{ name: 'Scale', type: 'float' }],
            'Mix Shader': [{ name: 'Fac', type: 'float' }, { name: 'Shader 1', type: 'shader' }, { name: 'Shader 2', type: 'shader' }],
            'Value': [],
            'RGB Input': []
        };
        return map[type] || [];
    }

    getOutputsForType(type) {
        const map = {
            'Material Output': [],
            'Principled BSDF': [{ name: 'BSDF', type: 'shader' }],
            'Image Texture': [{ name: 'Color', type: 'color' }, { name: 'Alpha', type: 'float' }],
            'Noise Texture': [{ name: 'Color', type: 'color' }, { name: 'Fac', type: 'float' }],
            'Mix Shader': [{ name: 'Shader', type: 'shader' }],
            'Value': [{ name: 'Value', type: 'float' }],
            'RGB Input': [{ name: 'Color', type: 'color' }]
        };
        return map[type] || [];
    }

    renderNode(node) {
        const el = document.createElement('div');
        el.className = 'shader-node';
        el.id = node.id;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;

        // Generate Controls
        let controlsHtml = '';
        if (node.type === 'Value') {
            controlsHtml = `<div class="node-control"><input type="number" step="0.1" value="${node.data.value}" class="node-input-val"></div>`;
        } else if (node.type === 'RGB Input') {
            controlsHtml = `<div class="node-control"><input type="color" value="${node.data.color}" class="node-input-color"></div>`;
        } else if (node.type === 'Noise Texture') {
            controlsHtml = `<div class="node-control" style="font-size:10px;color:#888;padding:4px;">Procedural Noise</div>`;
        }

        let inputsHtml = node.inputs.map(input => `
            <div class="node-socket input" data-socket="${input.name}" data-type="${input.type}">
                <div class="socket ${input.type}"></div>
                <span>${input.name}</span>
            </div>
        `).join('');

        let outputsHtml = node.outputs.map(output => `
            <div class="node-socket output" data-socket="${output.name}" data-type="${output.type}">
                <span>${output.name}</span>
                <div class="socket ${output.type}"></div>
            </div>
        `).join('');

        el.innerHTML = `
            <div class="node-header">${node.type}</div>
            <div class="node-content">${controlsHtml}</div>
            <div class="node-inputs">${inputsHtml}</div>
            <div class="node-outputs">${outputsHtml}</div>
        `;

        // Add Listeners for Controls
        const valInput = el.querySelector('.node-input-val');
        if (valInput) {
            valInput.addEventListener('input', (e) => {
                node.data.value = parseFloat(e.target.value);
                this.applyGraphToMaterial();
            });
            // Stop propagation to prevent dragging node when typing
            valInput.addEventListener('mousedown', e => e.stopPropagation());
        }

        const colorInput = el.querySelector('.node-input-color');
        if (colorInput) {
            colorInput.addEventListener('input', (e) => {
                node.data.color = e.target.value;
                this.applyGraphToMaterial();
            });
            colorInput.addEventListener('mousedown', e => e.stopPropagation());
        }

        // Drag Header
        const header = el.querySelector('.node-header');
        header.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.dragState.active = true;
            this.dragState.node = node;
            this.dragState.startX = e.clientX;
            this.dragState.startY = e.clientY;
            this.dragState.initialNodeX = node.x;
            this.dragState.initialNodeY = node.y;

            // Bring to front
            el.style.zIndex = 100;
            this.nodes.forEach(n => {
                if(n !== node) document.getElementById(n.id).style.zIndex = 1;
            });
        });

        // Socket Interactions
        el.querySelectorAll('.socket').forEach(socketEl => {
            socketEl.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const parent = socketEl.closest('.node-socket');
                const isOutput = parent.classList.contains('output');

                if (isOutput) {
                    this.startWireDrag(node, parent.dataset.socket, e);
                }
            });

            socketEl.addEventListener('mouseup', (e) => {
                e.stopPropagation();
                const parent = socketEl.closest('.node-socket');
                const isInput = parent.classList.contains('input');

                if (isInput && this.wireDragState.active) {
                    this.completeConnection(node, parent.dataset.socket);
                }
            });
        });

        this.canvas.appendChild(el);
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Node Dragging
        if (this.dragState.active && this.dragState.node) {
            const dx = e.clientX - this.dragState.startX;
            const dy = e.clientY - this.dragState.startY;

            this.dragState.node.x = this.dragState.initialNodeX + dx;
            this.dragState.node.y = this.dragState.initialNodeY + dy;

            const el = document.getElementById(this.dragState.node.id);
            if (el) {
                el.style.left = `${this.dragState.node.x}px`;
                el.style.top = `${this.dragState.node.y}px`;
            }

            // Debounced connection update to keep dragging smooth
            if (this._scheduleUpdateConnections) this._scheduleUpdateConnections();
        }

        // Wire Dragging
        if (this.wireDragState.active) {
            const startNode = this.wireDragState.fromNode;
            const startSocketName = this.wireDragState.fromSocket;

            // Find start position
            const startEl = document.getElementById(startNode.id);
            const socketEl = startEl.querySelector(`.node-socket.output[data-socket="${startSocketName}"] .socket`);
            const startRect = socketEl.getBoundingClientRect();

            const x1 = startRect.left - rect.left + 5;
            const y1 = startRect.top - rect.top + 5;
            const x2 = mouseX;
            const y2 = mouseY;

            this.updatePath(this.wireDragState.tempLine, x1, y1, x2, y2);
        }
    }

    handleMouseUp(e) {
        this.dragState.active = false;
        this.dragState.node = null;

        if (this.wireDragState.active) {
            if (this.wireDragState.tempLine) {
                this.wireDragState.tempLine.remove();
            }
            this.wireDragState.active = false;
            this.wireDragState.tempLine = null;
        }
    }

    startWireDrag(node, socketName, e) {
        this.wireDragState.active = true;
        this.wireDragState.fromNode = node;
        this.wireDragState.fromSocket = socketName;

        // Create temp SVG line
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', '#e0e0e0');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        this.svgContainer.appendChild(path);
        this.wireDragState.tempLine = path;
    }

    completeConnection(toNode, toSocketName) {
        const fromNode = this.wireDragState.fromNode;
        const fromSocketName = this.wireDragState.fromSocket;

        // Remove existing connection to this input if any (single input allowed)
        this.connections = this.connections.filter(c => 
            !(c.toNode === toNode && c.toSocket === toSocketName)
        );

        this.connections.push({
            fromNode,
            fromSocket: fromSocketName,
            toNode,
            toSocket: toSocketName
        });

        this.updateConnections();
        this.applyGraphToMaterial();
    }

    updateConnections() {
        try {
            // Clear SVG safely
            while (this.svgContainer.firstChild) {
                this.svgContainer.removeChild(this.svgContainer.firstChild);
            }

            const rect = this.canvas.getBoundingClientRect();

            this.connections.forEach(conn => {
                const fromEl = document.getElementById(conn.fromNode.id);
                const toEl = document.getElementById(conn.toNode.id);
                if (!fromEl || !toEl) return;

                const fromSocket = fromEl.querySelector(`.node-socket.output[data-socket="${conn.fromSocket}"] .socket`);
                const toSocket = toEl.querySelector(`.node-socket.input[data-socket="${conn.toSocket}"] .socket`);
                if (!fromSocket || !toSocket) return;

                const fromRect = fromSocket.getBoundingClientRect();
                const toRect = toSocket.getBoundingClientRect();

                const x1 = fromRect.left - rect.left + 5;
                const y1 = fromRect.top - rect.top + 5;
                const x2 = toRect.left - rect.left + 5;
                const y2 = toRect.top - rect.top + 5;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('stroke', '#4a9eff');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('fill', 'none');

                this.updatePath(path, x1, y1, x2, y2);
                this.svgContainer.appendChild(path);
            });
        } catch (e) {
            console.warn('NodeEditorSystem.updateConnections encountered an error:', e);
        }
    }

    updatePath(pathEl, x1, y1, x2, y2) {
        // Cubic bezier for smooth wire
        const dist = Math.abs(x2 - x1) * 0.5;
        const cp1x = x1 + dist;
        const cp1y = y1;
        const cp2x = x2 - dist;
        const cp2y = y2;

        const d = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
        pathEl.setAttribute('d', d);
    }

    // New Helper: Evaluate a node's output
    evaluateNode(node, outputSocketName) {
        if (!node) return null;

        if (node.type === 'Value') {
            return node.data.value;
        }

        if (node.type === 'RGB Input') {
            return new THREE.Color(node.data.color);
        }

        if (node.type === 'Noise Texture') {
            // Check if we already generated a texture for this node
            if (!node.data.texture) {
                const size = 256;
                const data = new Uint8Array(size * size * 4);
                for (let i = 0; i < size * size; i++) {
                    const stride = i * 4;
                    const val = Math.random() * 255;
                    data[stride] = val;
                    data[stride + 1] = val;
                    data[stride + 2] = val;
                    data[stride + 3] = 255;
                }
                const texture = new THREE.DataTexture(data, size, size);
                texture.needsUpdate = true;
                node.data.texture = texture;
            }
            return node.data.texture;
        }

        return null;
    }

    applyGraphToMaterial() {
        try {
            if (!this.studio.selectedObject) return;
            let mat = this.studio.selectedObject.material;
            if (!mat) return;

            // Some objects use an array of materials or non-standard material types.
            // Normalize to a single material object where possible (operate on first standard material).
            if (Array.isArray(mat)) mat = mat[0];

            // Find Principled BSDF
            const bsdfNode = this.nodes.find(n => n.type === 'Principled BSDF');
            if (!bsdfNode) return;

            // Helper to safely set numeric property if material supports it
            const safeSetNumeric = (material, prop, value) => {
                if (!material) return;
                try {
                    if (prop in material && typeof material[prop] === 'number') {
                        material[prop] = value;
                    } else if (material.hasOwnProperty(prop)) {
                        material[prop] = value;
                    }
                } catch (e) { /* ignore */ }
            };

            // 1. Handle Roughness
            const roughConn = this.connections.find(c => c.toNode === bsdfNode && c.toSocket === 'Roughness');
            if (roughConn) {
                const val = this.evaluateNode(roughConn.fromNode, roughConn.fromSocket);
                if (typeof val === 'number') {
                    safeSetNumeric(mat, 'roughness', Math.max(0, Math.min(1, val)));
                    console.log('Graph: Set Roughness', val);
                }
            }

            // 2. Handle Metallic
            const metalConn = this.connections.find(c => c.toNode === bsdfNode && c.toSocket === 'Metallic');
            if (metalConn) {
                const val = this.evaluateNode(metalConn.fromNode, metalConn.fromSocket);
                if (typeof val === 'number') {
                    safeSetNumeric(mat, 'metalness', Math.max(0, Math.min(1, val)));
                    console.log('Graph: Set Metalness', val);
                }
            }

            // 3. Handle Base Color
            const colorConn = this.connections.find(c => c.toNode === bsdfNode && c.toSocket === 'Base Color');
            if (colorConn) {
                const val = this.evaluateNode(colorConn.fromNode, colorConn.fromSocket);

                if (val && val.isColor && mat.color && typeof mat.color.copy === 'function') {
                    try { mat.color.copy(val); } catch (e) { /* ignore */ }
                    // clear texture if present
                    if ('map' in mat) mat.map = null;
                    console.log('Graph: Set Color', val.getHexString ? val.getHexString() : val);
                } else if (val && val.isTexture && 'map' in mat) {
                    try { mat.map = val; } catch (e) { /* ignore */ }
                    if (mat.color && typeof mat.color.setHex === 'function') mat.color.setHex(0xffffff);
                    console.log('Graph: Set Texture');
                }
            }

            if (mat && typeof mat.needsUpdate !== 'undefined') mat.needsUpdate = true;
        } catch (e) {
            console.warn('applyGraphToMaterial failed safely:', e);
        }
    }
}