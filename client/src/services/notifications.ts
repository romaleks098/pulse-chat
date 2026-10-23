export const notificationService = {
  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    if (Notification.permission === 'granted') {
      return true;
    }
    if (Notification.permission !== 'denied') {
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
    return false;
  },

  show(title: string, body: string, icon?: string, onClick?: () => void) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notification = new Notification(title, {
        body,
        icon: icon || 'https://api.dicebear.com/7.x/bottts/svg?seed=PulseChat',
        badge: 'https://api.dicebear.com/7.x/bottts/svg?seed=PulseChat',
        silent: true, // We play our own synthesized sound
      });

      notification.onclick = () => {
        window.focus();
        if (onClick) onClick();
        notification.close();
      };
    } catch (e) {
      // Ignore notification failures on some mobile webviews
    }
  },
};
