import postcss, {
  type AtRule,
  type Container,
  type Rule,
} from "postcss";

interface EffectiveDeclaration {
  value: string;
  priority: string;
}

export function getEffectiveCssRule(source: string, selector: string): string {
  const root = postcss.parse(source);
  return collectEffectiveDeclarations(getDirectStyleRules(root), selector);
}

export function getEffectiveMediaCssRule(
  source: string,
  mediaQuery: string,
  selector: string,
): string {
  const root = postcss.parse(source);
  const mediaRules = root.nodes.filter((item): item is AtRule => (
    item.type === "atrule"
      && item.name.toLowerCase() === "media"
      && normalizeWhitespace(item.params) === normalizeWhitespace(mediaQuery)
  ));
  if (mediaRules.length === 0) {
    throw new Error(`Missing media query: ${mediaQuery}`);
  }
  return collectEffectiveDeclarations(
    mediaRules.flatMap((item) => getDirectStyleRules(item)),
    selector,
  );
}

function getDirectStyleRules(container: Container): Rule[] {
  return (container.nodes ?? []).filter((item): item is Rule => item.type === "rule");
}

function collectEffectiveDeclarations(rules: Rule[], selector: string): string {
  const declarations = new Map<string, EffectiveDeclaration>();
  let matched = false;

  for (const item of rules) {
    if (!matchesSelector(item.selector, selector)) continue;
    matched = true;

    for (const child of item.nodes) {
      if (child.type !== "decl") continue;
      const priority = child.important ? "important" : "";
      const current = declarations.get(child.prop);
      if (current?.priority === "important" && priority !== "important") continue;
      declarations.set(child.prop, { value: child.value, priority });
    }
  }

  if (!matched) throw new Error(`Missing CSS rule: ${selector}`);
  return Array.from(declarations, ([property, declaration]) => (
    `${property}: ${declaration.value}${declaration.priority ? ` !${declaration.priority}` : ""};`
  )).join(" ");
}

function matchesSelector(actual: string, expected: string): boolean {
  const actualSelectors = splitSelectorList(actual);
  const expectedSelectors = splitSelectorList(expected);
  if (expectedSelectors.length === 1) {
    return actualSelectors.includes(expectedSelectors[0]!);
  }
  return actualSelectors.length === expectedSelectors.length
    && actualSelectors.every((item, index) => item === expectedSelectors[index]);
}

function splitSelectorList(value: string): string[] {
  const selectors: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote) {
      current += character;
      if (character === quote && value[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      selectors.push(normalizeWhitespace(current));
      current = "";
      continue;
    }
    current += character;
  }
  selectors.push(normalizeWhitespace(current));
  return selectors.filter(Boolean);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}