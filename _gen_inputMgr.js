import nipplejs from 'nipplejs';

export class InputManager {
    constructor(domElement) {
        this.domElement = domElement;
        this.keys = {};
        this.joystickData = { x: 0, y: 0 };
        this.mouse = { x: 0, y: 0 };
        this.mouseMoved = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.scrollDelta = 0;

        this.setupKeyboard();
        this.setupMouse();
        this.setupTouch();
        this.initJoystick();
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
    }

    setupMouse() {
        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.isMouseDown = true;
        });

        window.addEventListener('mouseup', () => {
            this.isMouseDown = false;
        });

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.mouseMoved.x = e.movementX || 0;
            this.mouseMoved.y = e.movementY || 0;
        });

        window.addEventListener('wheel', (e) => {
            this.scrollDelta = e.deltaY;
        }, { passive: true });
    }

    setupTouch() {
        let lastTouchX = 0, lastTouchY = 0;

        this.domElement.addEventListener('touchstart', (e) => {
            this.isMouseDown = true;
            lastTouchX = e.touches[0].pageX;
            lastTouchY = e.touches[0].pageY;
        });

        this.domElement.addEventListener('touchmove', (e) => {
            const touchX = e.touches[0].pageX;
            const touchY = e.touches[0].pageY;
            this.mouseMoved.x = touchX - lastTouchX;
            this.mouseMoved.y = touchY - lastTouchY;
            lastTouchX = touchX;
            lastTouchY = touchY;

            this.mouse.x = (touchX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(touchY / window.innerHeight) * 2 + 1;
        });

        window.addEventListener('touchend', () => {
            this.isMouseDown = false;
            this.mouseMoved.x = 0;
            this.mouseMoved.y = 0;
        });
    }

    initJoystick() {
        const zone = document.getElementById('joystick-zone');
        if (!zone) return;
        const manager = nipplejs.create({
            zone: zone,
            mode: 'static',
            position: { left: '50px', bottom: '50px' },
            color: 'white',
            size: 80
        });
        manager.on('move', (evt, data) => {
            this.joystickData.x = data.vector.x;
            this.joystickData.y = data.vector.y;
        });
        manager.on('end', () => {
            this.joystickData.x = 0;
            this.joystickData.y = 0;
        });
    }

    clearFrameData() {
        this.mouseMoved.x = 0;
        this.mouseMoved.y = 0;
        this.scrollDelta = 0;
    }
}