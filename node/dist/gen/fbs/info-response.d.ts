import * as flatbuffers from 'flatbuffers';
export declare class InfoResponse implements flatbuffers.IUnpackableObject<InfoResponseT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): InfoResponse;
    static getRootAsInfoResponse(bb: flatbuffers.ByteBuffer, obj?: InfoResponse): InfoResponse;
    static getSizePrefixedRootAsInfoResponse(bb: flatbuffers.ByteBuffer, obj?: InfoResponse): InfoResponse;
    projectName(): string | null;
    projectName(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    projectVersion(): string | null;
    projectVersion(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    buildType(): string | null;
    buildType(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    gitHash(): string | null;
    gitHash(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    gitBranch(): string | null;
    gitBranch(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    buildTime(): string | null;
    buildTime(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    platform(): string | null;
    platform(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    arch(): string | null;
    arch(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    compiler(): string | null;
    compiler(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    nodeVersion(): string | null;
    nodeVersion(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    static startInfoResponse(builder: flatbuffers.Builder): void;
    static addProjectName(builder: flatbuffers.Builder, projectNameOffset: flatbuffers.Offset): void;
    static addProjectVersion(builder: flatbuffers.Builder, projectVersionOffset: flatbuffers.Offset): void;
    static addBuildType(builder: flatbuffers.Builder, buildTypeOffset: flatbuffers.Offset): void;
    static addGitHash(builder: flatbuffers.Builder, gitHashOffset: flatbuffers.Offset): void;
    static addGitBranch(builder: flatbuffers.Builder, gitBranchOffset: flatbuffers.Offset): void;
    static addBuildTime(builder: flatbuffers.Builder, buildTimeOffset: flatbuffers.Offset): void;
    static addPlatform(builder: flatbuffers.Builder, platformOffset: flatbuffers.Offset): void;
    static addArch(builder: flatbuffers.Builder, archOffset: flatbuffers.Offset): void;
    static addCompiler(builder: flatbuffers.Builder, compilerOffset: flatbuffers.Offset): void;
    static addNodeVersion(builder: flatbuffers.Builder, nodeVersionOffset: flatbuffers.Offset): void;
    static endInfoResponse(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createInfoResponse(builder: flatbuffers.Builder, projectNameOffset: flatbuffers.Offset, projectVersionOffset: flatbuffers.Offset, buildTypeOffset: flatbuffers.Offset, gitHashOffset: flatbuffers.Offset, gitBranchOffset: flatbuffers.Offset, buildTimeOffset: flatbuffers.Offset, platformOffset: flatbuffers.Offset, archOffset: flatbuffers.Offset, compilerOffset: flatbuffers.Offset, nodeVersionOffset: flatbuffers.Offset): flatbuffers.Offset;
    unpack(): InfoResponseT;
    unpackTo(_o: InfoResponseT): void;
}
export declare class InfoResponseT implements flatbuffers.IGeneratedObject {
    projectName: string | Uint8Array | null;
    projectVersion: string | Uint8Array | null;
    buildType: string | Uint8Array | null;
    gitHash: string | Uint8Array | null;
    gitBranch: string | Uint8Array | null;
    buildTime: string | Uint8Array | null;
    platform: string | Uint8Array | null;
    arch: string | Uint8Array | null;
    compiler: string | Uint8Array | null;
    nodeVersion: string | Uint8Array | null;
    constructor(projectName?: string | Uint8Array | null, projectVersion?: string | Uint8Array | null, buildType?: string | Uint8Array | null, gitHash?: string | Uint8Array | null, gitBranch?: string | Uint8Array | null, buildTime?: string | Uint8Array | null, platform?: string | Uint8Array | null, arch?: string | Uint8Array | null, compiler?: string | Uint8Array | null, nodeVersion?: string | Uint8Array | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=info-response.d.ts.map