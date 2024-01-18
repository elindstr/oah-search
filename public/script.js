const socket = io()

document.getElementById("searchButton").addEventListener("click", function(event) {
    event.preventDefault()

    // prepare query
    const searchInput = document.getElementById("searchInput").value
    const layoffsChecked = document.getElementById("layoffsChecked").checked
    const CPCChecked = document.getElementById("CPCChecked").checked
    const mirsChecked = document.getElementById("mirsChecked").checked
    const ctcChecked = document.getElementById("ctcChecked").checked
    const query = {
      "searchInput": searchInput, 
      "layoffsChecked": layoffsChecked,
      "CPCChecked": CPCChecked,
      "mirsChecked": mirsChecked,
      "ctcChecked": ctcChecked
    }
    console.log(query)
    socket.emit("searchInput", query)
})

socket.on("results", (results) => {
  //console.log(results)

  if (results) {
    for (i in results) {
      $("#statusDiv").append(`<p>${results[i]}</p>`)
    }
  }
});
