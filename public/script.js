const socket = io()

$(function () {
  const directories = ['cpcChecked', 'mirsChecked', 'rifChecked', 'ctcChecked']
  directories.forEach((id) => {
    let isChecked = localStorage.getItem(id)
    if (isChecked === null) { // true by default
      isChecked = true
    } else {
      isChecked = isChecked === 'true' // convert string to bool
    }
    document.getElementById(id).checked = isChecked
  })
})

document.getElementById('searchButton').addEventListener('click', function (event) {
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
  // console.log(query)
  socket.emit('searchInput', query)

  // display loading message
  $('#statusDiv').text('Fetching results...')
  $('#outputDiv').empty()

  // gtag
  gtag('event', 'search', {
    event_category: 'Search',
    event_label: searchInput
  })

  // save check boxes to localStorage
  localStorage.setItem('cpcChecked', cpcChecked)
  localStorage.setItem('mirsChecked', mirsChecked)
  localStorage.setItem('rifChecked', rifChecked)
  localStorage.setItem('ctcChecked', ctcChecked)
})

// server data:
// results.push({
//   fileName: fileName,
//   pdfLink: pdfLink,
//   snippet: getSnippet(content, searchInput),
//   caseNo: path.basename(files[f]).replace(".txt", ""),
//   caseName: getCaseName(content)
socket.on('results', (data) => {
  // console.log(data)
  $('#statusDiv').empty()
  $('#outputDiv').empty()

  if (data) {
    $('#statusDiv').append(`<p>Found ${data.length} results:</p>`)

    data.forEach(result => {
      // Create elements for the result
      const type = $('<span>').text(`${result.type}   `)
      const pdfLink = $('<a>').text(`${result.caseNo}`).attr('href', result.pdfLink).attr('target', '_blank')
      const caseNameDiv = $('<span>').text(`   ${result.caseName}`)
      const snippetDiv = $('<div>').text(`Snippet: ...${result.snippet}...`)

      // Combine all elements into a single div
      const resultDiv = $("<div class='result'>")
        .append(type)
        .append(pdfLink)
        .append(snippetDiv)
        .append(caseNameDiv)
        .append(snippetDiv)

      // Append the result div to the statusDiv
      $('#outputDiv').append(resultDiv)
    })
  }
})
