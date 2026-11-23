import createDOMPurify, { type Config, type DOMPurify } from "dompurify";

const sanitizeConfig: Config = {
  USE_PROFILES: {
    html: true,
    svg: true,
    svgFilters: true,
    mathMl: true,
  },
  ADD_TAGS: ["iframe", "video", "audio", "source", "track", "mjx-container", "mjx-break", "use"],
  ADD_ATTR: [
    "allow",
    "allowfullscreen",
    "autoplay",
    "controls",
    "controlslist",
    "frameborder",
    "focusable",
    "loading",
    "loop",
    "muted",
    "open",
    "playsinline",
    "poster",
    "preload",
    "referrerpolicy",
    "sandbox",
    "target",
    "data-diagram-source",
    "display",
    "jax",
    "overflow",
    "size",
    "xlink:href",
  ],
  ADD_DATA_URI_TAGS: ["img", "source"],
  ALLOW_ARIA_ATTR: true,
  ALLOW_DATA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|asset|blob|file|about):|[a-z]:(?:[\\/]|%5c)|data:image\/(?:avif|gif|jpeg|png|webp);base64,|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: [
    "base",
    "embed",
    "form",
    "link",
    "meta",
    "object",
    "script",
    "style",
  ],
  FORBID_ATTR: ["srcdoc"],
};

let purifier: DOMPurify | null = null;

export function sanitizeMarkdownHtml(html: string): string {
  if (typeof window === "undefined") return html;
  if (!purifier) {
    purifier = createDOMPurify(window);
    purifier.addHook("afterSanitizeAttributes", (node) => {
      if (!(node instanceof Element)) return;
      if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
        node.setAttribute("rel", "noopener noreferrer");
      }
      if (node.tagName === "IFRAME") {
        node.setAttribute("sandbox", "");
      }
    });
  }
  if (!purifier.isSupported) return enforceSafeHtmlAttributes(html);

  const protectedHtml = protectDiagramSourceAttributes(html);
  const protectedMath = protectMathJaxUseReferences(protectedHtml.html);
  const sanitized = purifier.isSupported
    ? purifier.sanitize(protectedMath.html, sanitizeConfig) as string
    : protectedMath.html;
  return enforceSafeHtmlAttributes(restoreDiagramSourceAttributes(
    restoreMathJaxUseReferences(sanitized, protectedMath.references),
    protectedHtml.sources,
  ));
}

const diagramSourceSelector = [
  ".mermaid[data-diagram-source]",
  ".flowchart-render[data-diagram-source]",
  ".sequence-render[data-diagram-source]",
].join(",");

function protectDiagramSourceAttributes(html: string): {
  html: string;
  sources: ReadonlyMap<string, string>;
} {
  const template = document.createElement("template");
  const sources = new Map<string, string>();
  template.innerHTML = html;
  template.content.querySelectorAll<HTMLElement>(diagramSourceSelector)
    .forEach((element, index) => {
      const source = element.getAttribute("data-diagram-source");
      if (source === null) return;
      const token = `marko-protected-diagram-source-${index}`;
      sources.set(token, source);
      element.setAttribute("data-diagram-source", token);
    });
  return { html: template.innerHTML, sources };
}

function restoreDiagramSourceAttributes(
  html: string,
  sources: ReadonlyMap<string, string>,
): string {
  if (sources.size === 0) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll<HTMLElement>(diagramSourceSelector)
    .forEach((element) => {
      const token = element.getAttribute("data-diagram-source") ?? "";
      const source = sources.get(token);
      if (source !== undefined) element.setAttribute("data-diagram-source", source);
    });
  return template.innerHTML;
}

function protectMathJaxUseReferences(html: string): {
  html: string;
  references: ReadonlyMap<string, string>;
} {
  const template = document.createElement("template");
  const references = new Map<string, string>();
  template.innerHTML = html;
  template.content.querySelectorAll<SVGUseElement>("mjx-container.MathJax use")
    .forEach((element, index) => {
      const reference = element.getAttribute("xlink:href") ?? element.getAttribute("href");
      if (!reference || !/^#[A-Za-z][\w:.-]*$/.test(reference)) return;
      const token = `marko-protected-math-use-${index}`;
      references.set(token, reference);
      element.removeAttribute("xlink:href");
      element.removeAttribute("href");
      element.setAttribute("data-marko-math-use", token);
    });
  return { html: template.innerHTML, references };
}

function restoreMathJaxUseReferences(
  html: string,
  references: ReadonlyMap<string, string>,
): string {
  if (references.size === 0) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll<SVGUseElement>("use[data-marko-math-use]")
    .forEach((element) => {
      const token = element.getAttribute("data-marko-math-use") ?? "";
      const reference = references.get(token);
      element.removeAttribute("data-marko-math-use");
      if (reference !== undefined) element.setAttribute("href", reference);
    });
  return template.innerHTML;
}

function enforceSafeHtmlAttributes(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll(
    "base, embed, form, link, meta, object, script, style",
  ).forEach((element) => element.remove());

  template.content.querySelectorAll<HTMLElement>("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (
        ["href", "src", "xlink:href", "poster", "action", "formaction"].includes(name)
        && !isSafeResourceUrl(attribute.value, element.tagName, name)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === "A" && element.getAttribute("target") === "_blank") {
      element.setAttribute("rel", "noopener noreferrer");
    }
    if (element.tagName === "IFRAME") {
      element.setAttribute("sandbox", "");
    }
  });

  return template.innerHTML;
}

function isSafeResourceUrl(value: string, tagName: string, attributeName: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  if (!normalized) return true;
  if (/^[a-z]:(?:[\\/]|%5c)/.test(normalized)) return true;
  if (!/^[a-z][a-z0-9+.-]*:/.test(normalized)) return true;
  if (/^(?:https?|mailto|tel|asset|blob|file|about):/.test(normalized)) return true;
  return attributeName === "src"
    && (tagName === "IMG" || tagName === "SOURCE")
    && /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/.test(normalized);
}
