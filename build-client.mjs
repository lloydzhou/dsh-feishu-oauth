import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const result = await build({ absWorkingDir: fileURLToPath(new URL('.', import.meta.url)), entryPoints: ['client-source.js'], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022', external: ['react', '@deepseek-ai/dsh-client-ui-primitives'], legalComments: 'none' });
await writeFile(new URL('./client.js', import.meta.url), `window.__ModuleLoader__.load({id:"dsh-feishu-oauth",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
console.log('Built client.js for the official browser module loader');
