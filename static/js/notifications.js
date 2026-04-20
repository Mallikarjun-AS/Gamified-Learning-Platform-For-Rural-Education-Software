class NotificationSystem {
    constructor() {
        this.container = document.getElementById('notificationWrapper');
        this.notifications = [];
        this.maxNotifications = 5;
    }

    show(message, type = 'info', duration = 5000) {
        const icons = {
            success: '🎉',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const icon = icons[type] || '📢';
        const id = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.id = id;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${icon}</span>
                <div class="notification-message">${this.escapeHtml(message)}</div>
                <button class="notification-close" onclick="notificationSystem.close('${id}')">✕</button>
            </div>
            <div class="notification-progress" style="animation-duration: ${duration}ms"></div>
        `;

        this.container.appendChild(notification);
        this.notifications.push({ id, element: notification, timeout: null });

        if (this.notifications.length > this.maxNotifications) {
            const oldest = this.notifications.shift();
            this._removeNotification(oldest.id);
        }

        setTimeout(() => notification.classList.add('show'), 10);

        const timeout = setTimeout(() => {
            this.close(id);
        }, duration);

        const notifIndex = this.notifications.findIndex(n => n.id === id);
        if (notifIndex !== -1) {
            this.notifications[notifIndex].timeout = timeout;
        }

        return id;
    }

    success(message, duration = 5000) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }

    close(id) {
        this._removeNotification(id);
    }

    _removeNotification(id) {
        const index = this.notifications.findIndex(n => n.id === id);
        if (index === -1) return;

        const notification = this.notifications[index];
        const element = notification.element;

        if (notification.timeout) {
            clearTimeout(notification.timeout);
        }

        element.classList.add('hiding');
        element.classList.remove('show');

        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }, 300);

        this.notifications.splice(index, 1);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearAll() {
        while (this.notifications.length > 0) {
            this.close(this.notifications[0].id);
        }
    }

    async fetchFlashMessages() {
        try {
            const response = await fetch('/api/flash-messages');
            const data = await response.json();

            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    this.show(msg.message, msg.category);
                });
            }
        } catch (error) {
            console.error('Failed to fetch flash messages:', error);
        }
    }
}

const notificationSystem = new NotificationSystem();
window.notificationSystem = notificationSystem;

document.addEventListener('DOMContentLoaded', function() {
    const flashMessages = document.querySelectorAll('.flash-message');
    flashMessages.forEach(msg => {
        const type = msg.dataset.type || 'info';
        const text = msg.textContent;
        notificationSystem.show(text, type);
        msg.remove();
    });

    setTimeout(() => {
        notificationSystem.fetchFlashMessages();
    }, 100);
});