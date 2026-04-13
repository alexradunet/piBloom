export type InboundAccessPolicy = {
  allowedSenderIds: string[];
  directMessagesOnly: boolean;
  selfSenderIds: string[];
};

export type InboundMessage = {
  channel: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  messageId: string;
  timestamp: string;
  text: string;
  isGroup: boolean;
  access: InboundAccessPolicy;
};

export type ChatSession = {
  chatId: string;
  senderId: string;
  sessionPath: string;
  createdAt: string;
  updatedAt: string;
};

export type PiReply = {
  text: string;
  sessionPath: string;
};
