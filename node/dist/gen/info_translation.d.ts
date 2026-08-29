export type InfoRequest = {};
export type InfoResponse = {
    projectName: string;
    projectVersion: string;
    buildType: string;
    gitHash: string;
    gitBranch: string;
    buildTime: string;
    platform: string;
    arch: string;
    compiler: string;
    nodeVersion: string;
};
export declare function encodeRequest(request: InfoRequest): Uint8Array;
export declare function decodeResponse(bytes: Uint8Array): InfoResponse;
//# sourceMappingURL=info_translation.d.ts.map