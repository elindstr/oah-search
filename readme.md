# OAH-Search: a node.js search engine for California admin hearing teacher cases

## Project Overview 

The California Office of Administrative Hearings (OAH) is a quasi-judicial tribunal that conducts formal adjudicatory hearings for thousands of state and local public agencies in California. OAH annually issues tens of thousands of decisions.

Although its decisions constitute public records accessible to the public under the California Public Records Act[^1], the vast majority of OAH decisions are in reality not publicly accessible because OAH does not publish its decisions.

This is a project to make OAH decisions regarding public school teachers accessible online.

OAH hears disputes regarding teachers in four types of cases: (1) proceedings before a commission on professional competence (CPC) to determine whether there is cause to discipline a teacher; (2) interlocutory orders on Motions for Immediate Reversal of Suspension (MIRS) deciding whether a teacher may be suspended without pay pending a CPC proceeding; (3) decisions reviewing challenges to reduction-in-force (RIF) actions; and (4) proceedings before the Commission on Teacher Credentialing (CTC) involving teacher credentialing.

Each year I request from OAH, pursuant to the Public Records Act, all decisions issued that year in CPC, MIRS, RIF, and CTC cases. In response OAH produces the decisions as pdf files. I use python scripts to process the files and upload the original pdf and an extracted text file to this database. The code in this GitHub repository is a web application to search these decision files.

[^1]: "[A]ccess to information concerning the conduct of the people’s business is a fundamental and necessary right of every person in this state." Gov. Code § 7921.000.

## Technical Description

A minimalist front-end interface allows the user to enter a search query with optional filters for CPC, MIRS, RIF, and CTC cases. Terms in a search query may be connected using AND, OR, 'literal', and/or a special proximity connector ('/n') to find terms n words apart.

A backend node.js server using express and socket.io receives the query, parses the query into searchable logic, iteratively applies the search logic to the selected directories of text files, parses the case name and number from the resulting decisions along with a snippet of the hit, and returns these results to the front-end.

The project is currently deployed on an economy-class Ionos virtual machine running an nginx server: [www.ericjlindstrom.com](https://www.ericjlindstrom.com/).
