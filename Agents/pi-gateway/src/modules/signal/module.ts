import type { SignalModuleConfig } from "../../config.js";
import type { InboundMessage } from "../../models.js";
import type { GatewayModule } from "../types.js";
import { SignalTransport } from "../../signal/transport.js";

export class SignalModule implements GatewayModule {
  readonly name = "signal";
  private readonly transport: SignalTransport;

  constructor(private readonly config: SignalModuleConfig) {
    this.transport = new SignalTransport(config.httpUrl, config.account);
  }

  async healthCheck(): Promise<void> {
    await this.transport.healthCheck();
  }

  async startReceiving(
    onMessage: (msg: InboundMessage) => Promise<void>,
  ): Promise<never> {
    return this.transport.startReceiving(async (msg) => {
      await onMessage({
        ...msg,
        access: {
          allowedSenderIds: this.config.allowedNumbers,
          directMessagesOnly: this.config.directMessagesOnly,
          selfSenderIds: [this.config.account],
        },
      });
    });
  }

  async sendText(message: InboundMessage, text: string): Promise<void> {
    await this.transport.sendText(message.senderId, text);
  }
}
