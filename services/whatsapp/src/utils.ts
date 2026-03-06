export const MEDIA_TYPES: Record<string, string> = {
	audioMessage: "audio",
	imageMessage: "image",
	videoMessage: "video",
	documentMessage: "document",
	stickerMessage: "sticker",
};

export function mimeToExt(mime: string): string {
	const map: Record<string, string> = {
		"audio/ogg": "ogg",
		"audio/ogg; codecs=opus": "ogg",
		"audio/mpeg": "mp3",
		"audio/mp4": "m4a",
		"audio/wav": "wav",
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/webp": "webp",
		"image/gif": "gif",
		"video/mp4": "mp4",
		"video/3gpp": "3gp",
		"application/pdf": "pdf",
		"application/octet-stream": "bin",
	};
	return map[mime] ?? mime.split("/").pop() ?? "bin";
}

export interface ChannelMessage {
	type: string;
	to?: string;
	text?: string;
}

export function isChannelMessage(val: unknown): val is ChannelMessage {
	return (
		typeof val === "object" &&
		val !== null &&
		"type" in val &&
		typeof (val as Record<string, unknown>).type === "string"
	);
}

export function makeLogger() {
	const noop = () => {};
	return {
		level: "silent",
		trace: noop,
		debug: noop,
		info: noop,
		warn: (obj: unknown, msg?: string) => console.warn("[wa:warn]", msg ?? obj),
		error: (obj: unknown, msg?: string) => console.error("[wa:error]", msg ?? obj),
		fatal: (obj: unknown, msg?: string) => console.error("[wa:fatal]", msg ?? obj),
		child: () => makeLogger(),
	};
}
