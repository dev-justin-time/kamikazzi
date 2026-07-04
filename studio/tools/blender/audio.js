let audioContext = null;
const soundCache = new Map();

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Resume context if it's suspended (e.g., due to browser autoplay policies)
        if (audioContext.state === 'suspended') {
            const resumeContext = () => {
                audioContext.resume().then(() => {
                    console.log('AudioContext resumed successfully');
                    document.removeEventListener('click', resumeContext);
                });
            };
            document.addEventListener('click', resumeContext); // Attempt to resume on first click
        }
    }
    return audioContext;
}

/**
 * Plays a sound effect from a given URL.
 * @param {string} url - The URL of the sound file (e.g., .mp3).
 */
export async function playSound(url) {
    // Sound playback has been disabled as per user request.
    // To re-enable sounds, uncomment the code below.
    // try {
    //     const context = getAudioContext();
    //     if (context.state === 'suspended') {
    //         await context.resume();
    //     }

    //     let buffer;
    //     if (soundCache.has(url)) {
    //         buffer = soundCache.get(url);
    //     } else {
    //         const response = await fetch(url);
    //         const arrayBuffer = await response.arrayBuffer();
    //         buffer = await context.decodeAudioData(arrayBuffer);
    //         soundCache.set(url, buffer);
    //     }

    //     const source = context.createBufferSource();
    //     source.buffer = buffer;
    //     source.connect(context.destination);
    //     source.start(0);
    // } catch (error) {
    //     console.error(`Error playing sound ${url}:`, error);
    // }
}