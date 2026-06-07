#!/usr/bin/env node

import { Command } from 'commander';
import { join } from 'path';
import { readFileSync } from 'fs';
import { getDB, closeDB } from '../core/db.js';
import { Person, Story } from '../core/models.js';
import { exportJSON, exportHTML } from '../core/export.js';

const program = new Command();

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
program.name('cairn').description('Remember what matters.').version(pkg.version);

program.command('init')
  .description('Initialize a new Cairn vault in the current directory')
  .action(() => {
    getDB();
    console.log('Cairn vault initialized in .cairn/');
    closeDB();
  });

const personCmd = program.command('person').description('Manage people');

personCmd.command('add')
  .description('Add a person')
  .option('-n, --name <name>', "Person's name", 'Unknown')
  .option('-b, --birth <date>', 'Birth date')
  .option('-d, --death <date>', 'Death date')
  .option('--bio <text>', 'Biography')
  .action((opts) => {
    const p = Person.create({ name: opts.name, birthDate: opts.birth, deathDate: opts.death, bio: opts.bio });
    console.log(`Person added: ${p.name} (${p.id})`);
  });

personCmd.command('list')
  .description('List all people')
  .action(() => {
    const people = Person.getAll();
    if (people.length === 0) { console.log('No people found.'); return; }
    for (const p of people) {
      const span = p.birth_date ? `${p.birth_date}${p.death_date ? ' — ' + p.death_date : ''}` : '';
      console.log(`  ${p.id.substring(0, 8)}  ${p.name} ${span ? '[' + span + ']' : ''}`);
    }
  });

personCmd.command('get <id>')
  .description('Show person details')
  .action((id) => {
    const p = Person.getById(id);
    if (!p) { console.log('Person not found.'); return; }
    console.log(`Name: ${p.name}`);
    if (p.birth_date) console.log(`Born: ${p.birth_date}`);
    if (p.death_date) console.log(`Died: ${p.death_date}`);
    if (p.bio) console.log(`Bio: ${p.bio}`);
    const rels = Person.getRelationships(id);
    if (rels.length) {
      console.log('Relationships:');
      for (const r of rels) console.log(`  ${r.related_person_name} (${r.type})`);
    }
  });

personCmd.command('delete <id>')
  .description('Delete a person')
  .action((id) => {
    Person.delete(id);
    console.log('Person deleted.');
  });

const storyCmd = program.command('story').description('Manage stories');

storyCmd.command('add')
  .description('Add a story')
  .option('-t, --title <title>', 'Story title', 'Untitled')
  .option('-c, --content <content>', 'Story content (markdown)')
  .option('-d, --date <date>', 'Story date')
  .option('-p, --people <ids>', 'Comma-separated person IDs')
  .option('--tags <tags>', 'Comma-separated tags')
  .action((opts) => {
    const personIds = opts.people ? opts.people.split(',').map(s => s.trim()) : [];
    const tagNames = opts.tags ? opts.tags.split(',').map(s => s.trim()) : [];
    const content = opts.content || readFromStdin();
    const s = Story.create({ title: opts.title, content, storyDate: opts.date, personIds, tagNames });
    console.log(`Story added: ${s.title} (${s.id})`);
  });

storyCmd.command('list')
  .description('List all stories')
  .action(() => {
    const stories = Story.getAll();
    if (stories.length === 0) { console.log('No stories found.'); return; }
    for (const s of stories) {
      console.log(`  ${s.id.substring(0, 8)}  ${s.title}${s.story_date ? ' [' + s.story_date + ']' : ''}`);
    }
  });

storyCmd.command('get <id>')
  .description('Show story details')
  .action((id) => {
    const s = Story.getById(id);
    if (!s) { console.log('Story not found.'); return; }
    console.log(`Title: ${s.title}`);
    if (s.story_date) console.log(`Date: ${s.story_date}`);
    if (s.people?.length) console.log('People: ' + s.people.map(p => p.name).join(', '));
    if (s.tags?.length) console.log('Tags: ' + s.tags.join(', '));
    console.log('---');
    console.log(s.content);
  });

storyCmd.command('delete <id>')
  .description('Delete a story')
  .action((id) => {
    Story.delete(id);
    console.log('Story deleted.');
  });

const exportCmd = program.command('export').description('Export your vault');

exportCmd.command('json [dir]')
  .description('Export as JSON')
  .action((dir) => {
    const out = join(dir || process.cwd(), 'cairn-export');
    const path = exportJSON(out);
    console.log(`Exported to ${path}`);
  });

exportCmd.command('html [dir]')
  .description('Export as static HTML site')
  .action((dir) => {
    const out = join(dir || process.cwd(), 'cairn-site');
    const path = exportHTML(out);
    console.log(`Static site generated at ${path}/`);
    console.log('Open index.html in your browser to view.');
  });

program.command('serve')
  .description('Start the Cairn web interface')
  .option('-p, --port <port>', 'Port to serve on', '4717')
  .action(async (opts) => {
    const { startServer } = await import('../server/index.js');
    startServer(parseInt(opts.port));
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) program.help();

function readFromStdin() {
  return ''; // placeholder for future pipe support
}
