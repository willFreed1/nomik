import { describe, it, expect } from 'vitest';
import { findChangedFunctions, type FunctionLineRange } from '../git-diff';

describe('git-diff', () => {
    describe('findChangedFunctions', () => {
        const functions: FunctionLineRange[] = [
            { name: 'foo', id: 'id-foo', startLine: 1, endLine: 10 },
            { name: 'bar', id: 'id-bar', startLine: 15, endLine: 30 },
            { name: 'baz', id: 'id-baz', startLine: 35, endLine: 50 },
        ];

        it('returns functions whose line ranges overlap changed lines', () => {
            const result = findChangedFunctions([5, 20], functions);
            expect(result.map(f => f.name).sort()).toEqual(['bar', 'foo']);
        });

        it('returns empty when no overlap', () => {
            const result = findChangedFunctions([11, 12, 13], functions);
            expect(result).toHaveLength(0);
        });

        it('returns empty for empty changed lines', () => {
            const result = findChangedFunctions([], functions);
            expect(result).toHaveLength(0);
        });

        it('returns empty for empty functions', () => {
            const result = findChangedFunctions([5], []);
            expect(result).toHaveLength(0);
        });

        it('detects change at exact boundary (startLine)', () => {
            const result = findChangedFunctions([15], functions);
            expect(result).toHaveLength(1);
            expect(result[0]!.name).toBe('bar');
        });

        it('detects change at exact boundary (endLine)', () => {
            const result = findChangedFunctions([50], functions);
            expect(result).toHaveLength(1);
            expect(result[0]!.name).toBe('baz');
        });

        it('returns all functions when all lines changed', () => {
            const allLines = Array.from({ length: 50 }, (_, i) => i + 1);
            const result = findChangedFunctions(allLines, functions);
            expect(result).toHaveLength(3);
        });
    });
});
