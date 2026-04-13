import type { InboundMessage } from "../models.js";

export interface GatewayModule {
  readonly name: string;
  healthCheck(): Promise<void>;
  startReceiving(onMessage: (msg: InboundMessage) => Promise<void>): Promise<never>;
  sendText(message: InboundMessage, text: string): Promise<void>;
}
