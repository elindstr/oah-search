const socket = io()

const checkboxIds = ['cpcChecked', 'mirsChecked', 'rifChecked', 'ctcChecked']
const statusDiv = document.getElementById('statusDiv')
const outputDiv = document.getElementById('outputDiv')

document.addEventListener('DOMContentLoaded', () => {
  checkboxIds.forEach((id) => {
    let isChecked = localStorage.getItem(id)
    if (isChecked === null) {
      isChecked = true
    } else {
      isChecked = isChecked === 'true'
    }
    document.getElementById(id).checked = isChecked
  })
})

document.getElementById('searchButton').addEventListener('click', (event) => {
  event.preventDefault()

  // prepare query
  const searchInput = document.getElementById('searchInput').value
  const cpcChecked = document.getElementById('cpcChecked').checked
  const mirsChecked = document.getElementById('mirsChecked').checked
  const rifChecked = document.getElementById('rifChecked').checked
  const ctcChecked = document.getElementById('ctcChecked').checked
  const query = {
    searchInput,
    cpcChecked,
    mirsChecked,
    rifChecked,
    ctcChecked
  }
  socket.emit('searchInput', query)

  // display loading message
  statusDiv.textContent = 'Fetching results...'
  outputDiv.textContent = ''

  // save check boxes to localStorage
  localStorage.setItem('cpcChecked', cpcChecked)
  localStorage.setItem('mirsChecked', mirsChecked)
  localStorage.setItem('rifChecked', rifChecked)
  localStorage.setItem('ctcChecked', ctcChecked)
})

socket.on('searchError', (message) => {
  statusDiv.textContent = message || 'Search failed.'
  outputDiv.textContent = ''
})

socket.on('results', (data) => {
  statusDiv.textContent = ''
  outputDiv.textContent = ''

  if (!Array.isArray(data)) {
    statusDiv.textContent = 'No results.'
    return
  }

  const countP = document.createElement('p')
  countP.textContent = `Found ${data.length} results:`
  statusDiv.appendChild(countP)

  data.forEach((result) => {
    const resultDiv = document.createElement('div')
    resultDiv.className = 'result'

    const typeSpan = document.createElement('span')
    typeSpan.textContent = `${result.type}   `

    const pdfLink = document.createElement('a')
    pdfLink.textContent = `${result.caseNo}`
    pdfLink.href = result.pdfLink
    pdfLink.target = '_blank'
    pdfLink.rel = 'noopener noreferrer'

    const caseNameDiv = document.createElement('span')
    caseNameDiv.textContent = `   ${result.caseName}`

    const snippetDiv = document.createElement('div')
    snippetDiv.textContent = `Snippet: ...${result.snippet}...`

    resultDiv.appendChild(typeSpan)
    resultDiv.appendChild(pdfLink)
    resultDiv.appendChild(caseNameDiv)
    resultDiv.appendChild(snippetDiv)

    outputDiv.appendChild(resultDiv)
  })
})
