const CSVGood = function (file, onStep, onError, onComplete) {
    let header = null;
    let numberOfCols = 0;
    let firstLineParsed = false;
    let incompleteRow = null;

    const FileRow = function (data, error) {
        this.data = data;
        this.error = error;
    };

    const FileStreamerResultStep = function (rows) {
        this.fields = header;
        this.rows = rows;
    };

    const FileStreamerResultComplete = function () {
        this.file = file;
        this.fields = header;
    };

    const isHeader = function (line) {
        // Look for empty spaces and dates
        const isNotHeaderRegex = /["']{2}[,;]|[,;]{2}|([\d]{1,4}[\-\/][\d]{1,2}[\-\/][\d]{1,4})/g;
        return !isNotHeaderRegex.test(line);
    };

    const cleanFields = function (fields) {
        let cleanedFields = [];

        for (let field of fields) {
            field = field.replace(/(\r\n|\n|\r)/gm,"");

            if (field.endsWith(",") || field.endsWith(";"))
                field = field.substring(0, field.length - 1);

            if ((field.startsWith("\"") && field.endsWith("\"")) || (field.startsWith("\'") && field.endsWith("\'")))
                cleanedFields.push(field.substring(1, field.length - 1));
            else
                cleanedFields.push(field);
        }

        return cleanedFields;
    };

    const splitLineToFields = function (line) {
        const splitFieldsRegex = /("(?:[^"]|"")*"|[^,"\n\r]*)(,|;|\r?\n|\r|(.+$))/g;

        let fields = line.match(splitFieldsRegex);

        return cleanFields(fields);
    };

    const convertRowToJson = function (fields) {
        let dict = {};

        if (header !== null) {
            for (let index = 0; index < fields.length; ++index) {
                dict[header[index]] = fields[index];
            }
        } else {
            for (let index = 0; index < fields.length; ++index) {
                dict[index] = fields[index];
            }
        }

        return dict;
    };

    const endsWithNewLine = function (line) {
        return (line.endsWith("\r") || line.endsWith("\n"));
    };

    const checkRowForErrors = function (line, fields) {
        let error = null;

        if (firstLineParsed) {
            if (fields.length < numberOfCols)
                error = "TooFewColumns";
            else if (fields.length > numberOfCols)
                error = "TooManyColumns";
        }

        return error;
    };

    const isRowComplete = function (line, fields) {
        return endsWithNewLine(line);
    };

    const parseFirstRow = function (line, fields) {
        firstLineParsed = true;
        numberOfCols = fields.length;

        if (isHeader(line)) {
            header = fields;
        }
    };

    const splitRows = function (line) {
        return line.match(/.*(\r?\n|\r|$)/g);
    };

    const createResult = function (rowData) {
        return new FileStreamerResultStep(rowData);
    };

    const fillIncompleteRow = function (rows) {
        // Complete previous incomplete row
        if (incompleteRow !== null) {
            rows[0] = incompleteRow + rows[0];
            incompleteRow = null;
        }

        return rows;
    };

    const parseRow = function (line) {
        if (line === null || line === "")
            return null;

        const fields = splitLineToFields(line);

        if (! isRowComplete(line, fields)) {
            incompleteRow = line;
            return null;
        }

        const error = checkRowForErrors(line, fields);

        if (!firstLineParsed) {
            parseFirstRow(line, fields);

            // Don't return the header, if found
            if (header)
                return null;
        }

        // Finish row
        return new FileRow(convertRowToJson(fields), error);
    };

    const parseRows = function (rows) {
        // Parse all rows
        let fileRows = [];
        for (let row of rows) {
            let fileRow = parseRow(row);

            if (fileRow !== null && fileRow !== undefined)
                fileRows.push(fileRow);
        }

        if (fileRows.length > 0)
            onStep(createResult(fileRows));
    };

    const completeStreaming = function () {
        if (incompleteRow !== null && incompleteRow !== undefined && incompleteRow !== "") {
            const lastRow = incompleteRow + "\n";
            incompleteRow = null;
            onStep(createResult([parseRow(lastRow)]));
        }

        onComplete(new FileStreamerResultComplete());
    };

    const streamFile = function () {
        let loadedBytes = 0;
        let fileStepSize = 2048;
        let totalFileSize = file.size;
        let streamingProgress = 0;
        let fileReader = new FileReader();

        fileReader.onload = function(evt) {
            // Take result
            let rows = splitRows(evt.target.result);

            // Check rows for not completed
            rows = fillIncompleteRow(rows);

            // Parse all rows
            parseRows(rows);

            // Prepare for the second step
            loadedBytes += fileStepSize;
            streamingProgress = (loadedBytes/totalFileSize) * 100;

            if (loadedBytes <= totalFileSize) {
                // Parse the next part
                blob = file.slice(loadedBytes, loadedBytes + fileStepSize);
                fileReader.readAsText(blob);
            } else {
                // Completed streaming
                loadedBytes = totalFileSize;
                completeStreaming();
            }
        };

        let blob = file.slice(0, fileStepSize);
        fileReader.readAsText(blob);
    };

    streamFile();
};
