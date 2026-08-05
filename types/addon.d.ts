declare module '*.node' {
  const addon: {
    hello(): string;
  };
  export default addon;
}
