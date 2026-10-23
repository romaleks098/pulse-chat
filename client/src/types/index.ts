export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  statusText?: string;
  lastSeen?: string;
  role?: string;
}

export interface Reaction {
  userId: string;
  userName: string;
  emoji: string;
}

export interface ReplyInfo {
  id: string;
  senderName: string;
  text: string;
  type: 'text' | 'image' | 'file' | 'voice';
  fileName?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  type: 'text' | 'image' | 'file' | 'voice';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  voiceDuration?: number;
  replyTo?: ReplyInfo | null;
  replyToId?: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  reactions: Reaction[];
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatarUrl: string;
  partner?: User | null;
  members: User[];
  pinnedMessageId?: string | null;
  pinnedMessage?: Message | null;
  isSaved?: boolean;
  lastMessage?: {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    type: 'text' | 'image' | 'file' | 'voice';
    fileName?: string;
    createdAt: string;
  } | null;
  updatedAt: string;
  unreadCount?: number;
}

export interface NetworkInfo {
  localIp: string;
  allIps: string[];
  clientPort: number;
  serverPort: number;
}
