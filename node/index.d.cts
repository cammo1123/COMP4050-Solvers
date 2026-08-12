declare const addon: {
	info(): string;
	solve(buf: Uint8Array): Buffer;
};

export = addon;
