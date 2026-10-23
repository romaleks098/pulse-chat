import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { ChatProvider, useChat } from './context/ChatContext';
import { CallProvider } from './context/CallContext';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { NewChatModal } from './components/NewChatModal';
import { ConnectPhoneModal } from './components/ConnectPhoneModal';
import { ProfileModal } from './components/ProfileModal';
import { ImageViewerModal } from './components/ImageViewerModal';
import { CallModal } from './components/CallModal';
import { SettingsModal } from './components/SettingsModal';
import { Download } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { currentUser, activeConversationId, selectConversation } = useChat();

  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isPhoneConnectOpen, setIsPhoneConnectOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeImage, setActiveImage] = useState<{ url: string; fileName?: string } | null>(null);

  // PWA Install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-app,#090d16)] text-[var(--text-primary,#f8fafc)] overflow-hidden font-sans">
      {/* PWA Install Notification Bar */}
      {showInstallBanner && (
        <div className="bg-indigo-600 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md shrink-0 z-30">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 shrink-0" />
            <span>Установите PulseChat на свой ПК или телефон как приложение!</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallPWA}
              className="px-3 py-1 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-slate-100 transition-colors"
            >
              Установить
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="opacity-70 hover:opacity-100 text-sm font-bold ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main chat dual-pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: visible on desktop, or on mobile when no chat is open */}
        <div
          className={`h-full ${
            activeConversationId ? 'hidden md:flex' : 'flex w-full'
          }`}
        >
          <Sidebar
            onOpenNewChat={() => setIsNewChatOpen(true)}
            onOpenPhoneConnect={() => setIsPhoneConnectOpen(true)}
            onOpenProfile={() => setIsProfileOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>

        {/* Chat Area: visible on desktop, or on mobile when chat is selected */}
        <div
          className={`h-full flex-1 ${
            !activeConversationId ? 'hidden md:flex' : 'flex w-full'
          }`}
        >
          <ChatArea
            onBack={() => selectConversation(null)}
            onOpenPhoneConnect={() => setIsPhoneConnectOpen(true)}
            onImageClick={(url, fileName) => setActiveImage({ url, fileName })}
          />
        </div>
      </div>

      {/* Modals */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
      />

      <ConnectPhoneModal
        isOpen={isPhoneConnectOpen}
        onClose={() => setIsPhoneConnectOpen(false)}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenPhoneConnect={() => setIsPhoneConnectOpen(true)}
      />

      <ImageViewerModal
        imageUrl={activeImage?.url || null}
        fileName={activeImage?.fileName}
        onClose={() => setActiveImage(null)}
      />

      <CallModal />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ChatProvider>
          <CallProvider>
            <MainLayout />
          </CallProvider>
        </ChatProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
