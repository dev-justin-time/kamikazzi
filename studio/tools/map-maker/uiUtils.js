export function setupDragging(target, handle) {
    if (!target || !handle) return;
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    const onStart = (clientX, clientY) => {
        isDragging = true;
        startX = clientX;
        startY = clientY;
        const rect = target.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        target.style.position = 'absolute';
        target.style.bottom = 'auto';
        target.style.right = 'auto';
        target.style.left = `${startLeft}px`;
        target.style.top = `${startTop}px`;
    };

    const onMove = (clientX, clientY) => {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        const newLeft = Math.max(0, Math.min(window.innerWidth - target.offsetWidth, startLeft + dx));
        const newTop = Math.max(0, Math.min(window.innerHeight - target.offsetHeight, startTop + dy));
        target.style.left = `${newLeft}px`;
        target.style.top = `${newTop}px`;
    };

    handle.addEventListener('mousedown', (e) => {
        onStart(e.clientX, e.clientY);
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => isDragging = false);

    handle.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        onStart(touch.clientX, touch.clientY);
    });

    window.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        onMove(touch.clientX, touch.clientY);
    });

    window.addEventListener('touchend', () => isDragging = false);
}

export function processHeightmapToData(img, resolution) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = resolution;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, resolution, resolution);
    const pixels = ctx.getImageData(0, 0, resolution, resolution).data;
    return { pixels, width: resolution, height: resolution };
}