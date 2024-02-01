const express = require('express')
const app = express()
const port = 3000
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const fs = require('fs').promises
const path = require('path')
app.use(express.static('public'))
const parseSearchInput = require('./parser')

http.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`)
})

io.on('connection', (socket) => {
  console.log('a user connected')
  socket.on('disconnect', () => {
    console.log('user disconnected')
  })

  socket.on('searchInput', (query) => {
    // console.log(query)
    search(socket, query)
  })
})

async function search (socket, query) {
  console.log('running search')
  // log user and query

  // select folders
  const directoryPaths = []
  if (query.rifChecked) { directoryPaths.push('public/RIF/txt/') }
  if (query.cpcChecked) { directoryPaths.push('public/CPC/txt/') }
  if (query.mirsChecked) { directoryPaths.push('public/MIRS/txt/') }
  if (query.ctcChecked) { directoryPaths.push('public/CTC/txt/') }
  console.log('directoryPaths:', directoryPaths)

  // parse search query
  const searchInputs = parseSearchInput(query.searchInput)
  console.log(searchInputs)

  // results container
  const results = await getResults(directoryPaths, searchInputs)

  // return results to Client
  socket.emit('results', results)
}

async function getResults (directoryPaths, searchInputs) {
  const results = []

  for (let d = 0; d < directoryPaths.length; d++) {
    const directoryPath = path.join(__dirname, directoryPaths[d])
    const files = await fs.readdir(directoryPath)
    for (let f = 0; f < files.length; f++) {
      // read files
      const filePath = directoryPath + files[f]
      let content = await fs.readFile(filePath, 'utf8')

      const contentNormalCase = content
      content = content.toUpperCase()

      // use parsed searchInputs to decide whether file is a hit; if hit return content-index location of first hit for use by getSnippet
      const snippetID = await searchLogic(content, searchInputs)
      if (snippetID !== -1) {
        // prepare file names
        const fileName = path.basename(files[f])
        const pdfFilePath = filePath.replace('/txt/', '/pdf/').replace('.txt', '.pdf')
        const pdfLink = pdfFilePath.replace(path.join(__dirname, 'public'), '')
        const pdfLinkSplits = pdfLink.split('/')
        const type = pdfLinkSplits[1]

        // push results
        results.push({
          fileName,
          pdfLink,
          type,
          snippet: getSnippet(contentNormalCase, snippetID),
          caseNo: path.basename(files[f]).replace('.txt', ''),
          caseName: getCaseName(contentNormalCase, type, fileName)
        })
      }
    }
  }
  return results
}

// use parsed searchInputs to decide whether file is a hit; if hit return content-index location of first hit for use by getSnippet
function searchLogic (content, searchInputs) {
  const isHit = false
  let snippetID = -1

  for (let ORList = 0; ORList < searchInputs.length; ORList++) {
    let hasAllAnds = true

    for (let ANDItem = 0; ANDItem < searchInputs[ORList].length; ANDItem++) {
      const currentANDItem = searchInputs[ORList][ANDItem]

      // regular string
      if (typeof currentANDItem === 'string') {
        // console.log(currentANDItem, content.indexOf(currentANDItem))

        if (content.indexOf(currentANDItem) === -1) {
          // console.log("107: ", currentANDItem, content)
          hasAllAnds = false
          break
        } else {
          snippetID = content.indexOf(currentANDItem)
        }

      // proximity array: [n, term1, term2]
      } else if (typeof searchInputs[ORList][ANDItem] === 'object') {
        const n = searchInputs[ORList][ANDItem][0]
        const t1 = searchInputs[ORList][ANDItem][1]
        const t2 = searchInputs[ORList][ANDItem][2]
        // console.log('120:', n, t1, t2)
        if (isClose(n, t1, t2, content) === false) {
          hasAllAnds = false
          break
        } else {
          snippetID = isClose(n, t1, t2, content)
        }
      }
    } // ANDItem loop

    // check for hasAllAnds = true
    if (hasAllAnds) {
      return snippetID
    }
  } // ORList loop
  if (isHit === false) {
    return -1
  } else {
    return snippetID
  }
}

function findAllIndices (content, substring) {
  const indices = []
  let index = content.indexOf(substring)
  while (index !== -1) {
    indices.push(index)
    index = content.indexOf(substring, index + 1)
  }
  return indices
}

function isClose (n, t1, t2, content) {
  const indicesT1 = findAllIndices(content, t1)
  const indicesT2 = findAllIndices(content, t2)

  for (const indexT1 of indicesT1) {
    for (const indexT2 of indicesT2) {
      const distance = Math.abs(indexT1 - indexT2) - Math.min(t1.length, t2.length)
      if (distance <= n) {
        return indexT1
      }
    }
  }
  return false
}

function getSnippet (content, snippetID) {
  const searchIndex = snippetID
  const snippetStart = Math.max(0, searchIndex - 40)
  const snippetEnd = Math.min(content.length, searchIndex + 120)
  let snippet = content.substring(snippetStart, snippetEnd)
  snippet = snippet.replace(/\n/g, '')
  return snippet
}

function getCaseName (content, type, fileName) {
  let caseName = ''
  let Teacher = ''
  let Agency = ''

  // clean up special characters (except '.' and ',') and break into words
  content = content.replace(/[!@#$%^&*()_+\=\[\]{};':"\\|<>\/?]/g, '')
  const words = content.split(/\s+/)

  if (type === 'MIRS') {
    // EG:
    // BEFORE THE
    // OFFICE OF ADMINISTRATIVE HEARINGS
    // STATE OF CALIFORNIA
    // In the Matter of the Motion for Immediate Reversal of
    // Suspension of:
    // LINDA PAPPAS, a permanent certificated employee,
    // Moving Party,
    // and
    // GALT JOINT UNION ELEMENTARY SCHOOL DISTRICT,
    // Responding Party.

    // --- MIRS: FIND TEACHER --->

    // locate index of "BEFORE"
    let currentIndex = words.indexOf('BEFORE')

    // locate index of the first non-all CAP word (ie "In the Matter..")
    for (let i = currentIndex; i < words.length; i++) {
      if (words[i].length > 1 && words[i][1] !== words[i][1].toUpperCase()) {
        currentIndex = i
        break
      }
    }

    // locate index of the first CAP word (Teacher)
    let TeacherBegin = -1
    for (let i = currentIndex + 1; i < words.length; i++) {
      if (
        (words[i] != 'OAH') &&
      (words[i] != 'No.') &&
      (isNaN(words[i].charAt(0))) &&
      (words[i] !== 'ORDER') &&
      (words[i] !== 'GRANTING') &&
      (words[i] !== 'DENYING') &&
      (words[i] !== 'MOTION') &&
      (words[i] !== 'FOR') &&
      (words[i] !== 'IMMEDIATE') &&
      (words[i] !== 'REVERSAL') &&
      (words[i] !== 'OF') &&
      (words[i] !== 'SUSPENSION')) {
        // if not; found TeacherBegin
        if ((words[i].length > 1) &&
            (words[i][1] !== words[i][1].toLowerCase())) {
          TeacherBegin = i
          break
        }
      }
    }

    // locate index of the first non-all CAP word (end of teacher)
    let TeacherEnd = -1
    for (let i = TeacherBegin + 1; i < words.length; i++) {
      // if comma
      if (words[i].indexOf(',') > 0) {
        TeacherEnd = i
        break
      }

      // otherwise; if not upper case
      else if (words[i].length > 1 && words[i][1] !== words[i][1].toUpperCase()) {
        TeacherEnd = i
        break
      }
    }

    // build teacher's name
    Teacher = ''
    if (TeacherBegin !== -1 && TeacherEnd !== -1) {
      Teacher = words[TeacherBegin]
      for (let i = TeacherBegin + 1; i <= TeacherEnd; i++) {
        if (words[i].indexOf(',') > 0) {
          const lastWord = words[i].split(',')[0]
          Teacher += ' ' + lastWord
        } else {
          Teacher += ' ' + words[i]
        }
      }
    }

    // --- MIRS: FIND AGENCY --->

    // locate County Office of "Education" or School "District"
    Agency = ''
    let AgencyEnd = 7
    for (let i = 0; i < 100; i++) {
      console.log('269', i, words[i].replace(',', '').trim())
      if ((words[i].replace(',', '').trim() === 'DISTRICT') || (words[i].replace(',', '').trim() === 'EDUCATION')) {
        AgencyEnd = i
        break
      }
    }
    let AgencyBegin = AgencyEnd - 7
    // go backwards and locate first not all CAP
    for (let j = AgencyEnd; j > AgencyEnd - 7; j--) {
      console.log('277', j, words[j])
      if (words[j] != words[j].toUpperCase()) {
        AgencyBegin = j + 1
        break
      }
    }

    // build agency name
    Agency = ''
    if (AgencyEnd !== -1) {
      Agency = words[AgencyBegin]
      for (let i = AgencyBegin + 1; i <= AgencyEnd; i++) {
        if (words[i].indexOf(',') > 0) {
          const lastWord = words[i].split(',')[0]
          Agency += ' ' + lastWord
        } else {
          Agency += ' ' + words[i]
        }
      }
    }

    // done
    caseName = `${Teacher} / ${Agency}`
  } else if (type === 'CPC') {
    // e.g.:
    // BEFORE THE COMMISSION ON PROFESSIONAL COMPETENCE
    // SAN JUAN UNIFIED SCHOOL DISTRICT
    // STATE OF CALIFORNIA
    // In the Matter of:
    // DANIEL WESTOVER,
    // A Permanent Certificated Employee,
    // OAH No. 2008100579

    // --- CPC: FIND TEACHER --->

    // locate index of "BEFORE"
    const currentIndex = words.indexOf('BEFORE')
    let nextIndex = 0

    // locate index of the first non-all CAP word (ie "In the Matter..")
    for (let i = currentIndex; i < words.length; i++) {
      if (words[i]) {
        if (words[i] !== words[i].toUpperCase()) {
          nextIndex = i
          break
        }
      }
    }

    // locate index of the first CAP word (Teacher)
    let TeacherBegin = -1
    for (let i = nextIndex + 1; i < words.length; i++) {
      if ((words[i] !== 'OAH') &&
          (words[i] !== 'Case') &&
          (words[i] !== 'No.') &&
          (isNaN(words[i]))) {
        if ((words[i].length > 1) &&
            (words[i][1] !== words[i][1].toLowerCase())) {
          TeacherBegin = i
          break
        }
      }
    }

    // locate index of the first non-all CAP word (end of teacher)
    Teacher = words[TeacherBegin]
    for (let i = TeacherBegin + 1; i < TeacherBegin + 4; i++) {
      console.log('342:', i, words[i], fileName)
      console.log('346:', words[i], words[i+1], words[i+2])

      try {
        // if not a letter
        if (/^[a-zA-Z]$/.test(words[i][0]) == false) {
          console.log("349", words[i])
          break
        }

        // if comma
        else if (words[i].indexOf(',') > 0) {
          console.log("355", words[i])
          Teacher = Teacher + ' ' + words[i].split(',')[0]
          break
        }

        // otherwise; if not upper case
        else if (words[i][1] !== words[i][1].toUpperCase()) {
          console.log("361", words[i])
          break
        }

        else {
          console.log("367", words[i])
          Teacher = Teacher + ' ' + words[i]
        }
      }
      catch {
        console.log("374:")
      }
    }

    // --- CPC: AGENCY --->
    Agency = ''
    for (let i = 0; i < 20; i++) {
      Agency = Agency + ' ' + words[i]
      if ((words[i].replace(',', '').trim() === 'DISTRICT') || (words[i].replace(',', '').trim() === 'EDUCATION') || (words[i].replace(',', '').trim() === 'CALIFORNIA')) {
        AgencyEnd = i
        break
      }
    }
    if (Agency.includes('COMPETENCE')) {
      Agency = Agency.split('COMPETENCE')[1]
      Agency = Agency.replace('OF THE', '')
    }

    // done
    caseName = `${Teacher} / ${Agency}`
  } else {
    // Locate the first section of words in all caps in the text file
    const allCapsRegex = /\b([A-Z]+\s*)+/
    const matches = content.match(allCapsRegex)
    let agency = matches ? matches[0].trim() : ''

    // List of words and symbols to remove
    const removeList = ['\n', '\t', 'COMMISSION ON PROFESSIONAL COMPETENCE', ' ON ', 'COMMISSION', 'COMMISSON', 'PROFESSIONAL', 'PROFESSONAL', 'COMPETENCE', 'STATE', 'CALIFORNIA', 'ADMINISTRATOR', 'SCHOOLS', 'SUPERINTENDANT', 'SUPERINTENDENT', 'BEFORE', 'THE', 'OF ', 'COUNTY', 'CALIF ORNIA', 'EDUCATION', 'GOVERNING', 'BOARD', 'TRUSTEES', ' I', 'OAH N', 'OAH C', '*', ',', '/', 'Â', '©', '@', 'â', '€', 'œ', '~', '+', '.', '2', '|', '_', 'PROPOSED DECISION']
    removeList.forEach(item => {
      agency = agency.split(item).join(item.trim() ? ' ' : '')
    })
    agency = agency.replace(/\s+/g, ' ').trim()
    let regex = / I$/
    agency = agency.replace(regex, '')

    // Individual
    let nameBegin = 0
    let nameEnd = 0
    let trigger = false
    let found = false

    for (let i = 0; i < Math.min(900, content.length); i++) { // Prevent exceeding the string length
      if (trigger) {
        if (found) {
          // Check for a group of non-uppercase characters
          if (!isUpperCase(content[i]) && !isUpperCase(content[i + 1]) && !isUpperCase(content[i + 2]) && !isUpperCase(content[i + 3]) && (i + 4 < content.length && !isUpperCase(content[i + 4]))) {
            nameEnd = i
            break
          }
        } else {
          // Check for a group of uppercase characters
          if (isUpperCase(content[i]) && isUpperCase(content[i + 1]) && isUpperCase(content[i + 2]) && (i + 3 < content.length && isUpperCase(content[i + 3]))) {
            nameBegin = i
            found = true
          }
        }
      } else if (isLowerCase(content[i])) {
        trigger = true
      }
    }

    let individual = content.substring(nameBegin, nameEnd)
    individual = individual.replace(/\n/g, ' ') // Replace newlines with spaces
    regex = / I$/
    individual = individual.replace(regex, '')
    individual = individual.replace('PROPOSED DECISION', '')
    individual = individual.replace(', OAH N', '')
    individual = individual.trim() // Trim whitespace from the start and end

    // Function to check if a character is uppercase
    function isUpperCase (character) {
      return character && character === character.toUpperCase() && character !== character.toLowerCase()
    }

    // Function to check if a character is lowercase
    function isLowerCase (character) {
      return character && character === character.toLowerCase() && character !== character.toUpperCase()
    }

    caseName = individual + ' / ' + agency
  }

  return caseName
}
