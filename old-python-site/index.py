#!/usr/bin/python3
import re
import os, glob
from os import path

#Import CGI modules and get CGI
import cgi, cgitb
cgitb.enable()
form = cgi.FieldStorage()

cgi_input_text = form.getvalue('search_input')
if isinstance(cgi_input_text, str):
	input_text = cgi_input_text
else:
	input_text = ""

RIF_orders = form.getvalue('layoff_orders')
CPC_orders = form.getvalue('disc_orders')
MIRS_orders = form.getvalue('mirs_orders')
CTC_orders = form.getvalue('ctc_orders')

#other global variables
error_message = "no errors"
OR_strings = []
AND_strings = []

#SECTION 1 -- Pre-print non-results html
print("Content-Type: text/html")
print()
print("<!doctype html><html><head>")

print("<!-- Google Tag Manager --><script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-K575LTG');</script><!-- End Google Tag Manager -->")
print("<!-- Google tag (gtag.js) -->")
print("<script async src='https://www.googletagmanager.com/gtag/js?id=G-DM9CG8CGYX'></script>")
print("<script>")
print("  window.dataLayer = window.dataLayer || [];")
print("  function gtag(){dataLayer.push(arguments);}")
print("  gtag('js', new Date());")
print("gtag('config', 'G-DM9CG8CGYX');")
print("</script>")

print("<link rel='icon' href='data:,'><meta name=viewport content='width=device-width, initial-scale=.7', user-scalable='yes'><meta http-equiv='Cache-Control' content='no-cache, no-store, must-revalidate'><meta http-equiv='Pragma' content='no-cache'><meta http-equiv='Expires' content='0'><meta name='robots' content='noindex'>")
print("</head>")

print("<body>")
print('<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-K575LTG"height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript><!-- End Google Tag Manager (noscript) -->')

print("<h1>OAH Teacher Case Search</h1>")
print('<form action = "index.py" method = "POST">')
cgi_input_text_return = str(cgi_input_text).replace("None", "")
if (cgi_input_text_return == "None"):
	print('<input type="text" name="search_input" id="search_input" size="100" value="">')
else:
	print('<input type = "text" name="search_input" id="search_input" size="100" value="{}">'.format(cgi_input_text_return))
print('<input type = "submit" value = "Search" />')
print('<br>')
if (RIF_orders == "on"):
	print('<input type="checkbox" name="layoff_orders" id="layoff_orders" checked>')
else:
	print('<input type="checkbox" name="layoff_orders" id="layoff_orders" >')
print('<label for="layoff_orders">RIF Decisions</label>')
print('<br>')
if (CPC_orders == "on"):
	print('<input type="checkbox" name="disc_orders" id="disc_orders" checked>')
else:
	print('<input type="checkbox" name="disc_orders" id="disc_orders">')
print('<label for="disc_orders">CPC Decisions</label>')
print('<br>')
if (MIRS_orders == "on"):
	print('<input type="checkbox" name="mirs_orders" id="mirs_orders" checked>')
else:
	print('<input type="checkbox" name="mirs_orders" id="mirs_orders">')
print('<label for="mirs_orders">MIRS Orders</label>')
print('<br>')
if (CTC_orders == "on"):
	print('<input type="checkbox" name="ctc_orders" id="ctc_orders" checked>')
else:
	print('<input type="checkbox" name="ctc_orders" id="ctc_orders" >')
print('<label for="ctc_orders">Sac ALJ CTC Decisions</label>')
print('</form>')
print("<hr>")
print("<div id='results'>getting results...</div>")

#Section 4.b Prettify Result (for each search result)
Results_Array = []
def prepare_results_display(f, filename):
	global Results_Array

	#RIFs
	if filename[0] == "R":

		##local case no
		case_noList = re.findall("[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]", f)
		if len(case_noList) == 0:     #one file from 2012 is in this format
			case_noList= re.findall("[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]", f)
		if len(case_noList) == 0:     #one file from 2008 is in this format
			case_noList= re.findall("[0-9][0-9][0-9][0-9][0-9][0-9]\s\s[0-9][0-9][0-9][0-9]", f)
		if len(case_noList) == 0:     #one file from 2004 is in this format
			case_noList= re.findall("[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]", f)
		if len(case_noList) > 0:
			case_no = case_noList[0]
		else:
			case_no = "0000"

		#locate name (works for RIFS)
		name_begin = 0
		for i in range(200):
			if f[i:i+3] == "BEF":
				name_begin = i
				break

		name_end = 90
		for i in range(name_begin, 200):
			if f[i:i+3] == "OAH":
				name_end = i
				break
			else:
				if f[i].islower():
					if f[i] != "e":
						name_end = i
						break

		case_name = f[name_begin:name_end]
		case_name = case_name.replace("\n", " ")
		case_name = case_name.replace("\t", " ")
		case_name = case_name.replace("STATE OF CALIFORNIA", "")
		case_name = case_name.replace("STATE ADMINISTRATOR", "")
		case_name = case_name.replace("SUPERINTENDANT OF SCHOOLS", "")
		case_name = case_name.replace("SUPERINTENDANT", "")
		case_name = case_name.replace("SUPERINTENDENT", "")
		case_name = case_name.replace("BEFORE", "")
		case_name = case_name.replace("THE ", "")
		case_name = case_name.replace(" OF ", "")
		case_name = case_name.replace("STATE CALIFORNIA", "")
		case_name = case_name.replace("STATE CALIF ORNIA", "")
		case_name = case_name.replace("EDUCATION", "")
		case_name = case_name.replace("GOVERNING", "")
		case_name = case_name.replace("BOARD", "")
		case_name = case_name.replace("TRUSTEES", "")
		case_name = case_name.replace("  I", "")
		case_name = case_name.replace("OAH N", "")
		case_name = case_name.replace("OAH C", "")
		case_name = case_name.replace("*", "")
		case_name = case_name.replace(",", "")
		case_name = case_name.replace("/", "")
		case_name = case_name.replace("Â", "")
		case_name = case_name.replace("©", "")
		case_name = case_name.replace("@", "")
		case_name = case_name.replace("â", "")
		case_name = case_name.replace("€", "")
		case_name = case_name.replace("œ", "")
		case_name = case_name.replace("~", "")
		case_name = case_name.replace("+", "")
		case_name = case_name.replace(".", "")
		case_name = case_name.replace("2", "")
		case_name = case_name.replace("|", "")
		case_name = case_name.replace("OAH N", "")
		case_name = case_name.replace("_", "")
		case_name = case_name.replace("  ", " ")
		case_name = case_name.strip()

	#CPC/MIRS
	elif (filename[0] == "C") or (filename[0] == "M"):
		##local case no
		case_noList = re.findall("[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]", f)
		if len(case_noList) == 0:
			case_noList = re.findall("[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]", f)
		if len(case_noList) > 0:
			case_no = case_noList[0]
		else:
			case_no = "0000"

		#locate name
			##Iterate through 3 charachters at a time; find first group of case; then find first group of upper case letters. Select until "Respondent"
		name_begin = 0
		name_end = 0
		trigger = False
		found = False

		for i in range(900):
			if trigger == True:
				if found == True:
					if (f[i].isupper() == False) and (f[i+1].isupper() == False) and (f[i+2].isupper() == False) and (f[i+3].isupper() == False) and (f[i+5].isupper() == False):
						name_end = i
						break
				elif found == False:
					if f[i].isupper() and f[i+1].isupper() and f[i+2].isupper() and f[i+3].isupper():
						name_begin = i
						found = True
			elif trigger == False:
				if f[i].islower():
					trigger = True

		case_name = f[name_begin:name_end]
		case_name = case_name.replace("\n", " ")
		case_name = case_name.strip()

	linkname = filename.replace("txt", "pdf")
	casetype = filename[0:3]
	Results_Array.append([linkname, filename, case_no, case_name, casetype])


#Section 4.a SEARCH
def search():
	global input_text, AND_strings, OR_unit

	dir_active = []
	if (RIF_orders == "on"):
		dir_active.append("RIF/txt/")
	if (CPC_orders == "on"):
		dir_active.append("CPC/txt/")
	if (MIRS_orders == "on"):
		dir_active.append("MIRS/txt/")
	if (CTC_orders == "on"):
		dir_active.append("CTC/txt/")

	for directory in dir_active:
		for filename in glob.glob(os.path.join(directory, '*.txt')):
			#print("searching: ", filename)
			with open(filename, "r", encoding="ISO-8859-1") as file:
				f = file.read()
				
				#convert to lower case and remove apostrophes to match input strings
				f_string = f.lower()	#
				f_string = f_string.replace("'", "")

				#Search AND List
				hits = []
				for OR_unit in range(len(AND_strings)):
					hits.append([])
					for AND_unit in range(len(AND_strings[OR_unit])):

						#Search for ANDs and ORs
						if (isinstance(AND_strings[OR_unit][AND_unit], str) == True):
							if (AND_strings[OR_unit][AND_unit] in f_string):
								hits[len(hits) -1].append("yes")
							else:
								hits[len(hits) -1].append("no")

						#Search for slash connectors
						elif (isinstance(AND_strings[OR_unit][AND_unit], list) == True):
							a_b_found = False
							if (AND_strings[OR_unit][AND_unit][2] in f_string):

								#n = words
								a = AND_strings[OR_unit][AND_unit][2]
								b = AND_strings[OR_unit][AND_unit][3]
								n = AND_strings[OR_unit][AND_unit][1]
								begin_id = f_string.index(a)
								end_id = -1	#placeholder

								test_str =  f_string[begin_id:len(f_string)]

								word_count = 0
								for char in range(len(test_str)):
									if test_str[char] == " ":
										end_id = begin_id + char
										word_count = word_count + 1
										if word_count > n:
											break
								test_str = f_string[begin_id:end_id]
								if (b in test_str):
									a_b_found = True
								#print("<script>console.log('{}')</script>".format(test_str))

							if (a_b_found == True):
								hits[len(hits) -1].append("yes")		##FLAG
							else:
								hits[len(hits) -1].append("no")

				#Process HITS
				OR_Hit = False
				for OR_unit in range(len(AND_strings)):
					AND_Hit = True

					for AND_unit in range(len(AND_strings[OR_unit])):

						if (hits[OR_unit][AND_unit] == "yes"):
							OR_Hit = True
						else:
							AND_Hit = False

					if ( (OR_Hit == True) & (AND_Hit == True) ):

						##found hit; now prettify result
						prepare_results_display(f, filename)
				file.close()
#end search function

#Section 3. PARSE
def Parse_Input():
	global OR_strings, AND_strings, input_text, error_message

	#LOCATE OR_STRINGS
	def locate_OR_strings():
		global OR_strings, AND_strings, input_text
		OR_strings = input_text.split(" OR ")

	#PROCESS EACH OR STRING FOR AND_STRINGS
	def process_AND_strings():
		global OR_strings, AND_strings, input_text

		for unit in range (len(OR_strings)):
			AND_strings.append([])
			temp_input_text = OR_strings[unit]

			#widdle down unit into sub-strings
			while (len(temp_input_text) > 2):
				temp_input_text = temp_input_text.strip()
				Begin_String = 0

				#if beginning is quote
				if (temp_input_text[Begin_String] == "\""):
					#print("found beginning quote, temp_input_text: ", temp_input_text)

					#find end quote
					for char in range (len(temp_input_text)):
						if (temp_input_text[char] == "\""):
							End_String = char
						elif (char == len(temp_input_text)-1):
							End_String = char

					#process
					AND_strings[unit].append(temp_input_text[Begin_String+1:int(End_String)])
					temp_input_text = temp_input_text[End_String:len(temp_input_text)-1]

				else: #ie a..z
					#print("found beginning is non-quote, temp_input_text: ", temp_input_text)

					#find end point
					for char in range (len(temp_input_text)):
						if (char == 0):
							continue
						elif (temp_input_text[char] == " "):
							End_String = char
							#flag if unconnected space
							break
						elif (char == len(temp_input_text)-1):
							End_String = char

						elif (char+2) < len(temp_input_text):
							if ( (temp_input_text[char] == "A") & (temp_input_text[char+1] == "N") & (temp_input_text[char+2] == "D")):
								End_String = char

					#process
					AND_to_add = temp_input_text[Begin_String:int(End_String)+1]
					AND_to_add = AND_to_add.strip()
					if (AND_to_add != "AND"):
						AND_strings[unit].append(temp_input_text[Begin_String:int(End_String)+1])

					temp_input_text = temp_input_text[int(End_String+1):len(temp_input_text)]

	#CONVERT ANDS THAT ARE REALLY SLASH CONNECTORS
	def locate_slash_strings():
		global AND_strings

		a_list = []
		b_list = []
		s_list = []
		slash_list = []

		for OR_unit in range(len(AND_strings)):
			for AND_unit in (range(len(AND_strings[OR_unit]))):
				if (AND_strings[OR_unit][AND_unit][0] == "/") and (isinstance(AND_strings[OR_unit][AND_unit], str)):
					if (AND_unit == 0):
						print("error: slash connector not valid")
						AND_strings[OR_unit].pop(AND_unit)
					elif (AND_unit == len(AND_strings[OR_unit])):
						print("error: slash connector not valid")
						AND_strings[OR_unit].pop(AND_unit)
					else:
						slashid = AND_unit
						a_list.append(slashid-1)
						a = AND_strings[OR_unit][slashid-1]
						b_list.append(slashid+1)
						b = AND_strings[OR_unit][slashid+1]
						s_list.append(slashid)
						slash_n = int(AND_strings[OR_unit][AND_unit].replace("/",""))
						slash_list.append(["/", slash_n, a, b])

			#create unique pop off list
			pop_list = []
			for i in (range(len(a_list))):
				if ((a_list[i] in pop_list) == False):
					pop_list.append(a_list[i])
				if ((s_list[i] in pop_list) == False):
					pop_list.append(s_list[i])
				if ((b_list[i] in pop_list) == False):
					pop_list.append(b_list[i])

			#pop off unique aID_to_join and bID_to_join
			for i in reversed(range(len(pop_list))):
				AND_strings[OR_unit].pop(pop_list[i])

			#append slash_to_join
			for i in (range(len(slash_list))):
				AND_strings[OR_unit].append(slash_list[i])

	def input_error_check():
		global OR_strings, AND_strings, input_text, error_message		

		#handle unpaired quotes
		QList = []
		for char in range(len(input_text)):
			if (input_text[char] == "\""):
				QList.append(char)
		if (len(QList) % 2 != 0):
			error_message = "input: uneven quotes"
			#flag parenthesis as non-functional yet
			#flag slash symbols as non-functional yet
			return True
		else:
			return False

	#MAIN
	input_and_string_list=[]
	input_text = input_text.lower()
	input_text = input_text.replace(" or ", " OR ")
	input_text = input_text.replace(" and ", " AND ")
	input_text = input_text.replace("'", "") 	#crude - handle apostrophes by removing them altogether
	input_text = input_text.replace("(", "") 	#crude - handle paren by removing them altogether
	input_text = input_text.replace(")", "") 	#crude - handle paren by removing them altogether
	print("<script>console.log('input_text after cleaning up: {}')</script>".format(input_text))

	if input_error_check() == False:
		locate_OR_strings() ## returns OR_strings
		process_AND_strings()
		locate_slash_strings()
#end function Parse_Input()

#SECTION 2 -- Main Trigger On Call Command
if len(input_text) > 0:
	Parse_Input() ##parse input into OR Strings as array, with AND sub-arrays, ordering by slash command logic 
	search() #search

	#sort results_array by case number
	def takeThird(elem):
		return elem[2]
	Results_Array.sort(key=takeThird, reverse = True)

#SECTION 5: Print HTML with Results
if len(Results_Array) > 0:
	print("<script>")
	print("document.getElementById('results').innerHTML = '<i>{} Results:</i><br><br>'".format(len(Results_Array)))
	print("var Results_Array={};".format(Results_Array))
	print("for (i = 0; i < Results_Array.length; i++) {document.getElementById('results').innerHTML += Results_Array[i][4] + ' ' + '<a href=' + Results_Array[i][0] + '>No. ' + Results_Array[i][2] + '</a>' + ' ' + Results_Array[i][3] + '<br>'}")
	print("</script>")
else:
	print("<script>document.getElementById('results').innerHTML = '<i>0 Results</i>' </script>")

print("<script>")
print("console.log('error_msg: {}')".format(error_message))
print("OR_strings_js = {}".format(OR_strings))
print("AND_strings_js = {}".format(AND_strings))
print("console.log(OR_strings_js)")
print("console.log(AND_strings_js)") 
print("</script>")

print("<br><hr>")
print("<p>Sources: RIF (2004-2022), CPC (2010-2022), MIRS (2018-2022), CTC (Sacramento OAH, 2020-2022).<br><br>")
print("Available Commands:<br>&#8226 AND <i>(Unconnected terms are assumed to be connected by AND; use an explicit OR if desired)</i><br>&#8226 OR<br>&#8226 Quotations for literals<br>&#8226 /n (<i>n words apart</i>)<br></p>")
print("</body></html>")
