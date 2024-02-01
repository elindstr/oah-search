const socket = io()

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
  $('#outputDiv').empty()
  $('#statusDiv').empty()

  if (data) {
    $('#outputDiv').append(`<p>Found ${data.length} results:</p>`)

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
      $('#statusDiv').append(resultDiv)
    })
  }
})
