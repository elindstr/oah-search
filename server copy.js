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

async function search(socket, query) {
  console.log("running search")
  //log user and query

  // select folders
  let directoryPaths = [] 
  query.rifChecked? directoryPaths.push("public/CPC/txt/"): null
  query.cpcChecked? directoryPaths.push("public/RIF/txt/"): null
  query.mirsChecked? directoryPaths.push("public/MIRS/txt/"): null
  query.ctcChecked? directoryPaths.push("public/CTC/txt/"): null
  //console.log("directoryPaths:", directoryPaths)

  // parse search query
  let searchInput = query["searchInput"]

  // results container
  let results = await getResults(directoryPaths, searchInput)

  // return results to Client
  socket.emit("results", results)
}

async function getResults(directoryPaths, searchInput) {
  results = []

  for (d = 0; d < directoryPaths.length; d++) {
    const directoryPath = path.join(__dirname, directoryPaths[d]);
    files = await fs.readdir(directoryPath);
    for (f = 0; f < files.length; f++){

      // read files
      let filePath = directoryPath + files[f]
      const content = await fs.readFile(filePath, "utf8");
      
      // search and process results
      if (searchLogic(content, searchInput)) {

        // prepare file names
        const fileName = path.basename(files[f]);
        const pdfFilePath = filePath.replace('/txt/', '/pdf/').replace('.txt', '.pdf');
        const pdfLink = pdfFilePath.replace(path.join(__dirname, 'public'), '');
        let pdfLinkSplits = pdfLink.split("/")
        let type = pdfLinkSplits[1]

        //push results
        results.push({
          fileName: fileName,
          pdfLink: pdfLink,
          type: type,
          snippet: getSnippet(content, searchInput),
          caseNo: path.basename(files[f]).replace(".txt", ""),
          caseName: getCaseName(content, type)
        });
      }
    } 
  }
  return results
}

function searchLogic(content, searchInput) {
  // Convert content to uppercase for case-insensitive search
  content = content.toUpperCase();

  // Handle literals enclosed in quotes
  let literals = [];
  searchInput = searchInput.replace(/"(.*?)"/g, (match, literal) => {
      literals.push(literal.toUpperCase());
      return "LITERAL";
  });

  // Split searchInput by 'AND'
  searchInput = searchInput.replace("(", "")
  searchInput = searchInput.replace(")", "")
  searchInput = searchInput.replace("&", "AND")
  let andSplit = searchInput.toUpperCase().split('AND');
  let orSplit = [];

  andSplit = andSplit.map(part => {
      if (part.includes('OR')) {
          orSplit = part.split('OR').map(p => p.trim());
          return orSplit.some(subPart => {
              if (subPart === "LITERAL") {
                  return literals.some(literal => content.includes(literal));
              }
              return content.includes(subPart);
          });
      } else if (part.trim() === "LITERAL") {
          return literals.some(literal => content.includes(literal));
      }
      return content.includes(part.trim());
  });

  return andSplit.every(part => part === true || part === false && part);
}

function getSnippet(content, searchInput) {
  const searchIndex = content.indexOf(searchInput);
  const snippetStart = Math.max(0, searchIndex - 25);
  const snippetEnd = Math.min(content.length, searchIndex + 50 + searchInput.length);
  let snippet = content.substring(snippetStart, snippetEnd);
  snippet = snippet.replace(/\n/g, "")
  return snippet;
}

function getCaseName(content, type) {
  // Locate the first section of words in all caps in the text file
  const allCapsRegex = /\b([A-Z]+\s*)+/;
  const matches = content.match(allCapsRegex);
  let agency = matches ? matches[0].trim() : "";

  // List of words and symbols to remove
  const removeList = ["\n", "\t", "COMMISSION ON PROFESSIONAL COMPETENCE", " ON ", "COMMISSION", "COMMISSON", "PROFESSIONAL", "PROFESSONAL", "COMPETENCE", "STATE", "CALIFORNIA", "ADMINISTRATOR", "SCHOOLS", "SUPERINTENDANT", "SUPERINTENDENT", "BEFORE", "THE", "OF ", "COUNTY","CALIF ORNIA", "EDUCATION", "GOVERNING", "BOARD", "TRUSTEES", " I", "OAH N", "OAH C", "*", ",", "/", "Â", "©", "@", "â", "€", "œ", "~", "+", ".", "2", "|", "_", "PROPOSED DECISION"]
  removeList.forEach(item => {
    agency = agency.split(item).join(item.trim() ? ' ' : '');
  });
  agency = agency.replace(/\s+/g, ' ').trim();
  regex = / I$/;
  agency = agency.replace(regex, '');

  // Individual
  let nameBegin = 0;
  let nameEnd = 0;
  let trigger = false;
  let found = false;

  for (let i = 0; i < Math.min(900, content.length); i++) {  // Prevent exceeding the string length
      if (trigger) {
          if (found) {
              // Check for a group of non-uppercase characters
              if (!isUpperCase(content[i]) && !isUpperCase(content[i + 1]) && !isUpperCase(content[i + 2]) && !isUpperCase(content[i + 3]) && (i + 4 < content.length && !isUpperCase(content[i + 4]))) {
                  nameEnd = i;
                  break;
              }
          } else {
              // Check for a group of uppercase characters
              if (isUpperCase(content[i]) && isUpperCase(content[i + 1]) && isUpperCase(content[i + 2]) && (i + 3 < content.length && isUpperCase(content[i + 3]))) {
                  nameBegin = i;
                  found = true;
              }
          }
      } else if (isLowerCase(content[i])) {
          trigger = true;
      }
  }

  let individual = content.substring(nameBegin, nameEnd);
  individual = individual.replace(/\n/g, " ");  // Replace newlines with spaces
  regex = / I$/;
  individual = individual.replace(regex, '');
  individual = individual.replace("PROPOSED DECISION", '');
  individual = individual.replace(", OAH N", '');
  individual = individual.trim();  // Trim whitespace from the start and end
  

  // Function to check if a character is uppercase
  function isUpperCase(character) {
      return character && character === character.toUpperCase() && character !== character.toLowerCase();
  }

  // Function to check if a character is lowercase
  function isLowerCase(character) {
      return character && character === character.toLowerCase() && character !== character.toUpperCase();
  }

  caseName = individual + " / " + agency
  return caseName;
}


//   #locate name (works for RIFS)
//   name_begin = 0
//   for i in range(200):
//     if f[i:i+3] == "BEF":
//       name_begin = i
//       break

//   name_end = 90
//   for i in range(name_begin, 200):
//     if f[i:i+3] == "OAH":
//       name_end = i
//       break
//     else:
//       if f[i].islower():
//         if f[i] != "e":
//           name_end = i
//           break

//   case_name = f[name_begin:name_end]
//   case_name = case_name.replace("\n", " ")
//   case_name = case_name.replace("\t", " ")
//   case_name = case_name.replace("STATE OF CALIFORNIA", "")
//   case_name = case_name.replace("STATE ADMINISTRATOR", "")
//   case_name = case_name.replace("SUPERINTENDANT OF SCHOOLS", "")
//   case_name = case_name.replace("SUPERINTENDANT", "")
//   case_name = case_name.replace("SUPERINTENDENT", "")
//   case_name = case_name.replace("BEFORE", "")
//   case_name = case_name.replace("THE ", "")
//   case_name = case_name.replace(" OF ", "")
//   case_name = case_name.replace("STATE CALIFORNIA", "")
//   case_name = case_name.replace("STATE CALIF ORNIA", "")
//   case_name = case_name.replace("EDUCATION", "")
//   case_name = case_name.replace("GOVERNING", "")
//   case_name = case_name.replace("BOARD", "")
//   case_name = case_name.replace("TRUSTEES", "")
//   case_name = case_name.replace("  I", "")
//   case_name = case_name.replace("OAH N", "")
//   case_name = case_name.replace("OAH C", "")
//   case_name = case_name.replace("*", "")
//   case_name = case_name.replace(",", "")
//   case_name = case_name.replace("/", "")
//   case_name = case_name.replace("Â", "")
//   case_name = case_name.replace("©", "")
//   case_name = case_name.replace("@", "")
//   case_name = case_name.replace("â", "")
//   case_name = case_name.replace("€", "")
//   case_name = case_name.replace("œ", "")
//   case_name = case_name.replace("~", "")
//   case_name = case_name.replace("+", "")
//   case_name = case_name.replace(".", "")
//   case_name = case_name.replace("2", "")
//   case_name = case_name.replace("|", "")
//   case_name = case_name.replace("OAH N", "")
//   case_name = case_name.replace("_", "")
//   case_name = case_name.replace("  ", " ")
//   case_name = case_name.strip()

// #CPC/MIRS
// elif (filename[0] == "C") or (filename[0] == "M"):
//   ##local case no
//   case_noList = re.findall("[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]", f)
//   if len(case_noList) == 0:
//     case_noList = re.findall("[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]", f)
//   if len(case_noList) > 0:
//     case_no = case_noList[0]
//   else:
//     case_no = "0000"

//   #locate name
//     ##Iterate through 3 charachters at a time; find first group of case; then find first group of upper case letters. Select until "Respondent"
//   name_begin = 0
//   name_end = 0
//   trigger = False
//   found = False

//   for i in range(900):
//     if trigger == True:
//       if found == True:
//         if (f[i].isupper() == False) and (f[i+1].isupper() == False) and (f[i+2].isupper() == False) and (f[i+3].isupper() == False) and (f[i+5].isupper() == False):
//           name_end = i
//           break
//       elif found == False:
//         if f[i].isupper() and f[i+1].isupper() and f[i+2].isupper() and f[i+3].isupper():
//           name_begin = i
//           found = True
//     elif trigger == False:
//       if f[i].islower():
//         trigger = True

//   case_name = f[name_begin:name_end]
//   case_name = case_name.replace("\n", " ")
//   case_name = case_name.strip()
