declare const addon: {
	info(): string;
	solve(buf: Uint8Array): Promise<Buffer>;
};

export = addon;
