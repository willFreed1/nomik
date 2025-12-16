/** Cache TTL simple en memoire pour les requetes de lecture Neo4j */
interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

export class QueryCache {
    private store = new Map<string, CacheEntry<unknown>>();
    private readonly ttlMs: number;
    private readonly maxSize: number;

    constructor(ttlMs = 30_000, maxSize = 200) {
        this.ttlMs = ttlMs;
        this.maxSize = maxSize;
    }

    /** Recupere une entree si elle existe et n'a pas expire */
    get<T>(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.data as T;
    }

    /** Stocke une entree avec TTL */
    set<T>(key: string, data: T): void {
        // Eviction LRU basique si on depasse la taille max
        if (this.store.size >= this.maxSize) {
            const firstKey = this.store.keys().next().value;
            if (firstKey) this.store.delete(firstKey);
        }
        this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
    }

    /** Invalide toutes les entrees (apres un write) */
    invalidateAll(): void {
        this.store.clear();
    }

    /** Invalide les entrees dont la cle contient le pattern */
    invalidateByPattern(pattern: string): void {
        for (const key of this.store.keys()) {
            if (key.includes(pattern)) this.store.delete(key);
        }
    }

    get size(): number {
        return this.store.size;
    }
}
