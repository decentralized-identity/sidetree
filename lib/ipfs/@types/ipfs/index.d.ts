declare module 'ipfs' {
    export = IPFS;
}

type Callback<T> = (error: Error, result?: T) => void;

declare class IPFS {
    constructor(options?: IPFS.Options);

    types: IPFS.Types;

    init(options: IPFS.InitOptions, callback: Callback<boolean>): void;
    init(callback: Callback<boolean>): void;

    preStart(callback: Callback<any>): void;
    start(callback?: Callback<any>): void;
    stop(callback?: (error?: Error) => void): void;
    isOnline(): boolean;

    version(options: any, callback: (error: Error, version: IPFS.Version) => void): void ;
    version(options: any): Promise<IPFS.Version>;
    version(callback: (error: Error, version: IPFS.Version) => void): void ;
    version(): Promise<IPFS.Version>;

    id(options: any, callback: (error: Error, version: IPFS.Id) => void): void ;
    id(options: any): Promise<IPFS.Id>;
    id(callback: (error: Error, version: IPFS.Id) => void): void ;
    id(): Promise<IPFS.Id>;

    repo: IPFS.RepoAPI;
    bootstrap: any;
    config: any;
    block: any;
    object: IPFS.ObjectAPI;
    dag: IPFS.DagAPI;
    libp2p: any;
    swarm: IPFS.SwarmAPI;
    bitswap: any;
    pin: IPFS.PinAPI;

    ping(callback: (error: Error) => void): void;
    ping(): Promise<void>;

    pubsub: any;

    on(event: string, callback: () => void): IPFS;
    on(event: 'error', callback: (error: { message: any }) => void): IPFS;
    once(event: string, callback: () => void): IPFS;
 
    createAddStream(options: any, callback: Callback<any>): void;
    createAddStream(callback: Callback<any>): void;

    createPullStream(options: any): any;

    add(data: IPFS.FileContent, options: any, callback: Callback<IPFS.IPFSFile[]>): void;
    add(data: IPFS.FileContent, options: any): Promise<IPFS.IPFSFile[]>;
    add(data: IPFS.FileContent, callback: Callback<IPFS.IPFSFile[]>): void;
    add(data: IPFS.FileContent): Promise<IPFS.IPFSFile[]>;

    cat(hash: IPFS.Multihash, callback: Callback<IPFS.FileContent>): void;
    cat(hash: IPFS.Multihash): Promise<IPFS.FileContent>;

    get(hash: IPFS.Multihash, callback: Callback<IPFS.Files[]>): void;
    get(hash: IPFS.Multihash): Promise<IPFS.Files[]>;

    getPull(hash: IPFS.Multihash, callback: Callback<any>): void;
}

declare namespace IPFS {

    export interface Options {
        init?: boolean;
        start?: boolean;
        EXPERIMENTAL?: any;
        repo?: any;
        config?: any;
    }

    export interface InitOptions {
        emptyRepo?: boolean;
        bits?: number;
        log?: Function;
    }

    export interface Multiaddr {
        buffer: Uint8Array;
    }

    export type Multihash = any | string;
    export type CID = any;

    export interface Types {
        Buffer: any;
        PeerId: any;
        PeerInfo: any;
        multiaddr: Multiaddr;
        multihash: Multihash;
        CID: CID;
    }

    export interface Version {
        version: string;
        repo: string;
        commit: string;
    }

    export interface Id {
        id: string;
        publicKey: string;
        addresses: Multiaddr[];
        agentVersion: string;
        protocolVersion: string;
    }

    export interface RepoAPI {
        init(bits: number, empty: boolean, callback: Callback<any>): void;

        version(options: any, callback: Callback<any>): void;
        version(callback: Callback<any>): void;

        gc(): void;
        path(): string;
    }

    // TODO: Add type for pull-stream
    
    export type FileContent = Buffer | NodeJS.ReadableStream | Files[];

    export interface Files {
        path: string;
        // TODO: Add type for pull-stream
        content?: Buffer | NodeJS.ReadableStream;
    }

    export interface IPFSFile {
        path: string;
        hash: string;
        size: number;
        content?: FileContent;
    }
    
    export interface PinAPI {
        add(hash: Multihash, options: any, callback: Callback<any[]>): void;
        add(hash: Multihash, options: any): Promise<any[]>;
        add(hash: Multihash, callback: Callback<any>): void;
        add(hash: Multihash): Promise<any[]>;

        ls(): void;
        rm(): void;
    }
    
    export interface PeersOptions {
        v?: boolean;
        verbose?: boolean;
    }

    export type PeerId = any;

    export interface PeerInfo {
        id: PeerId;
        multiaddr: Multiaddr;
        multiaddrs: Multiaddr[];
        distinctMultiaddr(): Multiaddr[];
    }

    export interface Peer {
        addr: Multiaddr;
        peer: PeerInfo;
    }

    export interface SwarmAPI {
        peers(options: PeersOptions, callback: Callback<Peer[]>): void;
        peers(options: PeersOptions): Promise<Peer[]>;
        peers(callback: Callback<Peer[]>): void;
        peers(): Promise<Peer[]>;

        addrs(callback: Callback<PeerInfo[]>): void;
        addrs(): Promise<PeerInfo[]>;

        localAddrs(callback: Callback<Multiaddr[]>): void;
        localAddrs(): Promise<Multiaddr[]>;

        connect(maddr: Multiaddr | string, callback: Callback<any>): void;
        connect(maddr: Multiaddr | string): Promise<any>;

        disconnect(maddr: Multiaddr | string, callback: Callback<any>): void;
        disconnect(maddr: Multiaddr | string): Promise<any>;

        filters(callback: Callback<void>): never;
    }

    export type DAGNode = any;
    export type DAGLink = any;
    export type DAGLinkRef = DAGLink | any;
    export type Obj = Buffer | Object | DAGNode;

    export interface Object {
        Data: Buffer;
        Link: DAGLink;
    }

    export interface ObjectStat {
        Hash: Multihash;
        NumLinks: number;
        BlockSize: number;
        LinksSize: number;
        DataSize: number;
        CumulativeSize: number;
    }

    export interface PutObjectOptions {
        enc?: any;
    }

    export interface GetObjectOptions {
        enc?: any;
    }

    export interface ObjectPatchAPI {
        addLink(multihash: Multihash, link: DAGLink, options: GetObjectOptions, callback: Callback<any>): void;
        addLink(multihash: Multihash, link: DAGLink, options: GetObjectOptions): Promise<any>;
        addLink(multihash: Multihash, link: DAGLink, callback: Callback<any>): void;
        addLink(multihash: Multihash, link: DAGLink): Promise<any>;

        rmLink(multihash: Multihash, linkRef: DAGLinkRef, options: GetObjectOptions, callback: Callback<any>): void;
        rmLink(multihash: Multihash, linkRef: DAGLinkRef, options: GetObjectOptions): Promise<any>;
        rmLink(multihash: Multihash, linkRef: DAGLinkRef, callback: Callback<any>): void;
        rmLink(multihash: Multihash, linkRef: DAGLinkRef): Promise<any>;

        appendData(multihash: Multihash, data: any, options: GetObjectOptions, callback: Callback<any>): void;
        appendData(multihash: Multihash, data: any, options: GetObjectOptions): Promise<any>;
        appendData(multihash: Multihash, data: any, callback: Callback<any>): void;
        appendData(multihash: Multihash, data: any): Promise<any>;

        setData(multihash: Multihash, data: any, options: GetObjectOptions, callback: Callback<any>): void;
        setData(multihash: Multihash, data: any, options: GetObjectOptions): Promise<any>;
        setData(multihash: Multihash, data: any, callback: Callback<any>): void;
        setData(multihash: Multihash, data: any): Promise<any>;
    }

    export interface ObjectAPI {
        "new"(template: 'unixfs-dir', callback: Callback<DAGNode>): void;
        "new"(callback: Callback<DAGNode>): void;
        "new"(): Promise<DAGNode>;

        put(obj: Obj, options: PutObjectOptions, callback: Callback<any>): void;
        put(obj: Obj, options: PutObjectOptions): Promise<any>;
        put(obj: Obj, callback: Callback<any>): void;
        put(obj: Obj): Promise<any>;

        get(multihash: Multihash, options: GetObjectOptions, callback: Callback<any>): void;
        get(multihash: Multihash, options: GetObjectOptions): Promise<any>;
        get(multihash: Multihash, callback: Callback<any>): void;
        get(multihash: Multihash): Promise<any>;

        data(multihash: Multihash, options: GetObjectOptions, callback: Callback<any>): void;
        data(multihash: Multihash, options: GetObjectOptions): Promise<any>;
        data(multihash: Multihash, callback: Callback<any>): void;
        data(multihash: Multihash): Promise<any>;

        links(multihash: Multihash, options: GetObjectOptions, callback: Callback<DAGLink[]>): void;
        links(multihash: Multihash, options: GetObjectOptions): Promise<DAGLink[]>;
        links(multihash: Multihash, callback: Callback<DAGLink[]>): void;
        links(multihash: Multihash): Promise<DAGLink[]>;

        stat(multihash: Multihash, options: GetObjectOptions, callback: Callback<ObjectStat>): void;
        stat(multihash: Multihash, options: GetObjectOptions): Promise<ObjectStat>;
        stat(multihash: Multihash, callback: Callback<ObjectStat>): void;
        stat(multihash: Multihash): Promise<ObjectStat>;

        patch: ObjectPatchAPI;
    }

    export interface DagAPI {
        put(dagNode: any, options: any, callback: Callback<any>): void;
        put(dagNode: any, options: any): Promise<any>;

        get(cid: string | CID, path: string, options: any, callback: Callback<any>): void;
        get(cid: string | CID, path: string, options: any): Promise<any>;
        get(cid: string | CID, path: string, callback: Callback<any>): void;
        get(cid: string | CID, path: string): Promise<any>;
        get(cid: string | CID, callback: Callback<any>): void;
        get(cid: string | CID): Promise<any>;

        tree(cid: string | CID, path: string, options: any, callback: Callback<any>): void;
        tree(cid: string | CID, path: string, options: any): Promise<any>;
        tree(cid: string | CID, path: string, callback: Callback<any>): void;
        tree(cid: string | CID, path: string): Promise<any>;
        tree(cid: string | CID, options: any, callback: Callback<any>): void;
        tree(cid: string | CID, options: any): Promise<any>;
        tree(cid: string | CID, callback: Callback<any>): void;
        tree(cid: string | CID): Promise<any>;
    }

    export function createNode(options: Options): IPFS;
}