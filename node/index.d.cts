declare const addon: {
	hello(): string;
	doubleValue(buf: Uint8Array): Buffer;
};

export = addon;
