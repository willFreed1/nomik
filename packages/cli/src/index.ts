import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { statusCommand } from './commands/status.js';
import { impactCommand } from './commands/impact.js';
import { initCommand } from './commands/init.js';
import { watchCommand } from './commands/watch.js';
import { serveCommand } from './commands/serve.js';
import { queryCommand } from './commands/query.js';
import { recentCommand } from './commands/recent.js';
import { setupCursorCommand } from './commands/setup-cursor.js';
import { setupWindsurfCommand } from './commands/setup-windsurf.js';
import { projectCommand } from './commands/project.js';
import { prImpactCommand } from './commands/pr-impact.js';
import { explainCommand } from './commands/explain.js';
import { serviceLinksCommand } from './commands/service-links.js';
import { onboardCommand } from './commands/onboard.js';
import { wikiCommand } from './commands/wiki.js';

const program = new Command();

program
    .name('nomik')
    .description('NOMIK — The Living Blueprint')
    .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(statusCommand);
program.addCommand(impactCommand);
program.addCommand(watchCommand);
program.addCommand(serveCommand);
program.addCommand(queryCommand);
program.addCommand(recentCommand);
program.addCommand(setupCursorCommand);
program.addCommand(setupWindsurfCommand);
program.addCommand(projectCommand);
program.addCommand(prImpactCommand);
program.addCommand(explainCommand);
program.addCommand(serviceLinksCommand);
program.addCommand(onboardCommand);
program.addCommand(wikiCommand);

program.parse();
