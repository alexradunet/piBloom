export interface MatrixTextEvent {
	roomId: string;
	eventId: string;
	senderUserId: string;
	body: string;
	timestamp: number;
}

export interface MatrixIdentity {
	id: string;
	userId: string;
	homeserver: string;
	accessToken: string;
	storagePath: string;
	autojoin?: boolean;
}

export interface MatrixBridge {
	start(): Promise<void>;
	stop(): void;
	sendText(identityId: string, roomId: string, text: string): Promise<void>;
	setTyping(identityId: string, roomId: string, typing: boolean, timeoutMs?: number): Promise<void>;
	getRoomAlias(identityId: string, roomId: string): Promise<string>;
	onTextEvent(handler: (identityId: string, event: MatrixTextEvent) => void): void;
}
