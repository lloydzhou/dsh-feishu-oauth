import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const result = await build({ absWorkingDir: fileURLToPath(new URL('..', import.meta.url)), entryPoints: ['src/client/index.js'], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022', external: ['react', '@deepseek-ai/dsh-client-ui-primitives'], legalComments: 'none' });
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/client.js', import.meta.url), `window.__ModuleLoader__.load({id:"dsh-feishu-oauth",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
console.log('Built dist/client.js for the official browser module loader');
