# OAH-Search: a node.js search engine for California administrative hearing decisions regarding teachers

## Project Overview 

The California Office of Administrative Hearings (OAH) is a quasi-judicial tribunal that conducts formal adjudicatory hearings for the thousands of state and local governmental agencies in California. OAH annually issues tens of thousands of decisions. Its decisions are binding on the litigants and can be cited as persuasive precedent by litigants in other cases.

Although its decisions constitute public records accessible to the public under the California Public Records Act (CPRA)[^1], the vast majority of OAH decisions are in reality not publicly accessible because OAH does not publish its decisions.

This is a project to make OAH decisions regarding public school teachers accessible online.

OAH hears disputes regarding teachers in four types of cases: (1) decisions involving a commission on professional competence (CPC) to determine whether there is cause to discipline a teacher; (2) interlocutory orders on Motions for Immediate Reversal of Suspension (MIRS) deciding whether a teacher may be suspended without pay pending a CPC hearing; (3) decisions reviewing challenges to reduction-in-force (RIF) actions; and (4) actions before the Commission on Teacher Credentialing (CTC) in teacher credentialing.

Each year I request from OAH, pursuant to the Public Records Act, all decisions issued that year in CPC, MIRS, RIF, and CTC cases. OAH produces these decisions to me as pdf files. I use python scripts to process the files and save the original pdf and an extracted text file to this database. The code in this GitHub repository is a web app to search these decision files.

[^1]: "[A]ccess to information concerning the conduct of the people’s business is a fundamental and necessary right of every person in this state." Gov. Code § 7921.000.

## Technical Description

A minimalist front-end interface allows a user to enter a search query with optional filters for CPC, MIRS, RIF, and CTC cases. Terms in a search query may be connected using AND, OR, 'literal', and/or a special proximity connector ('/n') to find terms n words apart.

A backend node.js server, using express and socket.io, receives the query, parses the query into searchable logic, iteratively applies the search logic to the selected directories of text files, parses the case name and number from the resulting decisions along with a snippet of the hit, and returns these results back to the front-end.

The project is currently deployed on a basic Ionos virtual machine (CPU:1 vCore; RAM:1 GB; SSD:40 GB) running Ubuntu.


