require('dotenv').config()

const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const fs = require('fs').promises
const path = require('path')
const { MongoClient } = require('mongodb')
const parseSearchInput = require('./parser')

app.disable('x-powered-by')
app.use(express.static('public'))

const SEARCH_LIMITS = Object.freeze({
  maxQueryLength: 320,
  maxSearchesPerMinute: 30,
  maxConcurrentPerIp: 2
})
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const searchTimestampsByIp = new Map()
const activeSearchesByIp = new Map()
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB_NAME = process.env.MONGO_DB_NAME
const MONGO_COLLECTION_NAME = process.env.MONGO_COLLECTION_NAME || 'search_queries'
let mongoCollectionPromise = null
let didWarnMissingMongoConfig = false

app.get('/oah', (req, res) => {
  res.redirect(301, '/')
})

// // For direct http exposure
// const port = 80
// http.listen(port, '0.0.0.0', () => {
//   // console.log(`Server running at http://0.0.0.0:${port}/`)
// })

// For production deployment using nginx forwarding
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '127.0.0.1'
http.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`)
})

// init socket.io
io.on('connection', (socket) => {
  const clientIp = getClientIp(socket)
  console.log(Date.now(), 'a user connected:', clientIp)
  socket.on('disconnect', () => {
    console.log(Date.now(), 'a user disconnected:', clientIp)
  })

  socket.on('searchInput', (query) => {
    search(socket, query).catch((err) => {
      console.error('Unhandled search error:', err)
      socket.emit('searchError', 'Search failed due to a server error. Please retry.')
      socket.emit('results', [])
    })
  })
})

function getClientIp (socket) {
  const xff = socket.request?.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim()
  }
  const xRealIp = socket.request?.headers?.['x-real-ip']
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.trim()
  }
  return socket.request?.connection?.remoteAddress || socket.handshake?.address || 'unknown'
}

function normalizeQuery (query) {
  const safeQuery = (query && typeof query === 'object') ? query : {}
  const searchInputRaw = typeof safeQuery.searchInput === 'string' ? safeQuery.searchInput : ''
  const searchInput = searchInputRaw.trim().replace(/\s+/g, ' ')

  return {
    searchInput,
    cpcChecked: Boolean(safeQuery.cpcChecked),
    mirsChecked: Boolean(safeQuery.mirsChecked),
    rifChecked: Boolean(safeQuery.rifChecked),
    ctcChecked: Boolean(safeQuery.ctcChecked)
  }
}

function canSearchNow (ipAddress) {
  const now = Date.now()
  const existing = searchTimestampsByIp.get(ipAddress) || []
  const recent = existing.filter((timestamp) => now - timestamp <= RATE_LIMIT_WINDOW_MS)
  if (recent.length >= SEARCH_LIMITS.maxSearchesPerMinute) {
    searchTimestampsByIp.set(ipAddress, recent)
    return false
  }
  recent.push(now)
  searchTimestampsByIp.set(ipAddress, recent)
  return true
}

function incrementActiveSearches (ipAddress) {
  const active = activeSearchesByIp.get(ipAddress) || 0
  activeSearchesByIp.set(ipAddress, active + 1)
}

function decrementActiveSearches (ipAddress) {
  const active = activeSearchesByIp.get(ipAddress) || 0
  const next = active - 1
  if (next <= 0) {
    activeSearchesByIp.delete(ipAddress)
  } else {
    activeSearchesByIp.set(ipAddress, next)
  }
}

function getMongoCollectionPromise () {
  if (!MONGO_URI || !MONGO_DB_NAME) {
    if (!didWarnMissingMongoConfig) {
      console.warn('Mongo logging disabled: set MONGO_URI and MONGO_DB_NAME in .env')
      didWarnMissingMongoConfig = true
    }
    return null
  }

  if (!mongoCollectionPromise) {
    const client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    })

    mongoCollectionPromise = client
      .connect()
      .then(() => {
        console.log(`Mongo logging enabled: db=${MONGO_DB_NAME}, collection=${MONGO_COLLECTION_NAME}`)
        return client.db(MONGO_DB_NAME).collection(MONGO_COLLECTION_NAME)
      })
      .catch((err) => {
        mongoCollectionPromise = null
        throw err
      })
  }

  return mongoCollectionPromise
}

async function logSearchToMongo (logEntry) {
  const collectionPromise = getMongoCollectionPromise()
  if (!collectionPromise) {
    return
  }

  try {
    const collection = await collectionPromise
    await collection.insertOne(logEntry)
  } catch (err) {
    console.error('Failed to write search log to MongoDB:', err)
  }
}

async function search (socket, query) {
  // console.log('running search')
  const startDt = Date.now()
  const clientIp = getClientIp(socket)
  const normalizedQuery = normalizeQuery(query)

  if (normalizedQuery.searchInput.length === 0) {
    socket.emit('searchError', 'Enter at least one search term.')
    socket.emit('results', [])
    return
  }

  if (normalizedQuery.searchInput.length > SEARCH_LIMITS.maxQueryLength) {
    socket.emit('searchError', `Search input is too long (max ${SEARCH_LIMITS.maxQueryLength} characters).`)
    socket.emit('results', [])
    return
  }

  if (!normalizedQuery.cpcChecked && !normalizedQuery.mirsChecked && !normalizedQuery.rifChecked && !normalizedQuery.ctcChecked) {
    socket.emit('searchError', 'Select at least one source (CPC, MIRS, RIF, or CTC).')
    socket.emit('results', [])
    return
  }

  if (!canSearchNow(clientIp)) {
    socket.emit('searchError', 'Too many searches from this IP. Please wait 1 minute and retry.')
    socket.emit('results', [])
    return
  }

  const currentActiveSearches = activeSearchesByIp.get(clientIp) || 0
  if (currentActiveSearches >= SEARCH_LIMITS.maxConcurrentPerIp) {
    socket.emit('searchError', 'Too many concurrent searches from this IP. Please wait for current searches to finish.')
    socket.emit('results', [])
    return
  }
  incrementActiveSearches(clientIp)

  // parse search query
  let searchInputsErr = ''
  let searchInputs = []
  let results = []
  let resultsErr = ''

  try {
    try {
      searchInputs = parseSearchInput(normalizedQuery.searchInput)
    } catch (err) {
      searchInputsErr = err instanceof Error ? err.message : String(err)
    }

    // select folders
    const directoryPaths = []
    if (normalizedQuery.cpcChecked) { directoryPaths.push('public/CPC/txt/') }
    if (normalizedQuery.mirsChecked) { directoryPaths.push('public/MIRS/txt/') }
    if (normalizedQuery.rifChecked) { directoryPaths.push('public/RIF/txt/') }
    if (normalizedQuery.ctcChecked) { directoryPaths.push('public/CTC/txt/') }

    if (searchInputsErr) {
      socket.emit('searchError', searchInputsErr)
      socket.emit('results', [])
      return
    }

    try {
      results = await getResults(directoryPaths, searchInputs)

      // Sort results
      results.sort((a, b) => {
        // Adjust case number if it's 11 digits long
        const caseNoA = a.caseNo.length === 11 ? a.caseNo.slice(0, 10) : a.caseNo
        const caseNoB = b.caseNo.length === 11 ? b.caseNo.slice(0, 10) : b.caseNo

        // Convert to integers for comparison
        const numA = parseInt(caseNoA, 10)
        const numB = parseInt(caseNoB, 10)

        return numB - numA
      })
    } catch (err) {
      resultsErr = err instanceof Error ? err.message : String(err)
    }

    // return results to client
    if (resultsErr) {
      socket.emit('searchError', 'Search failed. Please retry with a simpler query.')
      socket.emit('results', [])
    } else {
      socket.emit('results', results)
    }
  } finally {
    decrementActiveSearches(clientIp)

    // log performance and errors
    const dtNow = new Date()
    const logQuery = {
      createdAt: dtNow,
      dtString: `${dtNow.getFullYear()}-${(dtNow.getMonth() + 1)}-${(dtNow.getDate())} ${(dtNow.getHours())}:${(dtNow.getMinutes())}:${(dtNow.getSeconds())}`,
      lag: Date.now() - startDt,
      query: normalizedQuery,
      searchInputs,
      results: Array.isArray(results) ? results.length : 0,
      ip1: clientIp,
      ip2: socket.request.headers['x-forwarded-for'],
      ip3: socket.request.headers['x-real-ip'],
      userAgent: socket.request.headers['user-agent'],
      searchInputsErr,
      resultsErr
    }
    await logSearchToMongo(logQuery)
  }
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
        const proximityPosition = isClose(n, t1, t2, content)
        if (proximityPosition === false) {
          hasAllAnds = false
          break
        } else {
          snippetID = proximityPosition
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
  const words = content.split(/\s+/) // Split content into words

  for (let i = 0; i < words.length; i++) {
    if (words[i].toUpperCase().includes(substring.toUpperCase())) {
      indices.push(i) // Save the word index instead of character index
    }
  }

  return indices
}

function isClose (n, t1, t2, content) {
  const words = content.split(/\s+/)
  const indicesT1 = findAllIndices(content, t1)
  const indicesT2 = findAllIndices(content, t2)

  for (const indexT1 of indicesT1) {
    for (const indexT2 of indicesT2) {
      const distance = Math.abs(indexT1 - indexT2) - 1
      if (distance <= n) {
        // if it meets the n-word limit, then find the character index for later creating a snippet
        let charPos = 0
        for (let i = 0; i < indexT1; i++) {
          charPos += words[i].length + 1
        }
        return charPos
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
    if (currentIndex < 0) {
      currentIndex = 0
    }

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
        (words[i] !== 'OAH') &&
      (words[i] !== 'No.') &&
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

      // otherwise; if not upper case
      } else if (words[i].length > 1 && words[i][1] !== words[i][1].toUpperCase()) {
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
    for (let i = 0; i < 100 && i < words.length; i++) {
      const word = words[i]
      if (!word) { break }
      if ((word.replace(',', '').trim() === 'DISTRICT') || (word.replace(',', '').trim() === 'EDUCATION')) {
        AgencyEnd = i
        break
      }
    }
    let AgencyBegin = Math.max(0, AgencyEnd - 7)
    // go backwards and locate first not all CAP
    for (let j = AgencyEnd; j > AgencyEnd - 7 && j >= 0; j--) {
      if (words[j] && words[j] !== words[j].toUpperCase()) {
        AgencyBegin = j + 1
        break
      }
    }

    // build agency name
    Agency = ''
    if (AgencyEnd !== -1 && AgencyBegin <= AgencyEnd && words[AgencyBegin]) {
      Agency = words[AgencyBegin]
      for (let i = AgencyBegin + 1; i <= AgencyEnd; i++) {
        if (!words[i]) { break }
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
    Teacher = (TeacherBegin >= 0 && words[TeacherBegin]) ? words[TeacherBegin] : ''
    if (TeacherBegin >= 0) {
      for (let i = TeacherBegin + 1; i < TeacherBegin + 4 && i < words.length; i++) {
        const word = words[i]
        if (!word || /^[a-zA-Z]$/.test(word[0]) === false) {
          break
        } else if (word.indexOf(',') > 0) {
          Teacher = Teacher + ' ' + word.split(',')[0]
          break
        } else if (word.length < 2 || word[1] !== word[1].toUpperCase()) {
          break
        } else {
          Teacher = Teacher + ' ' + word
        }
      }
    }

    // --- CPC: AGENCY --->
    Agency = ''
    for (let i = 0; i < 20 && i < words.length; i++) {
      const word = words[i]
      if (!word) { break }
      Agency = Agency + ' ' + word
      if ((word.replace(',', '').trim() === 'DISTRICT') || (word.replace(',', '').trim() === 'EDUCATION') || (word.replace(',', '').trim() === 'CALIFORNIA')) {
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
