'use strict';

const astTypes = require('../html-to-ast').types;
const attributeConversion = require('../attribute-conversion');
const constants = require('../constants');

const INDENT = '  ';
const bindings = constants.attributes.bindings;
const controlsAttrs = constants.attributes.controls;

function renderJsxText(node, indent) {
  let value = node.value;
  if (bindings.PATTERN.test(value)) {
    value = value.replace(bindings.PATTERN, '{ $1 }');
  }
  return `${indent}${value}\n`;
}

function renderJsxPropsSpreading(value) {
  return value.replace(
    bindings.STRICT_PATTERN,
    '{ ...$1 }'
  );
}

function renderJsxProp(value, attr) {
  // Consider the absence or an empty attribute (i.e. `attr` or `attr=""`) as
  // `true`.
  const nodeValue = value || 'true';

  if (bindings.BOLLEAN_PATTERN.test(nodeValue)) {
    value = nodeValue.replace(
      bindings.BOLLEAN_PATTERN,
      (m, g1) => `{ ${g1.toLowerCase()} }`
    );

  // It only contains a binding (i.e. `attr="{{ expression }}")`, in this case
  // it should be converted to `attr={ expression }`.
  } else if (bindings.STRICT_PATTERN.test(nodeValue)) {
    value = nodeValue.replace(
      bindings.STRICT_PATTERN,
      '{ $1 }'
    );

  // It is a string template (i.e. `attr="hello {{ expression }}"`), in this
  // case it should be converted to `attr={ `hello ${ expression }` }`.
  } else if (bindings.PATTERN.test(nodeValue)) {
    const replacement = nodeValue.replace(
      bindings.PATTERN,
      '$${ $1 }'
    );
    value = `{ \`${replacement}\` }`;

  // There are no bindings, it is just a string.
  } else {
    value = `'${nodeValue}'`;
  }

  return `${attr}=${value}`;
}

function renderJsxProps(node) {
  const mapper = k => {
    const attr = attributeConversion.toJsx(k);
    const value = node.attrs[k];

    switch (attr) {
      case constants.attributes.PROPS_SPREADING:
        return renderJsxPropsSpreading(value);
      default:
        return renderJsxProp(value, attr);
    }
  };

  const attrs = Object.keys(node.attrs)
    .map(mapper)
    .reduce((a, b) => `${a} ${b}`, '');

  return attrs;
}

function renderJsxBasicTag(node, tagToVar, indent) {
  const name = tagToVar[node.name] || node.name;
  const openTag = `${indent}<${name}`;
  const props = renderJsxProps(node);

  if (node.children.length > 0) {
    const closingTag = `${indent}</${name}>`;
    const children = node.children
      .map(child => renderJsxNode(child, tagToVar, `${INDENT}${indent}`))
      .join('');

    return `${openTag}${props}>\n${children}${closingTag}\n`;
  }

  return `${openTag}${props} />\n`;
}

function getBlockWrapper(withWrapper) {
  if (withWrapper) {
    return { open: '{ ', close: ' }' };
  }
  return { open: '', close: '' };
}

function renderJsxConditionalTag(node, tagToVar, indent, parentIsControl) {
  const block = getBlockWrapper(!parentIsControl);
  const test = node.attrs[controlsAttrs.CONDITIONALS_TEST].replace(
    bindings.STRICT_PATTERN,
    '$1'
  );
  const condition = `${indent}${block.open}(${test}) && (\n`;
  const child = node.children[0];
  const childIsControl = child.name === constants.tags.CONTROLS;
  const children = childIsControl
    ? renderJsxControlsTag(child, tagToVar, `${INDENT}${indent}`, true)
    : renderJsxNode(child, tagToVar, `${INDENT}${indent}`);
  const closing = `${indent})${block.close}\n`;

  return `${condition}${children}${closing}`;
}

function renderJsxLoopTag(node, tagToVar, indent, parentIsControl) {
  const block = getBlockWrapper(!parentIsControl);
  const arrayName = node.attrs[controlsAttrs.LOOP_ARRAY].replace(
    bindings.STRICT_PATTERN,
    '$1'
  );
  const varName = node.attrs[controlsAttrs.LOOP_VAR_NAME].replace(
    bindings.STRICT_PATTERN,
    '$1'
  );
  const loop = `${indent}${block.open}${arrayName}.map(${varName} => (\n`;
  const child = node.children[0];
  const childIsControl = child.name === constants.tags.CONTROLS;
  const children = childIsControl
    ? renderJsxControlsTag(child, tagToVar, `${INDENT}${indent}`, true)
    : renderJsxNode(child, tagToVar, `${INDENT}${indent}`);
  const closing = `${indent}))${block.close}\n`;

  return `${loop}${children}${closing}`;
}

function renderJsxControlsTag(node, tagToVar, indent, parentIsControl) {
  if (node.attrs[controlsAttrs.CONDITIONALS_TEST]) {
    return renderJsxConditionalTag(node, tagToVar, indent, parentIsControl);
  }
  return renderJsxLoopTag(node, tagToVar, indent, parentIsControl);
}

function renderJsxTag(node, tagToVar, indent, firstNode) {
  switch (node.name) {
    case constants.tags.CONTROLS:
      return renderJsxControlsTag(node, tagToVar, indent, firstNode);
    default:
      return renderJsxBasicTag(node, tagToVar, indent);
  }
}

function renderJsxNode(node, tagToVar, indent, firstNode) {
  switch (node.type) {
    case astTypes.TEXT:
      return renderJsxText(node, indent);
    default:
      return renderJsxTag(node, tagToVar, indent, firstNode);
  }
}

function extractJsx(node, tagToVar) {
  const jsx = renderJsxNode(node, tagToVar, `${INDENT}${INDENT}`, true);
  return `${INDENT}return (\n${jsx}${INDENT});\n`;
}

function renderComponent(node, tagToVar) {
  // Remove the `<template>` tag.
  const component = node.children[0];
  return extractJsx(component, tagToVar);
}

module.exports = renderComponent;
module.exports.renderJsxText = renderJsxText;
module.exports.renderJsxPropsSpreading = renderJsxPropsSpreading;
module.exports.renderJsxProp = renderJsxProp;
module.exports.renderJsxProps = renderJsxProps;
module.exports.renderJsxBasicTag = renderJsxBasicTag;
module.exports.renderJsxConditionalTag = renderJsxConditionalTag;
module.exports.renderJsxLoopTag = renderJsxLoopTag;
