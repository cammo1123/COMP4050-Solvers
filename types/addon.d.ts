declare module "*.node" {
	const addon: {
		hello(): string;
		sendJSON(num: number): number | null;
	};
	export default addon;
}
