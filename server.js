const express = require("express");
const app = express();
const port = 3000;
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
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
    console.log(query)
    search(socket, query)
  })
});



function search(socket, query) {
  console.log("running search")
  const directoryPath = path.join(__dirname, "../OAH Decisions/CPC/txt/");

  //log user and query
  //...

  //run search
  //...

  // Read directory
  fs.readdir(directoryPath, function (err, files) {
    if (err) {
      console.log("Unable to scan directory: " + err);
      socket.emit("error", "Error scanning directory");
      return;
    }

    console.log("Searching:", directoryPath)
    let results = [];
    let filesProcessed = 0;

    files.forEach(function (file) {
      const filePath = path.join(directoryPath, file);
      
      // Read each file
      fs.readFile(filePath, "utf8", function (err, content) {
        filesProcessed++;
        
        if (err) {
          console.log("Error reading file:", filePath);
        } else {

          // Check if content **includes** the query
          if (content.includes(query["searchInput"])) {
            results.push(file); // or you can push an object with more details
          }
        }
        
        // Check if all files have been processed
        if (filesProcessed === files.length) {
          console.log("Search results:", results);
          socket.emit("results", results);
        }
      })
    })
  })
}
