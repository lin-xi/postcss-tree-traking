const _ = require('lodash')
const parser = require('postcss-selector-parser')

function ignoreSelector (ignore, selector) {
  if (ignore.includes(selector)) return true

  for (var i = 0, len = ignore.length; i < len; ++i) {
    if (_.isRegExp(ignore[i]) && ignore[i].test(selector)) {
      return true
    }
  }

  return false
}

function matchEqualityAttribute (values, used) {
  for (const i in values) {
    if (!used.includes(values[i])) return false
  }
  return true
}

function matchWhitespaceEqualityAttribute (values, used) {
  if (values.length > 1) return false
  return used.includes(values[0])
}

function matchSubcodeAttribute (values, used) {
  const prefixValues = values.slice(0, values.length - 1)
  const suffixValue = values[values.length - 1]

  for (const i in prefixValues) {
    if (!used.includes(prefixValues[i])) return false
  }
  for (const i in used) {
    if (used[i].indexOf(suffixValue + '-') === 0) {
      return true
    }
  }
  return false
}

function matchStartingWithAttribute (values, used) {
  const prefixValues = values.slice(0, values.length - 1)
  const suffixValue = values[values.length - 1]
  for (const i in prefixValues) {
    if (!used.includes(prefixValues[i])) return false
  }
  for (const i in used) {
    if (used[i].indexOf(suffixValue) === 0) {
      return true
    }
  }
  return false
}

function matchEndingWithAttribute (values, used) {
  const tailValues = values.slice(1, values.length)
  const headValue = values[0]

  for (const i in tailValues) {
    if (!used.includes(tailValues[i])) return false
  }
  for (const i in used) {
    if (used[i].indexOf(headValue) === used[i].length - headValue.length) {
      return true
    }
  }
  return false
}

function matchContainsAttribute (values, used) {
  const headValue = values[0]
  const bodyValues = values.slice(1, values.length - 1)
  const tailValue = values[values.length - 1]

  if (values.length === 1) {
    for (const i in used) {
      if (used[i].includes(values[0])) {
        return true
      }
    }
  }
  for (const i in bodyValues) {
    if (!used.includes(bodyValues[i])) return false
  }
  for (const i in used) {
    if (used[i].indexOf(headValue) === used[i].length - headValue.length) {
      for (const j in used) {
        if (used[j].indexOf(tailValue) === 0) {
          return true
        }
      }
    }
  }
}

function matchAttribute (operator, value, used) {
  const values = value.split(' ')

  switch (operator) {
    case '=':
      return matchEqualityAttribute(values, used)
    case '~=':
      return matchWhitespaceEqualityAttribute(values, used)
    case '|=':
      return matchSubcodeAttribute(values, used)
    case '^=':
      return matchStartingWithAttribute(values, used)
    case '$=':
      return matchEndingWithAttribute(values, used)
    case '*=':
      return matchContainsAttribute(values, used)
    default:
      return false
  }
}

function makeSelectorFilter (options) {
  const ignore = options.ignore
  const used = options.used
  const allowIds = options.allowIds
  const allowNonClassSelectors = options.allowNonClassSelectors
  const allowNonClassCombinators = options.allowNonClassCombinators || options.allowNonClassSelectors

  return function selectorFilter (mainSelector) {
    if (mainSelector[0] === '@') return true
    if (ignoreSelector(ignore, mainSelector)) return true

    function transform (selectors) {
      selectors.each((selector) => {
                // Find separate parts of combined selectors
        let parts = []
        let sel = parser.selector()
        for (let i = 0; i < selector.nodes.length; i++) {
          switch (selector.at(i).type) {
            case 'combinator':
              parts.push(sel)
              sel = parser.selector()
              break

            case 'comment':
              break

            default:
              sel.append(selector.at(i).clone())
              break
          }
        }
        parts.push(sel)
        parts = parts.filter((part) => part.toString().trim().length)

        let classInSelector = false
                // Keep if all parts are kept
        let keep = parts.reduce((partResult, part) => {
          if (!partResult) return false
          if (ignoreSelector(ignore, part.toString())) return true

                    // Keep part if all classes are used and there are no ids
          let classInCombinator = false

          let allowCombinator = part.reduce((combinatorResult, node) => {
            if (!combinatorResult) return false
            if (ignoreSelector(ignore, node.toString())) return true

            let result = false

            switch (node.type) {
              case 'id':
                return allowIds

              case 'class':
                classInSelector = true
                classInCombinator = true
                return used.includes(node.value)

              case 'attribute':
                if (node.attribute !== 'class') return true

                if (node.insensitive) {
                  result = matchAttribute(node.operator, node.raws.unquoted.toUpperCase(), used.map((u) => u.toUpperCase()))
                } else {
                  result = matchAttribute(node.operator, node.raws.unquoted, used)
                }

                if (result) {
                  classInSelector = true
                  classInCombinator = true
                }

                return result

              default:
                return true
            }
          }, true)

          if (!allowNonClassCombinators && !classInCombinator) allowCombinator = false

          return allowCombinator
        }, true)

        if (!allowNonClassSelectors && !classInSelector) keep = false

        // Can't return false from the transform so empty the selector to indicate failure
        selector.empty()
        if (keep) selector.append(parser.comment({ value: '/* true */'}))
      })
    }

    return !!parser(transform).process(mainSelector).result.length
  }
}

module.exports = function filterUnusedSelectors (selectors, options) {
  return selectors.filter(makeSelectorFilter(options))
}
