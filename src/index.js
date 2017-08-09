/*
 *  The MIT License (MIT)
 *
 *  Copyright (c) 2013 Giacomo Martino
 */

var postcss = require('postcss')
var _ = require('lodash')
var filterUnusedSelectors = require('./filter.js')

function getUsedAnimations (css) {
  var usedAnimations = []
  css.walkDecls(function (decl) {
    if (_.endsWith(decl.prop, 'animation-name')) {
            // Multiple animations, separated by comma
      usedAnimations.push(...postcss.list.comma(decl.value))
    } else if (_.endsWith(decl.prop, 'animation')) {
            // Support multiple animations
      postcss.list.comma(decl.value).forEach(function (anim) {
                // If declared as animation, it should be in the form 'name Xs etc..'
        usedAnimations.push(postcss.list.space(anim)[0])
      })
    }
  })
  return usedAnimations
}

function filterKeyframes (css, animations, unusedRules) {
  css.walkAtRules(/keyframes$/, function (atRule) {
    if (animations.indexOf(atRule.params) === -1) {
      unusedRules.push(atRule)
      atRule.remove()
    }
  })
}

function filterEmptyAtRules (css) {
    // Filter media queries with no remaining rules
  css.walkAtRules(function (atRule) {
    if (atRule.name === 'media' && atRule.nodes.length === 0) {
      atRule.remove()
    }
  })
}

function filterUnusedRules (css, options) {
  let ignoreNextRule = false
  let unusedRuleSelectors
  let unusedRules = []
  let usedRuleSelectors

    /* Rule format:
     *  { selectors: [ '...', '...' ],
     *    declarations: [ { property: '...', value: '...' } ]
     *  },.
     * Two steps: filter the unused selectors for each rule,
     *            filter the rules with no selectors
     */

  ignoreNextRule = false
  css.walk(function (rule) {
    if (rule.type === 'comment') {
            // ignore next rule while using comment `/* uncss:ignore */`
      if (/^!?\s?uncss:ignore\s?$/.test(rule.text)) {
        ignoreNextRule = true
      }
    } else if (rule.type === 'rule') {
      if (rule.parent.type === 'atrule' && _.endsWith(rule.parent.name, 'keyframes')) {
                // Don't remove animation keyframes that have selector names of '30%' or 'to'
        return
      }
      if (ignoreNextRule) {
        ignoreNextRule = false
        options.ignore = options.ignore.concat(rule.selectors)
      }

      usedRuleSelectors = filterUnusedSelectors(rule.selectors, options)
      unusedRuleSelectors = rule.selectors.filter(function (selector) {
        return usedRuleSelectors.indexOf(selector) < 0
      })
      if (unusedRuleSelectors && unusedRuleSelectors.length) {
        unusedRules.push({
          type: 'rule',
          selectors: unusedRuleSelectors,
          position: rule.source
        })
      }
      if (usedRuleSelectors.length === 0) {
        rule.remove()
      } else {
        rule.selectors = usedRuleSelectors
      }
    }
  })

    /* Filter the @media rules with no rules */
  filterEmptyAtRules(css)

    /* Filter unused @keyframes */
  filterKeyframes(css, getUsedAnimations(css), unusedRules)

  return css
}

module.exports = postcss.plugin('postcss-tree-traking', function cssTreeshaking (opts) {
  return function (css) {
    return new Promise((resolve) => {
      const options = {
        used: [],
        ignore: [],
        allowIds: false,
        allowNonClassSelectors: false,
        allowNonClassCombinators: false
      }
      Object.assign(options, opts)

      css = filterUnusedRules(css, options)

      resolve(css)
    })
  }
})
