export type EdgeType =
    | 'CONTAINS'
    | 'IMPORTS'
    | 'EXPORTS'
    | 'EXTENDS'
    | 'IMPLEMENTS'
    | 'CALLS'
    | 'DEPENDS_ON'
    | 'HANDLES'
    | 'READS_FROM'
    | 'WRITES_TO'
    | 'CALLS_EXTERNAL'
    | 'TRIGGERS'
    | 'EMITS'
    | 'LISTENS_TO'
    | 'USES_ENV';

export interface BaseEdge {
    id: string;
    type: EdgeType;
    sourceId: string;
    targetId: string;
    confidence: number;
}

export interface ContainsEdge extends BaseEdge {
    type: 'CONTAINS';
}

export interface ImportsEdge extends BaseEdge {
    type: 'IMPORTS';
    specifiers: string[];
    isDefault: boolean;
    isDynamic: boolean;
}

export interface ExportsEdge extends BaseEdge {
    type: 'EXPORTS';
    isDefault: boolean;
    alias?: string;
}

export interface ExtendsEdge extends BaseEdge {
    type: 'EXTENDS';
}

export interface ImplementsEdge extends BaseEdge {
    type: 'IMPLEMENTS';
}

export interface CallsEdge extends BaseEdge {
    type: 'CALLS';
    line: number;
    column?: number;
}

export interface DependsOnEdge extends BaseEdge {
    type: 'DEPENDS_ON';
    kind: 'import' | 'call' | 'http' | 'event' | 'env';
}

export interface HandlesEdge extends BaseEdge {
    type: 'HANDLES';
    middleware: string[];
}

export interface ReadsFromEdge extends BaseEdge {
    type: 'READS_FROM';
    query?: string;
}

export interface WritesToEdge extends BaseEdge {
    type: 'WRITES_TO';
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
}

export interface CallsExternalEdge extends BaseEdge {
    type: 'CALLS_EXTERNAL';
    method: string;
    endpoint?: string;
}

export interface TriggersEdge extends BaseEdge {
    type: 'TRIGGERS';
    schedule?: string;
}

export interface EmitsEdge extends BaseEdge {
    type: 'EMITS';
    payload?: string;
}

export interface ListensToEdge extends BaseEdge {
    type: 'LISTENS_TO';
    handler: string;
}

export interface UsesEnvEdge extends BaseEdge {
    type: 'USES_ENV';
}

export type GraphEdge =
    | ContainsEdge
    | ImportsEdge
    | ExportsEdge
    | ExtendsEdge
    | ImplementsEdge
    | CallsEdge
    | DependsOnEdge
    | HandlesEdge
    | ReadsFromEdge
    | WritesToEdge
    | CallsExternalEdge
    | TriggersEdge
    | EmitsEdge
    | ListensToEdge
    | UsesEnvEdge;
