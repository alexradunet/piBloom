import type { InboundMessage } from "../models.js";

export class Policy {
  isAllowedSender(msg: InboundMessage): boolean {
    if (msg.access.selfSenderIds.includes(msg.senderId)) return false;
    return msg.access.allowedSenderIds.includes(msg.senderId);
  }

  isAdminSender(msg: InboundMessage): boolean {
    return msg.access.adminSenderIds.includes(msg.senderId);
  }

  isAllowedMessage(msg: InboundMessage): boolean {
    if (msg.access.directMessagesOnly && msg.isGroup) return false;
    return true;
  }
}
