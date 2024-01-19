const express = require("express");
const app = express();
const port = 3000;
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs").promises;
const path = require("path");
app.use(express.static("public"));

http.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("searchInput", (query) => {
    //console.log(query)
    search(socket, query)
  })
});

function search(socket, query) {
  console.log("running search")
  //log user and query
  //...

  // select folders
  let directoryPaths = [] 
  query["rifChecked"]? directoryPaths.push("public/CPC/txt/"): null
  query["cpcChecked"]? directoryPaths.push("public/RIF/txt/"): null
  query["mirsChecked"]? directoryPaths.push("public/MIRS/txt/"): null
  query["ctcChecked"]? directoryPaths.push("public/CTC/txt/"): null
  //console.log("directoryPaths:", directoryPaths)

  // parse search query
  let searchInput = query["searchInput"]

  // results container
  let results = []
  
  Promise.all(directoryPaths.map(directoryPath => 
    
    searchDirectory(directoryPath, searchInput)

  )).then(allResults => {
    allResults.forEach(files => {
      results.push(...files); 
      //...
    });

    console.log("Search done:", results.length, "results")
    var filesProcessed=0 //TODO
    socket.emit("results", {results, filesProcessed, searchInput})

  }).catch(error => {
    console.error("Error during search:", error);
    socket.emit("error", "Error during search");
  });
}

async function searchDirectory(directoryPath, searchInput) {
  const fullDirectoryPath = path.join(__dirname, directoryPath);
  try {
    const files = await fs.readdir(fullDirectoryPath);
    const searchResults = await Promise.all(files.map(file =>  
      searchFile(path.join(fullDirectoryPath, file), searchInput)
    ))
    return searchResults.filter(result => result !== null); // Filter out nulls (files that didn't match)
  } catch (error) {
    console.error(`Error reading directory ${fullDirectoryPath}:`, error);
    throw error; // Rethrow to catch in the main search function
  }
}

async function searchFile(filePath, searchInput) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.includes(searchInput) ? filePath : null;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null; // Return null if there's an error reading the file
  }
}