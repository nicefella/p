import extend from 'extend';
import {
  testRectRect
} from '../../../math/narrow-phase-collision';
import filterOverlapping from './bars-overlapping-filter';

const LINE_HEIGHT = 1.5;
const PADDING = 4;
// const DOUBLE_PADDING = PADDING * 2;

function cbContext(node, chart) {
  return {
    node,
    data: node.data,
    scale: chart.scale,
    formatter: chart.formatter,
    dataset: chart.dataset
  };
}

function isValidText(text) {
  const type = typeof text;
  return (type === 'string' || type === 'number') && text !== '';
}

function toBackground(label) {
  return {
    type: 'rect',
    rx: 2,
    ry: 2,
    fill: label.backgroundColor,
    ...label.backgroundBounds
  };
}

export function isTextInRect(rect, textMetrics, opts) {
  return opts.rotate ? !(rect.width < textMetrics.height || rect.height < textMetrics.width)
    : !(rect.width < textMetrics.width || rect.height < textMetrics.height);
}

export function placeTextInRect(rect, text, opts) {
  const label = {
    type: 'text',
    text,
    maxWidth: opts.rotate ? rect.height : rect.width,
    x: 0,
    y: rect.y,
    dx: 0,
    dy: 0,
    fill: opts.fill,
    anchor: opts.rotate ? 'end' : 'start',
    baseline: 'alphabetical',
    fontSize: `${opts.fontSize}px`,
    fontFamily: opts.fontFamily
  };

  const textMetrics = opts.textMetrics;
  if (!opts.overflow && !isTextInRect(rect, textMetrics, opts)) {
    return false;
  }

  if (opts.rotate) {
    if (opts.overflow && rect.width < textMetrics.height) {
      label.x = rect.x + (rect.width / 2); // Use center of the rect
      label.dx = opts.fontSize * 0.35; // Emulate the baseline heuristic for the 'central' attribute
    } else {
      const wiggleHor = Math.max(0, rect.width - (textMetrics.height / (LINE_HEIGHT * 0.8)));
      label.x = rect.x + (textMetrics.height / LINE_HEIGHT) + (opts.align * wiggleHor);
    }

    const wiggleVert = Math.max(0, rect.height - textMetrics.width);
    label.y = rect.y + (opts.justify * wiggleVert);
    label.transform = `rotate(-90, ${label.x + label.dx}, ${label.y + label.dy})`;
  } else {
    if (opts.overflow && rect.height < textMetrics.height) {
      label.y = rect.y + (rect.height / 2); // Use center of the rect
      label.dy = opts.fontSize * 0.35; // Emulate the baseline heuristic for the 'central' attribute
    } else {
      const wiggleHeight = Math.max(0, rect.height - (textMetrics.height / (LINE_HEIGHT * 0.8))); // 0.8 - MAGIC NUMBER - need to figure out why this works the best
      label.y = rect.y + (textMetrics.height / LINE_HEIGHT) + (opts.justify * wiggleHeight);
    }

    const wiggleWidth = Math.max(0, rect.width - textMetrics.width);
    label.x = rect.x + (opts.align * wiggleWidth);
  }

  return label;
}

function limitBounds(bounds, view) {
  const minY = Math.max(0, Math.min(bounds.y, view.height));
  const maxY = Math.max(0, Math.min(bounds.y + bounds.height, view.height));
  const minX = Math.max(0, Math.min(bounds.x, view.width));
  const maxX = Math.max(0, Math.min(bounds.x + bounds.width, view.width));
  bounds.x = minX;
  bounds.width = maxX - minX;
  bounds.y = minY;
  bounds.height = maxY - minY;
}

function pad(bounds, padding = {}) {
  const {
    top = PADDING, bottom = PADDING, left = PADDING, right = PADDING
  } = padding;
  bounds.x += left;
  bounds.width -= (left + right);
  bounds.y += top;
  bounds.height -= (top + bottom);
}

export function getBarRect({
  bar, view, direction, position, padding = PADDING
}) {
  const bounds = {};
  extend(bounds, bar);

  if (!position || position === 'inside') {
    // do nothing
  } else if (direction === 'up' || direction === 'down') {
    const start = Math.max(0, Math.min(bar.y, view.height));
    const end = Math.max(0, Math.min(bar.y + bar.height, view.height));

    if ((position === 'outside' && direction === 'up') || (position === 'opposite' && direction === 'down')) {
      bounds.y = 0;
      bounds.height = start;
    } else if ((position === 'outside' && direction === 'down') || (position === 'opposite' && direction === 'up')) {
      bounds.y = end;
      bounds.height = view.height - end;
    }
  } else {
    const start = Math.max(0, Math.min(bar.x, view.width));
    const end = Math.max(0, Math.min(bar.x + bar.width, view.width));

    if ((position === 'outside' && direction === 'left') || (position === 'opposite' && direction === 'right')) {
      bounds.x = 0;
      bounds.width = start;
    } else if ((position === 'outside' && direction === 'right') || (position === 'opposite' && direction === 'left')) {
      bounds.x = end;
      bounds.width = view.width - end;
    }
  }

  limitBounds(bounds, view);
  pad(bounds, padding);

  return bounds;
}

export function findBestPlacement({
  direction,
  fitsHorizontally,
  // lblStngs,
  measured,
  node,
  orientation,
  // placements,
  placementSettings,
  rect
}, barRect = getBarRect) {
  let largest;
  let bounds;
  let placement;
  let testBounds;
  let p;
  const boundaries = [];
  for (p = 0; p < placementSettings.length; p++) {
    placement = placementSettings[p];
    testBounds = barRect({
      bar: node.localBounds,
      view: rect,
      direction,
      position: placement.position,
      padding: placement.padding
    });
    boundaries.push(testBounds);
    largest = !p || testBounds.height > largest.height ? testBounds : largest;

    if (orientation === 'v' && ((fitsHorizontally && testBounds.height > measured.height * LINE_HEIGHT)
      || (!fitsHorizontally && testBounds.height > measured.width))) {
      bounds = testBounds;
      break;
    } else if (orientation === 'h' && (testBounds.height > measured.height)
      && (testBounds.width > measured.width)) {
      bounds = testBounds;
      break;
    }
  }

  // fallback strategy - place the text in the largest rectangle
  if (!bounds) {
    bounds = largest;
    p = boundaries.indexOf(bounds);
  }
  placement = placementSettings[p];

  return { bounds, placement };
}

function approxTextBounds(label, textMetrics, rotated, rect, padding = {}) {
  const {
    top = PADDING, bottom = PADDING, left = PADDING, right = PADDING
  } = padding;
  const x0 = label.x + label.dx;
  const y0 = label.y + label.dy;
  const height = rotated ? Math.min(textMetrics.width, rect.height) : Math.min(textMetrics.height, rect.width);
  const width = rotated ? Math.min(textMetrics.height, rect.height) : Math.min(textMetrics.width, rect.width);
  const offset = 0.8 * textMetrics.height; // the distance between text-before-edge and alphabetical
  const PADDING_OFFSET = 1e-9; // Needed to support a case when multiple bars are on the same location
  const x = rotated ? x0 - offset : x0;
  const y = rotated ? y0 : y0 - offset;
  const bounds = {
    x: x - left - PADDING_OFFSET,
    y: y - top - PADDING_OFFSET,
    width: width + (left + right) - PADDING_OFFSET,
    height: height + (top + bottom) - PADDING_OFFSET
  };
  return bounds;
}

export function placeInBars(
  {
    chart,
    targetNodes,
    rect,
    fitsHorizontally,
    collectiveOrientation
  },
  findPlacement = findBestPlacement,
  placer = placeTextInRect,
  postFilter = filterOverlapping
) {
  const labels = [];
  const postFilterContext = {
    container: rect,
    targetNodes,
    labels: [],
    orientation: collectiveOrientation
  };
  let label;
  let target;
  let node;
  let text;
  let justify;
  let bounds;
  let fill;
  let measured;
  let direction;
  let lblStngs;
  let placement;
  let placements;
  let arg;
  let orientation;

  for (let i = 0, len = targetNodes.length; i < len; i++) {
    bounds = null;
    target = targetNodes[i];
    node = target.node;
    arg = cbContext(node, chart);
    direction = target.direction;
    orientation = direction === 'left' || direction === 'right' ? 'h' : 'v';

    for (let j = 0; j < target.texts.length; j++) {
      text = target.texts[j];
      if (!isValidText(text)) {
        continue;
      }
      lblStngs = target.labelSettings[j];
      measured = target.measurements[j];
      placements = lblStngs.placements;

      const bestPlacement = findPlacement({
        direction,
        fitsHorizontally,
        lblStngs,
        measured,
        node,
        orientation,
        placements,
        placementSettings: target.placementSettings[j],
        rect
      });

      bounds = bestPlacement.bounds;
      placement = bestPlacement.placement;

      if (bounds && placement) {
        justify = placement.justify;
        fill = typeof placement.fill === 'function' ? placement.fill(arg, i) : placement.fill;
        const linkData = typeof lblStngs.linkData === 'function' ? lblStngs.linkData(arg, i) : undefined;
        const overflow = typeof placement.overflow === 'function' ? placement.overflow(arg, i) : placement.overflow;

        if (direction === 'up') {
          justify = 1 - justify;
        }
        if (placement.position === 'opposite') {
          justify = 1 - justify;
        }
        if (direction === 'left') {
          justify = 1 - justify;
        }

        const isRotated = !(collectiveOrientation === 'h' || fitsHorizontally);
        label = placer(bounds, text, {
          fill,
          justify: orientation === 'h' ? placement.align : justify,
          align: orientation === 'h' ? justify : placement.align,
          fontSize: lblStngs.fontSize,
          fontFamily: lblStngs.fontFamily,
          textMetrics: measured,
          rotate: isRotated,
          overflow: !!overflow
        });

        if (label) {
          if (typeof linkData !== 'undefined') {
            label.data = linkData;
          }
          if (typeof placement.background === 'object') {
            label.backgroundColor = typeof placement.background.fill === 'function' ? placement.background.fill(arg, i) : placement.background.fill;
            if (typeof label.backgroundColor !== 'undefined') {
              label.backgroundBounds = approxTextBounds(label, measured, isRotated, bounds, placement.background.padding);
            }
          }
          labels.push(label);
          postFilterContext.labels.push({
            node,
            textBounds: approxTextBounds(label, measured, isRotated, bounds, placement.padding)
          });
        }
      }
    }
  }

  const filteredLabels = labels.filter(postFilter(postFilterContext));
  const backgrounds = filteredLabels.filter(lb => typeof lb.backgroundBounds !== 'undefined').map(toBackground);

  return [...backgrounds, ...filteredLabels];
}

export function precalculate({
  nodes,
  rect,
  chart,
  labelSettings,
  placementSettings,
  settings,
  renderer
}) {
  const labelStruct = {};
  const targetNodes = [];
  let target;
  let fitsHorizontally = true;
  let hasHorizontalDirection = false;
  let node;
  let text;
  let bounds;
  let measured;
  let lblStng;
  let direction;

  for (let i = 0; i < nodes.length; i++) {
    node = nodes[i];
    bounds = node.localBounds;
    if (!testRectRect(bounds, rect)) {
      continue;
    }
    let arg = cbContext(node, chart);

    target = {
      node,
      texts: [],
      measurements: [],
      labelSettings: [],
      placementSettings: []
      // direction: 'up'
    };

    for (let j = 0; j < labelSettings.length; j++) {
      lblStng = labelSettings[j];
      text = typeof lblStng.label === 'function' ? lblStng.label(arg, i) : undefined;
      if (!isValidText(text)) {
        continue; // eslint-ignore-line
      }
      direction = typeof settings.direction === 'function' ? settings.direction(arg, i) : settings.direction || 'up';
      hasHorizontalDirection = hasHorizontalDirection || direction === 'left' || direction === 'right';

      labelStruct.fontFamily = lblStng.fontFamily;
      labelStruct.fontSize = `${lblStng.fontSize}px`;
      labelStruct.text = text;

      measured = renderer.measureText(labelStruct);
      target.measurements.push(measured);
      target.texts.push(text);
      target.labelSettings.push(lblStng);
      target.placementSettings.push(placementSettings[j]);
      target.direction = direction;
      fitsHorizontally = fitsHorizontally && measured.width <= (bounds.width - (PADDING * 2));
    }

    targetNodes.push(target);
  }

  return {
    targetNodes,
    fitsHorizontally,
    hasHorizontalDirection
  };
}

/**
 * @typedef {object} component--labels~label-strategy
 *
 */

/**
 * @typedef {object} component--labels~label-strategy.settings
 * @property {string|function} [direction='up'] - The direction in which the bars are growing: 'up', 'down', 'right' or 'left'.
 * @property {string} [fontFamily='Arial']
 * @property {number} [fontSize=12]
 * @property {Array<object>} labels
 * @property {string|function} labels[].label - The text value
 * @property {function} labels[].linkData - Link data to the label
 * @property {Array<object>} labels[].placements
 * @property {string} labels[].placements[].position - 'inside' | 'outside' | 'opposite'
 * @property {number} [labels[].placements[].justify=0] - Placement of the label along the direction of the bar
 * @property {number} [labels[].placements[].align=0.5] - Placement of the label along the perpendicular direction of the bar
 * @property {string} [labels[].placements[].fill='#333'] - Color of the label
 * @property {boolean} [labels[].placements[].overflow=false] - True if the label is allowed to overflow the bar
 * @property {object} labels[].placements[].padding - Padding between the label and the bar
 * @property {number} [labels[].placements[].padding.top=4] - Padding-top between the label and the bar
 * @property {number} [labels[].placements[].padding.bottom=4] - Padding-bottom between the label and the bar
 * @property {number} [labels[].placements[].padding.left=4] - Padding-left between the label and the bar
 * @property {number} [labels[].placements[].padding.right=4] - Padding-right between the label and the bar
 * @property {object} labels[].placements[].background - Background of the label
 * @property {string|function} labels[].placements[].background.fill - Background color of the label
 * @property {object} labels[].placements[].background.padding - Padding between the label and the background
 * @property {number} [labels[].placements[].background.padding.top=4] - Padding-top between the label and the background
 * @property {number} [labels[].placements[].background.padding.bottom=4] - Padding-bottom between the label and the background
 * @property {number} [labels[].placements[].background.padding.left=4] - Padding-left between the label and the background
 * @property {number} [labels[].placements[].background.padding.right=4] - Padding-right between the label and the background
 */

export function bars({
  settings,
  chart,
  nodes,
  rect,
  renderer,
  style
}, placer = placeInBars) {
  const defaults = extend({
    fontSize: 12,
    fontFamily: 'Arial',
    align: 0.5,
    justify: 0,
    fill: '#333'
  }, style.label);

  defaults.fontSize = parseInt(defaults.fontSize, 10);

  const labelSettings = settings.labels.map(labelSetting => extend({}, defaults, settings, labelSetting));

  const placementSettings = settings.labels.map(labelSetting => labelSetting.placements.map(placement => extend({}, defaults, settings, labelSetting, placement)));

  const {
    fitsHorizontally,
    hasHorizontalDirection,
    targetNodes
  } = precalculate({
    nodes,
    chart,
    renderer,
    settings,
    rect,
    labelSettings,
    placementSettings
  });

  const coord = hasHorizontalDirection ? 'y' : 'x';
  const side = hasHorizontalDirection ? 'height' : 'width';
  targetNodes.sort((a, b) => (a.node.localBounds[coord] + a.node.localBounds[side]) - (b.node.localBounds[coord] + b.node.localBounds[side]));

  return placer({
    chart,
    targetNodes,
    stngs: settings,
    rect,
    fitsHorizontally,
    collectiveOrientation: hasHorizontalDirection ? 'h' : 'v'
  });
}
