/** @babel */
import * as char from 'hjs-core/lib/char';
import {BufferedReader,InputStreamReader,StringReader} from 'hjs-io/lib/reader';
import {FileInputStream} from "hjs-file/lib/file";

const TSPECIALS = [
    char.LEFT_PAREN,
    char.RIGHT_PAREN,
    char.LEFT_ANGLE,
    char.RIGHT_ANGLE,
    char.AT,
    char.COMMA,
    char.SEMICOLON,
    char.COLON,
    char.SLASH,
    char.LEFT_BRACKET,
    char.RIGHT_BRACKET,
    char.QUESTION_MARK,
    char.EQUAL,
    char.BACK_SLASH,
    char.DOUBLE_QUOTE];

const isTokenChar = (c) => {
    return ((c > 0o40) && (c < 0o177)) && (TSPECIALS.indexOf(c) < 0);
};

export class MimeType {

    constructor({ mime = null, extension = null, primary = null, sub = null} = {}) {
        this.parameters = null;
        this.fileExtension = null;
        this.subType = null;
        this.parameters = null;
        if (primary && extension) {
            if (this.isValidToken(primary)) {
                this.primaryType = primary.toLowerCase();
            } else {
                throw new SyntaxError("MimeTypeParseException Primary type is invalid.");
            }
            if (this.isValidToken(sub)) {
                this.subType = sub.toLowerCase();
            } else {
                throw new SyntaxError("MimeTypeParseException Sub type is invalid.");
            }
            this.parameters = new MimeTypeParameterList();
            this.fileExtension = extension;
        } else if (mime && extension) {
            this.parse(mime);
            this.fileExtension = extension;
        } else {
            this.primaryType = "application";
            this.subType = "*";
            this.fileExtension = "";
            this.parameters = new MimeTypeParameterList();
        }
    }

    getBaseType() {
        return this.primaryType + "/" + this.subType;
    }

    getFileExtensions() {
        return this.fileExtension;
    }

    getParameter(name) {
        return this.parameters.get(name);
    }

    getParameters() {
        return this.parameters;
    }

    getPrimaryType() {
        return this.primaryType;
    }

    getSubType() {
        return this.subType;
    }

    isValidToken(s) {
        let len = s.length;
        if (len > 0) {
            for (let i = 0; i < len; ++i) {
                let c = s.charCodeAt(i);
                if (!isTokenChar(c)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    match({mime = null, extension = null, type = null} = {}) {
        if (mime && extension) {
            return this.match({ type: new MimeType({ mime, extension })});
        } else if (type) {
            return this.primaryType === type.getPrimaryType()
                && (this.subType === "*" ||
                type.getSubType() === "*" ||
                (this.subType === type.getSubType()));
        }
        return false;
    }

    parse(mime) {
        let slashIndex = mime.indexOf('/');
        let semIndex = mime.indexOf(';');
        if ((slashIndex < 0) && (semIndex < 0)) {
            throw new SyntaxError("MimeTypeParseException Unable to find a sub type.");
        } else if ((slashIndex < 0) && (semIndex >= 0)) {
            throw new SyntaxError("MimeTypeParseException Unable to find a sub type.");
        } else if ((slashIndex >= 0) && (semIndex < 0)) {
            let parts = mime.split("/");
            this.primaryType = parts[0].trim().toLowerCase();
            this.subType = parts[1].trim().toLowerCase();
            this.parameters = new MimeTypeParameterList();
        } else if (slashIndex < semIndex) {
            this.primaryType = mime.substring(0, slashIndex).trim().toLowerCase();
            this.subType = mime.substring(slashIndex + 1, semIndex).trim().toLowerCase();
            this.parameters = new MimeTypeParameterList(mime.substring(semIndex));
        } else {
            throw new SyntaxError("MimeTypeParseException Unable to find a sub type.");
        }
        if (!this.isValidToken(this.primaryType)) {
            throw new SyntaxError("MimeTypeParseException Primary type is invalid.");
        }
        if (!this.isValidToken(this.subType)) {
            throw new SyntaxError("MimeTypeParseException Sub type is invalid.");
        }
    }

    removeParameter(name) {
        this.parameters.remove(name);
    }

    setParameter(name, value) {
        this.parameters.set(name, value);
    }

    setSubType(sub) {
        if (!this.isValidToken(sub)) {
            throw new SyntaxError("MimeTypeParseException Sub type is invalid.");
        }
        this.subType = sub.toLowerCase();
    }

    toString() {
        return this.getBaseType() + this.parameters.toString() + " " + this.fileExtension;
    }

}

const skipWhiteSpace = (rawdata, i) => {
    let length = rawdata.length;
    while ((i < length) && char.isWhitespace(rawdata.charAt(i))) {
        i++;
    }
    return i;
};

const quote = (value) => {
    let needsQuotes = false;
    let length = value.length;
    for (let i = 0; (i < length) && !needsQuotes; i++) {
        needsQuotes = !isTokenChar(value.charCodeAt(i));
    }
    if (needsQuotes) {
        let buffer = '"';
        for (let i = 0; i < length; ++i) {
            let c = value.charCodeAt(i);
            if ((c === char.BACK_SLASH) || (c === char.DOUBLE_QUOTE)) {
                buffer += '\\';
            }
            buffer += value.charAt(i);
        }
        buffer += '"';
        return buffer;
    }
    return value;
};

const unquote = (value) => {
    let valueLength = value.length;
    let buffer = "";
    let escaped = false;
    for (let i = 0; i < valueLength; ++i) {
        let currentChar = value.charCodeAt(i);
        if (!escaped && (currentChar !== char.DOUBLE_QUOTE)) {
            buffer += value.charAt(i);
        } else if (escaped) {
            buffer += value.charAt(i);
            escaped = false;
        } else {
            escaped = true;
        }
    }
    return buffer;
};

export class MimeTypeParameterList {

    constructor(parameterList = null) {
        this.parameters = new Map();
        if (parameterList !== null) {
            this.parse(parameterList);
        }
    }

    get(name) {
        return this.parameters.get(name);
    }

    getNames() {
        return this.parameters.keys();
    }

    isEmpty() {
        return this.parameters.size === 0;
    }

    parse(parameterList) {
        if (parameterList === null) {
            return;
        }
        let length = parameterList.length;
        if (length <= 0) {
            return;
        }
        let i;
        let c;
        for (i = skipWhiteSpace(parameterList, 0);
             i < length && (c = parameterList.charAt(i)) === ';';
             i = skipWhiteSpace(parameterList, i)) {
            let lastIndex;
            let name;
            let value;
            i++;
            i = skipWhiteSpace(parameterList, i);
            if (i >= length) {
                return;
            }
            lastIndex = i;
            while ((i < length) && isTokenChar(parameterList.charCodeAt(i))) {
                i++;
            }
            name = parameterList.substring(lastIndex, i).toLowerCase();
            i = skipWhiteSpace(parameterList, i);
            if (i >= length || parameterList.charAt(i) !== '=') {
                throw new SyntaxError(
                    "MimeTypeParseException Couldn't find the '=' that separates a "
                    + "parameter name from its value.");
            }
            i++;
            i = skipWhiteSpace(parameterList, i);
            if (i >= length) {
                throw new SyntaxError("MimeTypeParseException Couldn't find a value for parameter named " + name);
            }
            c = parameterList.charCodeAt(i);
            if (c === char.DOUBLE_QUOTE) {
                i++;
                if (i >= length) {
                    throw new SyntaxError("MimeTypeParseException Encountered unterminated quoted parameter value.");
                }
                lastIndex = i;
                while (i < length) {
                    c = parameterList.charCodeAt(i);
                    if (c === char.DOUBLE_QUOTE) {
                        break;
                    }
                    if (c === char.BACK_SLASH) {
                        i++;
                    }
                    i++;
                }
                if (c !== char.DOUBLE_QUOTE) {
                    throw new SyntaxError("MimeTypeParseException Encountered unterminated quoted parameter value.");
                }
                value = unquote(parameterList.substring(lastIndex, i));
                i++;
            } else if (isTokenChar(c)) {
                lastIndex = i;
                while (i < length && isTokenChar(parameterList.charCodeAt(i))) {
                    i++;
                }
                value = parameterList.substring(lastIndex, i);
            } else {
                throw new SyntaxError("MimeTypeParseException Unexpected character encountered at index " + i);
            }
            this.parameters.set(name, value);
        }
        if (i < length) {
            throw new SyntaxError("MimeTypeParseException More characters encountered in input than expected.");
        }
    }

    remove(name) {
        this.parameters.delete(name.trim().toLowerCase());
    }

    set(name, value) {
        this.parameters.set(name.trim().toLowerCase(), value);
    }

    size() {
        return this.parameters.size;
    }

    toString() {
        let buffer = "";
        let keys = this.parameters.keys();
        for (let key of keys) {
            buffer += "; ";
            buffer += key;
            buffer += "=";
            buffer += quote(this.parameters.get(key));
        }
        return buffer;
    }

}

const singles = char.EQUAL;

export class LineTokenizer {

    constructor(str) {
        this.maxPosition = str.length;
        this.currentPosition = 0;
        this.str = str;
        this.stack = [];
    }

    hasMoreTokens() {
        if (this.stack.length > 0) {
            return true;
        }
        this.skipWhiteSpace();
        return (this.currentPosition < this.maxPosition);
    }

    nextToken() {
        let size = stack.length;
        if (size > 0) {
            return this.stack.pop();
        }
        this.skipWhiteSpace();
        if (this.currentPosition >= this.maxPosition) {
            throw new RangeError("NoSuchElementException");
        }
        let start = this.currentPosition;
        let c = this.str.charCodeAt(start);
        if (c === char.DOUBLE_QUOTE) {
            this.currentPosition++;
            let filter = false;
            while (this.currentPosition < this.maxPosition) {
                c = this.str.charCodeAt(this.currentPosition++);
                if (c === char.BACK_SLASH) {
                    this.currentPosition++;
                    filter = true;
                } else if (c === char.DOUBLE_QUOTE) {
                    let s;
                    if (filter) {
                        let sb = "";
                        for (let i = start + 1; i < this.currentPosition - 1; i++) {
                            c = this.str.charCodeAt(i);
                            if (c !== char.BACK_SLASH) {
                                sb += this.str.charAt(i);
                            }
                        }
                        s = sb;
                    } else {
                        s = this.str.substring(start + 1, this.currentPosition - 1);
                    }
                    return s;
                } else if (singles.indexOf(c) >= 0) {
                    this.currentPosition++;
                } else {
                    while ((this.currentPosition < this.maxPosition)
                    && singles.indexOf(this.str.charCodeAt(this.currentPosition)) < 0
                    && !char.isWhitespace(this.str
                        .charAt(this.currentPosition))) {
                        this.currentPosition++;
                    }
                }
            }
        }
        return this.str.substring(start, this.currentPosition);
    }

    pushToken(token) {
        this.stack.push(token);
    }

    skipWhiteSpace() {
        while ((this.currentPosition < this.maxPosition) && char.isWhitespace(this.str.charCodeAt(this.currentPosition))) {
            this.currentPosition++;
        }
    }
}

let MIME_TYPE_FILE_INSTANCE = null;

export class MimeTypeFile {

    constructor() {
        this.type_hash = new Map();
    }

    static getInstance() {
        if (MIME_TYPE_FILE_INSTANCE === null) {
            MIME_TYPE_FILE_INSTANCE = new MimeTypeFile();
        }
        return MIME_TYPE_FILE_INSTANCE;
    }

    getExtensions() {
        return this.type_hash.keys();
    }

    getMimeType(extension) {
        return this.type_hash.get(extension);
    }

    getMimeTypes() {
        return this.type_hash.values();
    }

    getMimeTypeString(extension) {
        let entry = this.getMimeType(extension);
        if (entry !== null) {
            return entry.getBaseType();
        }
        return null;
    }

    hasMimeType(extension) {
        return this.type_hash.has(extension);
    }

    load({input = null, onComplete}={}) {
        if (input !== null) {
            if (input instanceof InputStream) {
                this.parse(
                    new BufferedReader({input: new InputStreamReader(input)}),
                    onComplete
                );
            } else if (typeof input === "string") {
                const fr = new FileInputStream({path: input});
                fr.open({
                    onReadable: (err) => {
                        if (!err) {
                            let size = fr.available();
                            let input = new InputStreamReader(fr);
                            this.parse(
                                new BufferedReader({ input, size}),
                                onComplete
                            );
                        } else {
                            onComplete(err);
                        }
                    }
                });
            }
        }
    }

    parse(reader, onComplete = null) {
        let line = null;
        let prev = null;
        let buf_reader = reader;
        while (line = buf_reader.readLine()) {
            if (prev === null) {
                prev = line;
            } else {
                prev += line;
            }
            let end = prev.length;
            if (prev.length > 0 && prev.charCodeAt(end - 1) === char.BACK_SLASH) {
                prev = prev.substring(0, end - 1);
                continue;
            }
            this.parseEntry(prev);
            prev = null;
        }
        if (prev) {
            this.parseEntry(prev);
        }
        if (onComplete !== null) {
            onComplete();
        }
    }

    parseEntry(line) {
        let mime_type = null;
        let file_ext = null;
        line = line.trim();
        if (line.length === 0) {
            return;
        }
        if (line.charAt(0) === '#') {
            return;
        }
        if (line.indexOf('=') > 0) {
            let lt = new LineTokenizer(line);
            while (lt.hasMoreTokens()) {
                let value = null;
                let name = lt.nextToken();
                if (lt.hasMoreTokens() && lt.nextToken() === "=" && lt.hasMoreTokens()) {
                    value = lt.nextToken();
                }
                if (value === null) {
                    return;
                }
                if (name === "type") {
                    mime_type = value;
                } else if (name === "exts") {
                    let st = new char.StringTokenizer({ str: value, delim: "," });
                    while (st.hasMoreTokens()) {
                        file_ext = st.nextToken();
                        this.type_hash.set(file_ext, new MimeType({ mime: mime_type, extension: file_ext }));
                    }
                }
            }
        } else {
            let strtok = new char.StringTokenizer({ str: line });
            let num_tok = strtok.countTokens();
            if (num_tok === 0) {
                return;
            }
            mime_type = strtok.nextToken();
            while (strtok.hasMoreTokens()) {
                file_ext = strtok.nextToken();
                this.type_hash.set(file_ext, new MimeType({ mime: mime_type, extension: file_ext}));
            }
        }
    }

    setMimeType(mimeTypes, onComplete) {
        try {
            this.parse(
                new BufferedReader({input: new StringReader(mimeTypes)}),
                onComplete
            );
        } catch(e) {
            if (onComplete !== null) {
                onComplete(e);
            }
        }
    }
}