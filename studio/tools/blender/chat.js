import { playSound } from './audio-manager.js'; // Import playSound

let _websim;

let conversationHistory = [];
let currentLanguage = localStorage.getItem('aiChatLanguage') || 'en'; 
const systemMessage = { role: "system", content: "" };

const languageConfig = {
    en: {
        systemMessage: `You are an AI assistant for a 3D modeling application.
Users are operating a 3D model in an application like Blender.
You can answer questions about 3D modeling, Blender features, and general inquiries.
A GLB model is currently loaded in the user's Blender.
You cannot directly "see" the model, but you can make inferences based on file names or user descriptions and provide general information.
Please respond in English.`,
        ui: {
            panelTitle: "AI Assistant",
            inputPlaceholder: "Ask me anything about 3D modeling...",
            sendButton: "Send",
            thinking: "AI Assistant: Thinking...",
            error: "AI Assistant: An error occurred. Please try again.",
            initialGreeting: "AI Assistant: Hello! Can I help you with anything related to GLB model loading or 3D modeling?",
            undoNoHistory: "AI Assistant: No operations to undo.",
            undoSuccess: (commandName) => `AI Assistant: Undid "${commandName}" operation.`,
            redoNoHistory: "AI Assistant: No operations to redo.",
            redoSuccess: (commandName) => `AI Assistant: Redid "${commandName}" operation.`,
            modelLoaded: (filename) => `AI Assistant: Model "${filename}" loaded.`,
            modelLoadError: (errorMsg) => `AI Assistant: An error occurred while loading the model: ${errorMsg}.`,
            sceneRestored: "AI Assistant: Restored to previous scene state.",
            objectDeleted: "AI Assistant: Selected object deleted from scene.",
            noObjectToDelete: "AI Assistant: No object selected for deletion.",
            enteredModelingMode: "AI Assistant: Entered modeling mode. Move, rotate, scale, and add cube tools are available.",
            exitedModelingMode: "AI Assistant: Exited modeling mode.",
            gizmoToggleNoSelection: "AI Assistant: To toggle gizmo visibility, please select an object in modeling mode.",
            gizmoHidden: "AI Assistant: Gizmo hidden.",
            gizmoShown: "AI Assistant: Gizmo shown.",
            addCube: "AI Assistant: Added a new cube to the scene!",
            addUVSphere: "AI Assistant: Added a new UV Sphere to the scene!",
            addIcoSphere: "AI Assistant: Added a new Ico Sphere to the scene!",
            addCone: "AI Assistant: Added a new Cone to the scene!",
            addTorus: "AI Assistant: Added a new Torus to the scene!",
            addCapsule: "AI Assistant: Added a new Capsule to the scene!",
            addCircle: "AI Assistant: Added a new Circle to the scene!",
            addTriangle: "AI Assistant: Added a new Triangle (Prism) to the scene!",
            addGrid: "AI Assistant: Added a new Grid Plane to the scene!",
            addSquarePyramid: "AI Assistant: Added a new Square Pyramid to the scene!",
            addCylinder: "AI Assistant: Added a new Cylinder to the scene!",
            selectCleared: "Selection cleared (clicked on empty space).",
            objectDeselected: "Object deselected (clicked same object or select tool).",
            objectCopied: (objectName) => `AI Assistant: Copied "${objectName}".`,
            noObjectToCopy: "AI Assistant: No object selected to copy.",
            objectPasted: (objectName) => `AI Assistant: Pasted a new "${objectName}".`,
            noObjectToPaste: "AI Assistant: Nothing to paste. Please copy an object first.",
            objectRenamed: (oldName, newName) => `AI Assistant: Renamed "${oldName}" to "${newName}".`,
            bevelApplied: (objectName) => `AI Assistant: Applied Bevel to "${objectName}".`,
            bevelRemoved: (objectName) => `AI Assistant: Removed Bevel from "${objectName}".`, 
            bevelUnsupported: (objectName) => `AI Assistant: Bevel can only be applied to Cube objects for now. "${objectName}" is not a Cube.`,
            arrayApplied: (objectName) => `AI Assistant: Applied Array Modifier to "${objectName}".`, 
            arrayRemoved: (objectName) => `AI Assistant: Removed Array Modifier from "${objectName}".`, 
            screwApplied: (objectName) => `AI Assistant: Applied Screw Modifier to "${objectName}".`,
            screwRemoved: (objectName) => `AI Assistant: Removed Screw Modifier from "${objectName}".`, 
            bendRemoved: (objectName) => `AI Assistant: Removed Bend Modifier from "${objectName}".`, 
            noObjectSelected: `AI Assistant: No object selected. Please select an object to apply/remove the modifier.`,
            enteredUVEditingMode: "AI Assistant: Entered UV Editing mode. The screen is now split for UV manipulation.",
            exitedUVEditingMode: "AI Assistant: Exited UV Editing mode. Returned to 3D Viewport.",
            enteredShaderEditingMode: "AI Assistant: Entered Shader Editor mode. The screen is now split for material node editing.",
            exitedShaderEditingMode: "AI Assistant: Exited Shader Editor mode. Returned to 3D Viewport.",
            enteredPrompt3dEditingMode: "AI Assistant: Entered Prompt 3D Editor mode. Use the left panel to generate and modify objects with text prompts.",
            exitedPrompt3dEditingMode: "AI Assistant: Exited Prompt 3D Editor mode. Returned to 3D Viewport.",
            uvImageCreated: (name, width, height) => `AI Assistant: New UV image "${name}" (${width}x${height}px) created.`,
            uvImageLoaded: (name, width, height) => `AI Assistant: Image "${name}" (${width}x${height}px) loaded into UV Editor.`,
            uvImageLoadError: (filename) => `AI Assistant: An error occurred while loading image "${filename}" into UV Editor.`,
            uvImageCleared: "AI Assistant: UV image cleared.",
            exportSuccess: (filename) => `AI Assistant: Scene exported as "${filename}".`,
            exportError: (errorMsg) => `AI Assistant: Error exporting GLB: ${errorMsg}.`,
            shaderNotConnectedFeedback: "AI Assistant: Shader output is not connected to Material Output's Surface. Changes to material properties in the editor will not apply to the object's appearance.",
            shaderImageLoaded: (filename) => `AI Assistant: Image "${filename}" loaded into Image Texture node.`,
            shaderImageLoadError: (filename) => `AI Assistant: An error occurred while loading image "${filename}" into Image Texture node.`,
            addShaderNode: "AI Assistant: Added Add Shader node.",
            addCheckerTextureNode: "AI Assistant: Added Checker Texture node.",
            fontLoaded: "AI Assistant: 3D text fonts loaded successfully.",
            fontLoadError: (fontName, errorMsg) => `AI Assistant: Failed to load ${fontName} font: ${errorMsg}. 3D text might not work correctly.`,
            add3DText: (text) => `AI Assistant: Added 3D text: "${text}".`,
            emptyTextError: "AI Assistant: Please enter some text for the 3D text object.",
            invalidTextSize: "AI Assistant: Please enter a valid positive number for text size.",
            invalidTextDepth: "AI Assistant: Please enter a valid positive number for text depth.",
            fontNotLoadedError: (fontName) => `AI Assistant: The font "${fontName}" is not loaded yet. Please wait or try again later.`,
            // NEW: Prompt 3D Editor related messages
            promptInputPlaceholder: "Describe the 3D object you want to create or modify (e.g., 'a red car', 'a tree with green leaves')...",
            promptSubmittedFeedback: (prompt) => `AI Assistant: Received your prompt: "${prompt}". Processing...`,
            promptEmptyWarning: "AI Assistant: Please enter a description in the prompt field.",
            promptGenerating: (prompt) => `AI Assistant: Analyzing prompt "${prompt}" and generating 3D model...`,
            promptSuccess: (description, count) => `AI Assistant: Created ${description} with ${count} objects.`,
            promptError: "AI Assistant: Error generating 3D model. Creating a simple interpretation instead.",
            promptFallback: (description) => `AI Assistant: Simple ${description} created.`,
            // NEW: Join operation messages
            objectJoined: (count, groupName) => `AI Assistant: ${count} objects joined into "${groupName}".`,
            undoJoin: "AI Assistant: Undo join operation.",
            // NEW: UV Image Generation from Prompt messages
            uvImageGenerating: (prompt) => `AI Assistant: Generating texture from prompt "${prompt}"...`,
            uvImageGenerated: (type, name, width, height) => `AI Assistant: Generated a ${type} texture: "${name}" (${width}x${height}px).`,
            uvImageGenerateError: "AI Assistant: Failed to generate texture based on the prompt. Please try again with a different description.",
            uvImagePromptEmpty: "AI Assistant: Please enter a description for the texture generation.",
            // NEW: Randomize texture node messages
            randomizedBrickTextureNode: "AI Assistant: Randomized Brick Texture design.",
            randomizedNoiseTextureNode: "AI Assistant: Randomized Noise Texture design.",
        },
    },
    ja: {
        systemMessage: `あなたは3DモデリングアプリケーションのAIアシスタントです。
ユーザーはBlenderのようなアプリケーションで3Dモデルを操作しています。
3Dモデリング、Blenderの機能、一般的な問い合わせについて回答できます。
現在、ユーザーのBlenderにGLBモデルが読み込まれています。
あなたはモデルを直接「見る」ことはできませんが、ファイル名やユーザーの説明に基づいて推測したり、一般的な情報を提供したりできます。
日本語で回答してください。`,
        ui: {
            panelTitle: "AIアシスタント",
            inputPlaceholder: "3Dモデリングについて何でも質問してください...",
            sendButton: "送信",
            thinking: "AIアシスタント: 考え中...",
            error: "AIアシスタント: エラーが発生しました。もう一度お試しください。",
            initialGreeting: "AIアシスタント: こんにちは！GLBモデルのロードや3Dモデリングについて、何かお手伝いできますか？",
            undoNoHistory: "AIアシスタント: 元に戻せる操作はありません。",
            undoSuccess: (commandName) => `AIアシスタント: 「${commandName}」操作を元に戻しました。`,
            redoNoHistory: "AIアシスタント: やり直せる操作はありません。",
            redoSuccess: (commandName) => `AIアシスタント: 「${commandName}」操作をやり直しました。`,
            modelLoaded: (filename) => `AIアシスタント: モデル「${filename}」がロードされました。`,
            modelLoadError: (errorMsg) => `AIアシスタント: モデルのロード中にエラーが発生しました: ${errorMsg}。`,
            sceneRestored: "AIアシスタント: 以前のシーン状態に復元しました。",
            objectDeleted: "AIアシスタント: 選択されたオブジェクトがシーンから削除されました。",
            noObjectToDelete: "AIアシスタント: 削除するオブジェクトが選択されていません。",
            enteredModelingMode: "AIアシスタント: モデリングモードに入りました。移動、回転、拡大・縮小、立方体追加ツールが利用可能です。",
            exitedModelingMode: "AIアシスタント: モデリングモードを終了しました。",
            gizmoToggleNoSelection: "AIアシスタント: ギズモの表示を切り替えるには、モデリングモードでオブジェクトを選択してください。",
            gizmoHidden: "AIアシスタント: ギズモを非表示にしました。",
            gizmoShown: "AIアシスタント: ギズモを表示しました。",
            addCube: "AIアシスタント: シーンに新しい立方体を追加しました！",
            addUVSphere: "AIアシスタント: シーンに新しいUV球を追加しました！",
            addIcoSphere: "AIアシスタント: シーンに新しいICO球を追加しました！",
            addCone: "AIアシスタント: シーンに新しい円錐を追加しました！",
            addTorus: "AIアシスタント: シーンに新しいトーラスを追加しました！",
            addCapsule: "AIアシスタント: シーンに新しいカプセルを追加しました！",
            addCircle: "AIアシスタント: シーンに新しい円を追加しました！",
            addTriangle: "AIアシスタント: シーンに新しい三角（プリズム）を追加しました！",
            addGrid: "AIアシスタント: シーンに新しいグリッド平面を追加しました！",
            addSquarePyramid: "AIアシスタント: シーンに新しい四角錐を追加しました！",
            addCylinder: "AIアシスタント: シーンに新しい円柱を追加しました！",
            selectCleared: "選択が解除されました（空白をクリック）。",
            objectDeselected: "オブジェクトの選択が解除されました（同じオブジェクトまたは選択ツールをクリック）。",
            objectCopied: (objectName) => `AIアシスタント: 「${objectName}」をコピーしました。`,
            noObjectToCopy: "AIアシスタント: コピーするオブジェクトが選択されていません。",
            objectPasted: (objectName) => `AIアシスタント: 新しい「${objectName}」を貼り付けました。`,
            noObjectToPaste: "AIアシスタント: 貼り付けるものがありません。まずオブジェクトをコピーしてください。",
            objectRenamed: (oldName, newName) => `AIアシスタント: 「${oldName}」を「${newName}」に名前変更しました。`,
            bevelApplied: (objectName) => `AIアシスタント: 「${objectName}」にベベルを適用しました。`,
            bevelRemoved: (objectName) => `AIアシスタント: 「${objectName}」からベベルを削除しました。`, 
            bevelUnsupported: (objectName) => `AIアシスタント: ベベルモディファイアは立方体オブジェクトにのみ適用可能です。「${objectName}」は立方体ではありません。`,
            arrayApplied: (objectName) => `AIアシスタント: 「${objectName}」に配列モディファイアを適用しました。`, 
            arrayRemoved: (objectName) => `AIアシスタント: 「${objectName}」から配列モディファイアを削除しました。`, 
            screwApplied: (objectName) => `AIアシスタント: 「${objectName}」にスクリューモディファイアを適用しました。`,
            screwRemoved: (objectName) => `AIアシスタント: 「${objectName}」からスクリューモディファイアを削除しました。`, 
            bendRemoved: (objectName) => `AIアシスタント: 「${objectName}」からベンドモディファイアを削除しました。`, 
            noObjectSelected: `AIアシスタント: オブジェクトが選択されていません。モディファイアを適用するにはオブジェクトを選択してください。`,
            enteredUVEditingMode: "AIアシスタント: UV編集モードに入りました。画面がUV操作用に分割されました。",
            exitedUVEditingMode: "AIアシスタント: UV編集モードを終了しました。3Dビューポートに戻ります。",
            enteredShaderEditingMode: "AIアシスタント: シェーダーエディターモードに入りました。画面がマテリアルノード編集用に分割されました。",
            exitedShaderEditingMode: "AIアシスタント: シェーダーエディターモードを終了しました。3Dビューポートに戻ります。",
            enteredPrompt3dEditingMode: "AIアシスタント: プロンプト3Dエディターモードに入りました。左側のパネルを使用して、テキストプロンプトで3Dオブジェクトを生成および変更できます。",
            exitedPrompt3dEditingMode: "AIアシスタント: プロンプト3Dエディターモードを終了しました。3Dビューポートに戻ります。",
            uvImageCreated: (name, width, height) => `AIアシスタント: 新しいUV画像「${name}」 (${width}x${height}px) が作成されました。`,
            uvImageLoaded: (name, width, height) => `AIアシスタント: 画像「${name}」 (${width}x${height}px) がUVエディターに読み込まれました。`,
            uvImageLoadError: (filename) => `AIアシスタント: UVエディターに画像「${filename}」を読み込む際にエラーが発生しました。`,
            uvImageCleared: "AIアシスタント: UV画像をクリアしました。",
            exportSuccess: (filename) => `AIアシスタント: シーンを「${filename}」としてエクスポートしました。`,
            exportError: (errorMsg) => `AIアシスタント: GLBエクスポート中にエラーが発生しました: ${errorMsg}。`,
            shaderNotConnectedFeedback: "AIアシスタント: シェーダー出力がマテリアル出力のサーフェスに接続されていません。エディターでのマテリアルプロパティの変更はオブジェクトの外観に反映されません。",
            shaderImageLoaded: (filename) => `AIアシスタント: 画像「${filename}」が画像テクスチャノードに読み込まれました。`,
            shaderImageLoadError: (filename) => `AIアシスタント: 画像テクスチャノードへの画像「${filename}」の読み込み中にエラーが発生しました。`,
            addShaderNode: "AIアシスタント: シェーダー加算ノードを追加しました。",
            addCheckerTextureNode: "AIアシスタント: チェッカーテクスチャノードを追加しました。",
            fontLoaded: "AIアシスタント: 3Dテキストのフォントが正常にロードされました。",
            fontLoadError: (fontName, errorMsg) => `AIアシスタント: 3Dテキストのフォント「${fontName}」のロードに失敗しました: ${errorMsg}。3Dテキストが機能しない可能性があります。`,
            add3DText: (text) => `AIアシスタント: 3Dテキスト「${text}」を追加しました。`,
            emptyTextError: "AIアシスタント: 3Dテキストオブジェクトに何かテキストを入力してください。",
            invalidTextSize: "AIアシスタント: テキストサイズには有効な正の数を入力してください。",
            invalidTextDepth: "AIアシスタント: テキストの奥行きには有効な正の数を入力してください。",
            fontNotLoadedError: (fontName) => `AIアシスタント: フォント「${fontName}」はまだロードされていません。しばらくお待ちいただくか、後でもう一度お試しください。`,
            // NEW: Prompt 3D Editor related messages
            promptInputPlaceholder: "作成または変更したい3Dオブジェクトを記述してください（例：「赤い車」、「緑の葉を持つ木」）...",
            promptSubmittedFeedback: (prompt) => `AIアシスタント: プロンプト「${prompt}」を受け取りました。処理中...`,
            promptEmptyWarning: "AIアシスタント: プロンプト欄に説明を入力してください。",
            promptGenerating: (prompt) => `AIアシスタント: プロンプト「${prompt}」を分析して3Dモデルを生成しています...`,
            promptSuccess: (description, count) => `AIアシスタント: ${description}を${count}個のオブジェクトで作成しました。`,
            promptError: "AIアシスタント: 3Dモデルの生成中にエラーが発生しました。代わりに簡単な解釈を作成します。",
            promptFallback: (description) => `AIアシスタント: シンプルな${description}を作成しました。`,
            // NEW: Join operation messages
            objectJoined: (count, groupName) => `AIアシスタント: ${count}個のオブジェクトを「${groupName}」に結合しました。`,
            undoJoin: "AIアシスタント: 結合操作を元に戻しました。",
            // NEW: UV Image Generation from Prompt messages
            uvImageGenerating: (prompt) => `AIアシスタント: プロンプト「${prompt}」からテクスチャを生成しています...`,
            uvImageGenerated: (type, name, width, height) => `AIアシスタント: ${type}テクスチャ「${name}」 (${width}x${height}px) を生成しました。`,
            uvImageGenerateError: "AIアシスタント: プロンプトに基づいてテクスチャを生成できませんでした。別の説明で再試行してください。",
            uvImagePromptEmpty: "AIアシスタント: テクスチャ生成の説明を入力してください。",
            // NEW: Randomize texture node messages
            randomizedBrickTextureNode: "AIアシスタント: ブリックテクスチャのデザインをランダム化しました。",
            randomizedNoiseTextureNode: "AIアシスタント: ノイズテクスチャのデザインをランダム化しました。",
        },
    },
};

// DOM elements (will be retrieved inside init)
let aiChatPanel;
let aiChatPanelHeader;
let collapseChatButton;
let chatHistoryDiv;
let userInputField;
let sendChatButton;
let languageSelect;

export function initializeChatManager(websimInstance) {
    _websim = websimInstance;

    aiChatPanel = document.getElementById('ai-chat-panel');
    aiChatPanelHeader = document.getElementById('ai-chat-panel-header');
    collapseChatButton = document.getElementById('collapse-chat-button');
    chatHistoryDiv = document.getElementById('chat-history');
    userInputField = document.getElementById('user-input');
    sendChatButton = document.getElementById('send-button');
    languageSelect = document.getElementById('language-select');

    updateLanguageUI();
    updateSystemMessage();

    languageSelect.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        localStorage.setItem('aiChatLanguage', currentLanguage);
        updateLanguageUI();
        updateSystemMessage();
        chatHistoryDiv.innerHTML = '';
        addMessageToChatHistory(languageConfig[currentLanguage].ui.initialGreeting, 'ai');
        conversationHistory = [];
    });

    // Dragging logic
    let isDragging = false;
    let offsetX, offsetY;
    const onMouseMove = (e) => {
        if (!isDragging) return;

        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        newLeft = Math.max(0, Math.min(window.innerWidth - aiChatPanel.offsetWidth, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - aiChatPanel.offsetHeight, newTop));

        aiChatPanel.style.left = newLeft + 'px';
        aiChatPanel.style.top = newTop + 'px';
    };
    const onMouseUp = () => {
        isDragging = false;
        aiChatPanel.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    aiChatPanelHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('#collapse-chat-button') || e.target.closest('#language-select')) {
            return;
        }
        isDragging = true;
        aiChatPanel.style.cursor = 'grabbing';
        const panelRect = aiChatPanel.getBoundingClientRect();
        offsetX = e.clientX - panelRect.left;
        offsetY = e.clientY - panelRect.top;
        if (aiChatPanel.style.right) {
            aiChatPanel.style.left = (window.innerWidth - panelRect.width - parseFloat(getComputedStyle(aiChatPanel).right)) + 'px';
            aiChatPanel.style.right = '';
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    sendChatButton.addEventListener('click', sendMessage);
    userInputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    collapseChatButton.addEventListener('click', toggleChatPanel);
    loadChatPanelState();
    addMessageToChatHistory(languageConfig[currentLanguage].ui.initialGreeting, 'ai');
}

export function addMessageToChatHistory(message, type, isPlaceholder = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', type);
    if (isPlaceholder) {
        messageDiv.id = 'ai-thinking-placeholder';
    }
    let displayMessage = message;
    if (type === 'user') {
        displayMessage = currentLanguage === 'en' ? `You: ${message.replace(/^あなた: /, '')}` : `あなた: ${message.replace(/^あなた: /, '')}`;
    } else if (type === 'ai') {
        displayMessage = `AI Assistant: ${message}`;
    }
    messageDiv.textContent = displayMessage;
    chatHistoryDiv.appendChild(messageDiv);
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
}

async function sendMessage() {
    const userMessage = userInputField.value.trim();
    userInputField.value = '';
    if (!userMessage) return;

    addMessageToChatHistory(userMessage, 'user');
    conversationHistory.push({ role: "user", content: userMessage });
    conversationHistory = conversationHistory.slice(-10);

    addMessageToChatHistory(languageConfig[currentLanguage].ui.thinking, 'ai', true);

    try {
        const completion = await _websim.chat.completions.create({
            messages: [
                updateSystemMessage(),
                ...conversationHistory,
            ],
        });
        const aiResponse = completion.content;
        const thinkingMessage = document.getElementById('ai-thinking-placeholder');
        if (thinkingMessage) {
             thinkingMessage.remove();
        }
        addMessageToChatHistory(aiResponse, 'ai');
        conversationHistory.push({ role: "assistant", content: aiResponse });
    } catch (error) {
        console.error("Error communicating with AI:", error);
        const thinkingMessage = document.getElementById('ai-thinking-placeholder');
        if (thinkingMessage) {
             thinkingMessage.remove();
        }
        addMessageToChatHistory(languageConfig[currentLanguage].ui.error, 'ai');
    }
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
}

function toggleChatPanel() {
    const isCollapsed = aiChatPanel.classList.toggle('collapsed');
    collapseChatButton.textContent = isCollapsed ? '▲' : '▼';
    localStorage.setItem('aiChatPanelCollapsed', isCollapsed);
}

function loadChatPanelState() {
    const savedState = localStorage.getItem('aiChatPanelCollapsed');
    if (savedState === 'true') {
        aiChatPanel.classList.add('collapsed');
        collapseChatButton.textContent = '▲';
    } else {
        aiChatPanel.classList.remove('collapsed');
        collapseChatButton.textContent = '▼';
    }
}

function updateLanguageUI() {
    const ui = languageConfig[currentLanguage].ui;
    document.getElementById('ai-chat-panel-header').querySelector('h3').textContent = ui.panelTitle;
    document.getElementById('user-input').placeholder = ui.inputPlaceholder;
    document.getElementById('send-button').textContent = ui.sendButton;
    if (languageSelect) {
        languageSelect.value = currentLanguage;
    }
    // NEW: Update Prompt 3D Editor placeholder
    const promptInput = document.getElementById('prompt-input');
    const submitPromptBtn = document.getElementById('submit-prompt-btn');
    if (promptInput) {
        promptInput.placeholder = ui.promptInputPlaceholder;
    }
    if (submitPromptBtn) {
        submitPromptBtn.textContent = ui.sendButton; // Reusing send button text for prompt submit
    }
}

function updateSystemMessage() {
    systemMessage.content = languageConfig[currentLanguage].systemMessage;
    return systemMessage;
}

export { currentLanguage, languageConfig };