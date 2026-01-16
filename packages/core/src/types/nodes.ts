export interface FileNode {
    id: string;
    type: 'file';
    path: string;
    language: string;
    hash: string;
    size: number;
    lastParsed: string;
}

export interface FunctionNode {
    id: string;
    type: 'function';
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
    params: ParameterInfo[];
    returnType?: string;
    isAsync: boolean;
    isExported: boolean;
    isGenerator: boolean;
    decorators: string[];
    confidence: number;
    bodyHash?: string;
}

export interface ClassNode {
    id: string;
    type: 'class';
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
    isExported: boolean;
    isAbstract: boolean;
    superClass?: string;
    interfaces: string[];
    decorators: string[];
    methods: string[];
    properties: string[];
    bodyHash?: string;
}

export interface VariableNode {
    id: string;
    type: 'variable';
    name: string;
    filePath: string;
    line: number;
    kind: 'const' | 'let' | 'var';
    isExported: boolean;
    valueType?: string;
}

export interface ModuleNode {
    id: string;
    type: 'module';
    name: string;
    path: string;
    moduleType: 'file' | 'package' | 'external';
}

export interface RouteNode {
    id: string;
    type: 'route';
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ALL';
    path: string;
    handlerName: string;
    filePath: string;
    middleware: string[];
}

export interface DBTableNode {
    id: string;
    type: 'db_table';
    name: string;
    schema?: string;
    operations: Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>;
}

export interface ExternalAPINode {
    id: string;
    type: 'external_api';
    name: string;
    baseUrl?: string;
    methods: string[];
}

export interface CronJobNode {
    id: string;
    type: 'cron_job';
    name: string;
    schedule: string;
    handlerName: string;
    filePath: string;
}

export interface EventNode {
    id: string;
    type: 'event';
    name: string;
    eventKind: 'emit' | 'listen';
    filePath: string;
}

export interface EnvVarNode {
    id: string;
    type: 'env_var';
    name: string;
    required: boolean;
    defaultValue?: string;
}

/** Noeud projet : isole les donnees par projet dans le graphe */
export interface ProjectNode {
    id: string;
    type: 'project';
    name: string;
    rootPath: string;
    createdAt: string;
    lastScanAt?: string;
}

export interface ParameterInfo {
    name: string;
    type?: string;
    optional: boolean;
    defaultValue?: string;
}

export type GraphNode =
    | FileNode
    | FunctionNode
    | ClassNode
    | VariableNode
    | ModuleNode
    | RouteNode
    | DBTableNode
    | ExternalAPINode
    | CronJobNode
    | EventNode
    | EnvVarNode;

export type NodeType = GraphNode['type'];
