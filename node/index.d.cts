declare const addon: {
	hello(): string;
	solve(buf: Uint8Array): Buffer;
};

export = addon;
