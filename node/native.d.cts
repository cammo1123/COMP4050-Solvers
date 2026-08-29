declare const addon: {
	info(): Buffer;
	solve(buf: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<Buffer>;
};

export = addon;
