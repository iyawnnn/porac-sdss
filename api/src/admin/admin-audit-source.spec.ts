import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } from '../contracts/admin-audit';

const root = join(__dirname, '../..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (['node_modules', 'dist', '.next', '.git'].includes(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.(?:[cm]?js|tsx?|sql)$/.test(name)
        ? [path]
        : [];
  });
}
const paths = ['src', 'scripts']
  .flatMap((dir) => files(join(root, dir)))
  .concat(
    ['e2e', 'scripts', 'app', 'components', 'lib'].flatMap((dir) =>
      files(join(root, '..', dir)),
    ),
  );

describe('audit source inventory', () => {
  it('finds real audit writers and no row UPDATE/DELETE in app, scripts or E2E (historical migration SQL excluded)', () => {
    expect(
      paths.some((path) => path.endsWith('seed-demo-presentation.ts')),
    ).toBe(true);
    const violations: string[] = [];
    for (const path of paths) {
      if (/\.spec\.ts$/.test(path) && !path.includes(join(root, '..', 'e2e')))
        continue;
      const source = readFileSync(path, 'utf8');
      if (
        /\b(?:UPDATE\s+(?:public\.)?admin_audit_events|DELETE\s+FROM\s+(?:public\.)?admin_audit_events)\b|\.\s*(?:update|delete)\s*\(\s*adminAuditEvents\b/i.test(
          source,
        )
      )
        violations.push(relative(root, path));
    }
    expect(violations).toEqual([]);
  });

  it('every literal action written in API source or script has a shared action and label', () => {
    const actions = new Set<string>();
    for (const path of paths.filter(
      (p) => !/\.spec\.ts$/.test(p) && p.includes(join(root, 'src')),
    )) {
      const source = readFileSync(path, 'utf8');
      const ast = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const declarations = new Map<string, ts.Expression>();
      function index(node: ts.Node) {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer
        )
          declarations.set(node.name.text, node.initializer);
        ts.forEachChild(node, index);
      }
      index(ast);
      function strings(node: ts.Node, seen = new Set<string>()) {
        if (ts.isStringLiteral(node)) actions.add(node.text);
        else if (
          ts.isIdentifier(node) &&
          declarations.has(node.text) &&
          !seen.has(node.text)
        ) {
          seen.add(node.text);
          strings(declarations.get(node.text)!, seen);
        } else if (ts.isConditionalExpression(node)) {
          strings(node.whenTrue, seen);
          strings(node.whenFalse, seen);
        }
      }
      function visit(node: ts.Node) {
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(ast) === 'actionType'
        )
          strings(node.initializer);
        ts.forEachChild(node, visit);
      }
      visit(ast);
      if (/INSERT\s+INTO\s+admin_audit_events/i.test(source)) {
        for (const match of source.matchAll(
          /'(?:admin|ticket|report|work_order|operational_assessment)_[a-z_]+'/g,
        ))
          actions.add(match[0].slice(1, -1));
      }
    }
    expect(actions.has('admin_reactivated')).toBe(true);
    expect(actions.has('work_order_completed')).toBe(true);
    for (const action of actions) {
      expect(AUDIT_ACTIONS).toContain(action);
      expect(
        AUDIT_ACTION_LABELS[action as keyof typeof AUDIT_ACTION_LABELS],
      ).toMatch(/\S/);
    }
  });
});
