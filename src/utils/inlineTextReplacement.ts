export interface InlineTextReplacementRange {
  from: number;
  to: number;
  source: string;
  value: string;
}

export function collectInlineTextReplacementRanges(
  source: string,
  rendered: string,
  offset = 0,
): InlineTextReplacementRange[] {
  if (source === rendered) return [];
  const replacements: InlineTextReplacementRange[] = [];
  let sourceIndex = 0;
  let renderedIndex = 0;

  while (sourceIndex < source.length || renderedIndex < rendered.length) {
    if (source[sourceIndex] === rendered[renderedIndex]) {
      sourceIndex += 1;
      renderedIndex += 1;
      continue;
    }

    const alignment = findInlineTextAlignment(source, rendered, sourceIndex, renderedIndex);
    const sourceEnd = alignment?.source ?? source.length;
    const renderedEnd = alignment?.rendered ?? rendered.length;
    replacements.push({
      from: offset + sourceIndex,
      to: offset + sourceEnd,
      source: source.slice(sourceIndex, sourceEnd),
      value: rendered.slice(renderedIndex, renderedEnd),
    });
    sourceIndex = sourceEnd;
    renderedIndex = renderedEnd;
  }

  return replacements;
}

function findInlineTextAlignment(
  source: string,
  rendered: string,
  sourceIndex: number,
  renderedIndex: number,
): { source: number; rendered: number } | null {
  const sourceLimit = Math.min(source.length, sourceIndex + 24);
  const renderedLimit = Math.min(rendered.length, renderedIndex + 24);
  let best: { source: number; rendered: number; common: number; distance: number } | null = null;

  for (let nextSource = sourceIndex + 1; nextSource <= sourceLimit; nextSource += 1) {
    for (let nextRendered = renderedIndex + 1; nextRendered <= renderedLimit; nextRendered += 1) {
      let common = 0;
      while (
        nextSource + common < source.length
        && nextRendered + common < rendered.length
        && source[nextSource + common] === rendered[nextRendered + common]
      ) {
        common += 1;
      }
      const reachesEnd = nextSource === source.length && nextRendered === rendered.length;
      if (common === 0 && !reachesEnd) continue;
      const distance = (nextSource - sourceIndex) + (nextRendered - renderedIndex);
      if (
        !best
        || distance < best.distance
        || (distance === best.distance && common > best.common)
      ) {
        best = { source: nextSource, rendered: nextRendered, common, distance };
      }
    }
  }

  return best ? { source: best.source, rendered: best.rendered } : null;
}
