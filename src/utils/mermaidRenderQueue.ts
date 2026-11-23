import type { MermaidConfig } from "mermaid";

let mermaidRenderQueue: Promise<void> = Promise.resolve();
let mermaidRenderSequence = 0;
let mermaidApiPromise: Promise<typeof import("mermaid").default> | null = null;

export function loadSharedMermaid(
  config: MermaidConfig,
): Promise<typeof import("mermaid").default> {
  if (mermaidApiPromise) return mermaidApiPromise;
  const loading = import("mermaid").then((module) => {
    module.default.initialize(config);
    return module.default;
  });
  mermaidApiPromise = loading.catch((error) => {
    mermaidApiPromise = null;
    throw error;
  });
  return mermaidApiPromise;
}

export function nextMermaidRenderId(): string {
  mermaidRenderSequence += 1;
  return `marko-mermaid-${mermaidRenderSequence}`;
}

export function enqueueMermaidRender<T>(task: () => Promise<T>): Promise<T> {
  const result = mermaidRenderQueue.then(
    () => task(),
    () => task(),
  );
  mermaidRenderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
