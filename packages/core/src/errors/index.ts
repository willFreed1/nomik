export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export class GenomeError extends Error {
    readonly code: string;
    readonly severity: ErrorSeverity;
    readonly recoverable: boolean;
    readonly context?: Record<string, unknown>;

    constructor(
        message: string,
        code: string,
        severity: ErrorSeverity,
        recoverable: boolean,
        context?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'GenomeError';
        this.code = code;
        this.severity = severity;
        this.recoverable = recoverable;
        this.context = context;
    }
}

export class ParseError extends GenomeError {
    constructor(message: string, filePath: string, line?: number) {
        super(message, 'PARSE_ERROR', 'medium', true, { filePath, line });
        this.name = 'ParseError';
    }
}

export class GraphConnectionError extends GenomeError {
    constructor(message: string, uri: string) {
        super(message, 'GRAPH_CONNECTION_ERROR', 'critical', true, { uri });
        this.name = 'GraphConnectionError';
    }
}

export class GraphQueryError extends GenomeError {
    constructor(message: string, query?: string) {
        super(message, 'GRAPH_QUERY_ERROR', 'high', false, { query });
        this.name = 'GraphQueryError';
    }
}

export class ConfigError extends GenomeError {
    constructor(message: string, field?: string) {
        super(message, 'CONFIG_ERROR', 'critical', false, { field });
        this.name = 'ConfigError';
    }
}

export class FileSystemError extends GenomeError {
    constructor(message: string, path: string) {
        super(message, 'FS_ERROR', 'high', true, { path });
        this.name = 'FileSystemError';
    }
}

export class WatcherError extends GenomeError {
    constructor(message: string, path?: string) {
        super(message, 'WATCHER_ERROR', 'medium', true, { path });
        this.name = 'WatcherError';
    }
}

export class McpError extends GenomeError {
    constructor(message: string, tool?: string) {
        super(message, 'MCP_ERROR', 'high', true, { tool });
        this.name = 'McpError';
    }
}
