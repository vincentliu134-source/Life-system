import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
// Route handlers consistently return JSON on failure. This also ensures client
// save controls can show validation errors instead of treating HTML as success.
for (const file of files('app/api').filter((file) => file.endsWith('route.ts'))) {
  let text = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const node of ast.statements) {
    if (!ts.isFunctionDeclaration(node) || !node.body || !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    edits.push([node.body.getStart(ast)+1, '\n  try {']);
    edits.push([node.body.end-1, '\n  } catch (error) {\n    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });\n  }\n']);
  }
  for (const [at, insert] of edits.sort((a,b) => b[0]-a[0])) text = text.slice(0,at)+insert+text.slice(at);
  fs.writeFileSync(file, text);
}
// Make all legacy async busy states retryable after a rejected HTTP request.
for (const file of files('app/components').filter((file) => file.endsWith('.tsx') && !file.endsWith('planning-panels.tsx'))) {
  let text = fs.readFileSync(file,'utf8');
  const ast = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const edits = [];
  function walk(node) {
    if (ts.isFunctionDeclaration(node) && node.body && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      const body = node.body.getText(ast);
      const resets = [...body.matchAll(/(set(?:Organizing|ClarifyingAll|GeneratingWeekTasks|BreakingDown|Saving|SaveState|SaveStatus|DraftSaveStatus|CarryStatus))\((true|"saving")\)/g)].map(([,setter,value]) => `${setter}(${value === 'true' ? 'false' : '"idle"'});`);
      if (resets.length) {
        edits.push([node.body.getStart(ast)+1, '\n    try {']);
        edits.push([node.body.end-1, '\n    } catch { '+[...new Set(resets)].join(' ')+' }\n']);
      }
    }
    ts.forEachChild(node,walk);
  }
  walk(ast);
  for (const [at,insert] of edits.sort((a,b) => b[0]-a[0])) text = text.slice(0,at)+insert+text.slice(at);
  fs.writeFileSync(file,text);
}
// Remove unused imports introduced by moving declarations into focused files.
const targets = ['app/page.tsx', ...files('app/components').filter((f) => f.endsWith('.tsx'))];
const config = ts.parseJsonConfigFileContent(JSON.parse(fs.readFileSync('tsconfig.json','utf8')),ts.sys,process.cwd());
const host = { getScriptFileNames: () => config.fileNames, getScriptVersion: () => '0', getScriptSnapshot: (f) => fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f,'utf8')) : undefined, getCurrentDirectory: () => process.cwd(), getCompilationSettings: () => config.options, getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o), fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory };
const service = ts.createLanguageService(host);
for (const file of targets) {
  const changes = service.organizeImports({ type: 'file', fileName: path.resolve(file) }, {}, {});
  for (const change of changes) {
    let text = fs.readFileSync(change.fileName,'utf8');
    for (const edit of [...change.textChanges].sort((a,b) => b.span.start-a.span.start)) text = text.slice(0,edit.span.start)+edit.newText+text.slice(edit.span.start+edit.span.length);
    fs.writeFileSync(change.fileName,text);
  }
}
console.log('Completed JSON error handling and import cleanup.');
