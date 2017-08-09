'use strict';

var _ = require('lodash');
var parser = require('postcss-selector-parser');

function ignoreSelector(ignore, selector) {
  if (ignore.includes(selector)) return true;

  for (var i = 0, len = ignore.length; i < len; ++i) {
    if (_.isRegExp(ignore[i]) && ignore[i].test(selector)) {
      return true;
    }
  }

  return false;
}

function matchEqualityAttribute(values, used) {
  for (var i in values) {
    if (!used.includes(values[i])) return false;
  }
  return true;
}

function matchWhitespaceEqualityAttribute(values, used) {
  if (values.length > 1) return false;
  return used.includes(values[0]);
}

function matchSubcodeAttribute(values, used) {
  var prefixValues = values.slice(0, values.length - 1);
  var suffixValue = values[values.length - 1];

  for (var i in prefixValues) {
    if (!used.includes(prefixValues[i])) return false;
  }
  for (var _i in used) {
    if (used[_i].indexOf(suffixValue + '-') === 0) {
      return true;
    }
  }
  return false;
}

function matchStartingWithAttribute(values, used) {
  var prefixValues = values.slice(0, values.length - 1);
  var suffixValue = values[values.length - 1];
  for (var i in prefixValues) {
    if (!used.includes(prefixValues[i])) return false;
  }
  for (var _i2 in used) {
    if (used[_i2].indexOf(suffixValue) === 0) {
      return true;
    }
  }
  return false;
}

function matchEndingWithAttribute(values, used) {
  var tailValues = values.slice(1, values.length);
  var headValue = values[0];

  for (var i in tailValues) {
    if (!used.includes(tailValues[i])) return false;
  }
  for (var _i3 in used) {
    if (used[_i3].indexOf(headValue) === used[_i3].length - headValue.length) {
      return true;
    }
  }
  return false;
}

function matchContainsAttribute(values, used) {
  var headValue = values[0];
  var bodyValues = values.slice(1, values.length - 1);
  var tailValue = values[values.length - 1];

  if (values.length === 1) {
    for (var i in used) {
      if (used[i].includes(values[0])) {
        return true;
      }
    }
  }
  for (var _i4 in bodyValues) {
    if (!used.includes(bodyValues[_i4])) return false;
  }
  for (var _i5 in used) {
    if (used[_i5].indexOf(headValue) === used[_i5].length - headValue.length) {
      for (var j in used) {
        if (used[j].indexOf(tailValue) === 0) {
          return true;
        }
      }
    }
  }
}

function matchAttribute(operator, value, used) {
  var values = value.split(' ');

  switch (operator) {
    case '=':
      return matchEqualityAttribute(values, used);
    case '~=':
      return matchWhitespaceEqualityAttribute(values, used);
    case '|=':
      return matchSubcodeAttribute(values, used);
    case '^=':
      return matchStartingWithAttribute(values, used);
    case '$=':
      return matchEndingWithAttribute(values, used);
    case '*=':
      return matchContainsAttribute(values, used);
    default:
      return false;
  }
}

function makeSelectorFilter(options) {
  var ignore = options.ignore;
  var used = options.used;
  var allowIds = options.allowIds;
  var allowNonClassSelectors = options.allowNonClassSelectors;
  var allowNonClassCombinators = options.allowNonClassCombinators || options.allowNonClassSelectors;

  return function selectorFilter(mainSelector) {
    if (mainSelector[0] === '@') return true;
    if (ignoreSelector(ignore, mainSelector)) return true;

    function transform(selectors) {
      selectors.each(function (selector) {
        // Find separate parts of combined selectors
        var parts = [];
        var sel = parser.selector();
        for (var i = 0; i < selector.nodes.length; i++) {
          switch (selector.at(i).type) {
            case 'combinator':
              parts.push(sel);
              sel = parser.selector();
              break;

            case 'comment':
              break;

            default:
              sel.append(selector.at(i).clone());
              break;
          }
        }
        parts.push(sel);
        parts = parts.filter(function (part) {
          return part.toString().trim().length;
        });

        var classInSelector = false;
        // Keep if all parts are kept
        var keep = parts.reduce(function (partResult, part) {
          if (!partResult) return false;
          if (ignoreSelector(ignore, part.toString())) return true;

          // Keep part if all classes are used and there are no ids
          var classInCombinator = false;

          var allowCombinator = part.reduce(function (combinatorResult, node) {
            if (!combinatorResult) return false;
            if (ignoreSelector(ignore, node.toString())) return true;

            var result = false;

            switch (node.type) {
              case 'id':
                return allowIds;

              case 'class':
                classInSelector = true;
                classInCombinator = true;
                return used.includes(node.value);

              case 'attribute':
                if (node.attribute !== 'class') return true;

                if (node.insensitive) {
                  result = matchAttribute(node.operator, node.raws.unquoted.toUpperCase(), used.map(function (u) {
                    return u.toUpperCase();
                  }));
                } else {
                  result = matchAttribute(node.operator, node.raws.unquoted, used);
                }

                if (result) {
                  classInSelector = true;
                  classInCombinator = true;
                }

                return result;

              default:
                return true;
            }
          }, true);

          if (!allowNonClassCombinators && !classInCombinator) allowCombinator = false;

          return allowCombinator;
        }, true);

        if (!allowNonClassSelectors && !classInSelector) keep = false;

        // Can't return false from the transform so empty the selector to indicate failure
        selector.empty();
        if (keep) selector.append(parser.comment({ value: '/* true */' }));
      });
    }

    return !!parser(transform).process(mainSelector).result.length;
  };
}

module.exports = function filterUnusedSelectors(selectors, options) {
  return selectors.filter(makeSelectorFilter(options));
};