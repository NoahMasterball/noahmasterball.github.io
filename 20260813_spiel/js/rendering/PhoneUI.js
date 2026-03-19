/**
 * PhoneUI - Handy-Overlay mit Homescreen und oeffenbaren Apps (Karte, Chats).
 */

// ── Spielzeit-Mapping ────────────────────────────────────────────────────
const PHASE_TIME_MAP = {
    day:   { startHour: 8,  spanHours: 10 },
    dusk:  { startHour: 18, spanHours: 3  },
    night: { startHour: 21, spanHours: 8  },
    dawn:  { startHour: 5,  spanHours: 3  },
};

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// ── Apps ─────────────────────────────────────────────────────────────────
const PHONE_APPS = [
    { id: 'map',      label: 'Karte',       icon: 'map',   color: '#2ea043' },
    { id: 'chats',    label: 'Nachrichten',  icon: 'chat',  color: '#58a6ff' },
    { id: 'contacts', label: 'Kontakte',     icon: 'user',  color: '#d29922' },
    { id: 'settings', label: 'Einstellungen',icon: 'gear',  color: '#8b949e' },
];

// ── Chat-Daten ───────────────────────────────────────────────────────────
const CHAT_CONTACTS = [
    {
        name: 'Mama',
        messages: [
            { text: 'Vergiss nicht einzukaufen!', time: '09:14', incoming: true },
            { text: 'Ja mach ich spaeter',        time: '09:15', incoming: false },
            { text: 'Komm nicht zu spaet!',        time: '14:07', incoming: true },
        ],
    },
    {
        name: 'Luca',
        messages: [
            { text: 'Bist du heute online?',       time: '11:32', incoming: true },
            { text: 'Bin unterwegs gerade',         time: '11:33', incoming: false },
            { text: 'Ok sag bescheid wenn du da bist', time: '11:34', incoming: true },
        ],
    },
    {
        name: 'Tim',
        messages: [
            { text: 'Hast du das Spiel gesehen?',  time: '20:11', incoming: true },
            { text: 'Ja war krass!',                time: '20:12', incoming: false },
        ],
    },
];

// ── Handy-Konstanten ─────────────────────────────────────────────────────
const PHONE_W = 260;
const PHONE_H = 480;
const SCREEN_PAD = 12;
const SCREEN_TOP = 40;
const SCREEN_BOTTOM = 30;
const STATUS_BAR_H = 28;
const NAV_BAR_H = 36;

export class PhoneUI {

    constructor() {
        this.open = false;
        /** 'home' | 'map' | 'chats' | 'chat-detail' | 'contacts' | 'settings' */
        this.currentScreen = 'home';
        this.selectedChat = null;       // Index in CHAT_CONTACTS

        this._dayCount = 0;
        this._lastPhaseIndex = 0;
        this._slideProgress = 0;

        // Klick-State
        this._clickConsumed = false;

        // Gecachte Handy-Position (wird in draw() gesetzt, in handleClick gelesen)
        this._phoneX = 0;
        this._phoneY = 0;
        this._canvasW = 0;
        this._canvasH = 0;
    }

    // ── Toggle ───────────────────────────────────────────────────────────

    toggle() {
        if (this.open) {
            this.open = false;
            this.currentScreen = 'home';
            this.selectedChat = null;
        } else {
            this.open = true;
        }
    }

    // ── Update ───────────────────────────────────────────────────────────

    /**
     * @param {number} deltaTime
     * @param {import('../systems/DayNightSystem.js').DayNightSystem} dayNight
     * @param {{x:number, y:number, down:boolean}} mouse
     * @param {boolean} mouseJustPressed
     */
    update(deltaTime, dayNight, mouse, mouseJustPressed) {
        // Slide-Animation
        const target = this.open ? 1 : 0;
        const speed = 8;
        this._slideProgress += (target - this._slideProgress) * Math.min(1, speed * deltaTime);
        if (Math.abs(this._slideProgress - target) < 0.005) {
            this._slideProgress = target;
        }

        // Tag-Zaehler
        if (dayNight) {
            const idx = dayNight.phaseIndex;
            if (this._lastPhaseIndex === 3 && idx === 0) {
                this._dayCount++;
            }
            this._lastPhaseIndex = idx;
        }

        // Klick-Verarbeitung
        if (mouseJustPressed && this.open && this._slideProgress > 0.9) {
            this._handleClick(mouse.x, mouse.y);
        }
    }

    get visible() {
        return this._slideProgress > 0.01;
    }

    // ── Klick-Verarbeitung ───────────────────────────────────────────────

    _handleClick(mx, my) {
        const phoneX = this._phoneX;
        const phoneY = this._phoneY;
        const screenX = phoneX + SCREEN_PAD;
        const screenY = phoneY + SCREEN_TOP;
        const screenW = PHONE_W - SCREEN_PAD * 2;
        const screenH = PHONE_H - SCREEN_TOP - SCREEN_BOTTOM;
        const contentY = screenY + STATUS_BAR_H;
        const contentH = screenH - STATUS_BAR_H - NAV_BAR_H;

        // Ausserhalb Handy?
        if (mx < phoneX || mx > phoneX + PHONE_W || my < phoneY || my > phoneY + PHONE_H) {
            return;
        }

        // Nav-Bar: Zurueck-Button (immer sichtbar wenn nicht auf Home)
        const navY = screenY + screenH - NAV_BAR_H;
        if (this.currentScreen !== 'home' && my >= navY && my <= navY + NAV_BAR_H) {
            if (this.currentScreen === 'chat-detail') {
                this.currentScreen = 'chats';
                this.selectedChat = null;
            } else {
                this.currentScreen = 'home';
            }
            return;
        }

        // Homescreen: App-Icons
        if (this.currentScreen === 'home') {
            const cols = 2;
            const iconSize = 52;
            const gapX = (screenW - cols * iconSize) / (cols + 1);
            const gapY = 24;
            const startY = contentY + 30;

            for (let i = 0; i < PHONE_APPS.length; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const ix = screenX + gapX + col * (iconSize + gapX);
                const iy = startY + row * (iconSize + gapY + 16);

                if (mx >= ix && mx <= ix + iconSize && my >= iy && my <= iy + iconSize) {
                    this.currentScreen = PHONE_APPS[i].id;
                    return;
                }
            }
            return;
        }

        // Chats-Liste: Kontakt anklicken
        if (this.currentScreen === 'chats') {
            const listStartY = contentY + 8;
            const itemH = 52;

            for (let i = 0; i < CHAT_CONTACTS.length; i++) {
                const iy = listStartY + i * itemH;
                if (mx >= screenX && mx <= screenX + screenW && my >= iy && my <= iy + itemH) {
                    this.selectedChat = i;
                    this.currentScreen = 'chat-detail';
                    return;
                }
            }
        }
    }

    /** Prueft ob ein Klick innerhalb des Handys liegt (um Spielaktionen zu blockieren) */
    isClickOnPhone(mx, my) {
        if (!this.open || this._slideProgress < 0.5) return false;
        return mx >= this._phoneX && mx <= this._phoneX + PHONE_W &&
               my >= this._phoneY && my <= this._phoneY + PHONE_H;
    }

    // ── Spielzeit ────────────────────────────────────────────────────────

    getGameTime(dayNight) {
        const phaseId = dayNight.currentPhase?.id ?? 'day';
        const progress = dayNight.progress ?? 0;
        const mapping = PHASE_TIME_MAP[phaseId] ?? PHASE_TIME_MAP.day;

        const totalHours = mapping.startHour + mapping.spanHours * progress;
        const hours24 = ((totalHours % 24) + 24) % 24;
        const hours = Math.floor(hours24);
        const minutes = Math.floor((hours24 - hours) * 60);
        const dayName = DAY_NAMES[this._dayCount % DAY_NAMES.length];

        return { hours, minutes, dayName };
    }

    // ── Haupt-Render ─────────────────────────────────────────────────────

    draw(ctx, canvasWidth, canvasHeight, { dayNight, player, buildings, roadLayout, worldBounds }) {
        if (!this.visible) return;

        const slide = this._slideProgress;
        this._canvasW = canvasWidth;
        this._canvasH = canvasHeight;

        const phoneX = canvasWidth / 2 - PHONE_W / 2;
        const phoneBaseY = canvasHeight / 2 - PHONE_H / 2;
        const phoneY = phoneBaseY + (1 - slide) * (canvasHeight - phoneBaseY + 40);

        this._phoneX = phoneX;
        this._phoneY = phoneY;

        ctx.save();
        ctx.globalAlpha = Math.min(1, slide * 1.5);

        // Schatten
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 8;

        // Gehaeuse
        this._roundRect(ctx, phoneX, phoneY, PHONE_W, PHONE_H, 24);
        ctx.fillStyle = '#1a1a2e';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        this._roundRect(ctx, phoneX, phoneY, PHONE_W, PHONE_H, 24);
        ctx.strokeStyle = '#3a3a5e';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Bildschirm
        const screenX = phoneX + SCREEN_PAD;
        const screenY = phoneY + SCREEN_TOP;
        const screenW = PHONE_W - SCREEN_PAD * 2;
        const screenH = PHONE_H - SCREEN_TOP - SCREEN_BOTTOM;

        this._roundRect(ctx, screenX, screenY, screenW, screenH, 12);
        ctx.fillStyle = '#0d1117';
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        this._roundRect(ctx, screenX, screenY, screenW, screenH, 12);
        ctx.clip();

        // Statusleiste
        this._drawStatusBar(ctx, screenX, screenY, screenW, dayNight);

        // Content-Bereich
        const contentY = screenY + STATUS_BAR_H;
        const contentH = screenH - STATUS_BAR_H - NAV_BAR_H;

        switch (this.currentScreen) {
            case 'home':
                this._drawHomeScreen(ctx, screenX, contentY, screenW, contentH, dayNight);
                break;
            case 'map':
                this._drawMapApp(ctx, screenX, contentY, screenW, contentH, player, buildings, roadLayout, worldBounds);
                break;
            case 'chats':
                this._drawChatsApp(ctx, screenX, contentY, screenW, contentH);
                break;
            case 'chat-detail':
                this._drawChatDetail(ctx, screenX, contentY, screenW, contentH);
                break;
            case 'contacts':
                this._drawContactsApp(ctx, screenX, contentY, screenW, contentH);
                break;
            case 'settings':
                this._drawSettingsApp(ctx, screenX, contentY, screenW, contentH);
                break;
        }

        // Nav-Bar
        this._drawNavBar(ctx, screenX, screenY + screenH - NAV_BAR_H, screenW);

        ctx.restore(); // clip

        // Notch
        ctx.fillStyle = '#0d1117';
        this._roundRect(ctx, phoneX + PHONE_W / 2 - 40, phoneY + 8, 80, 20, 10);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(phoneX + PHONE_W / 2 + 20, phoneY + 18, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#1a3a5e';
        ctx.fill();

        // Home-Strich
        ctx.strokeStyle = '#3a3a5e';
        ctx.lineWidth = 2;
        this._roundRect(ctx, phoneX + PHONE_W / 2 - 30, phoneY + PHONE_H - 22, 60, 4, 2);
        ctx.stroke();

        ctx.restore();
    }

    // ── Statusleiste ─────────────────────────────────────────────────────

    _drawStatusBar(ctx, x, y, w, dayNight) {
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, STATUS_BAR_H);

        const time = this.getGameTime(dayNight);
        const timeStr = String(time.hours).padStart(2, '0') + ':' + String(time.minutes).padStart(2, '0');

        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(timeStr, x + 10, y + 19);

        ctx.textAlign = 'right';
        ctx.font = '12px Arial';
        ctx.fillStyle = '#8b949e';
        ctx.fillText(time.dayName, x + w - 10, y + 19);

        // Batterie-Icon
        const batX = x + w - 70;
        const batY = y + 9;
        ctx.strokeStyle = '#8b949e';
        ctx.lineWidth = 1;
        ctx.strokeRect(batX, batY, 16, 9);
        ctx.fillStyle = '#3fb950';
        ctx.fillRect(batX + 2, batY + 2, 10, 5);
        ctx.fillStyle = '#8b949e';
        ctx.fillRect(batX + 16, batY + 2, 2, 5);

        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + STATUS_BAR_H);
        ctx.lineTo(x + w, y + STATUS_BAR_H);
        ctx.stroke();
    }

    // ── Homescreen ───────────────────────────────────────────────────────

    _drawHomeScreen(ctx, x, y, w, h, dayNight) {
        // Uhrzeit gross
        const time = this.getGameTime(dayNight);
        const timeStr = String(time.hours).padStart(2, '0') + ':' + String(time.minutes).padStart(2, '0');

        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x + w / 2, y + 38);

        ctx.font = '13px Arial';
        ctx.fillStyle = '#8b949e';
        ctx.fillText(time.dayName, x + w / 2, y + 56);

        // App-Grid
        const cols = 2;
        const iconSize = 52;
        const gapX = (w - cols * iconSize) / (cols + 1);
        const gapY = 24;
        const startY = y + 78;

        for (let i = 0; i < PHONE_APPS.length; i++) {
            const app = PHONE_APPS[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const ix = x + gapX + col * (iconSize + gapX);
            const iy = startY + row * (iconSize + gapY + 16);

            // Icon-Hintergrund
            this._roundRect(ctx, ix, iy, iconSize, iconSize, 14);
            ctx.fillStyle = app.color;
            ctx.fill();

            // Icon-Symbol
            ctx.fillStyle = '#ffffff';
            this._drawAppIcon(ctx, ix + iconSize / 2, iy + iconSize / 2, app.icon);

            // Label
            ctx.fillStyle = '#c9d1d9';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(app.label, ix + iconSize / 2, iy + iconSize + 14);
        }

        // Ungelesene-Nachrichten Badge auf Chats
        const chatIdx = PHONE_APPS.findIndex(a => a.id === 'chats');
        if (chatIdx >= 0) {
            const col = chatIdx % cols;
            const row = Math.floor(chatIdx / cols);
            const ix = x + gapX + col * (iconSize + gapX);
            const iy = startY + row * (iconSize + gapY + 16);

            const unread = CHAT_CONTACTS.reduce((sum, c) => sum + c.messages.filter(m => m.incoming).length, 0);
            if (unread > 0) {
                ctx.beginPath();
                ctx.arc(ix + iconSize - 4, iy + 4, 10, 0, Math.PI * 2);
                ctx.fillStyle = '#f85149';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(String(unread), ix + iconSize - 4, iy + 8);
            }
        }
    }

    // ── App-Icons zeichnen ───────────────────────────────────────────────

    _drawAppIcon(ctx, cx, cy, icon) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (icon) {
            case 'map': {
                // Standort-Pin
                ctx.beginPath();
                ctx.arc(cx, cy - 4, 7, Math.PI, 0);
                ctx.lineTo(cx, cy + 10);
                ctx.closePath();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy - 4, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'chat': {
                // Sprechblase
                this._roundRect(ctx, cx - 10, cy - 9, 20, 14, 4);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx - 3, cy + 5);
                ctx.lineTo(cx - 7, cy + 11);
                ctx.lineTo(cx + 2, cy + 5);
                ctx.stroke();
                // Punkte
                ctx.beginPath();
                ctx.arc(cx - 5, cy - 2, 1.5, 0, Math.PI * 2);
                ctx.arc(cx, cy - 2, 1.5, 0, Math.PI * 2);
                ctx.arc(cx + 5, cy - 2, 1.5, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'user': {
                // Kopf
                ctx.beginPath();
                ctx.arc(cx, cy - 5, 6, 0, Math.PI * 2);
                ctx.stroke();
                // Koerper
                ctx.beginPath();
                ctx.arc(cx, cy + 14, 11, Math.PI + 0.4, -0.4);
                ctx.stroke();
                break;
            }
            case 'gear': {
                // Zahnrad
                const r = 9;
                const teeth = 6;
                ctx.beginPath();
                for (let i = 0; i < teeth; i++) {
                    const a1 = (i / teeth) * Math.PI * 2 - Math.PI / 2;
                    const a2 = ((i + 0.35) / teeth) * Math.PI * 2 - Math.PI / 2;
                    const a3 = ((i + 0.65) / teeth) * Math.PI * 2 - Math.PI / 2;
                    const a4 = ((i + 1) / teeth) * Math.PI * 2 - Math.PI / 2;
                    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
                    ctx.lineTo(cx + Math.cos(a2) * (r - 3), cy + Math.sin(a2) * (r - 3));
                    ctx.lineTo(cx + Math.cos(a3) * (r - 3), cy + Math.sin(a3) * (r - 3));
                    ctx.lineTo(cx + Math.cos(a4) * r, cy + Math.sin(a4) * r);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
        }
        ctx.restore();
    }

    // ── Map App ──────────────────────────────────────────────────────────

    _drawMapApp(ctx, x, y, w, h, player, buildings, roadLayout, worldBounds) {
        // Titel
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Karte', x + w / 2, y + 20);

        // Karte (so gross wie moeglich)
        const mapY = y + 34;
        const mapH = h - 38;

        ctx.fillStyle = '#1c2a1c';
        ctx.fillRect(x, mapY, w, mapH);

        this._drawMinimap(ctx, x, mapY, w, mapH, player, buildings, roadLayout, worldBounds);
    }

    // ── Chats App (Kontaktliste) ─────────────────────────────────────────

    _drawChatsApp(ctx, x, y, w, h) {
        // Titel
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Nachrichten', x + w / 2, y + 20);

        const listY = y + 34;
        const itemH = 52;

        for (let i = 0; i < CHAT_CONTACTS.length; i++) {
            const contact = CHAT_CONTACTS[i];
            const iy = listY + i * itemH;
            const lastMsg = contact.messages[contact.messages.length - 1];

            // Hover-Hintergrund
            ctx.fillStyle = i % 2 === 0 ? '#161b22' : '#0d1117';
            ctx.fillRect(x, iy, w, itemH);

            // Avatar-Kreis
            ctx.beginPath();
            ctx.arc(x + 26, iy + itemH / 2, 16, 0, Math.PI * 2);
            ctx.fillStyle = ['#2ea043', '#58a6ff', '#d29922'][i % 3];
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(contact.name[0], x + 26, iy + itemH / 2 + 5);

            // Name
            ctx.fillStyle = '#e6edf3';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(contact.name, x + 50, iy + 20);

            // Letzte Nachricht
            ctx.fillStyle = '#8b949e';
            ctx.font = '11px Arial';
            const preview = lastMsg ? (lastMsg.incoming ? '' : 'Du: ') + lastMsg.text : '';
            const maxChars = 22;
            ctx.fillText(
                preview.length > maxChars ? preview.slice(0, maxChars) + '...' : preview,
                x + 50, iy + 38
            );

            // Zeit
            if (lastMsg) {
                ctx.fillStyle = '#484f58';
                ctx.font = '10px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(lastMsg.time, x + w - 10, iy + 20);
            }

            // Trennlinie
            ctx.strokeStyle = '#21262d';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 50, iy + itemH);
            ctx.lineTo(x + w, iy + itemH);
            ctx.stroke();
        }
    }

    // ── Chat-Detail ──────────────────────────────────────────────────────

    _drawChatDetail(ctx, x, y, w, h) {
        const contact = CHAT_CONTACTS[this.selectedChat];
        if (!contact) return;

        // Titel
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(contact.name, x + w / 2, y + 20);

        // Nachrichten
        let msgY = y + 40;
        for (const msg of contact.messages) {
            if (msgY + 48 > y + h) break;
            this._drawChatBubble(ctx, x, w, msgY, msg, contact.name);
            msgY += 48;
        }
    }

    // ── Kontakte App ─────────────────────────────────────────────────────

    _drawContactsApp(ctx, x, y, w, h) {
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Kontakte', x + w / 2, y + 20);

        const contacts = ['Mama', 'Luca', 'Tim', 'Papa', 'Sarah'];
        const listY = y + 38;

        for (let i = 0; i < contacts.length; i++) {
            const iy = listY + i * 44;

            // Avatar
            ctx.beginPath();
            ctx.arc(x + 26, iy + 22, 14, 0, Math.PI * 2);
            ctx.fillStyle = ['#2ea043', '#58a6ff', '#d29922', '#f85149', '#a371f7'][i % 5];
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(contacts[i][0], x + 26, iy + 27);

            // Name
            ctx.fillStyle = '#e6edf3';
            ctx.font = '13px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(contacts[i], x + 50, iy + 26);

            // Trennlinie
            ctx.strokeStyle = '#21262d';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 50, iy + 44);
            ctx.lineTo(x + w, iy + 44);
            ctx.stroke();
        }
    }

    // ── Einstellungen App ────────────────────────────────────────────────

    _drawSettingsApp(ctx, x, y, w, h) {
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Einstellungen', x + w / 2, y + 20);

        const items = [
            { label: 'WLAN',       value: 'Verbunden' },
            { label: 'Bluetooth',  value: 'Aus' },
            { label: 'Helligkeit', value: 'Auto' },
            { label: 'Ton',        value: 'An' },
            { label: 'Info',       value: 'v1.0' },
        ];

        const listY = y + 40;
        for (let i = 0; i < items.length; i++) {
            const iy = listY + i * 38;

            ctx.fillStyle = '#e6edf3';
            ctx.font = '13px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(items[i].label, x + 14, iy + 22);

            ctx.fillStyle = '#8b949e';
            ctx.textAlign = 'right';
            ctx.fillText(items[i].value, x + w - 14, iy + 22);

            ctx.strokeStyle = '#21262d';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 14, iy + 38);
            ctx.lineTo(x + w - 14, iy + 38);
            ctx.stroke();
        }
    }

    // ── Nav-Bar ──────────────────────────────────────────────────────────

    _drawNavBar(ctx, x, y, w) {
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(x, y, w, NAV_BAR_H);

        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.stroke();

        if (this.currentScreen !== 'home') {
            // Zurueck-Pfeil
            ctx.strokeStyle = '#e6edf3';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            const cx = x + w / 2;
            const cy = y + NAV_BAR_H / 2;

            ctx.beginPath();
            ctx.moveTo(cx - 8, cy);
            ctx.lineTo(cx + 8, cy);
            ctx.moveTo(cx - 8, cy);
            ctx.lineTo(cx - 2, cy - 6);
            ctx.moveTo(cx - 8, cy);
            ctx.lineTo(cx - 2, cy + 6);
            ctx.stroke();

            ctx.fillStyle = '#8b949e';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Zurueck', cx, cy + 15);
        } else {
            // Home-Indicator
            ctx.fillStyle = '#30363d';
            this._roundRect(ctx, x + w / 2 - 20, y + NAV_BAR_H / 2 - 2, 40, 4, 2);
            ctx.fill();
        }
    }

    // ── Minimap ──────────────────────────────────────────────────────────

    _drawMinimap(ctx, x, y, w, h, player, buildings, roadLayout, worldBounds) {
        const worldW = worldBounds.width;
        const worldH = worldBounds.height;
        const scaleX = w / worldW;
        const scaleY = h / worldH;

        if (roadLayout) {
            ctx.strokeStyle = 'rgba(80, 80, 80, 0.7)';
            ctx.lineWidth = 2;
            const roads = [
                ...(roadLayout.horizontal ?? []),
                ...(roadLayout.vertical ?? []),
                ...(roadLayout.diagonal ?? []),
            ];
            for (const road of roads) {
                if (road.y1 !== undefined) {
                    ctx.beginPath();
                    ctx.moveTo(x + (road.x1 ?? road.x) * scaleX, y + (road.y1 ?? road.y) * scaleY);
                    ctx.lineTo(x + (road.x2 ?? road.x) * scaleX, y + (road.y2 ?? road.y) * scaleY);
                    ctx.stroke();
                } else if (road.y !== undefined) {
                    const startX = road.x1 ?? road.startX ?? 0;
                    const endX = road.x2 ?? road.endX ?? worldW;
                    ctx.beginPath();
                    ctx.moveTo(x + startX * scaleX, y + road.y * scaleY);
                    ctx.lineTo(x + endX * scaleX, y + road.y * scaleY);
                    ctx.stroke();
                } else if (road.x !== undefined) {
                    const startY = road.y1 ?? road.startY ?? 0;
                    const endY = road.y2 ?? road.endY ?? worldH;
                    ctx.beginPath();
                    ctx.moveTo(x + road.x * scaleX, y + startY * scaleY);
                    ctx.lineTo(x + road.x * scaleX, y + endY * scaleY);
                    ctx.stroke();
                }
            }
        }

        if (buildings) {
            ctx.fillStyle = 'rgba(100, 120, 150, 0.6)';
            for (const b of buildings) {
                const bx = (b.x ?? 0) * scaleX;
                const by = (b.y ?? 0) * scaleY;
                const bw = Math.max(2, (b.width ?? 0) * scaleX);
                const bh = Math.max(2, (b.height ?? 0) * scaleY);
                ctx.fillRect(x + bx, y + by, bw, bh);
            }
        }

        if (player) {
            const px = x + player.x * scaleX;
            const py = y + player.y * scaleY;
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 200, 255, 0.25)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#00c8ff';
            ctx.fill();
        }
    }

    // ── Chat-Bubble ──────────────────────────────────────────────────────

    _drawChatBubble(ctx, screenX, screenW, y, msg, senderName) {
        const maxBubbleW = screenW - 36;
        const bubbleH = 38;
        const isIncoming = msg.incoming;
        const bubbleW = Math.min(maxBubbleW, ctx.measureText(msg.text).width + 24);
        const bubbleX = isIncoming ? screenX + 8 : screenX + screenW - bubbleW - 8;

        ctx.fillStyle = isIncoming ? '#21262d' : '#1a3a2a';
        this._roundRect(ctx, bubbleX, y, bubbleW, bubbleH, 10);
        ctx.fill();

        // Absender + Zeit
        ctx.fillStyle = isIncoming ? '#58a6ff' : '#3fb950';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(isIncoming ? senderName : 'Du', bubbleX + 10, y + 13);

        ctx.fillStyle = '#484f58';
        ctx.font = '9px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(msg.time, bubbleX + bubbleW - 10, y + 13);

        // Text
        ctx.fillStyle = '#c9d1d9';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(msg.text, bubbleX + 10, y + 29);
    }

    // ── Hilfsfunktion ────────────────────────────────────────────────────

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
