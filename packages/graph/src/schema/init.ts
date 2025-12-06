import type { GraphDriver } from '../drivers/driver.interface.js';

/** Contraintes et index pour le schema Neo4j */
const SCHEMA_INIT = [
    // Contraintes d'unicite
    'CREATE CONSTRAINT file_id IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE',
    'CREATE CONSTRAINT function_id IF NOT EXISTS FOR (f:Function) REQUIRE f.id IS UNIQUE',
    'CREATE CONSTRAINT class_id IF NOT EXISTS FOR (c:Class) REQUIRE c.id IS UNIQUE',
    'CREATE CONSTRAINT route_id IF NOT EXISTS FOR (r:Route) REQUIRE r.id IS UNIQUE',
    'CREATE CONSTRAINT module_id IF NOT EXISTS FOR (m:Module) REQUIRE m.id IS UNIQUE',
    'CREATE CONSTRAINT variable_id IF NOT EXISTS FOR (v:Variable) REQUIRE v.id IS UNIQUE',
    // Index de recherche
    'CREATE INDEX file_path IF NOT EXISTS FOR (f:File) ON (f.path)',
    'CREATE INDEX function_name IF NOT EXISTS FOR (f:Function) ON (f.name)',
    'CREATE INDEX function_filepath IF NOT EXISTS FOR (f:Function) ON (f.filePath)',
    'CREATE INDEX class_name IF NOT EXISTS FOR (c:Class) ON (c.name)',
    'CREATE INDEX route_path IF NOT EXISTS FOR (r:Route) ON (r.path)',
];

export async function initializeSchema(driver: GraphDriver): Promise<void> {
    for (const stmt of SCHEMA_INIT) {
        try {
            await driver.runWrite(stmt);
        } catch {
            // Ignorer si la contrainte/index existe deja sous un autre nom
        }
    }
}
