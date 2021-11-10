const { registerHelpers } = require("solidity-docgen/dist/handlebars.js");

function inheritanceDescription(inheritance, options) {
  if (inheritance.length < 2) {
    return "";
  }
  const desc = inheritance
    .slice(1)
    .filter((x) => !x.name.startsWith("I"))
    .map((x) => `[${x.name}](#${x.name})`)
    .join(", ");
  return `*Inherits from ${desc}*\n`;
}

function shouldHaveSections(functions, events, structs, options) {
  return +!!functions.length + +!!events.length + +!!structs.length >= 2
    ? options.fn(this)
    : options.inverse(this);
}

function structType(t, options) {
  return t.replace("contract ", "");
}

registerHelpers({ inheritanceDescription, shouldHaveSections, structType });
