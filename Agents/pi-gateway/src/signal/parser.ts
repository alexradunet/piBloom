import { createHash } from "node:crypto";
import type { InboundMessage } from "../models.js";

type SignalDataMessage = {
  timestamp?: number;
  message?: string;
  groupInfo?: {
    groupId?: string;
    groupName?: string;
  };
  attachments?: unknown[];
  mentions?: unknown[];
  contacts?: unknown[];
};

type SignalSyncMessage = {
  sentMessage?: {
    destination?: string;
    destinationNumber?: string;
    destinationUuid?: string;
    timestamp?: number;
    message?: string;
  };
};

type SignalEnvelope = {
  source?: string | null;
  sourceNumber?: string | null;
  sourceUuid?: string | null;
  sourceName?: string | null;
  sourceDevice?: number | null;
  timestamp?: number;
  dataMessage?: SignalDataMessage;
  syncMessage?: SignalSyncMessage;
  receiptMessage?: unknown;
  typingMessage?: unknown;
};

type SignalNotification = {
  jsonrpc?: string;
  method?: string;
  envelope?: SignalEnvelope;
  account?: string;
  params?: {
    envelope?: SignalEnvelope;
    account?: string;
    subscription?: number;
    result?: {
      envelope?: SignalEnvelope;
      account?: string;
    };
  };
};

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

function hashMessage(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function extractEnvelope(input: SignalNotification): SignalEnvelope | null {
  if (input.envelope) return input.envelope;
  if (input.params?.envelope) return input.params.envelope;
  if (input.params?.result?.envelope) return input.params.result.envelope;
  return null;
}

export function parseSignalNotification(input: unknown): Omit<InboundMessage, "access"> | null {
  if (!input || typeof input !== "object") return null;

  const msg = input as SignalNotification;
  if (msg.method !== undefined && msg.method !== "receive") return null;

  const envelope = extractEnvelope(msg);
  if (!envelope) return null;

  if (envelope.syncMessage) return null;
  if (envelope.receiptMessage || envelope.typingMessage) return null;

  const dataMessage = envelope.dataMessage;
  if (!dataMessage) return null;

  const text = dataMessage.message?.trim() ?? "";
  if (!text) return null;

  const senderId = envelope.sourceNumber ?? envelope.source ?? envelope.sourceUuid;
  if (!senderId) return null;

  const ts = dataMessage.timestamp ?? envelope.timestamp;
  if (!ts) return null;

  const isGroup = !!dataMessage.groupInfo;
  const groupId = dataMessage.groupInfo?.groupId;
  const chatId = isGroup
    ? `signal-group:${groupId ?? "unknown"}`
    : `signal:${senderId}`;

  const messageId = `signal:${hashMessage([
    senderId,
    String(ts),
    String(envelope.sourceDevice ?? ""),
    text,
    String(groupId ?? ""),
  ])}`;

  return {
    channel: "signal",
    chatId,
    senderId,
    senderName: envelope.sourceName ?? undefined,
    messageId,
    timestamp: toIso(ts),
    text,
    isGroup,
  };
}
