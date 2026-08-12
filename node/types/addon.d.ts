declare module "*.node" {
	const addon: {
		hello(): string;
		doubleValue(buf: Uint8Array): Buffer;
	};
	export default addon;
}
