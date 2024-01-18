const express = require('express');
const app = express();
const port = 3000;

app.use(express.static('public'));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

const fs = require('fs');
const path = require('path');

app.get('/search', (req, res) => {
  const query = req.query.query;
  const directoryPath = path.join(__dirname, '../OAH Decisions/CPC/txt');

  // Search logic here
  // Read the directory, filter files based on the query, and return results

  res.json({ /* search results */ });
});
