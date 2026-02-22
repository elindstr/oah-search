const PARSER_LIMITS = Object.freeze({
  maxInputLength: 320,
  maxTokens: 64,
  maxOrConnectors: 12,
  maxExpandedClauses: 20000
})

function parseSearchInput (searchInput) {
  if (typeof searchInput !== 'string') {
    throw new Error('Search input must be text.')
  }
  if (searchInput.length > PARSER_LIMITS.maxInputLength) {
    throw new Error(`Search input is too long (max ${PARSER_LIMITS.maxInputLength} characters).`)
  }

  // Make case insensitive
  searchInput = searchInput.toUpperCase()

  // Split on space, quote, or paren; remove white space
  const tokens = searchInput.split(/(\s+|["()])/).filter(token => token.trim() !== '')
  enforceComplexityLimits(tokens)
  searchInput = regroupQuotedStrings(tokens)
  enforceComplexityLimits(searchInput)

  // Replace & => AND
  searchInput = searchInput.map(token => token === '&' ? 'AND' : token)
  enforceComplexityLimits(searchInput)

  searchInput = enforceTCSyntax(searchInput)

  let searchInputs = processParenQuotesProximityORs(searchInput)

  searchInputs = filterAnd(searchInputs)

  // console.log('Final parsing:')
  // console.log(searchInputs)

  return searchInputs
}

function enforceComplexityLimits (tokens) {
  if (tokens.length > PARSER_LIMITS.maxTokens) {
    throw new Error(`Search is too complex (max ${PARSER_LIMITS.maxTokens} tokens).`)
  }
  const orCount = tokens.filter(token => token === 'OR').length
  if (orCount > PARSER_LIMITS.maxOrConnectors) {
    throw new Error(`Search is too complex (max ${PARSER_LIMITS.maxOrConnectors} OR connectors).`)
  }
}

function enforceExpandedClauseLimit (searchInputs) {
  if (searchInputs.length > PARSER_LIMITS.maxExpandedClauses) {
    throw new Error('Search is too complex. Please reduce OR terms or parentheses.')
  }
}

// regroup tokens that inside quotes; remove unpaired quotes and parens
function regroupQuotedStrings (tokens) {
  const regroupedTokens = []
  let isInsideQuotes = false
  let quotedString = ''
  let quoteCount = 0
  let parenCount = 0

  // Count quotes and parentheses
  tokens.forEach(token => {
    if (token === '"') {
      quoteCount++
    } else if (token === '(' || token === ')') {
      parenCount++
    }
  })

  // Check if quotes and parentheses are paired
  const unpairedQuote = quoteCount % 2 !== 0
  const unpairedParen = parenCount % 2 !== 0

  tokens.forEach(token => {
    if (token === '"') {
      if (isInsideQuotes) {
        // End of quoted string
        if (!(unpairedQuote && quoteCount === 1)) {
          regroupedTokens.push(quotedString.trim())
        }
        quotedString = ''
        isInsideQuotes = false
      } else {
        // Start of quoted string
        isInsideQuotes = true
      }
      quoteCount--
    } else if (isInsideQuotes) {
      quotedString += token + ' '
    } else if ((token === '(' || token === ')') && unpairedParen && parenCount === 1) {
      // Skip unpaired parenthesis
      parenCount--
    } else {
      regroupedTokens.push(token)
      if (token === '(' || token === ')') {
        parenCount--
      }
    }
  })

  return regroupedTokens
}

// validate Term-Object-Term syntax; imply literal; delete trim
function enforceTCSyntax (searchInput) {
  const connectors = ['AND', 'OR']
  const isConnector = token => connectors.includes(token) || /^\//.test(token) // Connector is 'AND', 'OR', or starts with '/'

  const isParen = token => token === '(' || token === ')'

  const processedInput = []
  let i = 0

  while (i < searchInput.length) {
    const currentToken = searchInput[i]
    const nextToken = searchInput[i + 1]

    // Skip if first or last token is a connector
    if ((i === 0 || i === searchInput.length - 1) && isConnector(currentToken)) {
      i++
      continue
    }

    // If current token and next token are not a connector or paren, concatenate them
    if (!isConnector(currentToken) && !isParen(currentToken) && nextToken && !isConnector(nextToken) && !isParen(nextToken)) {
      processedInput.push(currentToken + ' ' + nextToken)

      i += 2 // Skip the next token as it's been concatenated
    } else {
      processedInput.push(currentToken)
      i++ // Move to the next token
    }
  }

  return processedInput
}

// if any parenthetical has been reduced to one element, delete the parentheses
function removeSingleElementParentheses (searchInputs) {
  for (let s = 0; s < searchInputs.length; s++) {
    const searchInput = JSON.parse(JSON.stringify(searchInputs[s]))

    // identify parens to kill; ["(", "x", ")"]
    const sliceIDs = []
    if (searchInput.length > 2) {
      for (let i = 0; i < searchInput.length - 2; i++) {
        if ((searchInput[i] === '(') &&
            (searchInput[i + 2] === ')')) {
          sliceIDs.push(i)
          sliceIDs.push(i + 2)
        }
      }
    }

    // build new list without sliceIDs values
    const newList = []
    for (let i = 0; i < searchInput.length; i++) {
      if (!sliceIDs.includes(i)) {
        newList.push(searchInput[i])
      }
    }
    searchInputs[s] = JSON.parse(JSON.stringify(newList))
  }

  return searchInputs
}

function removeEmptyQuotes (searchInputs) {
  for (let s = 0; s < searchInputs.length; s++) {
    const searchInput = JSON.parse(JSON.stringify(searchInputs[s]))

    // identify empty quotes to kill
    const sliceIDs = []
    if (searchInput.length > 2) {
      for (let i = 0; i < searchInput.length; i++) {
        if (searchInput[i] === '') {
          sliceIDs.push(i)
        }
      }
    }
    // build new list without sliceIDs values
    const newList = []
    for (let i = 0; i < searchInput.length; i++) {
      if (!sliceIDs.includes(i)) {
        newList.push(searchInput[i])
      }
    }
    searchInputs[s] = JSON.parse(JSON.stringify(newList))
  }
  return searchInputs
}

// searchInput is a list of elements. Look for Proximity Connectors, /n, in the form: [..., ..., "Term1", "/2", "Term2"..., ..., ...]. Use a stack and output method to find elements in that specific form: "Term1", "/2", "Term2". Skip the elements if Term1 or Term2 is a paren. When a "Term1", "/2", "Term2" syntax is found, remove those elements from the list and replace them with an array in the form [2, "Term1", "Term2"]. Do not try to distribute elements inside parentheses. Except for Term1 and Term2, do not change the content or order of the other elements in the searchInput list.
function processProximity (searchInputs) {
  const searchInputsTemp = []

  for (let s = 0; s < searchInputs.length; s++) {
    const searchInput = JSON.parse(JSON.stringify(searchInputs[s]))

    let i = 0
    while (i < searchInput.length - 2) {
      // Check if the current element and the one two places ahead are strings, and if the next element is a proximity connector
      if (typeof searchInput[i] === 'string' && typeof searchInput[i + 2] === 'string' && /^\/\d+$/.test(searchInput[i + 1])) {
        // Extract the number from the proximity connector
        const proximityNumber = parseInt(searchInput[i + 1].substring(1))

        // Ensure neither Term1 nor Term2 is a parenthesis
        if (searchInput[i] !== '(' && searchInput[i] !== ')' && searchInput[i + 2] !== '(' && searchInput[i + 2] !== ')') {
          // Replace the three elements with the array [n, "Term1", "Term2"]
          searchInput.splice(i, 3, [proximityNumber, searchInput[i], searchInput[i + 2]])

          break // to avoid errors; but that means this function will need to be run multiple times
        } else {
          // If a parenthesis is found, move to the next element
          i++
        }
      } else {
        // If the pattern is not matched, move to the next element
        i++
      }
    }
    searchInputsTemp.push(searchInput)
  }

  searchInputs = JSON.parse(JSON.stringify(searchInputsTemp))
  return searchInputs
}

// Read the searchInput items from left to right. If you find an OR connector inside a parenthetical, stop. Make a deep copy of searchInput into two new arrays (searchInputs[0] and searchInputs[1]). In searchInputs[0], remove the OR connector and the item immediately following the OR connector, and include all items before and after in the original searchInput unchanged. In searchInputs[1], remove the OR connector and the item immediately preceding the OR connector, and include all items before and after in the original searchInput unchanged.
function splitORsinParens (searchInputs) {
  const searchInputsTemp = []

  for (let s = 0; s < searchInputs.length; s++) {
    const searchInput = JSON.parse(JSON.stringify(searchInputs[s]))

    if (typeof searchInput !== 'string') {
      let isChanged = false

      let parentheticalDepth = 0
      for (let i = 0; i < searchInput.length; i++) {
        if (searchInput[i] === '(') {
          parentheticalDepth++
        } else if (searchInput[i] === ')') {
          parentheticalDepth--
        } else if (searchInput[i] === 'OR' && parentheticalDepth > 0) {
          // If "OR" connector is found inside a parenthetical, proceed with the split

          // In searchInputsTemp[0], remove the "OR" connector and the item immediately following the "OR" connector
          const newArray1 = JSON.parse(JSON.stringify(searchInput))
          newArray1.splice(i, 2)
          searchInputsTemp.push(newArray1)
          isChanged = true

          // In searchInputsTemp[1], remove the "OR" connector and the item immediately preceding the "OR" connector
          const newArray2 = JSON.parse(JSON.stringify(searchInput))
          newArray2.splice(i - 1, 2)
          searchInputsTemp.push(newArray2)

          break // Stop processing after the first "OR" connector inside a parenthetical to avoid errors; so need to run this multiple times.
        }
      }
      if (isChanged === false) {
        searchInputsTemp.push(searchInput)
      }
    } else {
      // if string:
      searchInputsTemp.push(searchInput)
    }
  }
  searchInputs = JSON.parse(JSON.stringify(searchInputsTemp))

  return searchInputs
}

function filterORs (searchInputs) {
  const searchInputsTemp = []
  for (let s = 0; s < searchInputs.length; s++) {
    const searchInput = JSON.parse(JSON.stringify(searchInputs[s]))

    if (typeof searchInput !== 'string') {
      let isChanged = false
      for (let i = 0; i < searchInput.length; i++) {
        if (searchInput[i] === 'OR') {
          // In searchInputsTemp[0], remove the "OR" connector and the item immediately following the "OR" connector
          const newArray1 = JSON.parse(JSON.stringify(searchInput))
          newArray1.splice(i, 2)
          searchInputsTemp.push(newArray1)
          isChanged = true

          // In searchInputsTemp[1], remove the "OR" connector and the item immediately preceding the "OR" connector
          const newArray2 = JSON.parse(JSON.stringify(searchInput))
          newArray2.splice(i - 1, 2)
          searchInputsTemp.push(newArray2)

          break // Stop processing after the first "OR" connector inside a parenthetical to avoid errors; so need to run this multiple times.
        }
      }
      if (isChanged === false) {
        searchInputsTemp.push(searchInput)
      }
    } else {
      // if string:
      searchInputsTemp.push(searchInput)
    }
  }
  searchInputs = JSON.parse(JSON.stringify(searchInputsTemp))
  return searchInputs
}

function processParenQuotesProximityORs (searchInput) {
  let searchInputs = [searchInput]

  let isChanged = true
  while (isChanged) {
    const oldArray = JSON.stringify(searchInputs)

    // clean up
    searchInputs = removeSingleElementParentheses(searchInputs)
    searchInputs = removeEmptyQuotes(searchInputs)

    // process proximity connections
    searchInputs = processProximity(searchInputs)

    // clean up
    searchInputs = removeSingleElementParentheses(searchInputs)
    searchInputs = removeEmptyQuotes(searchInputs)

    // distribute OR in parens by splitting into two lists
    searchInputs = splitORsinParens(searchInputs)
    enforceExpandedClauseLimit(searchInputs)

    // clean up
    searchInputs = removeSingleElementParentheses(searchInputs)
    searchInputs = removeEmptyQuotes(searchInputs)

    // split on OR
    searchInputs = filterORs(searchInputs)
    enforceExpandedClauseLimit(searchInputs)
    searchInputs = filterORs(searchInputs)
    enforceExpandedClauseLimit(searchInputs)

    // check for changes
    const newArray = JSON.stringify(searchInputs)
    if (oldArray === newArray) {
      isChanged = false
    }
  }

  return searchInputs // Return the updated searchInputs
}

function filterAnd (searchInputs) {
  for (let i = 0; i < searchInputs.length; i++) {
    // Iterate backwards through the list
    for (let j = searchInputs[i].length - 1; j >= 0; j--) {
      if (searchInputs[i][j] === 'AND') {
        // Remove the item if it is "AND"
        searchInputs[i].splice(j, 1)
      }
    }
  }
  return searchInputs
}

module.exports = parseSearchInput
