import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { statusCommand } from './commands/status.js';
import { impactCommand } from './commands/impact.js';
import { initCommand } from './commands/init.js';
import { watchCommand } from './commands/watch.js';
import { serveCommand } from './commands/serve.js';

const program = new Command();

program
    .name('genome')
    .description('GENOME — The Autonomous Knowledge Supervisor')
    .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(statusCommand);
program.addCommand(impactCommand);
program.addCommand(watchCommand);
program.addCommand(serveCommand);

program.parse();
