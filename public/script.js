const socket = io()

document.getElementById("searchButton").addEventListener("click", function(event) {
    event.preventDefault()

    // prepare query
    const searchInput = document.getElementById("searchInput").value
    const rifChecked = document.getElementById("rifChecked").checked
    const cpcChecked = document.getElementById("cpcChecked").checked
    const mirsChecked = document.getElementById("mirsChecked").checked
    const ctcChecked = document.getElementById("ctcChecked").checked
    const query = {
      "searchInput": searchInput, 
      "rifChecked": rifChecked,
      "cpcChecked": cpcChecked,
      "mirsChecked": mirsChecked,
      "ctcChecked": ctcChecked
    }
    //console.log(query)
    socket.emit("searchInput", query)
})

// server data: {results, filesProcessed, searchInput}
socket.on("results", (data) => {
  //console.log(data.results, data.filesProcessed, data.searchInput)
  $("#outputDiv").empty()
  $("#statusDiv").empty()

  if (data.filesProcessed && data.searchInput) {
    let filesProcessed = data.filesProcessed? data.filesProcessed: 0
    let dataLength = data.results? data.results.length: 0

    $("#outputDiv").append(`<p>Searched ${filesProcessed} decisions. Found ${dataLength} results:</p>`)
  }

  if (data.results) {
    data.results.forEach(result => {
      const link = $("<a></a>").text(result).attr("href", result);
      const div = $("<div>").append(link)
      $("#statusDiv").append(div);
    });
  }
});
