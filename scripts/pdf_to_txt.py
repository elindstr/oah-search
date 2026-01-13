import os
import PyPDF2

def pdf_to_text(input_folder, output_folder):
    """
    Converts all PDF files in `input_folder` to text files
    and saves them in `output_folder`.
    """
    # Make sure the output folder exists
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # Get a list of all PDF files in the input folder
    pdf_files = [f for f in os.listdir(input_folder) if f.lower().endswith('.pdf')]

    for pdf_file in pdf_files:
        pdf_path = os.path.join(input_folder, pdf_file)
        txt_filename = os.path.splitext(pdf_file)[0] + '.txt'
        txt_path = os.path.join(output_folder, txt_filename)

        # Extract text from the PDF
        text_content = ""
        with open(pdf_path, 'rb') as file_obj:
            pdf_reader = PyPDF2.PdfReader(file_obj)

            # Loop through each page in the PDF
            for page_num, page in enumerate(pdf_reader.pages):
                # Extract text from page
                page_text = page.extract_text()
                if page_text:
                    text_content += page_text

        # Write the extracted text to a .txt file
        with open(txt_path, 'w', encoding='utf-8') as txt_file:
            txt_file.write(text_content)

        print(f"Converted: {pdf_file} -> {txt_filename}")

if __name__ == "__main__":
    # Replace with your actual folder paths
    input_folder_path = r"../public/CTC/"
    output_folder_path = r"../public/CTC/"

    pdf_to_text(input_folder_path, output_folder_path)
    print("All PDFs have been successfully converted to text.")
