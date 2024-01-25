function parseSearchInput(searchInput) {
    //console.log("1.", searchInput);

    // Make case insensitive
    searchInput = searchInput.toUpperCase();

    // Split on space, quote, or paren; remove white space 
    const tokens = searchInput.split(/(\s+|["()])/).filter(token => token.trim() !== '');
    searchInput = regroupQuotedStrings(tokens);
    //console.log("2.", searchInput);

    // Replace & => AND
    searchInput = searchInput.map(token => token === '&' ? 'AND' : token);
    //console.log("3.", searchInput);

    searchInput = enforceTCSyntax(searchInput);
    // console.log("4.", searchInput);

    let searchInputs = processParenProximityOrs([searchInput]);
    // console.log("7.", searchInputs);

    searchInputs = filterAnd(searchInputs);
    //console.log("Final parsing:");
    //console.log(searchInputs);

    return searchInputs
}


// regroup tokens that inside quotes; remove unpaired quotes and parens
function regroupQuotedStrings(tokens) {
    const regroupedTokens = [];
    let isInsideQuotes = false;
    let quotedString = '';
    let quoteCount = 0;
    let parenCount = 0;

    // Count quotes and parentheses
    tokens.forEach(token => {
        if (token === '"') {
            quoteCount++;
        } else if (token === '(' || token === ')') {
            parenCount++;
        }
    });

    // Check if quotes and parentheses are paired
    const unpairedQuote = quoteCount % 2 !== 0;
    const unpairedParen = parenCount % 2 !== 0;

    tokens.forEach(token => {
        if (token === '"') {
            if (isInsideQuotes) {
                // End of quoted string
                if (!(unpairedQuote && quoteCount === 1)) {
                    regroupedTokens.push(quotedString.trim());
                }
                quotedString = '';
                isInsideQuotes = false;
            } else {
                // Start of quoted string
                isInsideQuotes = true;
            }
            quoteCount--;
        } else if (isInsideQuotes) {
            quotedString += token + ' ';
        } else if ((token === '(' || token === ')') && unpairedParen && parenCount === 1) {
            // Skip unpaired parenthesis
            parenCount--;
        } else {
            regroupedTokens.push(token);
            if (token === '(' || token === ')') {
                parenCount--;
            }
        }
    });

    return regroupedTokens;
}




// validate Term-Object-Term syntax; imply literal; delete trim
function enforceTCSyntax(searchInput) {
    const connectors = ['AND', 'OR'];
    const isConnector = token => connectors.includes(token) || /^\//.test(token); // Connector is 'AND', 'OR', or starts with '/'
    const isParen = token => token === '(' || token === ')';
    let processedInput = [];
    let i = 0;

    while (i < searchInput.length) {
        const currentToken = searchInput[i];
        const nextToken = searchInput[i + 1];

        // Skip if first or last token is a connector
        if ((i === 0 || i === searchInput.length - 1) && isConnector(currentToken)) {
            i++;
            continue;
        }

        // If current token and next token are not a connector or paren, concatenate them
        if (!isConnector(currentToken) && !isParen(currentToken) && nextToken && !isConnector(nextToken) && !isParen(nextToken)) {
            processedInput.push(currentToken + ' ' + nextToken);
            i += 2; // Skip the next token as it's been concatenated
        } else {
            processedInput.push(currentToken);
            i++; // Move to the next token
        }
    }

    return processedInput;
}

// if any parenthetical has been reduced to one element, delete the parentheses
function removeSingleElementParentheses(tokens) {
    const stack = [];
    let output = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token === '(') {
            // Start of a new group
            stack.push(output);
            output = [];
        } else if (token === ')' && stack.length > 0) {
            // End of a group
            const group = output;
            output = stack.pop(); // Retrieve the previous state
            
            if (group.length === 1) {
                // If the group has only one element, add it without parentheses
                output.push(...group);
            } else {
                // Otherwise, add the group with parentheses
                output.push('(', ...group, ')');
            }
        } else {
            // Regular term or connector
            output.push(token);
        }
    }

    return output;
}

// searchInput is a list of elements. Look for Proximity Connectors, /n, in the form: [..., ..., "Term1", "/2", "Term2"..., ..., ...]. Use a stack and output method to find elements in that specific form: "Term1", "/2", "Term2". Skip the elements if Term1 or Term2 is a paren. When a "Term1", "/2", "Term2" syntax is found, remove those elements from the list and replace them with an array in the form [2, "Term1", "Term2"]. Do not try to distribute elements inside parentheses. Except for Term1 and Term2, do not change the content or order of the other elements in the searchInput list.
function processProximity(searchInput) {
    let i = 0;
    while (i < searchInput.length - 2) {
        // Check if the current element and the one two places ahead are strings, and if the next element is a proximity connector
        if (typeof searchInput[i] === 'string' && typeof searchInput[i + 2] === 'string' && /^\/\d+$/.test(searchInput[i + 1])) {
            // Extract the number from the proximity connector
            let proximityNumber = parseInt(searchInput[i + 1].substring(1));

            // Ensure neither Term1 nor Term2 is a parenthesis
            if (searchInput[i] !== '(' && searchInput[i] !== ')' && searchInput[i + 2] !== '(' && searchInput[i + 2] !== ')') {
                // Replace the three elements with the array [n, "Term1", "Term2"]
                searchInput.splice(i, 3, [proximityNumber, searchInput[i], searchInput[i + 2]]);
            } else {
                // If a parenthesis is found, move to the next element
                i++;
            }
        } else {
            // If the pattern is not matched, move to the next element
            i++;
        }
    }
    return searchInput;
}

// Read the searchInput items from left to right. If you find an OR connector inside a parenthetical, stop. Make a deep copy of searchInput into two new arrays (searchInputs[0] and searchInputs[1]). In searchInputs[0], remove the OR connector and the item immediately following the OR connector, and include all items before and after in the original searchInput unchanged. In searchInputs[1], remove the OR connector and the item immediately preceding the OR connector, and include all items before and after in the original searchInput unchanged. 
function splitORsinParens(searchInput) {
    let parentheticalDepth = 0;
    var searchInputs = []

    for (let i = 0; i < searchInput.length; i++) {
        if (searchInput[i] === '(') {
            parentheticalDepth++;
        } else if (searchInput[i] === ')') {
            parentheticalDepth--;
        } else if (searchInput[i] === 'OR' && parentheticalDepth > 0) {
            // If "OR" connector is found inside a parenthetical, proceed with the split

            // In searchInputs[0], remove the "OR" connector and the item immediately following the "OR" connector
            let newArray1 = JSON.parse(JSON.stringify(searchInput));
            newArray1.splice(i, 2);
            searchInputs.push(newArray1)

            // In searchInputs[1], remove the "OR" connector and the item immediately preceding the "OR" connector
            let newArray2 = JSON.parse(JSON.stringify(searchInput));
            newArray2.splice(i - 1, 2);
            searchInputs.push(newArray2)

            break; // Stop processing after the first "OR" connector inside a parenthetical
        }
    }
    
    return searchInputs;
}

// split remaining ORs
function splitRemainingOrs (searchInput) {
    // Find the index of the 'OR' token
    const orIndex = searchInput.indexOf('OR');

    // If 'OR' is not found, return the original input inside an array
    if (orIndex === -1) {
        return [searchInput];
    }

    // Split the array at the 'OR' index
    const beforeOr = searchInput.slice(0, orIndex);
    const afterOr = searchInput.slice(orIndex + 1);

    // Return the two new arrays
    return [beforeOr, afterOr];
}


// Recursively process search inputs until no more changes are possible
function processParenProximityOrs(searchInputs) {
    let hasChanges;
    do {
        hasChanges = false;
        let currentLength = searchInputs.length;
        for (let i = 0; i < currentLength; i++) {
            let oldInput = JSON.stringify(searchInputs[i]);

            // Process each search input
            let splitResults = splitRemainingOrs(searchInputs[i]);
            if (splitResults.length > 1) {
                // Replace the original with the new split results
                searchInputs.splice(i, 1, ...splitResults);
                hasChanges = true;
                continue; // Skip further processing for this iteration as splitRemainingOrs already modified searchInputs
            }

            // Process proximity, remove single element parentheses
            searchInputs[i] = removeSingleElementParentheses(searchInputs[i]);
            searchInputs[i] = processProximity(searchInputs[i]);
            searchInputs[i] = removeSingleElementParentheses(searchInputs[i]);

            // Check if changes occurred
            if (JSON.stringify(searchInputs[i]) !== oldInput) {
                hasChanges = true;
            }
        }
    } while (hasChanges); // Continue until no more changes are made

    return searchInputs;
}

// eliminate "and" values
function filterAnd(searchInputs) {
    return searchInputs.map(input => input.filter(token => token !== 'AND'));
}


module.exports = parseSearchInput